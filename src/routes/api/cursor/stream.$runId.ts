import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cursorId = z.string().regex(/^(bc|run)-[a-zA-Z0-9-]+$/);

export const Route = createFileRoute("/api/cursor/stream/$runId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = new URL(request.url);
        const agentIdParam = url.searchParams.get("agentId");
        const lastEventId = request.headers.get("last-event-id");
        const runIdResult = cursorId.safeParse(params.runId);
        const agentIdResult = cursorId.safeParse(agentIdParam);
        if (!runIdResult.success || !agentIdResult.success)
          return new Response("Bad request", { status: 400 });
        const runId = runIdResult.data;
        const agentId = agentIdResult.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: identity, error: identityError } = await supabaseAdmin.auth.getUser(token);
        if (identityError || !identity.user) return new Response("Unauthorized", { status: 401 });

        // Authorize: caller must own a thread linked to this Cursor agent
        const { data: thread, error: threadError } = await supabaseAdmin
          .from("cursor_threads")
          .select("id, agent_name")
          .eq("cursor_agent_id", agentId)
          .eq("user_id", identity.user.id)
          .maybeSingle();
        if (threadError || !thread) return new Response("Not found", { status: 404 });

        const cursor = await import("@/lib/cursor/cursor.server");
        const upstream = await cursor.openRunStream(
          thread.agent_name,
          agentId,
          runId,
          lastEventId,
        );
        if (!upstream.ok || !upstream.body)
          return new Response(`Cursor stream unavailable (${upstream.status})`, {
            status: upstream.status === 410 ? 410 : 502,
          });

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let providerCost: unknown = null;

        const output = new ReadableStream({
          async start(controller) {
            const reader = upstream.body?.getReader();
            if (!reader) return controller.close();
            const send = (value: unknown) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
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
                  if (event === "error")
                    throw new Error(
                      typeof payload.message === "string"
                        ? payload.message
                        : "Cursor stream failed",
                    );
                }
              }
              const accounting = await cursor
                .fetchRunUsage(thread.agent_name, agentId, runId, null, providerCost)
                .catch(() => null);
              const usage = accounting
                ? {
                    inputTokens: accounting.usage.inputTokens,
                    outputTokens: accounting.usage.outputTokens,
                    cacheReadTokens: accounting.usage.cacheReadTokens,
                    cacheWriteTokens: accounting.usage.cacheWriteTokens,
                    totalTokens: accounting.usage.totalTokens,
                    totalCostMicros: accounting.cost.totalCostMicros,
                    costSource: accounting.cost.source,
                  }
                : null;
              send({ type: "done", text: fullText, usage });
            } catch (streamError) {
              const message =
                streamError instanceof Error ? streamError.message : "Cursor stream failed";
              send({ type: "error", message });
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
      },
    },
  },
});
