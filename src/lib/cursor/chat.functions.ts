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
  .inputValidator(z.object({ agentName, query: z.string().trim().max(160).optional(), archived: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    let matchingIds: string[] | null = null;
    if (data.query) {
      const { data: matches, error: searchError } = await context.supabase
        .from("cursor_messages")
        .select("thread_id")
        .ilike("content", `%${data.query}%`);
      if (searchError) throw new Error("Could not search conversations");
      matchingIds = [...new Set((matches ?? []).map((row) => row.thread_id))];
    }
    let request = context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at, active_run_id, pinned_at, archived_at, last_viewed_at")
      .eq("agent_name", data.agentName)
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    request = data.archived ? request.not("archived_at", "is", null) : request.is("archived_at", null);
    if (data.query) {
      const escaped = data.query.replace(/[%_,()]/g, "");
      request = request.or(`title.ilike.%${escaped}%,id.in.(${(matchingIds ?? []).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    }
    const { data: rows, error } = await request;
    if (error) throw new Error("Could not load conversations");
    const threads = (rows ?? []) as Array<CursorThread & { active_run_id: string | null }>;
    const ids = threads.map((t) => t.id);
    const lastByThread = new Map<string, CursorThread["last_status"]>();
    if (ids.length > 0) {
      const { data: usage } = await context.supabase
        .from("cursor_run_usage")
        .select("thread_id, status, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      for (const row of usage ?? []) {
        if (!row.thread_id || lastByThread.has(row.thread_id)) continue;
        lastByThread.set(row.thread_id, row.status as CursorThread["last_status"]);
      }
    }
    return threads.map((t) => ({
      ...t,
      last_status: lastByThread.get(t.id) ?? null,
      unread: Boolean(t.last_viewed_at && new Date(t.updated_at) > new Date(t.last_viewed_at) && !t.active_run_id),
    })) as CursorThread[];
  });


export const createCursorThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ agentName, title: z.string().trim().min(1).max(160).default("New conversation") }),
  )
  .handler(async ({ data, context }) => {
    if (context.claims?.is_anonymous) {
      throw new Error("Guest sessions can't start a conversation. Please sign in.");
    }
    const { data: row, error } = await context.supabase
      .from("cursor_threads")
      .insert({ user_id: context.userId, agent_name: data.agentName, title: data.title })
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create conversation");
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

export const updateCursorThreadState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    threadId,
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    viewed: z.boolean().optional(),
  }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const patch: { pinned_at?: string | null; archived_at?: string | null; last_viewed_at?: string | null } = {};
    if (data.pinned !== undefined) patch.pinned_at = data.pinned ? now : null;
    if (data.archived !== undefined) patch.archived_at = data.archived ? now : null;
    if (data.viewed) patch.last_viewed_at = now;
    const { error } = await context.supabase
      .from("cursor_threads")
      .update(patch)
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update conversation");
    return { ok: true as const };
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
      .select("id, agent_name, cursor_agent_id, title, created_at, updated_at, active_run_id")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .single();
    if (threadError || !thread) throw new Error("Conversation not found");
    const pinnedRunId = thread.active_run_id;
    const { data: prompts, error: promptsError } = await context.supabase
      .from("cursor_messages")
      .select("id, thread_id, cursor_run_id, retry_of_run_id, content, created_at")
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
    const backfillRows: Array<Parameters<typeof import("./usage.server").recordRunUsage>[0]> = [];

    for (const run of runs) {
      const prompt = promptByRunId.get(run.id);
      const detail = detailByRunId.get(run.id);
      // User prompt (from DB) — Cursor's API does not echo prompts back.
      if (prompt && !prompt.retry_of_run_id) {
        messages.push({
          kind: "user",
          id: `user-${prompt.id}`,
          cursor_run_id: run.id,
          content: prompt.content,
          createdAt: prompt.created_at,
        });
      }
      // Assistant — content + status from Cursor
      const raw = (detail?.status ?? run.status) as string;
      const status: "running" | "complete" | "error" | "cancelled" =
        raw === "RUNNING" || raw === "CREATING"
          ? "running"
          : raw === "ERROR"
            ? "error"
            : raw === "CANCELLED" || raw === "EXPIRED"
              ? "cancelled"
              : "complete";
      if (status === "running" && !liveRunId) liveRunId = run.id;
      if (pinnedRunId && run.id === pinnedRunId && status === "running") liveRunId = run.id;

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

      // Queue terminal runs for ledger backfill (upsert is idempotent so
      // re-hydrations are cheap and never double-count).
      if (status !== "running") {
        backfillRows.push({
          userId: context.userId,
          threadId: thread.id,
          agentName: thread.agent_name,
          cursorAgentId: thread.cursor_agent_id!,
          cursorRunId: run.id,
          status,
          model: detail?.model ?? null,
          usage,
          durationMs: detail?.durationMs ?? null,
          startedAt: detail?.createdAt ?? run.createdAt ?? null,
          finishedAt: detail?.updatedAt ?? run.updatedAt ?? null,
        });
      }
    }

    if (backfillRows.length > 0) {
      const { recordRunUsage } = await import("./usage.server");
      // Fire-and-forget — hydration latency stays low; upsert tolerates retries.
      void Promise.all(backfillRows.map((r) => recordRunUsage(r)));
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

    // Always pin the new run as the thread's active run so reload/toggle
    // can reconnect instantly without listing runs.
    const threadPatch: {
      active_run_id: string;
      updated_at: string;
      cursor_agent_id?: string;
      title?: string;
    } = {
      active_run_id: cursorRunId,
      updated_at: new Date().toISOString(),
    };
    if (!thread.cursor_agent_id) {
      threadPatch.cursor_agent_id = cursorAgentId;
      threadPatch.title = data.text.slice(0, 80);
    }
    const { error: threadUpdateError } = await context.supabase
      .from("cursor_threads")
      .update(threadPatch)
      .eq("id", thread.id)
      .eq("user_id", context.userId);
    if (threadUpdateError) throw new Error("Could not update conversation");

    return {
      promptId: prompt.id,
      promptCreatedAt: prompt.created_at,
      cursorAgentId,
      cursorRunId,
    };
  });

export const retryCursorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ threadId, cursorRunId: cursorId }))
  .handler(async ({ data, context }) => {
    const { data: thread, error: threadError } = await context.supabase
      .from("cursor_threads")
      .select("id, agent_name, cursor_agent_id")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .single();
    if (threadError || !thread?.cursor_agent_id) throw new Error("Conversation not found");
    const { data: prompt, error: promptError } = await context.supabase
      .from("cursor_messages")
      .select("content")
      .eq("thread_id", data.threadId)
      .eq("cursor_run_id", data.cursorRunId)
      .eq("user_id", context.userId)
      .single();
    if (promptError || !prompt) throw new Error("Original prompt not found");
    const cursor = await import("./cursor.server");
    const retryRunId = await cursor.createFollowupRun(thread.agent_name, thread.cursor_agent_id, prompt.content);
    const { data: retry, error: retryError } = await context.supabase
      .from("cursor_messages")
      .insert({ thread_id: thread.id, user_id: context.userId, cursor_run_id: retryRunId, content: prompt.content, retry_of_run_id: data.cursorRunId })
      .select("id, created_at")
      .single();
    if (retryError || !retry) throw new Error("Could not retry response");
    const { error: updateError } = await context.supabase
      .from("cursor_threads")
      .update({ active_run_id: retryRunId, updated_at: new Date().toISOString() })
      .eq("id", thread.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error("Could not update conversation");
    return { promptId: retry.id, cursorAgentId: thread.cursor_agent_id, cursorRunId: retryRunId };
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
    const cursor = await import("./cursor.server");
    await cursor.cancelCursorRun(thread.agent_name, data.cursorAgentId, data.cursorRunId);
    // Ledger the cancellation + best-effort final usage snapshot
    const detail = await cursor
      .getAgentRun(thread.agent_name, data.cursorAgentId, data.cursorRunId)
      .catch(() => null);
    const accounting = await cursor
      .fetchRunUsage(thread.agent_name, data.cursorAgentId, data.cursorRunId, null, null)
      .catch(() => null);
    const { recordRunUsage } = await import("./usage.server");
    await recordRunUsage({
      userId: context.userId,
      threadId: thread.id,
      agentName: thread.agent_name,
      cursorAgentId: data.cursorAgentId,
      cursorRunId: data.cursorRunId,
      status: "cancelled",
      model: detail?.model ?? null,
      usage: accounting
        ? {
            inputTokens: accounting.usage.inputTokens,
            outputTokens: accounting.usage.outputTokens,
            cacheReadTokens: accounting.usage.cacheReadTokens,
            cacheWriteTokens: accounting.usage.cacheWriteTokens,
            totalTokens: accounting.usage.totalTokens,
            totalCostMicros: accounting.cost.totalCostMicros,
            costSource: accounting.cost.source,
          }
        : null,
      durationMs: detail?.durationMs ?? null,
      startedAt: detail?.createdAt ?? null,
      finishedAt: detail?.updatedAt ?? new Date().toISOString(),
    });
    // Drop the active_run_id pin if it still points to us
    await context.supabase
      .from("cursor_threads")
      .update({ active_run_id: null })
      .eq("id", thread.id)
      .eq("active_run_id", data.cursorRunId);
    return { ok: true };
  });
