# Cursor Chat Kit — Architecture Proposal

**Status:** Draft for review.
**Audience:** Frontend Team Lead (second opinion before Phase 2).
**Scope:** Turn the in-repo Cursor background-agent chat into a reusable kit
that other Lovable projects (and eventually other teams) can drop in.

---

## 1. Goals & non-goals

**Goals**

1. Other Lovable projects can install the chat in **one prompt** ("add the
   Cursor chat kit to this project").
2. Each consuming project owns **its own database**, its own auth, its own
   Cursor agents and secrets.
3. The chat UI, server logic, schema, and analytics surfaces are versioned
   together and upgraded independently of any one project.
4. Usage metrics are first-class: queryable per-user / per-agent / per-model,
   exportable to billing systems.

**Non-goals (for v1)**

- Multi-tenant hosted SaaS. Each project is self-hosted on its own Supabase.
- A framework-agnostic build. v1 targets TanStack Start + Supabase, which is
  the Lovable default. A React-only / classic-stack adapter is post-v1.
- Replacing Lovable AI Gateway. The kit talks to **Cursor's** background-agent
  API; LLM model choice is Cursor's, not ours.

---

## 2. Distribution

Recommendation: **private npm package + Lovable Skill installer.** Skip the
hosted SaaS path for v1; revisit if multiple external customers ask for it.

| Option | Verdict |
|---|---|
| **Private npm package** (`@lovable/cursor-chat-kit`) under the workspace registry | ✅ Primary distribution. Versioned, type-safe, mechanical to consume. |
| **Lovable Skill** (`cursor-chat`) that installs the package + scaffolds wiring | ✅ One-prompt install for end users. Thin layer on top of the package. |
| **Hosted SaaS** (central API, JS SDK keyed by `projectId`) | ❌ Defer. Cross-tenant data, our infra to scale and bill. |
| **Git submodule / copy-paste** | ❌ No upgrade path. |

### Will it be public?

**No, not initially.** Recommend publishing to the **workspace-private npm
registry** (already wired in via `LOVABLE_NPM_REGISTRY_*`). Reasons:

- Keeps the Cursor API contract and pricing table internal until they
  stabilise (pricing currently lives in code as `STATIC_RATES`).
- Lets us iterate on the adapter API without semver pressure from external
  users.
- Lovable Skill can resolve a private package transparently — consumers
  don't see registry plumbing.

Promotion to public npm is a one-line `package.json` change (`"private":
false`) once: (a) the adapter API is frozen, (b) pricing is sourced from
Cursor's API instead of our static table, and (c) we have a documented
support story.

---

## 3. Component inputs (the public surface)

Strict separation between **UI props** (safe, client-visible) and **server
config** (env / secrets, never props).

### React component props

```tsx
<CursorAgentChat
  threadId={threadId}            // route param; chat is keyed by this
  agentKey="support-bot"         // logical name → server-side agent mapping
  className?: string
  headerSlot?: ReactNode         // custom title / status / branding
  placeholder?: string           // composer placeholder
  emptyState?: ReactNode         // shown when thread has no messages
  onRunComplete?(usage): void    // optional analytics hook
  onError?(err): void
  apiBasePath?: string           // default '/api/cursor'
/>
```

Companion components shipped alongside:

- `<CursorThreadSidebar agentKey activeThreadId onSelect onNewThread />`
- `<CursorUsageDashboard range agentKey? />` (optional drop-in for metrics)

### Server-only configuration (never reaches the browser)

| Concern | Mechanism |
|---|---|
| Cursor API key, webhook URL, webhook token | Per-agent secrets resolved by an `AgentConfigResolver` (default reads `CURSOR_<AGENT>_{API_KEY,WEBHOOK_URL,WEBHOOK_TOKEN}` env vars) |
| Supabase user client (RLS-scoped) | `requireSupabaseAuth` middleware injected by the consumer |
| Supabase admin client (service role) | `getAdminClient` adapter, loaded lazily inside handlers |
| Agent → Cursor-agent-id mapping (optional) | `agents` map in the backend factory; otherwise each thread tracks its own `cursor_agent_id` |
| Billing webhook | `onRunRecorded` callback in the factory |

---

## 4. Database ownership

**Each consuming project owns its own DB.** The kit ships:

- A **migration file** (`migrations/0001_cursor_chat_kit.sql`) the installer
  copies into the project's `supabase/migrations/` folder. The project's
  type-generation picks up the new tables automatically.
- **Pure domain types** (`CursorThread`, `CursorHydratedMessage`,
  `CursorRunUsage`) so the kit never depends on the project's generated
  `Database` type.
- **Adapter interfaces** for the two Supabase clients the kit needs.

### Why adapters instead of "import Supabase directly"

The kit cannot hardcode `@/integrations/supabase/client.server` — that path
only exists in the host project. Dependency-inverting the Supabase clients
gives us:

- Per-project credentials with zero kit changes.
- Test seams (mock admin client in unit tests).
- Future flexibility (a project could swap Supabase for another Postgres
  adapter without rewriting the kit).

### Required code changes (for an adapter-clean kit)

| Module | Today | After Phase 2 |
|---|---|---|
| `cursor.server.ts` | Reads env directly inside every call | Takes `AgentConfig` as a parameter; project wires an `AgentConfigResolver` |
| `usage.server.ts` | `await import("@/integrations/supabase/client.server")` | Receives `getAdminClient` via factory deps |
| `chat.functions.ts` | `.middleware([requireSupabaseAuth])` hard-coded | Factory accepts `withAuth` middleware; consumer supplies the project's middleware |
| `stream.$runId.ts` | Imports admin client and project SSE proxy directly | Re-exports a kit-provided `createStreamRouteHandler({ deps })` |
| React components | Import `@/integrations/supabase/client` for realtime | Receive the browser client via context (`<CursorChatProvider supabase={…}>`) |

### Tables (unchanged)

```
cursor_threads       — one row per conversation, owned by user_id
cursor_messages      — user prompts only (one per cursor_run_id)
cursor_run_usage     — analytics ledger, one row per terminal run
```

RLS on every table scoped to `auth.uid() = user_id`. `cursor_run_usage` is
write-only via service role (the SSE proxy / cancel fn / hydration backfill).

---

## 5. Metrics

Metrics are a **separate sub-module** so projects that only want the chat
don't pay the cost of dashboard components and aggregation queries.

```
@lovable/cursor-chat-kit          → types + chat UI + chat server fns
@lovable/cursor-chat-kit/usage    → server fns + React hook + optional dashboard
```

Three layers:

1. **Server functions** — `getUsageByUser`, `getUsageByAgent`,
   `getUsageBreakdown({ groupBy: 'model' | 'agent' | 'day' })`. Project
   re-exports them; RLS handles auth scoping.
2. **Headless hook** — `useCursorUsage({ from, to, agentName? })` returns
   `{ totalTokens, totalCostMicros, byModel, byAgent, series }`. Brings its
   own state; consumer renders.
3. **Drop-in dashboard** — `<CursorUsageDashboard />` for projects that
   want zero UI work. Uses our design tokens; project can override.
4. **`onRunRecorded` callback** in the backend factory — fire-and-forget
   forwarding to Stripe metered billing, PostHog, custom warehouses.

---

## 6. Layout (current state)

```text
packages/cursor-chat-kit/                ← Phase 1 — DONE
├── package.json                         ← name @lovable/cursor-chat-kit, private
├── README.md
├── migrations/
│   └── 0001_cursor_chat_kit.sql         ← consolidated schema
└── src/
    ├── index.ts                         ← public type re-exports
    ├── types.ts                         ← CursorThread, CursorRunUsage, …
    └── server/
        ├── index.ts
        ├── adapters.ts                  ← interfaces consumers implement
        ├── pricing.ts                   ← pure cost resolver + static table
        ├── cursor-api.ts                ← Cursor REST/SSE client (config injected)
        └── usage.ts                     ← cursor_run_usage upsert (admin injected)

src/lib/cursor/                          ← project shims, unchanged call sites
├── types.ts                             → re-export from kit
├── pricing.server.ts                    → re-export from kit
├── cursor.server.ts                     → wires env resolver + kit client
└── usage.server.ts                      → wires Supabase admin + kit upsert

src/components/cursor-agent-chat/        ← Phase 2 will move into kit/react/
src/lib/cursor/chat.functions.ts         ← Phase 2 (TanStack server fns)
src/routes/api/cursor/stream.$runId.ts   ← Phase 2 (SSE proxy)
```

---

## 7. Phase 2 (after this review)

Each step is independently shippable and keeps the host app green:

1. **`createCursorChatBackend` factory** in
   `packages/cursor-chat-kit/src/server/backend.ts`.
   Inputs: `{ resolveAgentConfig, getAdminClient, withAuth, agents?, onRunRecorded? }`.
   Outputs: `{ functions: { getCursorThread, sendCursorMessage, … }, streamHandler }`.
   Host project's `chat.functions.ts` shrinks to ~10 lines that pass the
   project's Supabase middleware and admin client into the factory.

2. **SSE proxy** moves into the kit as a framework-agnostic
   `createStreamRouteHandler({ deps })`. `src/routes/api/cursor/stream.$runId.ts`
   becomes a 2-line re-export.

3. **React components** move into
   `packages/cursor-chat-kit/src/react/` behind a `<CursorChatProvider>` that
   carries the browser Supabase client, agentKey defaults, and theming.

4. **Browser SSE client** (`cursorStreamClient.ts`) becomes the only piece of
   the kit that needs the *user's* Supabase client; provided via the provider.

5. **Install CLI / Skill** — `npx @lovable/cursor-chat-kit install` (or the
   Lovable Skill) does: `bun add @lovable/cursor-chat-kit`, copy migration,
   scaffold `src/lib/cursor-chat.ts` wiring file, scaffold the SSE route file,
   print required env vars.

6. **Move pricing out of the kit** — fetch from Cursor's usage API per run
   (we already capture it in `cost_source = 'provider'`); kit only retains
   the resolver + `unavailable` fallback. This unblocks public release.

---

## 8. Open questions for the review

1. **Backend boundary.** Factory + Tanstack-specific wrapper today, or build
   a framework-agnostic core (just HTTP handlers) with separate TanStack /
   Express / Next.js adapter packages?
2. **Browser Supabase coupling.** Realtime + cursor stream client need a
   Supabase user client. OK to require Supabase in the React layer, or
   should the kit accept any `{ getAccessToken: () => Promise<string> }`
   adapter and we drop realtime for non-Supabase consumers?
3. **Agent provisioning.** Right now each project must create a Cursor
   agent + webhook out of band and paste secrets into env. Should the kit
   own that flow (admin UI + Cursor API onboarding) or stay infra-only?
4. **Migration ownership.** Ship one consolidated migration (current plan)
   or ship N versioned migrations that the kit's install CLI applies in
   sequence (lets us add columns later without breaking existing consumers)?
5. **Metrics sub-package vs. main.** Worth the extra entry point, or just
   tree-shake from a single entry?
6. **License & visibility.** Stay private under the workspace registry, or
   plan for public from day one with an MIT license and a stricter API
   contract?

---

## 9. Risks

- **Pricing drift.** Static rate table goes stale; provider-cost path is the
  fix but isn't universal yet. Mitigation: ship `cost_source = 'unavailable'`
  honestly and surface it in the dashboard.
- **Tight coupling to TanStack Start.** Mitigated by keeping `server/` pure
  and pushing all framework specifics into thin wrappers in the host project
  (Phase 2 makes this explicit via the factory).
- **Cursor API churn.** All Cursor calls go through `cursor-api.ts` —
  single chokepoint to update.
- **RLS gaps in `cursor_run_usage`.** Currently service-role-only writes; a
  bug that exposes admin client to the browser would be catastrophic. Phase
  2 enforces this by making `getAdminClient` a server-only adapter
  contractually (typed import path, lint rule banning client-side use).

---

## 10. Decision needed

If the lead is comfortable with the layout in §6 and the Phase 2 plan in §7,
we proceed to step 1 (factory) next. If the open questions in §8 push us
toward a framework-agnostic core or a different distribution model, Phase 2
shape changes accordingly.
