import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Square } from "lucide-react";
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { HighlightedCode } from "./HighlightedCode";
import { MermaidDiagram } from "./MermaidDiagram";




function CodeHeader({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-mono">{language ?? "text"}</span>
      <button
        type="button"
        onClick={onCopy}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted-foreground/10"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ThinkingIndicator() {
  const status = useMessage((s) => s.status);
  const hasText = useMessage((s) =>
    s.content.some((p) => p.type === "text" && p.text.length > 0),
  );
  if (status?.type !== "running" || hasText) return null;
  return (
    <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground">
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
      <span className="ml-2 animate-pulse">Thinking…</span>
    </div>
  );
}

function AssistantMarkdown() {
  return (
    <MarkdownTextPrimitive
      className="cursor-markdown"
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...rest }) => {
          const match = /language-(\w+)/.exec(className ?? "");
          const text = String(children ?? "");
          if (!match) {
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          }
          const cleaned = text.replace(/\n$/, "");
          return (
            <div className="my-4 overflow-hidden rounded-lg">
              <CodeHeader language={match[1]} code={cleaned} />
              {match[1].toLowerCase() === "mermaid" ? (
                <MermaidDiagram code={cleaned} />
              ) : (
                <HighlightedCode code={cleaned} language={match[1]} />
              )}
            </div>
          );
        },
      }}
    />
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
        <>
          <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
          <ThinkingIndicator />
        </>
      ) : (
        <MessagePrimitive.Parts />
      )}
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
          <ComposerPrimitive.Root className="flex items-end gap-2 rounded-[28px] border bg-card px-3 py-2 shadow-sm transition-shadow focus-within:border-ring/40 focus-within:shadow-md">
            <ComposerPrimitive.Input
              autoFocus
              rows={1}
              placeholder="Message Cursor…"
              className="max-h-52 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel asChild>
                <Button size="icon" className="size-9 shrink-0 rounded-full" aria-label="Stop run">
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
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
