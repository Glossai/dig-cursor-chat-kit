import { useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useMessage, useThread } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { ArrowUp, ExternalLink, Home, Menu, MessageSquare, Plus, Square, Trash2 } from "lucide-react";
import remarkGfm from "remark-gfm";
import type { CursorThreadHydrated } from "../types";
import { useCursorChatClient } from "./context";
import { useCursorRuntime, useCursorThreadAgentId } from "./runtime";

export type CursorAgentChatProps = {
  agentName: string;
  data: CursorThreadHydrated;
  className?: string;
  title?: string;
};

function Message() {
  const role = useMessage((state) => state.role);
  return (
    <MessagePrimitive.Root className={role === "user" ? "ml-auto w-fit max-w-[80%] rounded-3xl bg-primary px-5 py-2.5 text-primary-foreground" : "mr-auto w-full py-2 text-foreground"}>
      <MessagePrimitive.Parts components={{ Text: () => <MarkdownTextPrimitive className="cursor-markdown" remarkPlugins={[remarkGfm]} /> }} />
      <MessagePrimitive.Error><p className="mt-2 text-sm text-destructive">Cursor could not complete this response.</p></MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}

function StatusLink({ threadId, initialAgentId }: { threadId: string; initialAgentId: string | null }) {
  const agentId = useCursorThreadAgentId(threadId, initialAgentId);
  const tone = useThread((thread) => thread.isRunning ? "pending" : [...thread.messages].reverse().find((message) => message.role === "assistant")?.status?.type === "incomplete" ? "error" : "ok");
  const color = tone === "pending" ? "bg-amber-400 animate-pulse" : tone === "error" ? "bg-destructive" : agentId ? "bg-emerald-500" : "bg-muted-foreground/40";
  const content = <><span className={`size-1.5 rounded-full ${color}`} />Open in Cursor<ExternalLink className="size-3" /></>;
  return agentId
    ? <a href={`https://cursor.com/agents/${agentId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">{content}</a>
    : <span aria-disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">{content}</span>;
}

function ThreadList({ agentName, activeId, close }: { agentName: string; activeId: string; close(): void }) {
  const client = useCursorChatClient();
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof client.listThreads>>>([]);
  const reload = () => client.listThreads({ agentName }).then(setThreads);
  useEffect(() => { void reload(); }, [agentName]);
  const create = async () => {
    const thread = await client.createThread({ agentName, title: "New conversation" });
    await client.navigateToThread(thread.id);
    close();
  };
  const remove = async (id: string) => {
    await client.deleteThread({ threadId: id });
    const remaining = threads.filter((thread) => thread.id !== id);
    setThreads(remaining);
    if (id === activeId) {
      if (remaining[0]) await client.navigateToThread(remaining[0].id);
      else await create();
    }
  };
  return <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
    <div className="border-b p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary font-mono text-xs text-sidebar-primary-foreground">C_</span>Cursor Cloud</div>
      <button onClick={() => void create()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium"><Plus className="size-4" />New thread</button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">{threads.map((thread) => <div key={thread.id} className={`group flex items-center gap-1 rounded-md ${thread.id === activeId ? "bg-sidebar-accent" : ""}`}>
      <button onClick={() => { void client.navigateToThread(thread.id); close(); }} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"><span className={`size-1.5 rounded-full ${thread.active_run_id ? "animate-pulse bg-amber-400" : thread.last_status === "error" ? "bg-destructive" : thread.last_status === "complete" ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /><MessageSquare className="size-4" /><span className="truncate">{thread.title}</span></button>
      <button aria-label={`Delete ${thread.title}`} onClick={() => void remove(thread.id)} className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-4" /></button>
    </div>)}</div>
    {client.navigateHome && <div className="border-t p-3"><button onClick={() => void client.navigateHome?.()} className="flex items-center gap-2 text-sm"><Home className="size-4" />Home</button></div>}
  </aside>;
}

function Chat({ agentName, data, title }: CursorAgentChatProps) {
  const { thread, messages, liveRunId } = data;
  const runtime = useCursorRuntime({ threadId: thread.id, agentId: thread.cursor_agent_id, initialMessages: messages, liveRunId });
  const [sidebar, setSidebar] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  return <AssistantRuntimeProvider runtime={runtime}>
    <div className="flex min-h-svh w-full overflow-hidden bg-background">
      {sidebar && <ThreadList agentName={agentName} activeId={thread.id} close={() => undefined} />}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-3"><div className="flex min-w-0 items-center gap-2"><button aria-label="Toggle conversations" onClick={() => setSidebar((value) => !value)} className="rounded-md p-2 hover:bg-muted"><Menu className="size-4" /></button><h1 className="truncate text-sm font-semibold">{title ?? thread.title}</h1></div><StatusLink threadId={thread.id} initialAgentId={thread.cursor_agent_id} /></header>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto" autoScroll>
            <ThreadPrimitive.Empty><div className="m-auto max-w-lg px-6 py-24 text-center"><h2 className="text-3xl font-semibold tracking-tight">What should Cursor build?</h2><p className="mt-3 text-sm text-muted-foreground">Describe a coding task. This thread keeps the same agent and workspace for follow-ups.</p></div></ThreadPrimitive.Empty>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8"><ThreadPrimitive.Messages components={{ Message }} /></div>
            <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-6">
              <ComposerPrimitive.Root className="flex items-end gap-2 rounded-[28px] border bg-card px-3 py-2 shadow-sm">
                <ComposerPrimitive.Input ref={input} autoFocus rows={1} placeholder="Message Cursor…" className="max-h-52 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none" />
                <ThreadPrimitive.If running><ComposerPrimitive.Cancel asChild><button aria-label="Stop run" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><Square className="size-4 fill-current" /></button></ComposerPrimitive.Cancel></ThreadPrimitive.If>
                <ThreadPrimitive.If running={false}><ComposerPrimitive.Send asChild><button aria-label="Send message" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><ArrowUp className="size-4" /></button></ComposerPrimitive.Send></ThreadPrimitive.If>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </main>
    </div>
  </AssistantRuntimeProvider>;
}

export function CursorAgentChat(props: CursorAgentChatProps) {
  return <div className={props.className}><Chat key={props.data.thread.id} {...props} /></div>;
}