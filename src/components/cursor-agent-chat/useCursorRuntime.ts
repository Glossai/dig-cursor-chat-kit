import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { cancelCursorMessage, sendCursorMessage } from "@/lib/cursor/chat.functions";
import type { CursorMessage } from "@/lib/cursor/types";
import { readCursorStream } from "./cursorStreamClient";

const textFromContent = (content: readonly unknown[]) =>
  content
    .map((part) =>
      typeof part === "object" && part && "type" in part && part.type === "text" && "text" in part
        ? String(part.text)
        : "",
    )
    .join("");

export function useCursorRuntime(threadId: string, messages: CursorMessage[]) {
  const send = useServerFn(sendCursorMessage);
  const cancel = useServerFn(cancelCursorMessage);
  const initialMessages = useMemo<ThreadMessageLike[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: [{ type: "text" as const, text: message.content }],
        status:
          message.status === "error"
            ? {
                type: "incomplete" as const,
                reason: "error" as const,
                error: message.error_message ?? "Cursor failed",
              }
            : { type: "complete" as const, reason: "stop" as const },
        metadata: message.usage ? { custom: { usage: message.usage } } : undefined,
        createdAt: new Date(message.created_at),
      })),
    [messages],
  );

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages: runtimeMessages, abortSignal }) {
        const latest = runtimeMessages.at(-1);
        if (!latest || latest.role !== "user") throw new Error("A user message is required");
        const text = textFromContent(latest.content);
        const started = await send({ data: { threadId, text } });
        let responseText = "";
        const onAbort = () => {
          void cancel({ data: { assistantMessageId: started.assistantMessageId } }).catch(
            () => undefined,
          );
        };
        abortSignal.addEventListener("abort", onAbort, { once: true });
        try {
          for await (const event of readCursorStream(started.assistantMessageId, abortSignal)) {
            if (event.type === "delta") {
              responseText += event.text;
              yield { content: [{ type: "text", text: responseText }] };
            }
            if (event.type === "error") throw new Error(event.message);
            if (event.type === "done") {
              yield {
                content: [{ type: "text", text: responseText }],
                metadata: event.usage ? { custom: { usage: event.usage } } : undefined,
              };
              return;
            }
          }
        } finally {
          abortSignal.removeEventListener("abort", onAbort);
        }
        return;
      },
    }),
    [cancel, send, threadId],
  );

  return useLocalRuntime(adapter, { initialMessages });
}
