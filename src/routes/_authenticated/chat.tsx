import { createFileRoute, redirect } from "@tanstack/react-router";
import { createCursorThread, listCursorThreads } from "@/lib/cursor/chat.functions";

const AGENT_NAME = "demo-agent";

export const Route = createFileRoute("/_authenticated/chat")({
  beforeLoad: async () => {
    const threads = await listCursorThreads({ data: { agentName: AGENT_NAME } });
    const thread =
      threads?.[0] ??
      (await createCursorThread({ data: { agentName: AGENT_NAME, title: "New conversation" } }));
    throw redirect({ to: "/chat/$threadId", params: { threadId: thread.id } });
  },
});
