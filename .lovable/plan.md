## Goal
Build a reusable `CursorAgentChat` React component based on **assistant-ui**, plus a Cursor Cloud adapter supporting threaded history, SSE responses, guest/authenticated users, and full traceability by `user_id` and denormalized `agent_name`.

A demo route in this project will exercise the component with test credentials supplied later.

## Confirmed Cursor flow
For every new thread:

1. **Initial message:** server sends `POST <automation-webhook-url>` with `{ "prompt": "..." }` and `Authorization: Bearer <webhook-token>`.
2. Read `backgroundComposerId` as the Cursor `agentId`.
3. Poll `GET https://api.cursor.com/v1/agents/{agentId}` with the separate Cursor API key until `latestRunId` is present, using bounded exponential backoff.
4. Stream `GET /v1/agents/{agentId}/runs/{runId}/stream` as SSE.
5. **Later messages:** call `POST /v1/agents/{agentId}/runs` with `{ "prompt": { "text": "..." } }`; read `run.id` directly, then stream it.

Only `assistant`, `result`, `error`, and `done` events affect the first UI version. Thinking, tool calls, and richer interaction events are ignored.

## Secure reusable configuration
The authorization values cannot safely be browser component props. The reusable public component accepts:

```tsx
<CursorAgentChat agentName="demo-agent" />
```

The server adapter resolves settings by normalized `agent_name`:

- `CURSOR_DEMO_AGENT_WEBHOOK_URL`
- `CURSOR_DEMO_AGENT_WEBHOOK_TOKEN`
- `CURSOR_DEMO_AGENT_API_KEY`
- Optional shared `CURSOR_API_BASE_URL`, default `https://api.cursor.com`

`agentName` is validated and normalized consistently. Credentials remain server-only and never enter browser props, loaders, logs, or database rows. The package exposes a server configuration resolver interface so another Lovable project can replace the secret naming strategy.

## Lovable Cloud and identity
Enable Lovable Cloud for authentication and persistence.

- Support anonymous guest sessions and email/password accounts.
- Every guest receives a real authenticated user ID, allowing identical RLS and traceability for guests and registered users.
- No `profiles` table, as confirmed.
- Minimal auth surface: continue as guest, sign up, sign in, sign out, forgot password, and reset-password route.
- Thread routes live under the authenticated layout; anonymous signed-in users are allowed.

## Database design
Create one migration with explicit grants, RLS, constraints, timestamps, and indexes.

### `cursor_threads`
- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `agent_name text not null`
- `cursor_agent_id text nullable`
- `title text not null`
- `created_at`, `updated_at`
- Index `(user_id, agent_name, updated_at desc)`

### `cursor_messages`
- Database-generated `id uuid primary key`
- `thread_id uuid not null references cursor_threads(id) on delete cascade`
- `user_id uuid not null` and `agent_name text not null`, both denormalized
- `role text` constrained to `user | assistant`
- `content text not null`
- `cursor_run_id text nullable`
- `status text` constrained to `pending | streaming | complete | error | cancelled`
- `error_code`, `error_message`, `created_at`, `completed_at`
- Indexes for ordered thread reads and user/agent/time aggregation

### `cursor_runs`
One row per Cursor run for operational traceability, usage, and cost analytics:
- `id uuid primary key`
- `thread_id`, `user_message_id`, `assistant_message_id`
- `user_id uuid not null`, `agent_name text not null`
- `cursor_agent_id text not null`, `cursor_run_id text unique not null`
- `source text` constrained to `automation_webhook | followup`
- `model_id text nullable`
- `status text`, `last_event_id text nullable`
- `started_at`, `finished_at`, `duration_ms`
- Token fields: `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `total_tokens`
- Cost fields stored in integer micros to avoid floating-point drift:
  - `input_cost_micros`, `output_cost_micros`
  - `cache_read_cost_micros`, `cache_write_cost_micros`
  - `total_cost_micros`
  - `cost_currency text default 'USD'`
  - `cost_source text` constrained to `provider | static_table | unavailable`
  - `pricing_version text nullable`
- `provider_usage jsonb nullable` and `provider_cost jsonb nullable` preserve the original normalized provider payload for auditability
- `error_code`, `error_message`
- Indexes on `(agent_name, started_at)`, `(user_id, agent_name, started_at)`, model, and run identifiers

### Security
- Grant user operations to `authenticated` and full access to `service_role`; no direct `anon` grants.
- Enable RLS on every table.
- All user-facing policies require `user_id = auth.uid()`.
- Denormalized ownership/agent values are copied server-side from the owned thread and never trusted from browser input.

## Token and cost accounting
After every terminal run:

1. Call `GET /v1/agents/{agentId}/usage?runId={runId}` and persist Cursor’s per-run token values.
2. Inspect the terminal run/SSE result and usage response for provider-reported cost fields. If present and valid, store them with `cost_source = 'provider'` and retain the source payload.
3. If cost is absent, calculate it from a versioned static pricing table in server code using `model_id` and the four token categories:

```text
cost = input_tokens × input_rate
     + output_tokens × output_rate
     + cache_read_tokens × cache_read_rate
     + cache_write_tokens × cache_write_rate
```

Rates are stored as USD micros per million tokens to keep calculations exact. The selected table version is recorded in `pricing_version`, with `cost_source = 'static_table'`.
4. If the model/rate is unknown, preserve token usage, set `cost_source = 'unavailable'`, leave monetary fields null, and log a non-secret diagnostic rather than guessing.
5. Provider cost always wins over the fallback table. Static rates are isolated in one typed, tested module so future pricing updates are a small versioned change and historical calculations remain explainable.

## Server adapter
Create a reusable typed server module with Zod-validated boundaries:

- `triggerAutomationWebhook(agentName, prompt)`
- `pollLatestRunId(agentName, cursorAgentId)`
- `createFollowupRun(agentName, cursorAgentId, prompt)`
- `openRunStream(agentName, cursorAgentId, cursorRunId, lastEventId?)`
- `cancelRun(...)`
- `fetchRunUsage(...)`
- `resolveRunCost(modelId, usage, providerCost?)`

Behavior:
- Reject malformed agent names/IDs, empty or oversized prompts.
- Use request timeouts and bounded polling.
- Handle webhook failures, malformed IDs, Cursor 401/403/404/409/429, polling timeout, stream expiry, and malformed SSE with safe errors.
- Resume interrupted streams with `Last-Event-ID`; reconcile expired streams via the run endpoint.
- Never log authorization values.

## Application server surfaces
- Authenticated server functions for listing, creating, renaming, deleting threads, and loading messages.
- A `sendMessage` server function that verifies ownership, persists the user message, starts the initial/follow-up run, stores Cursor IDs, and creates a pending assistant message and run row.
- A raw authenticated server route for streaming:
  - Verifies caller ownership.
  - Proxies Cursor SSE without exposing credentials.
  - Converts assistant deltas into adapter events.
  - Persists complete assistant text and terminal run metadata.
  - Captures `last_event_id` for recovery.
  - Fetches token usage and finalizes provider/static cost before marking accounting complete.
- A cancel function wired to assistant-ui abort behavior.
- Explicit persistence error handling; no fire-and-forget writes.

## Reusable assistant-ui component
Install and use `@assistant-ui/react` and its markdown renderer:

```text
src/components/cursor-agent-chat/
  CursorAgentChat.tsx
  CursorAgentChatProvider.tsx
  CursorThreadSidebar.tsx
  CursorThread.tsx
  useCursorRuntime.ts
  cursorStreamClient.ts
  types.ts
  README.md
```

Behavior:
- assistant-ui runtime adapter maps stored messages into thread messages.
- User/assistant messages only, with assistant markdown.
- Immediate optimistic user message and visible working state before SSE text.
- Thread sidebar with create/select/rename/delete and no nested buttons.
- Dedicated `/chat/{threadId}` URL; reload restores that exact thread.
- Composer remains focused during normal use.
- Stop cancels the active Cursor run.
- Responsive collapsible sidebar.

The user explicitly requires assistant-ui, so assistant-ui primitives replace the default AI Elements chat foundation; custom code is limited to Cursor transport, persistence, routing, and styling.

## Demo application
- Replace the placeholder page with a test-harness entry.
- Add `/auth` and `/reset-password` public routes.
- Add authenticated `/chat` bootstrap and `/chat/{threadId}` routes.
- `/chat` selects or creates a thread and navigates to its dedicated URL.
- Render `<CursorAgentChat agentName="demo-agent" />`.
- Show a safe configuration error if that agent’s server-side settings are missing.
- Add a small per-run usage disclosure in the assistant message metadata: total tokens and cost when available; detailed token categories remain accessible but visually secondary.

## Test parameters requested after implementation
Use the secure secret form to provide:
1. Automation webhook URL.
2. Automation webhook bearer token.
3. Cursor API v1 key.
4. Desired `agentName` for the demo.

## Verification
- Validate initial webhook → `backgroundComposerId` → poll `latestRunId` → SSE.
- Validate follow-ups reuse `cursor_agent_id` and use returned `run.id` directly.
- Confirm assistant text persists and reloads.
- Create two threads and verify no message/agent ID bleed after switching and reloading.
- Test guest and registered users; verify cross-user reads are blocked.
- Test cancellation, busy/rate-limit errors, poll timeout, reconnect, and reconciliation.
- Verify token values against Cursor’s usage endpoint.
- Test provider-reported cost precedence, static-table fallback, exact micros arithmetic, unknown-model behavior, and pricing-version traceability.
- Confirm indexed aggregates by user, agent, model, status, duration, tokens, and cost.
- Run project tests and verify desktop/mobile chat layout.