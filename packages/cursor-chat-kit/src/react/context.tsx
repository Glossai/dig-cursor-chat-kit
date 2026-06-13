import { createContext, useContext, type ReactNode } from "react";
import type { CursorThread } from "../types";

export type CursorChatClient = {
  listThreads(input: { agentName: string }): Promise<CursorThread[]>;
  createThread(input: { agentName: string; title: string }): Promise<CursorThread>;
  deleteThread(input: { threadId: string }): Promise<{ ok: true }>;
  sendMessage(input: { threadId: string; text: string }): Promise<{
    promptId: string;
    cursorAgentId: string;
    cursorRunId: string;
  }>;
  cancelMessage(input: { cursorAgentId: string; cursorRunId: string }): Promise<{ ok: true }>;
  getAccessToken(): Promise<string | null>;
  /** MUST navigate to a URL that uniquely identifies threadId; ignoring the argument breaks thread switching. */
  navigateToThread(threadId: string): void | Promise<void>;
  navigateHome?(): void | Promise<void>;
  streamBasePath?: string;
};

const CursorChatContext = createContext<CursorChatClient | null>(null);

export function CursorChatProvider({
  client,
  children,
}: {
  client: CursorChatClient;
  children: ReactNode;
}) {
  return <CursorChatContext.Provider value={client}>{children}</CursorChatContext.Provider>;
}

export function useCursorChatClient() {
  const client = useContext(CursorChatContext);
  if (!client) throw new Error("CursorAgentChat must be wrapped in CursorChatProvider");
  return client;
}