import { z } from "zod";
import { resolveRunCost, type TokenUsage } from "./pricing.server";

const agentNameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const cursorIdSchema = z.string().regex(/^(bc|run)-[a-zA-Z0-9-]+$/);

function configKey(agentName: string, suffix: string) {
  return `CURSOR_${agentName.toUpperCase().replace(/-/g, "_")}_${suffix}`;
}

export function getCursorConfig(agentName: string) {
  const safeName = agentNameSchema.parse(agentName);
  const webhookUrl = process.env[configKey(safeName, "WEBHOOK_URL")];
  const webhookToken = process.env[configKey(safeName, "WEBHOOK_TOKEN")];
  const apiKey = process.env[configKey(safeName, "API_KEY")];
  if (!webhookUrl || !webhookToken || !apiKey)
    throw new Error(`Cursor agent '${safeName}' is not configured`);
  const parsedUrl = z.string().url().parse(webhookUrl);
  return {
    webhookUrl: parsedUrl,
    webhookToken,
    apiKey,
    apiBaseUrl: process.env.CURSOR_API_BASE_URL ?? "https://api.cursor.com",
  };
}

async function checkedJson(url: string, init: RequestInit, timeoutMs = 30_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) {
    let providerMessage = "";
    try {
      const errorBody = JSON.parse(text) as { message?: unknown };
      if (typeof errorBody.message === "string") providerMessage = `: ${errorBody.message}`;
    } catch {
      providerMessage = "";
    }
    throw new Error(
      `Cursor request failed (${response.status})${
        response.status === 409 ? ": agent is busy" : providerMessage
      }`,
    );
  }
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("Cursor returned invalid JSON");
  }
}

const apiHeaders = (apiKey: string) => ({
  Authorization: `Basic ${btoa(`${apiKey}:`)}`,
  "Content-Type": "application/json",
});

export async function triggerAutomationWebhook(agentName: string, prompt: string) {
  const config = getCursorConfig(agentName);
  const body = await checkedJson(config.webhookUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.webhookToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const agentId = z.string().parse(body.backgroundComposerId);
  cursorIdSchema.parse(agentId);
  return agentId;
}

export async function pollLatestRunId(agentName: string, agentId: string) {
  cursorIdSchema.parse(agentId);
  const config = getCursorConfig(agentName);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = await checkedJson(
      `${config.apiBaseUrl}/v1/agents/${encodeURIComponent(agentId)}`,
      { headers: apiHeaders(config.apiKey) },
    );
    if (typeof body.latestRunId === "string") return cursorIdSchema.parse(body.latestRunId);
    await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4_000)));
  }
  throw new Error("Cursor run did not become available in time");
}

export async function createFollowupRun(agentName: string, agentId: string, prompt: string) {
  const config = getCursorConfig(agentName);
  const body = await checkedJson(
    `${config.apiBaseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs`,
    {
      method: "POST",
      headers: apiHeaders(config.apiKey),
      body: JSON.stringify({ prompt: { text: prompt } }),
    },
  );
  const run = z.object({ id: z.string() }).parse(body.run);
  return cursorIdSchema.parse(run.id);
}

export function openRunStream(
  agentName: string,
  agentId: string,
  runId: string,
  lastEventId?: string | null,
) {
  const config = getCursorConfig(agentName);
  return fetch(
    `${config.apiBaseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "text/event-stream",
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
    },
  );
}

export async function cancelCursorRun(agentName: string, agentId: string, runId: string) {
  const config = getCursorConfig(agentName);
  await checkedJson(
    `${config.apiBaseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", headers: apiHeaders(config.apiKey) },
  );
}

export async function fetchRunUsage(
  agentName: string,
  agentId: string,
  runId: string,
  modelId: string | null,
  providerCost: unknown,
) {
  const config = getCursorConfig(agentName);
  const body = await checkedJson(
    `${config.apiBaseUrl}/v1/agents/${encodeURIComponent(agentId)}/usage?runId=${encodeURIComponent(runId)}`,
    { headers: apiHeaders(config.apiKey) },
  );
  const usageRecord = z
    .object({
      runs: z.array(
        z.object({
          id: z.string(),
          usage: z.object({
            inputTokens: z.number().nonnegative().default(0),
            outputTokens: z.number().nonnegative().default(0),
            cacheReadTokens: z.number().nonnegative().default(0),
            cacheWriteTokens: z.number().nonnegative().default(0),
            totalTokens: z.number().nonnegative().default(0),
          }),
        }),
      ),
    })
    .parse(body)
    .runs.find((item) => item.id === runId);
  const usage: TokenUsage = usageRecord?.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
  return { usage, cost: resolveRunCost(modelId, usage, providerCost), raw: body };
}
