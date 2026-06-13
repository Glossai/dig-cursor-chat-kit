import type {
  CursorHydratedMessage,
  CursorRunStatus,
  CursorRunUsage,
  CursorThread,
  CursorThreadHydrated,
} from "../types";
import type {
  AgentConfigResolver,
  CursorAuthContext,
  CursorAuthPolicy,
  CursorAuthResolver,
  GetAdminClient,
  OnRunRecorded,
} from "./adapters";
import {
  cancelRun,
  createFollowupRun,
  fetchAgentUsageAll,
  fetchRunUsage,
  getAgentRun,
  listAgentRuns,
  openRunStream,
  pollLatestRunId,
  triggerAutomationWebhook,
} from "./cursor-api";
import { resolveRunCost } from "./pricing";
import { recordRunUsage, type RecordRunUsageInput } from "./usage";

const AGENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const CURSOR_ID = /^(bc|run)-[a-zA-Z0-9-]+$/;

type ThreadRow = CursorThread & { active_run_id: string | null };
type PromptRow = {
  id: string;
  thread_id: string;
  cursor_run_id: string;
  retry_of_run_id?: string | null;
  content: string;
  created_at: string;
};

export type CursorChatBackendOptions = {
  resolveAuth: CursorAuthResolver;
  resolveAgentConfig: AgentConfigResolver;
  getAdminClient: GetAdminClient;
  policy?: CursorAuthPolicy;
  onRunRecorded?: OnRunRecorded;
};

export type CursorChatBackend = ReturnType<typeof createCursorChatBackend>;

function requiredText(value: string, label: string, max: number) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new Error(`Invalid ${label}`);
  return cleaned;
}

function requiredAgentName(value: string) {
  if (!AGENT_NAME.test(value)) throw new Error("Invalid agent name");
  return value;
}

function requiredCursorId(value: string) {
  if (!CURSOR_ID.test(value)) throw new Error("Invalid Cursor id");
  return value;
}

function normalizeStatus(raw: string): CursorRunStatus {
  if (raw === "RUNNING" || raw === "CREATING") return "running";
  if (raw === "ERROR") return "error";
  if (raw === "CANCELLED" || raw === "EXPIRED") return "cancelled";
  return "complete";
}

export function createCursorChatBackend(options: CursorChatBackendOptions) {
  const auth = async (): Promise<CursorAuthContext> => {
    const context = await options.resolveAuth();
    if (!context.userId) throw new Error("Unauthorized");
    if (context.isAnonymous && options.policy?.allowAnonymous !== true) {
      throw new Error("Guest sessions are not allowed");
    }
    return context;
  };
  const ledger = (input: RecordRunUsageInput) =>
    recordRunUsage(
      { getAdminClient: options.getAdminClient, onRunRecorded: options.onRunRecorded },
      input,
    );

  return {
    async listThreads(input: { agentName: string; query?: string; archived?: boolean }) {
      const { userId, db } = await auth();
      const agentName = requiredAgentName(input.agentName);
      let request = db
        .from<ThreadRow[]>("cursor_threads")
        .select("id, agent_name, cursor_agent_id, title, created_at, updated_at, active_run_id, pinned_at, archived_at, last_viewed_at")
        .eq("user_id", userId)
        .eq("agent_name", agentName);
      request = input.archived ? request.not("archived_at", "is", null) : request.is("archived_at", null);
      request = request.order("updated_at", { ascending: false });
      if (input.query) request = request.or(`title.ilike.%${requiredText(input.query, "query", 160)}%`);
      const { data, error } = await request;
      if (error) throw new Error("Could not load conversations");
      const threads = data ?? [];
      const ids = threads.map((thread) => thread.id);
      const lastByThread = new Map<string, CursorThread["last_status"]>();
      if (ids.length > 0) {
        const usageResult = await db
          .from<Array<{ thread_id: string | null; status: string }>>("cursor_run_usage")
          .select("thread_id, status, created_at")
          .in("thread_id", ids)
          .order("created_at", { ascending: false });
        for (const row of usageResult.data ?? []) {
          if (row.thread_id && !lastByThread.has(row.thread_id)) {
            lastByThread.set(row.thread_id, row.status as CursorThread["last_status"]);
          }
        }
      }
      return threads.map((thread) => ({
        ...thread,
        last_status: lastByThread.get(thread.id) ?? null,
      }));
    },

    async createThread(input: { agentName: string; title?: string }) {
      const { userId, db } = await auth();
      const agentName = requiredAgentName(input.agentName);
      const title = requiredText(input.title ?? "New conversation", "title", 160);
      const { data, error } = await db
        .from<CursorThread>("cursor_threads")
        .insert({ user_id: userId, agent_name: agentName, title })
        .select("id, agent_name, cursor_agent_id, title, created_at, updated_at, active_run_id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not create conversation");
      return data;
    },

    async renameThread(input: { threadId: string; title: string }) {
      const { userId, db } = await auth();
      const title = requiredText(input.title, "title", 160);
      const { error } = await db
        .from("cursor_threads")
        .update({ title })
        .eq("id", input.threadId)
        .eq("user_id", userId);
      if (error) throw new Error("Could not rename conversation");
      return { ok: true as const };
    },

    async updateThread(input: { threadId: string; pinned?: boolean; archived?: boolean; viewed?: boolean }) {
      const { userId, db } = await auth();
      const now = new Date().toISOString();
      const patch: Record<string, string | null> = {};
      if (input.pinned !== undefined) patch.pinned_at = input.pinned ? now : null;
      if (input.archived !== undefined) patch.archived_at = input.archived ? now : null;
      if (input.viewed) patch.last_viewed_at = now;
      const { error } = await db.from("cursor_threads").update(patch).eq("id", input.threadId).eq("user_id", userId);
      if (error) throw new Error("Could not update conversation");
      return { ok: true as const };
    },

    async deleteThread(input: { threadId: string }) {
      const { userId, db } = await auth();
      const { error } = await db
        .from("cursor_threads")
        .delete()
        .eq("id", input.threadId)
        .eq("user_id", userId);
      if (error) throw new Error("Could not delete conversation");
      return { ok: true as const };
    },

    async getThread(input: { threadId: string }): Promise<CursorThreadHydrated> {
      const { userId, db } = await auth();
      const threadResult = await db
        .from<ThreadRow>("cursor_threads")
        .select("id, agent_name, cursor_agent_id, title, created_at, updated_at, active_run_id")
        .eq("id", input.threadId)
        .eq("user_id", userId)
        .single();
      const thread = threadResult.data;
      if (threadResult.error || !thread) throw new Error("Conversation not found");
      const promptsResult = await db
        .from<PromptRow[]>("cursor_messages")
        .select("id, thread_id, cursor_run_id, retry_of_run_id, content, created_at")
        .eq("thread_id", input.threadId)
        .order("created_at", { ascending: true });
      if (promptsResult.error) throw new Error("Could not load prompts");
      if (!thread.cursor_agent_id) return { thread, messages: [], liveRunId: null };

      const config = await options.resolveAgentConfig(thread.agent_name);
      const runs = await listAgentRuns(config, thread.cursor_agent_id).catch(() => []);
      runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const details = await Promise.all(
        runs.map(async (run) => {
          const detail = await getAgentRun(config, thread.cursor_agent_id ?? "", run.id).catch(
            () => null,
          );
          return [run.id, detail] as const;
        }),
      );
      const detailByRun = new Map(details);
      const usageByRun = await fetchAgentUsageAll(config, thread.cursor_agent_id).catch(
        () => new Map(),
      );
      const promptByRun = new Map((promptsResult.data ?? []).map((row) => [row.cursor_run_id, row]));
      const messages: CursorHydratedMessage[] = [];
      const backfills: RecordRunUsageInput[] = [];
      let liveRunId: string | null = null;

      for (const run of runs) {
        const prompt = promptByRun.get(run.id);
        const detail = detailByRun.get(run.id);
        if (prompt && !prompt.retry_of_run_id) {
          messages.push({
            kind: "user",
            id: `user-${prompt.id}`,
            cursor_run_id: run.id,
            content: prompt.content,
            createdAt: prompt.created_at,
          });
        }
        const status = normalizeStatus(detail?.status ?? run.status);
        if (status === "running" && (!liveRunId || thread.active_run_id === run.id)) {
          liveRunId = run.id;
        }
        const tokens = usageByRun.get(run.id) ?? null;
        const cost = tokens ? resolveRunCost(null, tokens, null) : null;
        const usage: CursorRunUsage | null = tokens
          ? {
              ...tokens,
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
        if (status !== "running") {
          backfills.push({
            userId,
            threadId: thread.id,
            agentName: thread.agent_name,
            cursorAgentId: thread.cursor_agent_id,
            cursorRunId: run.id,
            status,
            model: detail?.model ?? null,
            usage,
            durationMs: detail?.durationMs ?? null,
            startedAt: detail?.createdAt ?? run.createdAt,
            finishedAt: detail?.updatedAt ?? run.updatedAt ?? null,
          });
        }
      }
      if (backfills.length > 0) void Promise.all(backfills.map(ledger));
      return { thread, messages, liveRunId };
    },

    async sendMessage(input: { threadId: string; text: string }) {
      const { userId, db } = await auth();
      const text = requiredText(input.text, "message", 50_000);
      const threadResult = await db
        .from<Pick<ThreadRow, "id" | "agent_name" | "cursor_agent_id" | "title">>(
          "cursor_threads",
        )
        .select("id, agent_name, cursor_agent_id, title")
        .eq("id", input.threadId)
        .eq("user_id", userId)
        .single();
      const thread = threadResult.data;
      if (threadResult.error || !thread) throw new Error("Conversation not found");
      const config = await options.resolveAgentConfig(thread.agent_name);
      const cursorAgentId =
        thread.cursor_agent_id ?? (await triggerAutomationWebhook(config, text));
      const cursorRunId = thread.cursor_agent_id
        ? await createFollowupRun(config, cursorAgentId, text)
        : await pollLatestRunId(config, cursorAgentId);
      const promptResult = await db
        .from<{ id: string; created_at: string }>("cursor_messages")
        .insert({
          thread_id: thread.id,
          user_id: userId,
          cursor_run_id: cursorRunId,
          content: text,
        })
        .select("id, created_at")
        .single();
      if (promptResult.error || !promptResult.data) throw new Error("Could not save your prompt");
      const patch: Record<string, unknown> = {
        active_run_id: cursorRunId,
        updated_at: new Date().toISOString(),
      };
      if (!thread.cursor_agent_id) {
        patch.cursor_agent_id = cursorAgentId;
        patch.title = text.slice(0, 80);
      }
      const updateResult = await db
        .from("cursor_threads")
        .update(patch)
        .eq("id", thread.id)
        .eq("user_id", userId);
      if (updateResult.error) throw new Error("Could not update conversation");
      return {
        promptId: promptResult.data.id,
        promptCreatedAt: promptResult.data.created_at,
        cursorAgentId,
        cursorRunId,
      };
    },

    async cancelMessage(input: { cursorAgentId: string; cursorRunId: string }) {
      const { userId, db } = await auth();
      const agentId = requiredCursorId(input.cursorAgentId);
      const runId = requiredCursorId(input.cursorRunId);
      const threadResult = await db
        .from<{ id: string; agent_name: string }>("cursor_threads")
        .select("id, agent_name")
        .eq("cursor_agent_id", agentId)
        .eq("user_id", userId)
        .maybeSingle();
      const thread = threadResult.data;
      if (threadResult.error || !thread) throw new Error("Conversation not found");
      const config = await options.resolveAgentConfig(thread.agent_name);
      await cancelRun(config, agentId, runId);
      const detail = await getAgentRun(config, agentId, runId).catch(() => null);
      const accounting = await fetchRunUsage(config, agentId, runId, null, null).catch(() => null);
      await ledger({
        userId,
        threadId: thread.id,
        agentName: thread.agent_name,
        cursorAgentId: agentId,
        cursorRunId: runId,
        status: "cancelled",
        model: detail?.model ?? null,
        usage: accounting
          ? {
              ...accounting.usage,
              totalCostMicros: accounting.cost.totalCostMicros,
              costSource: accounting.cost.source,
            }
          : null,
        durationMs: detail?.durationMs ?? null,
        startedAt: detail?.createdAt ?? null,
        finishedAt: detail?.updatedAt ?? new Date().toISOString(),
      });
      await db
        .from("cursor_threads")
        .update({ active_run_id: null })
        .eq("id", thread.id)
        .eq("active_run_id", runId);
      return { ok: true as const };
    },

    async openStream(agentName: string, agentId: string, runId: string, lastEventId?: string | null) {
      const config = await options.resolveAgentConfig(requiredAgentName(agentName));
      return openRunStream(
        config,
        requiredCursorId(agentId),
        requiredCursorId(runId),
        lastEventId,
      );
    },

    fetchRunUsage: async (
      agentName: string,
      agentId: string,
      runId: string,
      model: string | null,
      providerCost: unknown,
    ) =>
      fetchRunUsage(
        await options.resolveAgentConfig(requiredAgentName(agentName)),
        requiredCursorId(agentId),
        requiredCursorId(runId),
        model,
        providerCost,
      ),
    getRun: async (agentName: string, agentId: string, runId: string) =>
      getAgentRun(
        await options.resolveAgentConfig(requiredAgentName(agentName)),
        requiredCursorId(agentId),
        requiredCursorId(runId),
      ),
    recordRunUsage: ledger,
  };
}