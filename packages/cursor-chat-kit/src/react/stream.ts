import type { CursorStreamEvent } from "../types";
import type { CursorChatClient } from "./context";

export async function* readCursorStream(
  client: CursorChatClient,
  agentId: string,
  runId: string,
  signal: AbortSignal,
): AsyncGenerator<CursorStreamEvent> {
  const token = await client.getAccessToken();
  if (!token) throw new Error("Please sign in to continue");
  const base = client.streamBasePath ?? "/api/cursor/stream";
  const response = await fetch(
    `${base}/${encodeURIComponent(runId)}?agentId=${encodeURIComponent(agentId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || "Could not open Cursor stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as CursorStreamEvent;
    }
  }
}