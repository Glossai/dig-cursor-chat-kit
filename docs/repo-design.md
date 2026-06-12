# Repository Design

This document describes the structure of this repository: what each top-level
piece is, how the host app and the extracted package relate, and where new
code should land. It is the companion to
[`cursor-chat-kit-architecture.md`](./cursor-chat-kit-architecture.md), which
focuses specifically on the kit's distribution strategy.

## High-level layout

```
.
├── src/                          # Host TanStack Start app
│   ├── routes/                   # File-based routes (pages + /api/* server routes)
│   ├── components/               # App UI, including cursor-agent-chat consumer
│   ├── lib/cursor/               # Thin wiring shims around @lovable/cursor-chat-kit
│   ├── integrations/supabase/    # Auto-generated Supabase clients + types
│   ├── hooks/                    # Shared React hooks
│   ├── router.tsx                # TanStack router bootstrap
│   ├── start.ts                  # createStart() + global middleware
│   └── styles.css                # Tailwind v4 + design tokens
├── packages/
│   └── cursor-chat-kit/          # Reusable Cursor chat package (Phase 1)
│       ├── src/                  # Pure modules + adapter interfaces
│       └── migrations/           # Consolidated schema for consumers
├── supabase/
│   └── migrations/               # Project-local DB migrations
└── docs/                         # Architecture + design docs (this folder)
```

## Two layers, one repo

The repo is intentionally split into **host** and **kit**:

| Layer | Lives in | Purpose | Knows about |
| --- | --- | --- | --- |
| **Host app** | `src/` | This specific Lovable project's UI, routes, auth, and DB wiring | Supabase project, env vars, design system |
| **Kit** | `packages/cursor-chat-kit/` | Reusable Cursor agent chat logic + schema | Nothing project-specific |

**Rule:** the kit must never import from `@/...`. The host imports from the
kit and injects everything project-specific (admin Supabase client, env
config, agent → API key mapping).

This separation exists so the kit can later be published (private workspace
registry first; see the architecture doc for the public-package decision) and
consumed by other Lovable projects without dragging this project's Supabase
instance or env layout with it.

## Host app conventions

- **Framework:** TanStack Start v1 on Vite 7, deployed to Cloudflare Workers.
- **Routing:** file-based under `src/routes/`. Pages are flat dot-separated
  files. Server HTTP routes live under `src/routes/api/`.
- **Server logic:** prefer `createServerFn` from `@tanstack/react-start` in
  `*.functions.ts` files. Webhooks, SSE proxies, and external callers use
  server routes under `src/routes/api/`.
- **Data fetching:** TanStack Query wired into the router context;
  loaders call `ensureQueryData`, components call `useSuspenseQuery`.
- **Auth + DB:** Lovable Cloud (Supabase). Three clients:
  - `@/integrations/supabase/client` — browser, publishable key, RLS.
  - `requireSupabaseAuth` middleware — authed server fns, RLS as user.
  - `@/integrations/supabase/client.server` — admin, service role, server-only.
- **Styling:** Tailwind v4 via `src/styles.css`, semantic tokens only — no
  hardcoded color utilities in components.

## The cursor-chat-kit boundary

The kit owns:

- Domain types (`CursorThread`, `CursorMessage`, `CursorRunUsage`, …).
- Adapter interfaces (`AdminClientLike`, `AgentConfig`, `CursorBackendConfig`).
- Pure logic: pricing resolver, Cursor REST/SSE client, usage upsert.
- The consolidated SQL migration (`migrations/0001_cursor_chat_kit.sql`).

The host owns:

- `src/lib/cursor/*.ts` — shims that resolve env, pick the admin client, and
  call into the kit.
- `src/lib/cursor/chat.functions.ts` — server fns with `requireSupabaseAuth`.
- `src/routes/api/cursor/stream.$runId.ts` — SSE proxy route.
- `src/components/cursor-agent-chat/*` — the React UI rendered in the host.
- `supabase/migrations/*` — the applied copy of the kit's schema plus any
  host-only changes (e.g. anonymous-access hardening).

When something changes in the kit's schema, the host applies an equivalent
migration through `supabase/migrations/`. The kit's `migrations/` folder is
the source of truth for new consumers; the host's folder is the historical
log of what's already in this project's database.

## Security baseline

All `cursor_*` tables in the host DB enforce:

- `auth.uid() = user_id` on every policy.
- `(auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE` to block anonymous
  Supabase sessions even if the provider is later enabled.
- `cursor_run_usage` is service-role-write only; users get read-only access
  scoped to their own rows.
- Every `public.*` table has explicit `GRANT`s to `authenticated` /
  `service_role` (PostgREST does not grant defaults).

The kit's shipped migration mirrors this baseline so new consumers get the
same posture out of the box.

## Where new code should land

| You're adding… | Put it in |
| --- | --- |
| A new page or route in this app | `src/routes/` |
| A reusable host-only component | `src/components/` |
| A server fn that reads/writes this project's DB | `src/lib/<feature>/<feature>.functions.ts` |
| A webhook / public API | `src/routes/api/public/<name>.ts` |
| New Cursor chat domain logic intended to be reused | `packages/cursor-chat-kit/src/` |
| A schema change for the kit | both `packages/cursor-chat-kit/migrations/` (canonical) and `supabase/migrations/` (applied) |
| Architecture/design notes | `docs/` |

## Open questions / Phase 2

These are tracked in `cursor-chat-kit-architecture.md` but worth surfacing
here for repo-level context:

- Extract `chat.functions.ts` and the SSE proxy into the kit behind a
  `createCursorChatBackend({ getAdminClient, cursor, agents })` factory.
- Extract the React components into `packages/cursor-chat-kit/src/react/`
  with `apiBasePath` + `threadId` + `agentKey` as the only required props.
- Decide whether to publish the kit publicly. Current recommendation:
  **private workspace registry first**, public after the adapter shape and
  pricing table stabilize.
- Ship a Lovable Skill (`.workspace/skills/cursor-chat-kit/`) that runs the
  install: copy migration, scaffold the wiring file, register secrets, drop
  the component into a route.
