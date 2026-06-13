import { AssistantRuntimeProvider, useThread } from "@assistant-ui/react";
import { ExternalLink } from "lucide-react";
import type { CursorThreadHydrated } from "../types";
import { useCursorChatClient } from "./context";
import { useCursorRuntime, useCursorThreadAgentId } from "./runtime";
import { CursorThread } from "./CursorThread";
import { CursorThreadSidebar } from "./CursorThreadSidebar";
import { defaultCursorChatFeatures, defaultCursorChatLabels, type CursorChatClassNames, type CursorChatFeatures, type CursorChatLabels, type CursorChatSlots } from "./customization";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { cn } from "./ui/utils";

export type CursorAgentChatProps = {
  agentName: string;
  data: CursorThreadHydrated;
  className?: string;
  title?: string;
  labels?: CursorChatLabels;
  classNames?: CursorChatClassNames;
  slots?: CursorChatSlots;
  features?: CursorChatFeatures;
};

function StatusLink({ threadId, initialAgentId, label }: { threadId: string; initialAgentId: string | null; label: string }) {
  const agentId = useCursorThreadAgentId(threadId, initialAgentId);
  const tone = useThread((thread) => thread.isRunning ? "pending" : [...thread.messages].reverse().find((message) => message.role === "assistant")?.status?.type === "incomplete" ? "error" : "ok");
  const color = tone === "pending" ? "bg-amber-400 animate-pulse" : tone === "error" ? "bg-destructive" : agentId ? "bg-emerald-500" : "bg-muted-foreground/40";
  const content = <><span className={`size-1.5 rounded-full ${color}`} />{label}<ExternalLink className="size-3" /></>;
  return agentId
    ? <a href={`https://cursor.com/agents/${agentId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">{content}</a>
    : <span aria-disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">{content}</span>;
}

function Chat({ agentName, data, title, className, labels: labelOverrides, classNames = {}, slots = {}, features: featureOverrides }: CursorAgentChatProps) {
  const { thread, messages, liveRunId } = data;
  const runtime = useCursorRuntime({ threadId: thread.id, agentId: thread.cursor_agent_id, initialMessages: messages, liveRunId });
  const labels = { ...defaultCursorChatLabels, ...labelOverrides };
  const features = { ...defaultCursorChatFeatures, ...featureOverrides };
  const status = <StatusLink threadId={thread.id} initialAgentId={thread.cursor_agent_id} label={labels.openInCursor} />;
  const Header = slots.header;
  return <AssistantRuntimeProvider runtime={runtime}>
    <SidebarProvider className={cn(className, classNames.root)} defaultOpen={features.sidebar}>
      {features.sidebar && <CursorThreadSidebar agentName={agentName} threadId={thread.id} labels={labels} classNames={classNames} features={features} />}
      <SidebarInset className="min-h-svh overflow-hidden bg-background">
        {Header ? <Header thread={thread} status={status} /> : <header className={cn("flex h-14 shrink-0 items-center justify-between border-b px-3", classNames.header)}><div className="flex min-w-0 items-center gap-2">{features.sidebar && <SidebarTrigger />}<h1 className="truncate text-sm font-semibold">{title ?? thread.title}</h1></div>{status}</header>}
        <CursorThread labels={labels} classNames={classNames} slots={slots} features={features} />
      </SidebarInset>
    </SidebarProvider>
  </AssistantRuntimeProvider>;
}

export function CursorAgentChat(props: CursorAgentChatProps) {
  return <Chat key={props.data.thread.id} {...props} />;
}