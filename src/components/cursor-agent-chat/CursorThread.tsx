import { ArrowDown, Send, Square } from "lucide-react";
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useMessage } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Button } from "@/components/ui/button";
import type { CursorRunUsage } from "@/lib/cursor/types";

function MessageUsage() {
  const usage = useMessage((state) => (state.metadata?.custom as { usage?: CursorRunUsage } | undefined)?.usage);
  if (!usage) return null;
  const cost = usage.totalCostMicros === null ? "Cost unavailable" : `$${(usage.totalCostMicros / 1_000_000).toFixed(4)}`;
  return <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{usage.totalTokens.toLocaleString()} tokens · {cost}</summary><p className="mt-1">Input {usage.inputTokens.toLocaleString()} · Output {usage.outputTokens.toLocaleString()} · Cache read {usage.cacheReadTokens.toLocaleString()} · Cache write {usage.cacheWriteTokens.toLocaleString()}</p></details>;
}

function ChatMessage() {
  const role = useMessage((state) => state.role);
  return (
    <MessagePrimitive.Root className={role === "user" ? "ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground" : "mr-auto w-full max-w-3xl py-3 text-foreground"}>
      {role === "assistant" ? <MessagePrimitive.Parts components={{ Text: () => <MarkdownTextPrimitive className="cursor-markdown" /> }} /> : <MessagePrimitive.Parts />}
      {role === "assistant" && <MessageUsage />}
      <MessagePrimitive.Error><p className="mt-2 text-sm text-destructive">Cursor could not complete this response.</p></MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}

export function CursorThread() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4" autoScroll>
        <ThreadPrimitive.Empty><div className="m-auto max-w-lg py-24 text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border bg-secondary font-mono text-lg font-bold">C_</div><h2 className="text-2xl font-semibold tracking-tight">Start a Cursor Cloud run</h2><p className="mt-2 text-sm text-muted-foreground">Describe the coding task. This thread keeps the same Cloud Agent and workspace for follow-ups.</p></div></ThreadPrimitive.Empty>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 py-8"><ThreadPrimitive.Messages components={{ Message: ChatMessage }} /></div>
        <ThreadPrimitive.ScrollToBottom asChild><Button className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full" size="icon" variant="outline" aria-label="Scroll to latest"><ArrowDown /></Button></ThreadPrimitive.ScrollToBottom>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto w-full max-w-4xl bg-background/95 pb-5 pt-3 backdrop-blur">
          <ComposerPrimitive.Root className="rounded-2xl border bg-card p-2 shadow-lg">
            <ComposerPrimitive.Input autoFocus placeholder="Give Cursor a coding task…" className="min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />
            <div className="flex justify-end px-1 pb-1">
              <ThreadPrimitive.If running><ComposerPrimitive.Cancel asChild><Button size="icon" variant="secondary" aria-label="Stop run"><Square className="fill-current" /></Button></ComposerPrimitive.Cancel></ThreadPrimitive.If>
              <ThreadPrimitive.If running={false}><ComposerPrimitive.Send asChild><Button size="icon" aria-label="Send message"><Send /></Button></ComposerPrimitive.Send></ThreadPrimitive.If>
            </div>
          </ComposerPrimitive.Root>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Runs execute in Cursor Cloud. Verify generated changes before merging.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}