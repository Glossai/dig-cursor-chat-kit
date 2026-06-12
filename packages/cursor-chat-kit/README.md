# @lovable/cursor-chat-kit

Reusable Cursor background-agent chat for Lovable projects.

**Status: Phase 1 skeleton.** Pure modules have been extracted from
`src/lib/cursor/*`. Adapter-shaped server code, React components, and the
`createCursorChatBackend` factory are still wired in the host project —
see `docs/cursor-chat-kit-architecture.md` for the full plan and Phase 2
extraction steps.

## What's in here today

```
packages/cursor-chat-kit/
├── package.json
├── migrations/
│   └── 0001_cursor_chat_kit.sql      # consolidated schema
└── src/
    ├── index.ts                      # public type re-exports
    ├── types.ts                      # CursorThread, CursorRunUsage, …
    └── server/
        ├── index.ts
        ├── adapters.ts               # interfaces consumers implement
        ├── pricing.ts                # pure cost resolver + static table
        ├── cursor-api.ts             # Cursor REST/SSE client (config injected)
        └── usage.ts                  # cursor_run_usage upsert (admin injected)
```

The host project's `src/lib/cursor/*` files are thin shims that re-export
from this package and inject project-local Supabase clients.

## Not extracted yet (Phase 2)

- `chat.functions.ts` — TanStack `createServerFn` + Supabase auth middleware
- `stream.$runId.ts` — SSE proxy route
- React components (`CursorAgentChat`, `CursorThread`, sidebar, runtime hook)
- Install CLI / Lovable Skill

See `docs/cursor-chat-kit-architecture.md` for the rationale and intended
adapter shape.
