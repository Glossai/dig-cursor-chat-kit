// Adapter interfaces the kit depends on. The kit is auth-agnostic: it never
// imports project-specific auth middleware. Instead, the host injects a
// CursorAuthResolver that returns the authenticated user id plus an
// RLS-scoped DB client. Every kit server handler calls `resolveAuth()` at the
// top of `.handler()`; the kit never receives `userId` as client input.

import type { CursorRunUsage } from "../types";

/**
 * Authenticated request context resolved by the host.
 *
 * - `userId` MUST be derived server-side from a verified credential
 *   (cookie/bearer/session). Never accept it from client input.
 * - `db` is a DB client scoped to the user — RLS enforces row ownership.
 *   The kit never falls back to a service-role client for user-scoped reads.
 * - `isAnonymous` lets the kit apply the policy gate uniformly across auth
 *   providers (Supabase anon JWT, Clerk guest, custom, …).
 */
export type CursorAuthContext = {
  userId: string;
  db: AuthedDbClientLike;
  isAnonymous?: boolean;
};

/**
 * Host-provided auth resolver. Called inside each server handler. It reads
 * the request via the host's runtime (e.g. TanStack `getRequest`, cookies,
 * bearer header) and returns the verified context. Throw to reject the call.
 */
export type CursorAuthResolver = () => Promise<CursorAuthContext>;

/** Minimal authenticated DB surface used by chat/thread/message queries. */
export type DbResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

export type DbQueryLike<T = unknown> = PromiseLike<DbResult<T>> & {
  select(columns: string): DbQueryLike<T>;
  insert(values: Record<string, unknown>): DbQueryLike<T>;
  update(values: Record<string, unknown>): DbQueryLike<T>;
  delete(): DbQueryLike<T>;
  eq(column: string, value: unknown): DbQueryLike<T>;
  is(column: string, value: null): DbQueryLike<T>;
  or(filters: string): DbQueryLike<T>;
  in(column: string, values: readonly unknown[]): DbQueryLike<T>;
  order(column: string, options?: { ascending?: boolean }): DbQueryLike<T>;
  single(): Promise<DbResult<T>>;
  maybeSingle(): Promise<DbResult<T>>;
};

export type AuthedDbClientLike = {
  from<T = unknown>(table: string): DbQueryLike<T>;
};

/** Minimal shape required from a Supabase-compatible admin client. */
export type AdminClientLike = {
  from(table: string): {
    upsert(values: Record<string, unknown>, opts?: { onConflict?: string }): Promise<{
      error: { message: string } | null;
    }>;
  };
};

/** Loaded lazily inside server handlers to keep service-role keys server-only. */
export type GetAdminClient = () => Promise<AdminClientLike> | AdminClientLike;

/** Per-agent secrets resolved at request time (env, KMS, Vault — consumer's choice). */
export type AgentConfig = {
  apiKey: string;
  webhookUrl: string;
  webhookToken: string;
  apiBaseUrl?: string;
};

export type AgentConfigResolver = (agentName: string) => AgentConfig | Promise<AgentConfig>;

/** Declarative policy the kit enforces using the resolver's output. */
export type CursorAuthPolicy = {
  /** Default: false. When false, isAnonymous=true contexts are rejected. */
  allowAnonymous?: boolean;
};

/** Fired once per terminal run; consumers can forward to billing/analytics. */
export type RunRecordedEvent = {
  userId: string;
  threadId: string | null;
  agentName: string;
  cursorAgentId: string;
  cursorRunId: string;
  model: string | null;
  status: "complete" | "error" | "cancelled";
  usage: CursorRunUsage | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type OnRunRecorded = (event: RunRecordedEvent) => void | Promise<void>;

