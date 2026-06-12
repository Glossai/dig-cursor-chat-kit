import { ExternalLink } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
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
                <p className="text-xs text-muted-foreground">
                  {thread.cursor_agent_id
                    ? "Connected to persistent agent"
                    : "Agent starts with your first message"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {thread.cursor_agent_id && (
                <a
                  href={`https://cursor.com/agents/${thread.cursor_agent_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_currentColor]" />
                  Open in Cursor
                  <ExternalLink className="size-3 opacity-60 transition group-hover:opacity-100" />
                </a>
              )}
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                Cloud agent
              </span>
            </div>
          </header>
          <CursorThread />
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}
