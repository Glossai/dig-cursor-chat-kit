# @lovable/cursor-chat-kit

Reusable Cursor background-agent chat for Lovable projects.

**Status: v0.1 release candidate.** The package includes domain types,
Cursor API/pricing/usage logic, an auth-agnostic backend factory, an injectable
stream handler, React chat UI, and the database migration.

## Public entry points

```
packages/cursor-chat-kit/
├── package.json
├── migrations/
│   └── 0001_cursor_chat_kit.sql      # consolidated schema
└── src/
    ├── index.ts                      # public type re-exports
    ├── types.ts                      # CursorThread, CursorRunUsage, …
    ├── react/                        # provider + reusable chat surface
    └── server/                       # backend factory, stream handler, API clients
```

- `@lovable/cursor-chat-kit` and `/types` — pure domain types.
- `@lovable/cursor-chat-kit/server` — `createCursorChatBackend`,
  `createCursorStreamHandler`, adapters, Cursor API and usage helpers.
- `@lovable/cursor-chat-kit/react` — `CursorChatProvider` and
  `CursorAgentChat`.

## Consumer responsibilities

The consuming app owns authentication, database clients, route navigation,
server-function wrappers, Cursor secrets, and migration application. The kit
receives these through adapters and never imports project-local auth or `@/`
paths. See the `cursor-chat-kit` Lovable skill for the installation recipe.
