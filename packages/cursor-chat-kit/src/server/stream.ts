import type { CursorChatBackend } from "./backend";

export type CursorStreamIdentity = { userId: string };
export type CursorStreamThread = { id: string; agentName: string };

export type CursorStreamHandlerOptions = {
  backend: CursorChatBackend;
  authenticate(request: Request): Promise<CursorStreamIdentity | null>;
  findOwnedThread(input: {
    userId: string;
    cursorAgentId: string;
  }): Promise<CursorStreamThread | null>;
  clearActiveRun(input: { threadId: string; cursorRunId: string }): Promise<void>;
};

const CURSOR_ID = /^(bc|run)-[a-zA-Z0-9-]+$/;

export function createCursorStreamHandler(options: CursorStreamHandlerOptions) {
  return async function handleCursorStream(request: Request, runIdValue: string) {
    const identity = await options.authenticate(request);
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId") ?? "";
    if (!CURSOR_ID.test(runIdValue) || !CURSOR_ID.test(agentId)) {
      return new Response("Bad request", { status: 400 });
    }
    const thread = await options.findOwnedThread({
      userId: identity.userId,
      cursorAgentId: agentId,
    });
    if (!thread) return new Response("Not found", { status: 404 });
    const upstream = await options.backend.openStream(
      thread.agentName,
      agentId,
      runIdValue,
      request.headers.get("last-event-id"),
    );
    if (!upstream.ok || !upstream.body) {
      return new Response(`Cursor stream unavailable (${upstream.status})`, {
        status: upstream.status === 410 ? 410 : 502,
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const output = new ReadableStream({
      async start(controller) {
        const reader = upstream.body?.getReader();
        if (!reader) return controller.close();
        const send = (value: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        let fullText = "";
        let buffer = "";
        let providerCost: unknown = null;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split(/\r?\n\r?\n/);
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              let event = "message";
              let data = "";
              for (const line of chunk.split(/\r?\n/)) {
                if (line.startsWith("event:")) event = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (!data) continue;
              let payload: Record<string, unknown>;
              try {
                payload = JSON.parse(data) as Record<string, unknown>;
              } catch {
                continue;
              }
              if (event === "assistant" && typeof payload.text === "string") {
                fullText += payload.text;
                send({ type: "delta", text: payload.text });
              }
              if (event === "result") {
                if (typeof payload.text === "string") fullText = payload.text;
                providerCost = payload.cost ?? null;
              }
              if (event === "error") {
                throw new Error(
                  typeof payload.message === "string" ? payload.message : "Cursor stream failed",
                );
              }
            }
          }
          const accounting = await options.backend
            .fetchRunUsage(thread.agentName, agentId, runIdValue, null, providerCost)
            .catch(() => null);
          const detail = await options.backend
            .getRun(thread.agentName, agentId, runIdValue)
            .catch(() => null);
          const usage = accounting
            ? {
                ...accounting.usage,
                totalCostMicros: accounting.cost.totalCostMicros,
                costSource: accounting.cost.source,
              }
            : null;
          await options.backend.recordRunUsage({
            userId: identity.userId,
            threadId: thread.id,
            agentName: thread.agentName,
            cursorAgentId: agentId,
            cursorRunId: runIdValue,
            status: "complete",
            model: detail?.model ?? null,
            usage,
            durationMs: detail?.durationMs ?? null,
            startedAt: detail?.createdAt ?? null,
            finishedAt: detail?.updatedAt ?? new Date().toISOString(),
          });
          await options.clearActiveRun({ threadId: thread.id, cursorRunId: runIdValue });
          send({ type: "done", text: fullText, usage });
        } catch (error) {
          await options.clearActiveRun({ threadId: thread.id, cursorRunId: runIdValue });
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Cursor stream failed",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(output, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}