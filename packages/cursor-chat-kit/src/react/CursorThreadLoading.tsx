import { Skeleton } from "./ui/skeleton";

export function CursorThreadLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" aria-busy="true" aria-label="Loading conversation">
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
  );
}