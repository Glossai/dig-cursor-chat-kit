---
name: cursor-chat-kit
description: Install and wire @lovable/cursor-chat-kit into a Lovable project — copies the schema migration, scaffolds the server wiring file with the adapter factory, registers Cursor secrets, and drops the chat component into a route. Use when the user asks to add a Cursor background-agent chat, "install cursor chat", reuse the cursor-chat-kit, or wire a new Cursor agent into another Lovable app.
---

# cursor-chat-kit installer

This skill installs the `@lovable/cursor-chat-kit` package into a Lovable
(TanStack Start + Lovable Cloud) project. The kit ships pure logic, domain
types, adapter interfaces, and a consolidated schema; the consuming project
provides Supabase clients, env-resolved Cursor config, and the agent map.

Background on the architecture: read `docs/cursor-chat-kit-architecture.md`
in the kit's source repo before non-trivial customization.

## When to use

Trigger this skill when the user wants to:

- Add a Cursor background-agent chat surface to an app.
- Reuse the chat component built in the source project ("the cursor chat
  thing", "the agent chat we built before").
- Wire a new Cursor agent (different `CURSOR_API_KEY` / agent ID) into an
  existing project that already has the kit.

Do **not** use this skill for: generic OpenAI/Anthropic chat UIs, Lovable AI
Gateway flows, or anything that isn't talking to a Cursor background agent.

## Preconditions

Before running steps:

1. Confirm the project uses TanStack Start (`src/routes/`, `src/start.ts`)
   and Lovable Cloud (`src/integrations/supabase/client.ts` exists).
2. Confirm `requireSupabaseAuth` is registered in `src/start.ts` global
   `functionMiddleware`. If not, add `attachSupabaseAuth` first.
3. Ask the user for the agent map up front:
   - human-readable `agentKey` (e.g. `support-bot`)
   - Cursor agent ID (`agt_...`)
   - model (e.g. `sonnet-4`)
   - which secret holds the API key (defaults to `CURSOR_API_KEY`)

If the user wants more than one agent, collect them all before scaffolding so
the wiring file is written once.

## Install steps

1. **Add the package.** From the project root:
   - If consuming from the workspace registry: `bun add @lovable/cursor-chat-kit`.
   - If vendoring for now: copy `packages/cursor-chat-kit/` into the target
     repo and add a workspace entry.

2. **Apply the schema.** Copy
   `packages/cursor-chat-kit/migrations/0001_cursor_chat_kit.sql` into the
   project's `supabase/migrations/` folder using the standard Lovable
   migration tool (do not run raw SQL). This creates `cursor_threads`,
   `cursor_messages`, `cursor_run_usage` with the hardened RLS baseline
   (anonymous-blocked, service-role-only writes on usage).

3. **Register secrets.** For each agent's API key, add the secret via the
   secrets tool. Default name: `CURSOR_API_KEY`. Also add
   `CURSOR_WEBHOOK_TOKEN` if the project will receive Cursor webhooks.

4. **Scaffold the wiring file.** Create `src/lib/cursor/backend.ts` that
   imports `createCursorChatBackend` from the kit and injects four adapters:

   - `resolveAuth` — **the auth seam.** The kit is auth-agnostic; it never
     imports `requireSupabaseAuth` or any project middleware. The host
     resolver returns `{ userId, db, isAnonymous? }` where `db` is an
     RLS-scoped client. For a Lovable Cloud (Supabase) project:
     ```ts
     import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

     // Wrap the host's middleware once per server-fn call. Each kit handler
     // runs `await resolveAuth()` at the top of `.handler()`, so userId is
     // server-derived and never accepted as client input.
     resolveAuth: async () => {
       const ctx = await requireSupabaseAuth.resolve();
       return {
         userId: ctx.userId,
         db: ctx.supabase,
         isAnonymous: ctx.claims?.is_anonymous === true,
       };
     },
     policy: { allowAnonymous: false },
     ```
     For Clerk / Auth.js / Better-Auth / custom JWT: return the same shape
     from that provider's session reader. Nothing else changes.
   - `getAdminClient: async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin`
     — used only for the usage-ledger upsert.
   - `cursor: { apiKey: process.env.CURSOR_API_KEY!, webhookUrl: ... }`
   - `agents: { '<agentKey>': { cursorAgentId, model } }`

   Export the resulting `chatFunctions` and re-export them from
   `src/lib/cursor/chat.functions.ts` so TanStack picks them up as server fns.


5. **Add the SSE proxy route** at `src/routes/api/cursor/stream.$runId.ts`,
   delegating to the kit's proxy handler with the wired backend.

6. **Drop the component.** In the route where the chat should appear:
   ```tsx
   import { CursorAgentChat } from '@lovable/cursor-chat-kit/react';
   <CursorAgentChat threadId={threadId} agentKey="support-bot" />
   ```

7. **Verify.** Send a test message, confirm the SSE stream renders, and
   confirm a `cursor_run_usage` row appears scoped to the current user.

## Things to get right

- Never import from `@/...` inside the kit. All project-specific values flow
  through the factory.
- Read `process.env.*` inside `.handler()` bodies, not at module scope, or
  TanStack server functions will see `undefined` at call time.
- Keep the SSE proxy under `src/routes/api/` (not `/api/public/`) unless the
  consumer explicitly wants unauthenticated access — Cursor responses can
  leak run content.
- After applying the migration, verify every new `public.cursor_*` table has
  `GRANT`s to `authenticated` and `service_role`. The kit's migration
  includes them; if you edit the SQL, keep them.

## Files this skill writes

- `supabase/migrations/<timestamp>_cursor_chat_kit.sql`
- `src/lib/cursor/backend.ts`
- `src/lib/cursor/chat.functions.ts`
- `src/routes/api/cursor/stream.$runId.ts`
- One route or component edit to mount `<CursorAgentChat />`

## Files this skill does NOT touch

- `src/integrations/supabase/*` (auto-generated)
- `src/start.ts` beyond confirming `attachSupabaseAuth` is registered
- The kit source under `packages/cursor-chat-kit/` (consumers don't fork it)
