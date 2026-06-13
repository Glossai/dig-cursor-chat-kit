# @lovable/cursor-chat-kit

Reusable Cursor background-agent chat for Lovable projects.

**Status: v0.2 release candidate.** The package includes domain types,
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

## Required CSS setup

The package ships its complete default UI, responsive sidebar, markdown and
Shiki code highlighting. Add both lines to the consuming project's main
Tailwind v4 stylesheet after installing the package:

```css
@import "@lovable/cursor-chat-kit/styles.css";
@source "../node_modules/@lovable/cursor-chat-kit/dist";
```

The `@source` line is required because utility classes such as
`animate-pulse`, `bg-amber-400`, `bg-emerald-500`, and `rounded-[28px]` live
inside the installed package rather than the consuming app's source tree.

## React API and customization

The complete reference design is the zero-configuration default. Consumers
can customize copy and targeted surfaces without forking the implementation:

```tsx
<CursorAgentChat
  agentName="support-bot"
  data={thread}
  labels={{ newThread: "New chat", placeholder: "Ask Cursor…" }}
  classNames={{ userMessage: "bg-primary text-primary-foreground", composer: "shadow-lg" }}
  slots={{ header: CustomHeader, emptyState: CustomEmptyState, codeBlock: CustomCodeBlock }}
  features={{ sidebar: true, codeHighlighting: true, homeNavigation: true }}
/>
```

Every customization field is optional. The package includes assistant-ui,
Radix primitives, icons, markdown rendering, Shiki, and styling helpers as
regular dependencies; only React and React DOM are peers.

## Consumer responsibilities

The consuming app always owns its database, authentication, database clients, route navigation,
server-function wrappers, Cursor secrets, and migration application. The kit
receives these through adapters and never imports project-local auth or `@/`
paths. Installing the package never connects to or shares a central database:
each project applies the shipped migration to its own database and all rows
remain protected by that project's authentication and access policies. See
the `cursor-chat-kit` Lovable skill for the installation recipe.
