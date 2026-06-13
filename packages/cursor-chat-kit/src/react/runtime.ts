import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useExternalStoreRuntime, type AppendMessage, type ThreadMessageLike } from "@assistant-ui/react";
import type { CursorHydratedMessage, CursorRunUsage } from "../types";
import { useCursorChatClient } from "./context";
import { readCursorStream } from "./stream";

type ActiveRun = { agentId: string; runId: string; abort: AbortController };
type Store = {
  agentId: string | null;
  messages: CursorHydratedMessage[];
  running: boolean;
  active: ActiveRun | null;
  listeners: Set<() => void>;
};
const stores = new Map<string, Store>();
const emit = (store: Store) => store.listeners.forEach((listener) => listener());
const notifyThreadList = (threadId: string) => window.dispatchEvent(new CustomEvent("cursor-thread-updated", { detail: { threadId } }));

function getStore(id: string, messages: CursorHydratedMessage[], agentId: string | null) {
  const existing = stores.get(id);
  if (existing) {
    if (!existing.agentId && agentId) existing.agentId = agentId;
    return existing;
  }
  const store: Store = { agentId, messages, running: false, active: null, listeners: new Set() };
  stores.set(id, store);
  return store;
}

export function useCursorThreadAgentId(threadId: string, fallback: string | null) {
  return useSyncExternalStore(
    (listener) => {
      const store = stores.get(threadId);
      store?.listeners.add(listener);
      return () => store?.listeners.delete(listener);
    },
    () => stores.get(threadId)?.agentId ?? fallback,
    () => fallback,
  );
}

function patch(store: Store, id: string, values: Partial<Extract<CursorHydratedMessage, { kind: "assistant" }>>) {
  store.messages = store.messages.map((message) =>
    message.id === id && message.kind === "assistant" ? { ...message, ...values } : message,
  );
  emit(store);
}

async function stream(client: ReturnType<typeof useCursorChatClient>, threadId: string, store: Store, agentId: string, runId: string, assistantId: string) {
  const abort = new AbortController();
  store.active = { agentId, runId, abort };
  store.running = true;
  emit(store);
  try {
    for await (const event of readCursorStream(client, agentId, runId, abort.signal)) {
      if (event.type === "delta") {
        const current = store.messages.find((message) => message.id === assistantId);
        patch(store, assistantId, { content: `${current?.content ?? ""}${event.text}` });
      } else if (event.type === "done") {
        patch(store, assistantId, { content: event.text, status: "complete", usage: event.usage });
      } else {
        patch(store, assistantId, { status: "error", errorMessage: event.message });
      }
    }
  } catch (error) {
    patch(store, assistantId, abort.signal.aborted
      ? { status: "cancelled" }
      : { status: "error", errorMessage: error instanceof Error ? error.message : "Stream failed" });
  } finally {
    if (store.active?.abort === abort) {
      store.active = null;
      store.running = false;
      emit(store);
      notifyThreadList(threadId);
    }
  }
}

function convert(message: CursorHydratedMessage): ThreadMessageLike {
  if (message.kind === "user") return { id: message.id, role: "user", content: [{ type: "text", text: message.content }], createdAt: new Date(message.createdAt) };
  const status = message.status === "running" ? { type: "running" as const }
    : message.status === "complete" ? { type: "complete" as const, reason: "stop" as const }
      : { type: "incomplete" as const, reason: message.status === "error" ? "error" as const : "cancelled" as const, error: message.errorMessage ?? undefined };
  return { id: message.id, role: "assistant", content: [{ type: "text", text: message.content }], status, metadata: message.usage ? { custom: { usage: message.usage as CursorRunUsage } } : undefined, createdAt: new Date(message.createdAt) };
}

export function useCursorRuntime(args: { threadId: string; agentId: string | null; initialMessages: CursorHydratedMessage[]; liveRunId: string | null }) {
  const client = useCursorChatClient();
  const store = useMemo(() => getStore(args.threadId, args.initialMessages, args.agentId), [args.threadId]);
  const subscribe = useCallback((listener: () => void) => { store.listeners.add(listener); return () => store.listeners.delete(listener); }, [store]);
  const messages = useSyncExternalStore(subscribe, () => store.messages, () => args.initialMessages);
  const isRunning = useSyncExternalStore(subscribe, () => store.running, () => false);

  useEffect(() => {
    if (!store.active && args.initialMessages.length > store.messages.length) {
      store.messages = args.initialMessages;
      store.agentId = args.agentId ?? store.agentId;
      emit(store);
    }
  }, [args.agentId, args.initialMessages, store]);
  useEffect(() => {
    if (!args.liveRunId || !args.agentId || store.active) return;
    const assistantId = `asst-${args.liveRunId}`;
    if (store.messages.some((message) => message.id === assistantId)) void stream(client, args.threadId, store, args.agentId, args.liveRunId, assistantId);
  }, [args.agentId, args.liveRunId, client, store]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content.map((part) => part.type === "text" ? part.text : "").join("").trim();
    if (!text) return;
    const stamp = Date.now();
    const userId = `user-tmp-${stamp}`;
    const assistantId = `asst-tmp-${stamp}`;
    const createdAt = new Date().toISOString();
    store.messages = [...store.messages,
      { kind: "user", id: userId, cursor_run_id: "", content: text, createdAt },
      { kind: "assistant", id: assistantId, cursor_run_id: "", content: "", status: "running", createdAt },
    ];
    store.running = true;
    emit(store);
    try {
      const started = await client.sendMessage({ threadId: args.threadId, text });
      const permanentAssistantId = `asst-${started.cursorRunId}`;
      store.agentId = started.cursorAgentId;
      store.messages = store.messages.map((item) => item.id === userId
        ? { ...item, id: `user-${started.promptId}`, cursor_run_id: started.cursorRunId }
        : item.id === assistantId ? { ...item, id: permanentAssistantId, cursor_run_id: started.cursorRunId } : item);
      emit(store);
      notifyThreadList(args.threadId);
      await stream(client, args.threadId, store, started.cursorAgentId, started.cursorRunId, permanentAssistantId);
    } catch (error) {
      patch(store, assistantId, { status: "error", errorMessage: error instanceof Error ? error.message : "Cursor request failed" });
      store.running = false;
      emit(store);
    }
  }, [args.threadId, client, store]);
  const onCancel = useCallback(async () => {
    const active = store.active;
    if (!active) return;
    active.abort.abort();
    await client.cancelMessage({ cursorAgentId: active.agentId, cursorRunId: active.runId }).catch(() => undefined);
  }, [client, store]);
  return useExternalStoreRuntime<CursorHydratedMessage>({
    messages,
    isRunning,
    convertMessage: convert,
    onNew,
    onCancel,
    setMessages: (next) => { store.messages = [...next]; emit(store); },
  });
}

export function useRetryCursorResponse(threadId: string) {
  const client = useCursorChatClient();
  return useCallback(async (cursorRunId: string) => {
    if (!/^(bc|run)-[a-zA-Z0-9-]+$/.test(cursorRunId)) return;
    const store = stores.get(threadId);
    if (!store || store.running || !client.retryMessage) return;
    const assistantId = `asst-retry-tmp-${Date.now()}`;
    store.messages = [...store.messages, { kind: "assistant", id: assistantId, cursor_run_id: "", content: "", status: "running", createdAt: new Date().toISOString() }];
    store.running = true;
    emit(store);
    try {
      const started = await client.retryMessage({ threadId, cursorRunId });
      const permanentId = `asst-${started.cursorRunId}`;
      store.messages = store.messages.map((message) => message.id === assistantId ? { ...message, id: permanentId, cursor_run_id: started.cursorRunId } : message);
      store.agentId = started.cursorAgentId;
      emit(store);
      notifyThreadList(threadId);
      await stream(client, threadId, store, started.cursorAgentId, started.cursorRunId, permanentId);
    } catch (error) {
      patch(store, assistantId, { status: "error", errorMessage: error instanceof Error ? error.message : "Retry failed" });
      store.running = false;
      emit(store);
    }
  }, [client, threadId]);
}