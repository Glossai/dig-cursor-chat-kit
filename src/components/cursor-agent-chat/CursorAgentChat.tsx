import { ExternalLink } from "lucide-react";
import { AssistantRuntimeProvider, useThread } from "@assistant-ui/react";
import { useCursorThreadAgentId } from "./useCursorRuntime";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { CursorThreadHydrated } from "@/lib/cursor/types";
import { CursorThreadSidebar } from "./CursorThreadSidebar";
import { CursorThread } from "./CursorThread";
import { useCursorRuntime } from "./useCursorRuntime";

export type CursorAgentChatProps = {
  agentName: string;
  data: CursorThreadHydrated;
  className?: string;
};

export function CursorAgentChat({ agentName, data, className }: CursorAgentChatProps) {
  return (
    <CursorAgentChatRuntime
      key={data.thread.id}
      agentName={agentName}
      data={data}
      className={className}
    />
  );
}

function CursorAgentChatRuntime({ agentName, data, className }: CursorAgentChatProps) {
  const { thread, messages, liveRunId } = data;
  const runtime = useCursorRuntime({
    threadId: thread.id,
    agentId: thread.cursor_agent_id,
    initialMessages: messages,
    liveRunId,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider className={className}>
        <CursorThreadSidebar agentName={agentName} threadId={thread.id} />
        <SidebarInset className="min-h-svh overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">{thread.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OpenInCursorPill threadId={thread.id} initialAgentId={thread.cursor_agent_id} />
            </div>
          </header>
          <CursorThread />
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}

/**
 * Status pill — always visible, never absent. State machine:
 *   no agentId + idle     → gray, disabled
 *   no agentId + running  → pulsing yellow, disabled (waiting for Cursor)
 *   agentId    + running  → pulsing yellow, clickable
 *   agentId    + error    → red, clickable
 *   agentId    + idle     → green, clickable
 */
function OpenInCursorPill({
  threadId,
  initialAgentId,
}: {
  threadId: string;
  initialAgentId: string | null;
}) {
  const agentId = useCursorThreadAgentId(threadId, initialAgentId);
  const tone = useThread((t) => {
    if (t.isRunning) return "pending" as const;
    const last = [...t.messages].reverse().find((m) => m.role === "assistant");
    if (last?.status?.type === "incomplete" && last.status.reason === "error")
      return "error" as const;
    return "ok" as const;
  });
  const dotClass =
    !agentId && tone !== "pending"
      ? "bg-muted-foreground/40"
      : tone === "pending"
        ? "bg-amber-400 shadow-[0_0_8px_currentColor] animate-pulse"
        : tone === "error"
          ? "bg-red-500 shadow-[0_0_8px_currentColor]"
          : "bg-emerald-500 shadow-[0_0_6px_currentColor]";
  const baseClass =
    "group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-sm transition";
  const dot = <span className={`size-1.5 rounded-full ${dotClass}`} />;
  if (!agentId) {
    return (
      <span
        className={`${baseClass} cursor-not-allowed text-muted-foreground/70`}
        aria-disabled="true"
        title="Open in Cursor — available once Cursor accepts your first message"
      >
        {dot}
        Open in Cursor
        <ExternalLink className="size-3 opacity-40" />
      </span>
    );
  }
  return (
    <a
      href={`https://cursor.com/agents/${agentId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseClass} text-foreground/80 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground`}
    >
      {dot}
      Open in Cursor
      <ExternalLink className="size-3 opacity-60 transition group-hover:opacity-100" />
    </a>
  );
}
