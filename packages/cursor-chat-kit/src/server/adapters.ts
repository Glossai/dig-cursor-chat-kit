// Adapter interfaces the kit will depend on. Phase 1 only declares the shapes;
// the project wires concrete Supabase clients on its side. Phase 2 of the
// extraction (see docs/cursor-chat-kit-architecture.md) replaces the direct
// `@/integrations/supabase/*` imports in the project shims with these.

import type { CursorRunUsage } from "../types";

/** Minimal shape required from a Supabase-compatible admin client. */
export type AdminClientLike = {
  from(table: string): {
    upsert(values: Record<string, unknown>, opts?: { onConflict?: string }): Promise<{
      error: { message: string } | null;
    }>;
  };
};

/** Loaded lazily inside server handlers to keep service-role keys server-only. */
export type GetAdminClient = () => Promise<AdminClientLike> | AdminClientLike;

/** Per-agent secrets resolved at request time (env, KMS, Vault — consumer's choice). */
export type AgentConfig = {
  apiKey: string;
  webhookUrl: string;
  webhookToken: string;
  apiBaseUrl?: string;
};

export type AgentConfigResolver = (agentName: string) => AgentConfig | Promise<AgentConfig>;

/** Fired once per terminal run; consumers can forward to billing/analytics. */
export type RunRecordedEvent = {
  userId: string;
  threadId: string | null;
  agentName: string;
  cursorAgentId: string;
  cursorRunId: string;
  model: string | null;
  status: "complete" | "error" | "cancelled";
  usage: CursorRunUsage | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type OnRunRecorded = (event: RunRecordedEvent) => void | Promise<void>;
