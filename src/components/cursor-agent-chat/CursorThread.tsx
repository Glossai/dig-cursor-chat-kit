import { ArrowDown, ArrowUp, Square } from "lucide-react";
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Button } from "@/components/ui/button";
import type { CursorRunUsage } from "@/lib/cursor/types";

function MessageUsage() {
  const usage = useMessage(
    (state) => (state.metadata?.custom as { usage?: CursorRunUsage } | undefined)?.usage,
  );
  if (!usage) return null;
  const cost =
    usage.totalCostMicros === null
      ? "Cost unavailable"
      : `$${(usage.totalCostMicros / 1_000_000).toFixed(4)}`;
  return (
    <details className="mt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        {usage.totalTokens.toLocaleString()} tokens · {cost}
      </summary>
      <p className="mt-1">
        Input {usage.inputTokens.toLocaleString()} · Output {usage.outputTokens.toLocaleString()} ·
        Cache read {usage.cacheReadTokens.toLocaleString()} · Cache write{" "}
        {usage.cacheWriteTokens.toLocaleString()}
      </p>
    </details>
  );
}

function ChatMessage() {
  const role = useMessage((state) => state.role);
  return (
    <MessagePrimitive.Root
      className={
        role === "user"
          ? "ml-auto w-fit max-w-[80%] rounded-3xl bg-muted px-5 py-2.5 text-foreground"
          : "mr-auto w-full max-w-full py-2 text-foreground"
      }
    >
      {role === "assistant" ? (
        <MessagePrimitive.Parts
          components={{ Text: () => <MarkdownTextPrimitive className="cursor-markdown" /> }}
        />
      ) : (
        <MessagePrimitive.Parts />
      )}
      {role === "assistant" && <MessageUsage />}
      <MessagePrimitive.Error>
        <p className="mt-2 text-sm text-destructive">Cursor could not complete this response.</p>
      </MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}

export function CursorThread() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col bg-background">
      <ThreadPrimitive.Viewport
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
        autoScroll
      >
        <ThreadPrimitive.Empty>
          <div className="m-auto max-w-lg px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">What should Cursor build?</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Describe a coding task. This thread keeps the same Cloud Agent and workspace for
              follow-ups.
            </p>
          </div>
        </ThreadPrimitive.Empty>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
          <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
        </div>
        <ThreadPrimitive.ScrollToBottom asChild>
          <Button
            className="absolute bottom-32 left-1/2 size-8 -translate-x-1/2 rounded-full shadow-md"
            size="icon"
            variant="outline"
            aria-label="Scroll to latest"
          >
            <ArrowDown className="size-4" />
          </Button>
        </ThreadPrimitive.ScrollToBottom>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-6">
          <ComposerPrimitive.Root className="flex items-end gap-2 rounded-[28px] border bg-card px-3 py-2 shadow-sm focus-within:border-ring/40 focus-within:shadow-md transition-shadow">
            <ComposerPrimitive.Input
              autoFocus
              rows={1}
              placeholder="Message Cursor…"
              className="max-h-52 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel asChild>
                <Button
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  aria-label="Stop run"
                >
                  <Square className="size-4 fill-current" />
                </Button>
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send asChild>
                <Button
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  aria-label="Send message"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Runs execute in Cursor Cloud. Verify generated changes before merging.
          </p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
