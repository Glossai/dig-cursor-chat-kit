import { createFileRoute } from "@tanstack/react-router";
import { CursorAgentChat } from "@/components/cursor-agent-chat/CursorAgentChat";
import { getCursorThread } from "@/lib/cursor/chat.functions";

const AGENT_NAME = "demo-agent";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  loader: ({ params }) => getCursorThread({ data: { threadId: params.threadId } }),
  component: ChatPage,
  errorComponent: ({ error }) => (
    <div className="grid min-h-svh place-items-center bg-background p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Conversation unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="grid min-h-svh place-items-center">Conversation not found.</div>
  ),
});

function ChatPage() {
  const data = Route.useLoaderData();
  return <CursorAgentChat agentName={AGENT_NAME} thread={data.thread} messages={data.messages} />;
}
