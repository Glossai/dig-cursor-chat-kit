import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { cancelCursorMessage, sendCursorMessage } from "@/lib/cursor/chat.functions";
import type { CursorHydratedMessage, CursorRunUsage } from "@/lib/cursor/types";
import { readCursorStream } from "./cursorStreamClient";

function extractText(content: AppendMessage["content"]): string {
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function convertMessage(m: CursorHydratedMessage): ThreadMessageLike {
  if (m.kind === "user") {
    return {
      id: m.id,
      role: "user",
      content: [{ type: "text", text: m.content }],
      createdAt: new Date(m.createdAt),
    };
  }
  const status =
    m.status === "running"
      ? ({ type: "running" } as const)
      : m.status === "error"
        ? ({
            type: "incomplete",
            reason: "error",
            error: m.errorMessage ?? "Cursor failed",
          } as const)
        : m.status === "cancelled"
          ? ({ type: "incomplete", reason: "cancelled" } as const)
          : ({ type: "complete", reason: "stop" } as const);
  return {
    id: m.id,
    role: "assistant",
    content: [{ type: "text", text: m.content }],
    status,
    metadata: m.usage ? { custom: { usage: m.usage } } : undefined,
    createdAt: new Date(m.createdAt),
  };
}

type RuntimeArgs = {
  threadId: string;
  agentId: string | null;
  initialMessages: CursorHydratedMessage[];
  liveRunId: string | null;
};

export function useCursorRuntime({
  threadId,
  agentId,
  initialMessages,
  liveRunId,
}: RuntimeArgs) {
  const send = useServerFn(sendCursorMessage);
  const cancel = useServerFn(cancelCursorMessage);

  const [messages, setMessages] = useState<CursorHydratedMessage[]>(initialMessages);
  const [isRunning, setIsRunning] = useState(liveRunId != null);
  const agentIdRef = useRef<string | null>(agentId);
  const activeRunRef = useRef<{ agentId: string; runId: string; abort: AbortController } | null>(
    null,
  );

  // Keep refs fresh
  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  const patchMessage = useCallback(
    (id: string, patch: Partial<Extract<CursorHydratedMessage, { kind: "assistant" }>>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id && m.kind === "assistant" ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const streamRun = useCallback(
    async (streamAgentId: string, runId: string, assistantId: string) => {
      const controller = new AbortController();
      activeRunRef.current = { agentId: streamAgentId, runId, abort: controller };
      setIsRunning(true);
      try {
        for await (const event of readCursorStream(streamAgentId, runId, controller.signal)) {
          if (event.type === "delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.kind === "assistant"
                  ? { ...m, content: m.content + event.text }
                  : m,
              ),
            );
          } else if (event.type === "done") {
            patchMessage(assistantId, {
              content: event.text,
              status: "complete",
              usage: event.usage as CursorRunUsage | null,
            });
            return;
          } else if (event.type === "error") {
            patchMessage(assistantId, { status: "error", errorMessage: event.message });
            return;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          patchMessage(assistantId, { status: "cancelled" });
        } else {
          patchMessage(assistantId, {
            status: "error",
            errorMessage: error instanceof Error ? error.message : "Stream failed",
          });
        }
      } finally {
        if (activeRunRef.current?.runId === runId) activeRunRef.current = null;
        setIsRunning(false);
      }
    },
    [patchMessage],
  );

  // Auto-resume an in-flight run on mount
  useEffect(() => {
    if (!liveRunId || !agentId) return;
    const assistantId = `asst-${liveRunId}`;
    // Only attach if we have a placeholder for it and no stream already running
    const hasPlaceholder = initialMessages.some((m) => m.id === assistantId);
    if (!hasPlaceholder || activeRunRef.current) return;
    void streamRun(agentId, liveRunId, assistantId);
    return () => {
      activeRunRef.current?.abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = extractText(message.content);
      if (!text) return;
      const tempUserId = `user-tmp-${Date.now()}`;
      const tempAssistantId = `asst-tmp-${Date.now()}`;
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          kind: "user",
          id: tempUserId,
          cursor_run_id: "",
          content: text,
          createdAt: now,
        },
        {
          kind: "assistant",
          id: tempAssistantId,
          cursor_run_id: "",
          content: "",
          status: "running",
          createdAt: now,
        },
      ]);
      setIsRunning(true);

      let started: Awaited<ReturnType<typeof send>>;
      try {
        started = await send({ data: { threadId, text } });
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId && m.kind === "assistant"
              ? {
                  ...m,
                  status: "error",
                  errorMessage: error instanceof Error ? error.message : "Cursor request failed",
                }
              : m,
          ),
        );
        setIsRunning(false);
        return;
      }

      const permanentUserId = `user-${started.promptId}`;
      const permanentAssistantId = `asst-${started.cursorRunId}`;
      agentIdRef.current = started.cursorAgentId;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === tempUserId)
            return { ...m, id: permanentUserId, cursor_run_id: started.cursorRunId };
          if (m.id === tempAssistantId)
            return { ...m, id: permanentAssistantId, cursor_run_id: started.cursorRunId };
          return m;
        }),
      );

      await streamRun(started.cursorAgentId, started.cursorRunId, permanentAssistantId);
    },
    [send, streamRun, threadId],
  );

  const onCancel = useCallback(async () => {
    const active = activeRunRef.current;
    if (!active) return;
    active.abort.abort();
    try {
      await cancel({
        data: { cursorAgentId: active.agentId, cursorRunId: active.runId },
      });
    } catch {
      // already terminal — fine
    }
  }, [cancel]);

  return useExternalStoreRuntime<CursorHydratedMessage>({
    messages,
    setMessages,
    isRunning,
    convertMessage,
    onNew,
    onCancel,
  });
}
