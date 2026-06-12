// Idempotent ledger writer for `cursor_run_usage`. Adapter-shaped: the admin
// client is supplied by the consumer so the kit never imports a project-local
// `@/integrations/supabase/client.server`.

import type { CursorRunUsage } from "../types";
import type { GetAdminClient, OnRunRecorded } from "./adapters";

type Status = "complete" | "error" | "cancelled" | "running";

export type RecordRunUsageInput = {
  userId: string;
  threadId: string | null;
  agentName: string;
  cursorAgentId: string;
  cursorRunId: string;
  status: Status;
  model: string | null;
  usage: CursorRunUsage | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type RecordRunUsageDeps = {
  getAdminClient: GetAdminClient;
  onRunRecorded?: OnRunRecorded;
};

export async function recordRunUsage(deps: RecordRunUsageDeps, input: RecordRunUsageInput) {
  // Don't ledger runs that haven't terminated yet.
  if (input.status === "running") return;
  const admin = await deps.getAdminClient();
  const usage = input.usage;
  const row = {
    user_id: input.userId,
    thread_id: input.threadId,
    agent_name: input.agentName,
    cursor_agent_id: input.cursorAgentId,
    cursor_run_id: input.cursorRunId,
    model: input.model,
    status: input.status,
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    cache_read_tokens: usage?.cacheReadTokens ?? 0,
    cache_write_tokens: usage?.cacheWriteTokens ?? 0,
    total_cost_micros: usage?.totalCostMicros ?? null,
    cost_source: usage?.costSource ?? "unavailable",
    duration_ms: input.durationMs,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  };
  const { error } = await admin
    .from("cursor_run_usage")
    .upsert(row, { onConflict: "cursor_run_id" });
  if (error) {
    // Don't throw — usage tracking must never break the user's chat turn.
    console.error("[cursor_run_usage] upsert failed", {
      cursorRunId: input.cursorRunId,
      error: error.message,
    });
    return;
  }
  if (deps.onRunRecorded) {
    try {
      await deps.onRunRecorded({ ...input, status: input.status });
    } catch (err) {
      console.error("[cursor_run_usage] onRunRecorded callback threw", err);
    }
  }
}
