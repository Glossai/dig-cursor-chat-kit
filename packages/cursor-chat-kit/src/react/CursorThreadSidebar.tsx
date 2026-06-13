import { useEffect, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Home, MessageSquare, MoreHorizontal, Pencil, Pin, Plus, Search, Trash2 } from "lucide-react";
import { useThread } from "@assistant-ui/react";
import type { CursorThread } from "../types";
import { useCursorChatClient } from "./context";
import type { CursorChatClassNames, CursorChatFeatures, CursorChatLabels } from "./customization";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ pinned: true, today: true, yesterday: true, earlier: false });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const next = await client.listThreads({ agentName, query: query || undefined, archived });
      if (cancelled) return;
      setThreads(next);
      if (next.some((thread) => thread.active_run_id)) timer = setTimeout(() => void load(), 2_000);
    };
    const refresh = () => void load();
    void load();
    window.addEventListener("cursor-thread-updated", refresh);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("cursor-thread-updated", refresh);
    };
  }, [agentName, archived, client, query]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const sortedThreads = [...threads].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const sections = [
    { id: "pinned", label: "Pinned", threads: sortedThreads.filter((thread) => Boolean(thread.pinned_at)) },
    { id: "today", label: "Today", threads: sortedThreads.filter((thread) => !thread.pinned_at && new Date(thread.updated_at).getTime() >= todayStart) },
    { id: "yesterday", label: "Yesterday", threads: sortedThreads.filter((thread) => { const time = new Date(thread.updated_at).getTime(); return !thread.pinned_at && time >= yesterdayStart && time < todayStart; }) },
    { id: "earlier", label: "Earlier", threads: sortedThreads.filter((thread) => !thread.pinned_at && new Date(thread.updated_at).getTime() < yesterdayStart) },
  ].filter((section) => section.threads.length > 0);
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
    <SidebarContent className="p-2">{!collapsed && <div className="mb-2 space-y-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" className="h-8 pl-8" /></div><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setArchived((value) => !value)}><Archive />{archived ? "Active threads" : "Archived"}</Button></div>}{sections.map((section) => <div key={section.id} className="mb-2">{!collapsed && <Button variant="ghost" size="sm" className="mb-1 w-full justify-start px-2 text-xs font-medium text-muted-foreground" onClick={() => setOpenSections((current) => ({ ...current, [section.id]: !current[section.id] }))} aria-expanded={openSections[section.id]}>{openSections[section.id] ? <ChevronDown /> : <ChevronRight />}{section.label}<span className="ml-auto tabular-nums">{section.threads.length}</span></Button>}{(collapsed || openSections[section.id]) && <SidebarMenu>{section.threads.map((thread) => <SidebarMenuItem key={thread.id} className="group/item flex items-center">
      <SidebarMenuButton isActive={thread.id === threadId} tooltip={thread.title} onClick={() => { onSelectThread?.(thread); if (isMobile) setOpenMobile(false); void client.navigateToThread(thread.id); }} className="flex min-w-0 flex-1 items-center gap-2"><ThreadStatusDot thread={thread} isActive={thread.id === threadId} /><MessageSquare /><span className="truncate">{thread.title}</span>{thread.pinned_at && <Pin className="ml-auto size-3.5 shrink-0 fill-current text-muted-foreground" aria-label="Pinned" />}{thread.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}</SidebarMenuButton>
      {!collapsed && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover/item:opacity-100" aria-label={`Options for ${thread.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{client.renameThread && <DropdownMenuItem onClick={() => { const title = window.prompt("Rename thread", thread.title)?.trim(); if (title) void client.renameThread?.({ threadId: thread.id, title }).then(() => setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, title } : item))); }}><Pencil />Rename</DropdownMenuItem>}{client.updateThread && <><DropdownMenuItem onClick={() => void client.updateThread?.({ threadId: thread.id, pinned: !thread.pinned_at }).then(() => client.listThreads({ agentName, query: query || undefined, archived }).then(setThreads))}><Pin />{thread.pinned_at ? "Unpin" : "Pin"}</DropdownMenuItem><DropdownMenuItem onClick={() => void client.updateThread?.({ threadId: thread.id, archived: !thread.archived_at }).then(() => client.listThreads({ agentName, query: query || undefined, archived }).then(setThreads))}><Archive />{thread.archived_at ? "Restore" : "Archive"}</DropdownMenuItem></>}<DropdownMenuItem className="text-destructive" onClick={() => void remove(thread.id)}><Trash2 />{labels.deleteThread}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </SidebarMenuItem>)}</SidebarMenu>}</div>)}</SidebarContent>
    {features.homeNavigation && client.navigateHome && <SidebarFooter className="border-t border-sidebar-border p-3"><Button variant="ghost" size={collapsed ? "icon" : "sm"} className="w-full" onClick={() => void client.navigateHome?.()}><Home />{!collapsed && labels.home}</Button></SidebarFooter>}
  </Sidebar>;
}

function ThreadStatusDot({ thread, isActive }: { thread: CursorThread; isActive: boolean }) {
  if (isActive) return <LiveDot fallback={<StaticDot thread={thread} />} />;
  return <StaticDot thread={thread} />;
}
function StaticDot({ thread }: { thread: CursorThread }) {
  const tone = thread.active_run_id ? "pending" : thread.last_status === "error" ? "error" : thread.cursor_agent_id ? "ok" : "idle";
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