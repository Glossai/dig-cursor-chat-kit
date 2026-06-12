import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CursorHydratedMessage,
  CursorRunUsage,
  CursorThread,
  CursorThreadHydrated,
} from "./types";

const agentName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const threadId = z.string().uuid();
const cursorId = z.string().regex(/^(bc|run)-[a-zA-Z0-9-]+$/);

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

/**
 * Hydrate a thread by merging DB-stored user prompts with live state from
 * Cursor's API. Cursor is the source of truth for runs/assistant text/usage.
 */
export const getCursorThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId }))
  .handler(async ({ data, context }): Promise<CursorThreadHydrated> => {
    const { data: thread, error: threadError } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .single();
    if (threadError || !thread) throw new Error("Conversation not found");
    const { data: prompts, error: promptsError } = await context.supabase
      .from("cursor_messages")
      .select("id, thread_id, cursor_run_id, content, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (promptsError) throw new Error("Could not load prompts");
    const promptByRunId = new Map((prompts ?? []).map((p) => [p.cursor_run_id, p]));

    // No Cursor agent yet → fresh thread, nothing to hydrate
    if (!thread.cursor_agent_id) {
      return {
        thread: thread as CursorThread,
        messages: [],
        liveRunId: null,
      };
    }

    const cursor = await import("./cursor.server");
    const runs = await cursor
      .listAgentRuns(thread.agent_name, thread.cursor_agent_id)
      .catch(() => []);
    // List Runs returns newest-first; we render oldest-first
    runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Per-run details (terminal runs have `result`). Parallel-fetch with a cap.
    const detailEntries = await Promise.all(
      runs.map((run) =>
        cursor
          .getAgentRun(thread.agent_name, thread.cursor_agent_id!, run.id)
          .then((d) => [run.id, d] as const)
          .catch(() => [run.id, null] as const),
      ),
    );
    const detailByRunId = new Map(detailEntries);

    // Usage in a single call
    const usageByRunId = await cursor
      .fetchAgentUsageAll(thread.agent_name, thread.cursor_agent_id)
      .catch(() => new Map());

    const { resolveRunCost } = await import("./pricing.server");

    const messages: CursorHydratedMessage[] = [];
    let liveRunId: string | null = null;

    for (const run of runs) {
      const prompt = promptByRunId.get(run.id);
      const detail = detailByRunId.get(run.id);
      // User prompt (from DB) — Cursor's API does not echo prompts back.
      if (prompt) {
        messages.push({
          kind: "user",
          id: `user-${prompt.id}`,
          cursor_run_id: run.id,
          content: prompt.content,
          createdAt: prompt.created_at,
        });
      }
      // Assistant — content + status from Cursor
      const status: CursorHydratedMessage["kind"] extends "assistant"
        ? never
        : never extends never
          ? "running" | "complete" | "error" | "cancelled"
          : never = (() => {
        const raw = (detail?.status ?? run.status) as string;
        if (raw === "RUNNING" || raw === "CREATING") return "running" as const;
        if (raw === "ERROR") return "error" as const;
        if (raw === "CANCELLED" || raw === "EXPIRED") return "cancelled" as const;
        return "complete" as const;
      })();
      if (status === "running" && !liveRunId) liveRunId = run.id;

      const tokens = usageByRunId.get(run.id) ?? null;
      const cost = tokens ? resolveRunCost(null, tokens, null) : null;
      const usage: CursorRunUsage | null = tokens
        ? {
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            cacheReadTokens: tokens.cacheReadTokens,
            cacheWriteTokens: tokens.cacheWriteTokens,
            totalTokens: tokens.totalTokens,
            totalCostMicros: cost?.totalCostMicros ?? null,
            costSource: cost?.source ?? "unavailable",
          }
        : null;

      messages.push({
        kind: "assistant",
        id: `asst-${run.id}`,
        cursor_run_id: run.id,
        content: detail?.result ?? "",
        status,
        usage,
        createdAt: detail?.updatedAt ?? run.updatedAt ?? run.createdAt,
      });
    }

    return {
      thread: thread as CursorThread,
      messages,
      liveRunId,
    };
  });

/**
 * Start a new turn. Calls Cursor first; only persists the user prompt once
 * Cursor has accepted it and returned a run id. The client then opens the
 * SSE stream at /api/cursor/stream/{runId}?agentId={agentId}.
 */
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

    const cursor = await import("./cursor.server");
    const cursorAgentId =
      thread.cursor_agent_id ??
      (await cursor.triggerAutomationWebhook(thread.agent_name, data.text));
    const cursorRunId = thread.cursor_agent_id
      ? await cursor.createFollowupRun(thread.agent_name, cursorAgentId, data.text)
      : await cursor.pollLatestRunId(thread.agent_name, cursorAgentId);

    // Persist the user prompt (only now that Cursor has accepted it)
    const { data: prompt, error: promptError } = await context.supabase
      .from("cursor_messages")
      .insert({
        thread_id: thread.id,
        user_id: context.userId,
        cursor_run_id: cursorRunId,
        content: data.text,
      })
      .select("id, created_at")
      .single();
    if (promptError || !prompt) throw new Error("Could not save your prompt");

    // First message in a thread: link the agent and seed a title
    if (!thread.cursor_agent_id) {
      const { error } = await context.supabase
        .from("cursor_threads")
        .update({ cursor_agent_id: cursorAgentId, title: data.text.slice(0, 80) })
        .eq("id", thread.id)
        .eq("user_id", context.userId);
      if (error) throw new Error("Could not link Cursor agent");
    } else {
      // Touch updated_at so the sidebar reorders
      await context.supabase
        .from("cursor_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", thread.id)
        .eq("user_id", context.userId);
    }

    return {
      promptId: prompt.id,
      promptCreatedAt: prompt.created_at,
      cursorAgentId,
      cursorRunId,
    };
  });

/**
 * Cancel an in-flight run. Caller supplies the Cursor IDs (held client-side
 * once a run is started); we authorize by confirming the user owns a thread
 * with that cursor_agent_id.
 */
export const cancelCursorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ cursorAgentId: cursorId, cursorRunId: cursorId }))
  .handler(async ({ data, context }) => {
    const { data: thread, error } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name")
      .eq("cursor_agent_id", data.cursorAgentId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !thread) throw new Error("Conversation not found");
    const { cancelCursorRun } = await import("./cursor.server");
    await cancelCursorRun(thread.agent_name, data.cursorAgentId, data.cursorRunId);
    return { ok: true };
  });
