import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function CursorAgentChatLoading() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="mt-2 h-8 w-full" />
        </SidebarHeader>
        <SidebarContent className="space-y-2 p-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-8 w-full" />
          ))}
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-svh overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center border-b px-3">
          <Skeleton className="h-4 w-40" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
            <Skeleton className="ml-auto h-10 w-2/5 rounded-3xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <Skeleton className="h-14 w-full rounded-[28px]" />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}