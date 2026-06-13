import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useThread } from "@assistant-ui/react";
import { Home, MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/lib/cursor/chat.functions";

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
  const threads = useQuery({
    queryKey: ["cursor-threads", agentName],
    queryFn: () => list({ data: { agentName } }),
  });
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
        <SidebarMenu>
          {threads.data?.map((thread) => (
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
                  <span className="truncate">{thread.title}</span>
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
        </SidebarMenu>
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
      : thread.last_status === "complete"
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

