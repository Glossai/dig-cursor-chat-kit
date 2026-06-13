import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useThread } from "@assistant-ui/react";
import { Archive, ChevronDown, ChevronRight, Home, MessageSquare, MoreHorizontal, Pencil, Pin, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CursorThread as CursorThreadType } from "@/lib/cursor/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  createCursorThread,
  deleteCursorThread,
  listCursorThreads,
  renameCursorThread,
  updateCursorThreadState,
} from "@/lib/cursor/chat.functions";

const defaultSectionState: Record<string, boolean> = { pinned: true, today: true, yesterday: true, earlier: false };
let savedSectionState = defaultSectionState;

export function CursorThreadSidebar({
  agentName,
  threadId,
  onSelectThread,
}: {
  agentName: string;
  threadId: string;
  onSelectThread?: (thread: CursorThreadType) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const list = useServerFn(listCursorThreads);
  const create = useServerFn(createCursorThread);
  const remove = useServerFn(deleteCursorThread);
  const rename = useServerFn(renameCursorThread);
  const updateState = useServerFn(updateCursorThreadState);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => savedSectionState);
  const toggleSection = (sectionId: string) => setOpenSections((current) => {
    savedSectionState = { ...current, [sectionId]: !current[sectionId] };
    return savedSectionState;
  });
  const threads = useQuery({
    queryKey: ["cursor-threads", agentName, query, showArchived],
    queryFn: () => list({ data: { agentName, query: query || undefined, archived: showArchived } }),
    refetchInterval: (result) => result.state.data?.some((thread) => thread.active_run_id) ? 2_000 : false,
  });
  useEffect(() => {
    const refreshThreads = () => void queryClient.invalidateQueries({ queryKey: ["cursor-threads", agentName] });
    window.addEventListener("cursor-thread-updated", refreshThreads);
    return () => window.removeEventListener("cursor-thread-updated", refreshThreads);
  }, [agentName, queryClient]);
  const createMutation = useMutation({
    mutationFn: () => create({ data: { agentName, title: "New conversation" } }),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({ queryKey: ["cursor-threads", agentName] });
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { threadId: id } }),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["cursor-threads", agentName] });
      if (id === threadId) {
        const remaining = (threads.data ?? []).filter((thread) => thread.id !== id);
        if (remaining[0])
          await navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
        else createMutation.mutate();
      }
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cursor-threads", agentName] });
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => rename({ data: { threadId: id, title } }),
    onSuccess: async () => { setEditingId(null); await refresh(); },
  });
  const stateMutation = useMutation({
    mutationFn: ({ id, pinned, archived }: { id: string; pinned?: boolean; archived?: boolean }) => updateState({ data: { threadId: id, pinned, archived } }),
    onSuccess: refresh,
  });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const sortedThreads = [...(threads.data ?? [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const sections = [
    { id: "pinned", label: "Pinned", threads: sortedThreads.filter((thread) => Boolean(thread.pinned_at)) },
    { id: "today", label: "Today", threads: sortedThreads.filter((thread) => !thread.pinned_at && new Date(thread.updated_at).getTime() >= todayStart) },
    { id: "yesterday", label: "Yesterday", threads: sortedThreads.filter((thread) => { const time = new Date(thread.updated_at).getTime(); return !thread.pinned_at && time >= yesterdayStart && time < todayStart; }) },
    { id: "earlier", label: "Earlier", threads: sortedThreads.filter((thread) => !thread.pinned_at && new Date(thread.updated_at).getTime() < yesterdayStart) },
  ].filter((section) => section.threads.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary font-mono text-xs font-bold text-sidebar-primary-foreground">
            C_
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Cursor Cloud</p>
              <p className="truncate text-xs text-muted-foreground">{agentName}</p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size={collapsed ? "icon" : "sm"}
          className="mt-2 w-full"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <Plus />
          {!collapsed && "New thread"}
        </Button>
      </SidebarHeader>
      <SidebarContent className="p-2">
        {!collapsed && <div className="mb-2 space-y-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" className="h-8 pl-8" /></div><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setShowArchived((value) => !value)}><Archive />{showArchived ? "Active threads" : "Archived"}</Button></div>}
        {sections.map((section) => <div key={section.id} className={collapsed || openSections[section.id] ? "mb-2" : "mb-0"}>
          {!collapsed && <Button variant="ghost" size="sm" className={`${openSections[section.id] ? "mb-1" : "mb-0"} w-full justify-start px-2 text-xs font-medium text-muted-foreground`} onClick={() => toggleSection(section.id)} aria-expanded={openSections[section.id]}>{openSections[section.id] ? <ChevronDown /> : <ChevronRight />}{section.label}<span className="ml-auto tabular-nums">{section.threads.length}</span></Button>}
          {(collapsed || openSections[section.id]) && <SidebarMenu>
          {section.threads.map((thread) => (
            <SidebarMenuItem key={thread.id} className="group/item flex items-center">
              <SidebarMenuButton asChild isActive={thread.id === threadId} tooltip={thread.title}>
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: thread.id }}
                  onClick={() => onSelectThread?.(thread)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <ThreadStatusDot thread={thread} isActive={thread.id === threadId} />
                  <MessageSquare />
                  {editingId === thread.id ? <Input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onClick={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.key === "Enter" && editingTitle.trim()) renameMutation.mutate({ id: thread.id, title: editingTitle.trim() }); if (event.key === "Escape") setEditingId(null); }} className="h-7" /> : <span className="truncate">{thread.title}</span>}
                   {thread.pinned_at && <Pin className="ml-auto size-3.5 shrink-0 fill-current text-muted-foreground" aria-label="Pinned" />}
                   {thread.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </SidebarMenuButton>
              {!collapsed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover/item:opacity-100"
                      aria-label={`Options for ${thread.title}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingId(thread.id); setEditingTitle(thread.title); }}><Pencil />Rename</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => stateMutation.mutate({ id: thread.id, pinned: !thread.pinned_at })}><Pin />{thread.pinned_at ? "Unpin" : "Pin"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => stateMutation.mutate({ id: thread.id, archived: !thread.archived_at })}><Archive />{thread.archived_at ? "Restore" : "Archive"}</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(thread.id)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>}
        </div>)}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <Button asChild variant="ghost" size={collapsed ? "icon" : "sm"} className="w-full">
          <Link to="/">
            <Home />
            {!collapsed && "Home"}
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Per-thread status dot mirroring the "Open in Cursor" pill:
 *   active_run_id present → pulsing amber (run in flight)
 *   last_status === "error" → red
 *   last_status === "complete" → emerald
 *   otherwise → muted (idle / never run)
 *
 * For the currently open thread, the live runtime overrides DB state so the
 * dot reacts in real time without waiting for a refetch.
 */
function ThreadStatusDot({
  thread,
  isActive,
}: {
  thread: CursorThreadType;
  isActive: boolean;
}) {
  if (isActive) return <LiveDot fallback={<StaticDot thread={thread} />} />;
  return <StaticDot thread={thread} />;
}

function StaticDot({ thread }: { thread: CursorThreadType }) {
  const tone: "pending" | "error" | "ok" | "idle" = thread.active_run_id
    ? "pending"
    : thread.last_status === "error"
      ? "error"
      : thread.cursor_agent_id
        ? "ok"
        : "idle";
  return <Dot tone={tone} />;
}

function LiveDot({ fallback }: { fallback: React.ReactElement }) {
  const tone = useThread((t) => {
    if (t.isRunning) return "pending" as const;
    const last = [...t.messages].reverse().find((m) => m.role === "assistant");
    if (last?.status?.type === "incomplete" && last.status.reason === "error")
      return "error" as const;
    if (last) return "ok" as const;
    return null;
  });
  if (tone === null) return fallback;
  return <Dot tone={tone} />;
}

function Dot({ tone }: { tone: "pending" | "error" | "ok" | "idle" }) {
  const cls =
    tone === "pending"
      ? "bg-amber-400 shadow-[0_0_8px_currentColor] animate-pulse"
      : tone === "error"
        ? "bg-red-500 shadow-[0_0_6px_currentColor]"
        : tone === "ok"
          ? "bg-emerald-500 shadow-[0_0_6px_currentColor]"
          : "bg-muted-foreground/40";
  return <span className={`size-1.5 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

