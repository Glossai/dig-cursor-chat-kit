// Domain types used across the kit. Pure — no project dependencies.
// Mirrors what the original `src/lib/cursor/types.ts` exposed.

export type CursorThread = {
  id: string;
  agent_name: string;
  cursor_agent_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  active_run_id?: string | null;
  last_status?: CursorRunStatus | null;
  pinned_at?: string | null;
  archived_at?: string | null;
  last_viewed_at?: string | null;
  unread?: boolean;
};

export type CursorUserPromptRow = {
  id: string;
  thread_id: string;
  cursor_run_id: string;
  retry_of_run_id?: string | null;
  content: string;
  created_at: string;
};

export type CursorRunStatus = "running" | "complete" | "error" | "cancelled";

export type CursorRunUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCostMicros: number | null;
  costSource: "provider" | "static_table" | "unavailable";
};

export type CursorHydratedMessage =
  | {
      kind: "user";
      id: string;
      cursor_run_id: string;
      content: string;
      createdAt: string;
    }
  | {
      kind: "assistant";
      id: string;
      cursor_run_id: string;
      content: string;
      status: CursorRunStatus;
      errorMessage?: string | null;
      usage?: CursorRunUsage | null;
      createdAt: string;
    };

export type CursorThreadHydrated = {
  thread: CursorThread;
  messages: CursorHydratedMessage[];
  liveRunId: string | null;
};

export type CursorStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; usage: CursorRunUsage | null }
  | { type: "error"; message: string };
