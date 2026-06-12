import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { CursorMessage, CursorThread as CursorThreadType } from "@/lib/cursor/types";
import { CursorThreadSidebar } from "./CursorThreadSidebar";
import { CursorThread } from "./CursorThread";
import { useCursorRuntime } from "./useCursorRuntime";

export type CursorAgentChatProps = { agentName: string; thread: CursorThreadType; messages: CursorMessage[]; className?: string };

export function CursorAgentChat({ agentName, thread, messages, className }: CursorAgentChatProps) {
  return <CursorAgentChatRuntime key={thread.id} agentName={agentName} thread={thread} messages={messages} className={className} />;
}

function CursorAgentChatRuntime({ agentName, thread, messages, className }: CursorAgentChatProps) {
  const runtime = useCursorRuntime(thread.id, messages);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider className={className}>
        <CursorThreadSidebar agentName={agentName} threadId={thread.id} />
        <SidebarInset className="min-h-svh overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-3"><div className="flex min-w-0 items-center gap-2"><SidebarTrigger asChild><Button variant="ghost" size="icon"><PanelLeft /></Button></SidebarTrigger><div className="min-w-0"><h1 className="truncate text-sm font-semibold">{thread.title}</h1><p className="text-xs text-muted-foreground">{thread.cursor_agent_id ? "Connected to persistent agent" : "Agent starts with your first message"}</p></div></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">Cloud agent</span></header>
          <CursorThread />
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}