import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Download, RefreshCw, Square, WrapText } from "lucide-react";
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useComposer, useComposerRuntime, useMessage } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { HighlightedCode } from "./HighlightedCode";
import { MermaidDiagram } from "./MermaidDiagram";
import { useRetryCursorResponse } from "./runtime";
import { MermaidDiagram } from "./MermaidDiagram";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import type { CursorChatClassNames, CursorChatFeatures, CursorChatLabels, CursorChatSlots } from "./customization";

type ThreadProps = {
  labels: Required<CursorChatLabels>;
  classNames: CursorChatClassNames;
  slots: CursorChatSlots;
  features: Required<CursorChatFeatures>;
};

function CodeViewer({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const onCopy = () => void navigator.clipboard.writeText(code).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });
  return <div className="my-4 overflow-hidden rounded-lg"><div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
    <span className="font-mono">{language ?? "text"}</span>
    <div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setWrapped((value) => !value)}><WrapText className="size-3" />Wrap</Button><Button variant="ghost" size="sm" onClick={() => setCollapsed((value) => !value)}><ChevronDown className="size-3" />{collapsed ? "Expand" : "Collapse"}</Button><Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([code], { type: "text/plain" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `code.${language ?? "txt"}`; anchor.click(); URL.revokeObjectURL(url); }}><Download className="size-3" />Download</Button><button type="button" onClick={onCopy} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted-foreground/10" aria-label="Copy code">
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "Copied" : "Copy"}
    </button></div>
  </div>{!collapsed && <div className={wrapped ? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words" : ""}>{language?.toLowerCase() === "mermaid" ? <MermaidDiagram code={code} /> : <HighlightedCode code={code} language={language} />}</div>}</div>;
}

function ThinkingIndicator({ label }: { label: string }) {
  const status = useMessage((state) => state.status);
  const hasText = useMessage((state) => state.content.some((part) => part.type === "text" && part.text.length > 0));
  if (status?.type !== "running" || hasText) return null;
  return <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground">
    <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.3s]" />
    <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.15s]" />
    <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
    <span className="ml-2 animate-pulse">{label}</span>
  </div>;
}

function ChatMessage({ labels, classNames, slots, features, threadId }: ThreadProps & { threadId: string }) {
  const role = useMessage((state) => state.role);
  const messageId = useMessage((state) => state.id);
  const status = useMessage((state) => state.status);
  const cursorRunId = /^asst-((?:bc|run)-[a-zA-Z0-9-]+)$/.exec(messageId)?.[1] ?? null;
  const AssistantMarkdown = () => <MarkdownTextPrimitive className="cursor-markdown" remarkPlugins={[remarkGfm]} components={{
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...rest }) => {
      const match = /language-(\w+)/.exec(className ?? "");
      if (!match) return <code className={className} {...rest}>{children}</code>;
      const code = String(children ?? "").replace(/\n$/, "");
      const SlotCodeBlock = slots.codeBlock;
      return SlotCodeBlock ? <div className="my-4 overflow-hidden rounded-lg"><SlotCodeBlock code={code} language={match[1]} /></div> : features.codeHighlighting ? <CodeViewer language={match[1]} code={code} /> : <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-sm"><code>{code}</code></pre>;
    },
  }} />;
  return <MessagePrimitive.Root className={cn(role === "user" ? "ml-auto w-fit max-w-[80%] rounded-3xl bg-muted px-5 py-2.5 text-foreground" : "mr-auto w-full max-w-full py-2 text-foreground", role === "user" ? classNames.userMessage : classNames.assistantMessage)}>
    {role === "assistant" ? <><MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} /><ThinkingIndicator label={labels.thinking} /></> : <MessagePrimitive.Parts />}
    <MessagePrimitive.Error><p className="mt-2 text-sm text-destructive">{labels.error}</p>{cursorRunId && status?.type === "incomplete" && status.reason === "error" && <RetryResponse threadId={threadId} cursorRunId={cursorRunId} />}</MessagePrimitive.Error>
  </MessagePrimitive.Root>;
}

function RetryResponse({ threadId, cursorRunId }: { threadId: string; cursorRunId: string }) {
  const retry = useRetryCursorResponse(threadId);
  return <Button variant="outline" size="sm" className="mt-2" onClick={() => void retry(cursorRunId)}><RefreshCw />Retry response</Button>;
}

function DraftKeeper({ threadId }: { threadId: string }) {
  const text = useComposer((state) => state.text);
  const composer = useComposerRuntime();
  useEffect(() => { composer.setText(localStorage.getItem(`cursor-chat-draft:${threadId}`) ?? ""); }, [composer, threadId]);
  useEffect(() => {
    const key = `cursor-chat-draft:${threadId}`;
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  }, [text, threadId]);
  return null;
}

export function CursorThread(props: ThreadProps & { threadId: string }) {
  const EmptyState = props.slots.emptyState;
  return <ThreadPrimitive.Root className={cn("flex min-h-0 flex-1 flex-col bg-background", props.classNames.thread)}>
    <DraftKeeper threadId={props.threadId} /><ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto" autoScroll>
      <ThreadPrimitive.Empty>{EmptyState ? <EmptyState /> : <div className={cn("m-auto max-w-lg px-6 py-24 text-center", props.classNames.emptyState)}><h2 className="text-3xl font-semibold tracking-tight">{props.labels.emptyTitle}</h2><p className="mt-3 text-sm text-muted-foreground">{props.labels.emptyDescription}</p></div>}</ThreadPrimitive.Empty>
      <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8", props.classNames.messages)}><ThreadPrimitive.Messages components={{ Message: () => <ChatMessage {...props} threadId={props.threadId} /> }} /></div>
      <ThreadPrimitive.ScrollToBottom asChild><Button className="absolute bottom-32 left-1/2 size-8 -translate-x-1/2 rounded-full shadow-md" size="icon" variant="outline" aria-label="Scroll to latest"><ArrowDown className="size-4" /></Button></ThreadPrimitive.ScrollToBottom>
      <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-6">
        <ComposerPrimitive.Root className={cn("flex items-end gap-2 rounded-[28px] border bg-card px-3 py-2 shadow-sm transition-shadow focus-within:border-ring/40 focus-within:shadow-md", props.classNames.composer)}>
          <ComposerPrimitive.Input autoFocus rows={1} placeholder={props.labels.placeholder} className="max-h-52 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground" />
          <ThreadPrimitive.If running><ComposerPrimitive.Cancel asChild><Button size="icon" className="size-9 shrink-0 rounded-full" aria-label="Stop run"><Square className="size-4 fill-current" /></Button></ComposerPrimitive.Cancel></ThreadPrimitive.If>
          <ThreadPrimitive.If running={false}><ComposerPrimitive.Send asChild><Button size="icon" className="size-9 shrink-0 rounded-full" aria-label="Send message"><ArrowUp className="size-4" /></Button></ComposerPrimitive.Send></ThreadPrimitive.If>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>;
}