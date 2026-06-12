export type CursorThread = {
  id: string;
  agent_name: string;
  cursor_agent_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export type CursorMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "streaming" | "complete" | "error" | "cancelled";
  cursor_run_id: string | null;
  error_message: string | null;
  created_at: string;
  usage?: CursorRunUsage | null;
};

export type CursorRunUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCostMicros: number | null;
  costSource: "provider" | "static_table" | "unavailable";
};

export type CursorStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: CursorRunUsage | null }
  | { type: "error"; message: string };