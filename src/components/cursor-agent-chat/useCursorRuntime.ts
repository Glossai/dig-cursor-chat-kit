import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { cancelCursorMessage, sendCursorMessage } from "@/lib/cursor/chat.functions";
import type { CursorHydratedMessage, CursorRunUsage } from "@/lib/cursor/types";
import { readCursorStream } from "./cursorStreamClient";

/* ------------------------------------------------------------------
 * Module-level per-thread store
 *
 * Keeps messages + in-flight SSE alive across thread toggles. When the
 * user navigates away from a chat the component unmounts, but the store
 * (and the AbortController-backed stream loop) keep running. On return,
 * the new mount re-subscribes and immediately sees current text / status.
 * ------------------------------------------------------------------ */

type ActiveRun = { agentId: string; runId: string; abort: AbortController };

type ThreadStore = {
  threadId: string;
  agentId: string | null;
  messages: CursorHydratedMessage[];
  isRunning: boolean;
  activeRun: ActiveRun | null;
  listeners: Set<() => void>;
};

const stores = new Map<string, ThreadStore>();

/** Subscribe to the live agentId for a thread (updates after first send). */
export function useCursorThreadAgentId(threadId: string, fallback: string | null) {
  const store = stores.get(threadId);
  return useSyncExternalStore(
    (cb) => {
      const s = stores.get(threadId);
      if (!s) return () => {};
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    () => store?.agentId ?? fallback,
    () => store?.agentId ?? fallback,
  );
}

function getOrCreateStore(
  threadId: string,
  initialMessages: CursorHydratedMessage[],
  agentId: string | null,
): ThreadStore {
  let store = stores.get(threadId);
  if (!store) {
    store = {
      threadId,
      agentId,
      messages: initialMessages,
      isRunning: false,
      activeRun: null,
      listeners: new Set(),
    };
    stores.set(threadId, store);
  }
  return store;
}

function notify(store: ThreadStore) {
  for (const l of store.listeners) l();
}

function patchAssistant(
  store: ThreadStore,
  id: string,
  patch: Partial<Extract<CursorHydratedMessage, { kind: "assistant" }>>,
) {
  store.messages = store.messages.map((m) =>
    m.id === id && m.kind === "assistant" ? { ...m, ...patch } : m,
  );
  notify(store);
}

async function runStreamLoop(
  store: ThreadStore,
  agentId: string,
  runId: string,
  assistantId: string,
) {
  const controller = new AbortController();
  store.activeRun = { agentId, runId, abort: controller };
  store.isRunning = true;
  notify(store);
  try {
    for await (const event of readCursorStream(agentId, runId, controller.signal)) {
      if (event.type === "delta") {
        store.messages = store.messages.map((m) =>
          m.id === assistantId && m.kind === "assistant"
            ? { ...m, content: m.content + event.text }
            : m,
        );
        notify(store);
      } else if (event.type === "done") {
        patchAssistant(store, assistantId, {
          content: event.text,
          status: "complete",
          usage: event.usage as CursorRunUsage | null,
        });
        return;
      } else if (event.type === "error") {
        patchAssistant(store, assistantId, { status: "error", errorMessage: event.message });
        return;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      patchAssistant(store, assistantId, { status: "cancelled" });
    } else {
      patchAssistant(store, assistantId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Stream failed",
      });
    }
  } finally {
    if (store.activeRun?.runId === runId) store.activeRun = null;
    store.isRunning = false;
    notify(store);
  }
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

function extractText(content: AppendMessage["content"]): string {
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
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

  const store = useMemo(
    () => getOrCreateStore(threadId, initialMessages, agentId),
    // initialMessages identity changes on re-hydrate; that's intentional —
    // see the reconciliation effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId],
  );

  const subscribe = useCallback(
    (cb: () => void) => {
      store.listeners.add(cb);
      return () => store.listeners.delete(cb);
    },
    [store],
  );
  const messages = useSyncExternalStore(
    subscribe,
    () => store.messages,
    () => store.messages,
  );
  const isRunning = useSyncExternalStore(
    subscribe,
    () => store.isRunning,
    () => store.isRunning,
  );

  // Reconcile: when the server hydration delivers a fresher snapshot than
  // what we have cached (and we aren't actively streaming), adopt it.
  useEffect(() => {
    if (store.activeRun) return; // never clobber a live stream
    if (initialMessages.length > store.messages.length) {
      store.messages = initialMessages;
      store.agentId = agentId;
      notify(store);
    }
  }, [initialMessages, agentId, store]);

  // Auto-resume an in-flight run on mount (when the server told us one is
  // running and we don't already have a stream attached locally).
  useEffect(() => {
    if (!liveRunId || !agentId) return;
    if (store.activeRun) return;
    const assistantId = `asst-${liveRunId}`;
    const hasPlaceholder = store.messages.some((m) => m.id === assistantId);
    if (!hasPlaceholder) return;
    void runStreamLoop(store, agentId, liveRunId, assistantId);
    // Intentionally do NOT abort on unmount — the stream should keep going
    // while the user is on another thread.
  }, [liveRunId, agentId, store]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = extractText(message.content);
      if (!text) return;
      const tempUserId = `user-tmp-${Date.now()}`;
      const tempAssistantId = `asst-tmp-${Date.now()}`;
      const now = new Date().toISOString();
      store.messages = [
        ...store.messages,
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
      ];
      store.isRunning = true;
      notify(store);

      let started: Awaited<ReturnType<typeof send>>;
      try {
        started = await send({ data: { threadId, text } });
      } catch (error) {
        store.messages = store.messages.map((m) =>
          m.id === tempAssistantId && m.kind === "assistant"
            ? {
                ...m,
                status: "error",
                errorMessage: error instanceof Error ? error.message : "Cursor request failed",
              }
            : m,
        );
        store.isRunning = false;
        notify(store);
        return;
      }

      const permanentUserId = `user-${started.promptId}`;
      const permanentAssistantId = `asst-${started.cursorRunId}`;
      store.agentId = started.cursorAgentId;
      store.messages = store.messages.map((m) => {
        if (m.id === tempUserId)
          return { ...m, id: permanentUserId, cursor_run_id: started.cursorRunId };
        if (m.id === tempAssistantId)
          return { ...m, id: permanentAssistantId, cursor_run_id: started.cursorRunId };
        return m;
      });
      notify(store);

      await runStreamLoop(
        store,
        started.cursorAgentId,
        started.cursorRunId,
        permanentAssistantId,
      );
    },
    [send, store, threadId],
  );

  const onCancel = useCallback(async () => {
    const active = store.activeRun;
    if (!active) return;
    active.abort.abort();
    try {
      await cancel({
        data: { cursorAgentId: active.agentId, cursorRunId: active.runId },
      });
    } catch {
      // already terminal — fine
    }
  }, [cancel, store]);

  const setMessages = useCallback(
    (next: readonly CursorHydratedMessage[]) => {
      store.messages = [...next];
      notify(store);
    },
    [store],
  );

  return useExternalStoreRuntime<CursorHydratedMessage>({
    messages,
    setMessages,
    isRunning,
    convertMessage,
    onNew,
    onCancel,
  });
}
