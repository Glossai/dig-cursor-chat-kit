// Pure Cursor REST/SSE client. Takes config explicitly — no env reads here.
// The project (or a future `createCursorChatBackend` factory) decides how to
// resolve per-agent config; see `AgentConfigResolver` in ./adapters.

import { z } from "zod";
import { resolveRunCost, type TokenUsage } from "./pricing";
import type { AgentConfig } from "./adapters";

const agentNameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const cursorIdSchema = z.string().regex(/^(bc|run)-[a-zA-Z0-9-]+$/);

export function assertAgentName(name: string) {
  return agentNameSchema.parse(name);
}

export function assertCursorId(id: string) {
  return cursorIdSchema.parse(id);
}

function resolveBaseUrl(config: AgentConfig) {
  return config.apiBaseUrl ?? "https://api.cursor.com";
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

export async function triggerAutomationWebhook(config: AgentConfig, prompt: string) {
  const body = await checkedJson(config.webhookUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.webhookToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const agentId = z.string().parse(body.backgroundComposerId);
  return cursorIdSchema.parse(agentId);
}

export async function pollLatestRunId(config: AgentConfig, agentId: string) {
  cursorIdSchema.parse(agentId);
  const baseUrl = resolveBaseUrl(config);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = await checkedJson(
      `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}`,
      { headers: apiHeaders(config.apiKey) },
    );
    if (typeof body.latestRunId === "string") return cursorIdSchema.parse(body.latestRunId);
    await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4_000)));
  }
  throw new Error("Cursor run did not become available in time");
}

export async function createFollowupRun(
  config: AgentConfig,
  agentId: string,
  prompt: string,
) {
  const baseUrl = resolveBaseUrl(config);
  const body = await checkedJson(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs`,
    {
      method: "POST",
      headers: apiHeaders(config.apiKey),
      body: JSON.stringify({ prompt: { text: prompt } }),
    },
  );
  const run = z.object({ id: z.string() }).parse(body.run);
  return cursorIdSchema.parse(run.id);
}

const runStatusSchema = z.enum([
  "CREATING",
  "RUNNING",
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
]);
export type CursorRunStatusRaw = z.infer<typeof runStatusSchema>;

const runItemSchema = z.object({
  id: z.string(),
  status: runStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type CursorRunSummary = z.infer<typeof runItemSchema>;

export async function listAgentRuns(config: AgentConfig, agentId: string) {
  const baseUrl = resolveBaseUrl(config);
  const all: CursorRunSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await checkedJson(url.toString(), { headers: apiHeaders(config.apiKey) });
    const items = z.array(runItemSchema).parse(body.items ?? []);
    all.push(...items);
    const next = typeof body.nextCursor === "string" ? body.nextCursor : null;
    if (!next) break;
    cursor = next;
  }
  return all;
}

const runDetailSchema = z.object({
  id: z.string(),
  status: runStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  result: z.string().optional(),
  durationMs: z.number().optional(),
  model: z.string().optional(),
});

export type CursorRunDetail = z.infer<typeof runDetailSchema>;

export async function getAgentRun(config: AgentConfig, agentId: string, runId: string) {
  cursorIdSchema.parse(runId);
  const baseUrl = resolveBaseUrl(config);
  const body = await checkedJson(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    { headers: apiHeaders(config.apiKey) },
  );
  return runDetailSchema.parse(body);
}

export function openRunStream(
  config: AgentConfig,
  agentId: string,
  runId: string,
  lastEventId?: string | null,
) {
  const baseUrl = resolveBaseUrl(config);
  return fetch(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "text/event-stream",
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
    },
  );
}

export async function cancelRun(config: AgentConfig, agentId: string, runId: string) {
  const baseUrl = resolveBaseUrl(config);
  await checkedJson(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", headers: apiHeaders(config.apiKey) },
  );
}

const tokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative().default(0),
  outputTokens: z.number().nonnegative().default(0),
  cacheReadTokens: z.number().nonnegative().default(0),
  cacheWriteTokens: z.number().nonnegative().default(0),
  totalTokens: z.number().nonnegative().default(0),
});

export async function fetchAgentUsageAll(config: AgentConfig, agentId: string) {
  const baseUrl = resolveBaseUrl(config);
  const body = await checkedJson(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/usage`,
    { headers: apiHeaders(config.apiKey) },
  );
  const parsed = z
    .object({
      runs: z
        .array(z.object({ id: z.string(), usage: tokenUsageSchema }))
        .default([]),
    })
    .parse(body);
  return new Map(parsed.runs.map((r) => [r.id, r.usage as TokenUsage]));
}

export async function fetchRunUsage(
  config: AgentConfig,
  agentId: string,
  runId: string,
  modelId: string | null,
  providerCost: unknown,
) {
  const baseUrl = resolveBaseUrl(config);
  const body = await checkedJson(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/usage?runId=${encodeURIComponent(runId)}`,
    { headers: apiHeaders(config.apiKey) },
  );
  const usageRecord = z
    .object({ runs: z.array(z.object({ id: z.string(), usage: tokenUsageSchema })) })
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

/**
 * Convenience: env-driven config resolver used by projects that store one
 * secret per agent under `CURSOR_<AGENT>_{API_KEY,WEBHOOK_URL,WEBHOOK_TOKEN}`.
 * Custom resolvers (Vault, per-tenant DB, etc.) replace this.
 */
export function getCursorConfigFromEnv(agentName: string): AgentConfig {
  const safe = assertAgentName(agentName).toUpperCase().replace(/-/g, "_");
  const env = (suffix: string) => process.env[`CURSOR_${safe}_${suffix}`];
  const webhookUrl = env("WEBHOOK_URL");
  const webhookToken = env("WEBHOOK_TOKEN");
  const apiKey = env("API_KEY");
  if (!webhookUrl || !webhookToken || !apiKey)
    throw new Error(`Cursor agent '${agentName}' is not configured`);
  return {
    apiKey,
    webhookToken,
    webhookUrl: z.string().url().parse(webhookUrl),
    apiBaseUrl: process.env.CURSOR_API_BASE_URL ?? "https://api.cursor.com",
  };
}
