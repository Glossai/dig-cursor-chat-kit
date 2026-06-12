// Project wiring for the Cursor API client. The pure client lives in the kit
// and takes config explicitly; this file resolves config from env (legacy
// behaviour) and re-exposes the same function shapes the rest of the project
// already imports, so no call sites had to change.
//
// Phase 2 (see docs/cursor-chat-kit-architecture.md) replaces these wrappers
// with a single `createCursorChatBackend({ resolveAgentConfig, getAdminClient, … })`
// factory.

import {
  getCursorConfigFromEnv,
  triggerAutomationWebhook as kitTriggerAutomationWebhook,
  pollLatestRunId as kitPollLatestRunId,
  createFollowupRun as kitCreateFollowupRun,
  listAgentRuns as kitListAgentRuns,
  getAgentRun as kitGetAgentRun,
  openRunStream as kitOpenRunStream,
  cancelRun as kitCancelRun,
  fetchAgentUsageAll as kitFetchAgentUsageAll,
  fetchRunUsage as kitFetchRunUsage,
} from "../../../packages/cursor-chat-kit/src/server/cursor-api";

export type {
  CursorRunStatusRaw,
  CursorRunSummary,
  CursorRunDetail,
} from "../../../packages/cursor-chat-kit/src/server/cursor-api";

export function getCursorConfig(agentName: string) {
  return getCursorConfigFromEnv(agentName);
}

export function triggerAutomationWebhook(agentName: string, prompt: string) {
  return kitTriggerAutomationWebhook(getCursorConfigFromEnv(agentName), prompt);
}

export function pollLatestRunId(agentName: string, agentId: string) {
  return kitPollLatestRunId(getCursorConfigFromEnv(agentName), agentId);
}

export function createFollowupRun(agentName: string, agentId: string, prompt: string) {
  return kitCreateFollowupRun(getCursorConfigFromEnv(agentName), agentId, prompt);
}

export function listAgentRuns(agentName: string, agentId: string) {
  return kitListAgentRuns(getCursorConfigFromEnv(agentName), agentId);
}

export function getAgentRun(agentName: string, agentId: string, runId: string) {
  return kitGetAgentRun(getCursorConfigFromEnv(agentName), agentId, runId);
}

export function openRunStream(
  agentName: string,
  agentId: string,
  runId: string,
  lastEventId?: string | null,
) {
  return kitOpenRunStream(getCursorConfigFromEnv(agentName), agentId, runId, lastEventId);
}

export function cancelCursorRun(agentName: string, agentId: string, runId: string) {
  return kitCancelRun(getCursorConfigFromEnv(agentName), agentId, runId);
}

export function fetchAgentUsageAll(agentName: string, agentId: string) {
  return kitFetchAgentUsageAll(getCursorConfigFromEnv(agentName), agentId);
}

export function fetchRunUsage(
  agentName: string,
  agentId: string,
  runId: string,
  modelId: string | null,
  providerCost: unknown,
) {
  return kitFetchRunUsage(
    getCursorConfigFromEnv(agentName),
    agentId,
    runId,
    modelId,
    providerCost,
  );
}
