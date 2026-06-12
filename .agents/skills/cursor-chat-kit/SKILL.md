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
3. Ask for the human-readable `agentName` used in env names (for example
   `support-bot`). The kit creates and persists Cursor agent IDs at runtime.

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
     // Server-function wrappers pass their verified middleware context into
     // a request-scoped backend instance. Never call middleware internals or
     // accept userId from client input.
     const backend = createCursorChatBackend({
       resolveAuth: async () => ({
         userId: context.userId,
         db: context.supabase,
         isAnonymous: context.claims?.is_anonymous === true,
       }),
       resolveAgentConfig: getCursorConfigFromEnv,
       getAdminClient: async () =>
         (await import('@/integrations/supabase/client.server')).supabaseAdmin,
       policy: { allowAnonymous: false },
     });
     policy: { allowAnonymous: false },
     ```
     For Clerk / Auth.js / Better-Auth / custom JWT: return the same shape
     from that provider's session reader. Nothing else changes.
   - `getAdminClient: async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin`
     — used only for the usage-ledger upsert.
    - `resolveAgentConfig` reads
      `CURSOR_<AGENT>_{API_KEY,WEBHOOK_URL,WEBHOOK_TOKEN}` at request time.

   Each `createServerFn` wrapper validates input, builds the backend from its
   authenticated `context`, and delegates to `backend.listThreads`,
   `createThread`, `getThread`, `sendMessage`, or `cancelMessage`.


5. **Add the SSE proxy route** at `src/routes/api/cursor/stream.$runId.ts`,
   delegating to the kit's proxy handler with the wired backend.

6. **Drop the component.** In the route where the chat should appear:
   ```tsx
   import { CursorAgentChat, CursorChatProvider } from '@lovable/cursor-chat-kit/react';
   <CursorChatProvider client={client}>
     <CursorAgentChat agentName="support-bot" data={hydratedThread} />
   </CursorChatProvider>
   ```

7. **Verify.** Send a test message, confirm the SSE stream renders, and
   confirm a `cursor_run_usage` row appears scoped to the current user.

## Things to get right

- The kit MUST stay auth-agnostic. Never add `requireSupabaseAuth` or any
  other project middleware as a dependency of the kit; everything flows
  through `resolveAuth`.
- `userId` is never a kit server-fn input — only an output of `resolveAuth()`.
  Reject any PR that adds `userId` to an `inputValidator`.
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
