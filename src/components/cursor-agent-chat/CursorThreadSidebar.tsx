import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useThread } from "@assistant-ui/react";
import { MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

export function CursorThreadSidebar({
  agentName,
  threadId,
}: {
  agentName: string;
  threadId: string;
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
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className="w-full"
          onClick={async () => {
            await queryClient.cancelQueries();
            queryClient.clear();
            await supabase.auth.signOut();
            await navigate({ to: "/auth", replace: true });
          }}
        >
          {collapsed ? "↗" : "Sign out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
