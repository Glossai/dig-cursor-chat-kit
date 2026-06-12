import { supabase } from "@/integrations/supabase/client";
import type { CursorStreamEvent } from "@/lib/cursor/types";

export async function* readCursorStream(messageId: string, signal: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in to continue");
  const response = await fetch(`/api/cursor/stream/${encodeURIComponent(messageId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error((await response.text()) || "Could not open Cursor stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as CursorStreamEvent;
  }
}
