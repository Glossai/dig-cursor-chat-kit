import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CursorMessage, CursorThread } from "./types";

const agentName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const threadId = z.string().uuid();

export const listCursorThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ agentName }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at")
      .eq("agent_name", data.agentName)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Could not load conversations");
    return rows as CursorThread[];
  });

export const createCursorThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ agentName, title: z.string().trim().min(1).max(160).default("New conversation") }),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cursor_threads")
      .insert({ user_id: context.userId, agent_name: data.agentName, title: data.title })
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at")
      .single();
    if (error || !row) throw new Error("Could not create conversation");
    return row as CursorThread;
  });

export const renameCursorThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId, title: z.string().trim().min(1).max(160) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cursor_threads")
      .update({ title: data.title })
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not rename conversation");
    return { ok: true };
  });

export const deleteCursorThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cursor_threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete conversation");
    return { ok: true };
  });

export const getCursorThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId }))
  .handler(async ({ data, context }) => {
    const { data: thread, error: threadError } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .single();
    if (threadError || !thread) throw new Error("Conversation not found");
    const { data: messages, error: messageError } = await context.supabase
      .from("cursor_messages")
      .select("id, thread_id, role, content, status, cursor_run_id, error_message, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (messageError) throw new Error("Could not load messages");
    const assistantIds = (messages ?? [])
      .filter((message) => message.role === "assistant")
      .map((message) => message.id);
    const { data: runs, error: runError } = assistantIds.length
      ? await context.supabase
          .from("cursor_runs")
          .select(
            "assistant_message_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, total_cost_micros, cost_source",
          )
          .in("assistant_message_id", assistantIds)
      : { data: [], error: null };
    if (runError) throw new Error("Could not load usage");
    const byMessage = new Map(
      (runs ?? []).map((run) => [
        run.assistant_message_id,
        {
          inputTokens: run.input_tokens ?? 0,
          outputTokens: run.output_tokens ?? 0,
          cacheReadTokens: run.cache_read_tokens ?? 0,
          cacheWriteTokens: run.cache_write_tokens ?? 0,
          totalTokens: run.total_tokens ?? 0,
          totalCostMicros: run.total_cost_micros,
          costSource: run.cost_source as "provider" | "static_table" | "unavailable",
        },
      ]),
    );
    return {
      thread: thread as CursorThread,
      messages: (messages ?? []).map((message) => ({
        ...message,
        usage: byMessage.get(message.id) ?? null,
      })) as CursorMessage[],
    };
  });

export const sendCursorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId, text: z.string().trim().min(1).max(50_000) }))
  .handler(async ({ data, context }) => {
    const { data: thread, error: threadError } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id, title")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .single();
    if (threadError || !thread) throw new Error("Conversation not found");
    const { data: userMessage, error: userError } = await context.supabase
      .from("cursor_messages")
      .insert({
        thread_id: thread.id,
        user_id: context.userId,
        agent_name: thread.agent_name,
        role: "user",
        content: data.text,
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (userError || !userMessage) throw new Error("Could not save your message");
    try {
      const cursor = await import("./cursor.server");
      const source = thread.cursor_agent_id
        ? ("followup" as const)
        : ("automation_webhook" as const);
      const cursorAgentId =
        thread.cursor_agent_id ??
        (await cursor.triggerAutomationWebhook(thread.agent_name, data.text));
      const cursorRunId =
        source === "followup"
          ? await cursor.createFollowupRun(thread.agent_name, cursorAgentId, data.text)
          : await cursor.pollLatestRunId(thread.agent_name, cursorAgentId);
      if (!thread.cursor_agent_id) {
        const { error } = await context.supabase
          .from("cursor_threads")
          .update({ cursor_agent_id: cursorAgentId, title: data.text.slice(0, 80) })
          .eq("id", thread.id)
          .eq("user_id", context.userId);
        if (error) throw new Error("Could not link Cursor agent");
      }
      const { data: assistantMessage, error: assistantError } = await context.supabase
        .from("cursor_messages")
        .insert({
          thread_id: thread.id,
          user_id: context.userId,
          agent_name: thread.agent_name,
          role: "assistant",
          content: "",
          cursor_run_id: cursorRunId,
          status: "pending",
        })
        .select("id")
        .single();
      if (assistantError || !assistantMessage)
        throw new Error("Could not create assistant response");
      const { error: runError } = await context.supabase.from("cursor_runs").insert({
        thread_id: thread.id,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        user_id: context.userId,
        agent_name: thread.agent_name,
        cursor_agent_id: cursorAgentId,
        cursor_run_id: cursorRunId,
        source,
        status: "creating",
      });
      if (runError) throw new Error("Could not record Cursor run");
      return { assistantMessageId: assistantMessage.id, cursorAgentId, cursorRunId };
    } catch (error) {
      await context.supabase.from("cursor_messages").insert({
        thread_id: thread.id,
        user_id: context.userId,
        agent_name: thread.agent_name,
        role: "assistant",
        content: "",
        status: "error",
        error_code: "cursor_start_failed",
        error_message: error instanceof Error ? error.message : "Cursor request failed",
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  });

export const cancelCursorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ assistantMessageId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("cursor_runs")
      .select("id, agent_name, cursor_agent_id, cursor_run_id")
      .eq("assistant_message_id", data.assistantMessageId)
      .eq("user_id", context.userId)
      .single();
    if (error || !run) throw new Error("Run not found");
    const { cancelCursorRun } = await import("./cursor.server");
    await cancelCursorRun(run.agent_name, run.cursor_agent_id, run.cursor_run_id);
    await context.supabase
      .from("cursor_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await context.supabase
      .from("cursor_messages")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.assistantMessageId);
    return { ok: true };
  });
