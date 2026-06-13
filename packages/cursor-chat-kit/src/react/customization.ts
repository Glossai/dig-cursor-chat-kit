import type { ComponentType, ReactNode } from "react";
import type { CursorThread } from "../types";

export type CursorChatLabels = {
  productName?: string;
  newThread?: string;
  newThreadTitle?: string;
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  openInCursor?: string;
  home?: string;
  deleteThread?: string;
  thinking?: string;
  error?: string;
};

export type CursorChatClassNames = {
  root?: string;
  sidebar?: string;
  header?: string;
  thread?: string;
  messages?: string;
  userMessage?: string;
  assistantMessage?: string;
  composer?: string;
  emptyState?: string;
};

export type CursorChatSlots = {
  header?: ComponentType<{ thread: CursorThread; status: ReactNode }>;
  emptyState?: ComponentType;
  codeBlock?: ComponentType<{ code: string; language?: string }>;
};

export type CursorChatFeatures = {
  sidebar?: boolean;
  codeHighlighting?: boolean;
  homeNavigation?: boolean;
};

export const defaultCursorChatLabels: Required<CursorChatLabels> = {
  productName: "Cursor Cloud",
  newThread: "New thread",
  newThreadTitle: "New conversation",
  placeholder: "Message Cursor…",
  emptyTitle: "What should Cursor build?",
  emptyDescription: "Describe a coding task. This thread keeps the same Cloud Agent and workspace for follow-ups.",
  openInCursor: "Open in Cursor",
  home: "Home",
  deleteThread: "Delete",
  thinking: "Thinking…",
  error: "Cursor could not complete this response.",
};

export const defaultCursorChatFeatures: Required<CursorChatFeatures> = {
  sidebar: true,
  codeHighlighting: true,
  homeNavigation: true,
};