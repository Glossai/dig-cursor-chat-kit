import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/cursor/stream/$messageId")({
  server: { handlers: { GET: async ({ request, params }) => {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = auth.slice(7);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: identity, error: identityError } = await supabaseAdmin.auth.getUser(token);
    if (identityError || !identity.user) return new Response("Unauthorized", { status: 401 });
    const { data: run, error } = await supabaseAdmin.from("cursor_runs").select("id, user_id, agent_name, cursor_agent_id, cursor_run_id, assistant_message_id, model_id, last_event_id").eq("assistant_message_id", params.messageId).eq("user_id", identity.user.id).single();
    if (error || !run) return new Response("Not found", { status: 404 });
    const cursor = await import("@/lib/cursor/cursor.server");
    const upstream = await cursor.openRunStream(run.agent_name, run.cursor_agent_id, run.cursor_run_id, run.last_event_id);
    if (!upstream.ok || !upstream.body) return new Response(`Cursor stream unavailable (${upstream.status})`, { status: upstream.status === 410 ? 409 : 502 });
    await supabaseAdmin.from("cursor_runs").update({ status: "running" }).eq("id", run.id);
    await supabaseAdmin.from("cursor_messages").update({ status: "streaming" }).eq("id", run.assistant_message_id);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let lastEventId = run.last_event_id;
    let durationMs: number | null = null;
    let providerCost: unknown = null;
    const output = new ReadableStream({
      async start(controller) {
        const reader = upstream.body?.getReader();
        if (!reader) { controller.close(); return; }
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
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
                if (line.startsWith("id:")) lastEventId = line.slice(3).trim();
                else if (line.startsWith("event:")) event = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (lastEventId) await supabaseAdmin.from("cursor_runs").update({ last_event_id: lastEventId }).eq("id", run.id);
              if (!data) continue;
              let payload: Record<string, unknown>;
              try { payload = JSON.parse(data) as Record<string, unknown>; } catch { continue; }
              if (event === "assistant" && typeof payload.text === "string") { fullText += payload.text; send({ type: "delta", text: payload.text }); }
              if (event === "result") { if (typeof payload.text === "string") fullText = payload.text; durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null; providerCost = payload.cost ?? null; }
              if (event === "error") throw new Error(typeof payload.message === "string" ? payload.message : "Cursor stream failed");
            }
          }
          const accounting = await cursor.fetchRunUsage(run.agent_name, run.cursor_agent_id, run.cursor_run_id, run.model_id, providerCost).catch(() => null);
          const usage = accounting ? { inputTokens: accounting.usage.inputTokens, outputTokens: accounting.usage.outputTokens, cacheReadTokens: accounting.usage.cacheReadTokens, cacheWriteTokens: accounting.usage.cacheWriteTokens, totalTokens: accounting.usage.totalTokens, totalCostMicros: accounting.cost.totalCostMicros, costSource: accounting.cost.source } : null;
          const completedAt = new Date().toISOString();
          await supabaseAdmin.from("cursor_messages").update({ content: fullText, status: "complete", completed_at: completedAt }).eq("id", run.assistant_message_id);
          await supabaseAdmin.from("cursor_runs").update({ status: "finished", finished_at: completedAt, duration_ms: durationMs, last_event_id: lastEventId, input_tokens: accounting?.usage.inputTokens, output_tokens: accounting?.usage.outputTokens, cache_read_tokens: accounting?.usage.cacheReadTokens, cache_write_tokens: accounting?.usage.cacheWriteTokens, total_tokens: accounting?.usage.totalTokens, input_cost_micros: accounting?.cost.inputCostMicros, output_cost_micros: accounting?.cost.outputCostMicros, cache_read_cost_micros: accounting?.cost.cacheReadCostMicros, cache_write_cost_micros: accounting?.cost.cacheWriteCostMicros, total_cost_micros: accounting?.cost.totalCostMicros, cost_source: accounting?.cost.source ?? "unavailable", pricing_version: accounting?.cost.pricingVersion, provider_usage: accounting?.raw as Json | undefined, provider_cost: accounting?.cost.providerCost as Json | undefined }).eq("id", run.id);
          send({ type: "done", usage });
        } catch (streamError) {
          const message = streamError instanceof Error ? streamError.message : "Cursor stream failed";
          await supabaseAdmin.from("cursor_messages").update({ content: fullText, status: "error", error_code: "cursor_stream_failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", run.assistant_message_id);
          await supabaseAdmin.from("cursor_runs").update({ status: "error", error_code: "cursor_stream_failed", error_message: message, finished_at: new Date().toISOString(), last_event_id: lastEventId }).eq("id", run.id);
          send({ type: "error", message });
        } finally { controller.close(); }
      },
    });
    return new Response(output, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" } });
  } } },
});