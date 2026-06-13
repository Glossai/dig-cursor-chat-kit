import { useEffect, useState } from "react";
import { Home, MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useThread } from "@assistant-ui/react";
import type { CursorThread } from "../types";
import { useCursorChatClient } from "./context";
import type { CursorChatClassNames, CursorChatFeatures, CursorChatLabels } from "./customization";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "./ui/sidebar";
import { cn } from "./ui/utils";

type SidebarProps = {
  agentName: string;
  threadId: string;
  labels: Required<CursorChatLabels>;
  classNames: CursorChatClassNames;
  features: Required<CursorChatFeatures>;
  onSelectThread?: (thread: CursorThread) => void;
};

export function CursorThreadSidebar({ agentName, threadId, labels, classNames, features, onSelectThread }: SidebarProps) {
  const client = useCursorChatClient();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const [threads, setThreads] = useState<CursorThread[]>([]);
  useEffect(() => { void client.listThreads({ agentName }).then(setThreads); }, [agentName, client]);
  const create = async () => {
    const thread = await client.createThread({ agentName, title: labels.newThreadTitle });
    setThreads((current) => [thread, ...current]);
    if (isMobile) setOpenMobile(false);
    await client.navigateToThread(thread.id);
  };
  const remove = async (id: string) => {
    await client.deleteThread({ threadId: id });
    const remaining = threads.filter((thread) => thread.id !== id);
    setThreads(remaining);
    if (id === threadId) {
      if (remaining[0]) await client.navigateToThread(remaining[0].id);
      else await create();
    }
  };
  return <Sidebar collapsible="icon" className={cn("border-r border-sidebar-border", classNames.sidebar)}>
    <SidebarHeader className="border-b border-sidebar-border p-3">
      <div className="flex items-center gap-2 overflow-hidden"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary font-mono text-xs font-bold text-sidebar-primary-foreground">C_</div>{!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{labels.productName}</p><p className="truncate text-xs text-muted-foreground">{agentName}</p></div>}</div>
      <Button variant="outline" size={collapsed ? "icon" : "sm"} className="mt-2 w-full" onClick={() => void create()}><Plus />{!collapsed && labels.newThread}</Button>
    </SidebarHeader>
    <SidebarContent className="p-2"><SidebarMenu>{threads.map((thread) => <SidebarMenuItem key={thread.id} className="group/item flex items-center">
      <SidebarMenuButton isActive={thread.id === threadId} tooltip={thread.title} onClick={() => { onSelectThread?.(thread); if (isMobile) setOpenMobile(false); void client.navigateToThread(thread.id); }} className="flex min-w-0 flex-1 items-center gap-2"><ThreadStatusDot thread={thread} isActive={thread.id === threadId} /><MessageSquare /><span className="truncate">{thread.title}</span></SidebarMenuButton>
      {!collapsed && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover/item:opacity-100" aria-label={`Options for ${thread.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onClick={() => void remove(thread.id)}><Trash2 />{labels.deleteThread}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </SidebarMenuItem>)}</SidebarMenu></SidebarContent>
    {features.homeNavigation && client.navigateHome && <SidebarFooter className="border-t border-sidebar-border p-3"><Button variant="ghost" size={collapsed ? "icon" : "sm"} className="w-full" onClick={() => void client.navigateHome?.()}><Home />{!collapsed && labels.home}</Button></SidebarFooter>}
  </Sidebar>;
}

function ThreadStatusDot({ thread, isActive }: { thread: CursorThread; isActive: boolean }) {
  if (isActive) return <LiveDot fallback={<StaticDot thread={thread} />} />;
  return <StaticDot thread={thread} />;
}
function StaticDot({ thread }: { thread: CursorThread }) {
  const tone = thread.active_run_id ? "pending" : thread.last_status === "error" ? "error" : thread.last_status === "complete" ? "ok" : "idle";
  return <Dot tone={tone} />;
}
function LiveDot({ fallback }: { fallback: React.ReactElement }) {
  const tone = useThread((state) => {
    if (state.isRunning) return "pending" as const;
    const last = [...state.messages].reverse().find((message) => message.role === "assistant");
    if (last?.status?.type === "incomplete" && last.status.reason === "error") return "error" as const;
    return last ? "ok" as const : null;
  });
  return tone ? <Dot tone={tone} /> : fallback;
}
function Dot({ tone }: { tone: "pending" | "error" | "ok" | "idle" }) {
  const color = tone === "pending" ? "bg-amber-400 shadow-[0_0_8px_currentColor] animate-pulse" : tone === "error" ? "bg-red-500 shadow-[0_0_6px_currentColor]" : tone === "ok" ? "bg-emerald-500 shadow-[0_0_6px_currentColor]" : "bg-muted-foreground/40";
  return <span className={`size-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}