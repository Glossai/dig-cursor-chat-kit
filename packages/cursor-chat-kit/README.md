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

### Per-thread URLs (required)

Every active thread must be identified by the page URL. `navigateToThread`
**MUST use its `threadId` argument**, and the thread loader **MUST read the
active thread from the URL**, not always load the first row. Reloading a thread
URL must restore that same thread.

Use a path-param route for the thread page:

```tsx
// src/routes/_authenticated/chat.$threadId.tsx
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { CursorAgentChat } from "@lovable/cursor-chat-kit/react";
import { getCursorThread } from "@/lib/cursor/chat.functions";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  loader: ({ params }) => getCursorThread({ data: { threadId: params.threadId } }),
  component: ChatPage,
});

function ChatPage() {
  const data = Route.useLoaderData();
  const loading = useRouterState({ select: (state) => state.status === "pending" });
  return <CursorAgentChat agentName="my-agent" data={data} loading={loading} />;
}
```

Redirect the index to the newest existing thread, or create one:

```tsx
// src/routes/_authenticated/chat.index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createCursorThread, listCursorThreads } from "@/lib/cursor/chat.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  beforeLoad: async () => {
    const threads = await listCursorThreads({ data: { agentName: "my-agent" } });
    const thread = threads[0] ?? await createCursorThread({
      data: { agentName: "my-agent", title: "New conversation" },
    });
    throw redirect({ to: "/chat/$threadId", params: { threadId: thread.id } });
  },
});
```

Wire provider navigation to the same route without discarding the ID:

```tsx
const navigate = useNavigate();
const client: CursorChatClient = {
  // ...database and messaging adapters
  navigateToThread: (threadId) =>
    navigate({ to: "/chat/$threadId", params: { threadId } }),
};
```

The `loading` prop replaces only the conversation viewport with the kit's
loading shell while keeping the sidebar and header mounted and interactive.
Do not use a route-level `pendingComponent` for thread changes, because that
replaces the entire chat shell.
