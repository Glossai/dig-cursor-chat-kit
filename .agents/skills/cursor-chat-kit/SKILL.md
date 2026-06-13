---
name: cursor-chat-kit
description: Install and verify the self-contained Cursor background-agent chat kit in a TanStack Start project with a project-owned database.
---

# Cursor chat kit installer

Use this skill when adding `@lovable/cursor-chat-kit` to a Lovable TanStack
Start project.

## Invariants

- Each consuming project owns its database, authentication, migrations,
  database clients, Cursor secrets, and server wrappers. Never connect a
  consumer to a shared kit database.
- Keep the kit auth-agnostic. Identity comes from the host's verified
  `resolveAuth`; never accept `userId` from browser input.
- Keep server-only credentials and admin clients out of browser modules.
- The package's current design and behavior are defaults. Use `labels`,
  `classNames`, `slots`, and `features` for customization instead of forking.

## Install

1. Confirm TanStack Start, Lovable Cloud, and global `attachSupabaseAuth`.
2. Collect all three per-agent secrets before scaffolding:
   `CURSOR_<AGENT>_API_KEY`, `CURSOR_<AGENT>_WEBHOOK_URL`, and
   `CURSOR_<AGENT>_WEBHOOK_TOKEN`.
3. Add `@lovable/cursor-chat-kit`.
4. Apply `migrations/0001_cursor_chat_kit.sql` to the consuming project's own
   database through the migration tool. Confirm grants and RLS on every table.
5. Scaffold authenticated server functions that create a request-scoped
   `createCursorChatBackend` with `resolveAuth`, `resolveAgentConfig`, and a
   lazily imported project admin client.
6. Scaffold the authenticated `/api/cursor/stream.$runId` proxy.
7. Import the package styling in the app's main Tailwind v4 stylesheet:

   ```css
   @import "@lovable/cursor-chat-kit/styles.css";
   @source "../node_modules/@lovable/cursor-chat-kit/dist";
   ```

8. Mount `CursorChatProvider` and `CursorAgentChat` with a URL-derived active
   thread. `navigateToThread` MUST use its `threadId` argument, the loader MUST
   read that ID from the URL rather than always selecting the first row, and
   reloading the URL MUST restore the same thread. Use this path-param pattern:

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

   ```tsx
   const navigate = useNavigate();
   const client: CursorChatClient = {
     // ...database and messaging adapters
     navigateToThread: (threadId) =>
       navigate({ to: "/chat/$threadId", params: { threadId } }),
   };
   ```

   Drive the kit's `loading` prop from router pending state so only the
   conversation viewport shows loading while the sidebar and header remain
   mounted. Do not add a route-level pending component for thread changes.

## Verify

- Create two threads, send a message in each, switch, and reload each URL.
- Throttle the thread loader, click another thread, and confirm the URL and
  conversation loading shell update immediately while the sidebar and header
  remain unchanged and interactive.
- Open thread A, send a message, and switch to thread B mid-run. Confirm both
  threads' state is preserved, switching is instant, and reloading either URL
  restores that thread.
- Confirm optimistic user text and the thinking indicator appear before
  streamed assistant text.
- Confirm markdown code blocks use syntax highlighting and copy works.
- Confirm a fenced `mermaid` block renders as a diagram and malformed Mermaid
  falls back to readable source without breaking the message.
- Confirm the sidebar collapses on desktop, opens as a sheet on mobile, and
  its collapse preference/keyboard shortcut work.
- Confirm stop/cancel, delete, new thread, status dots, and Open in Cursor.
- Confirm a usage row is written only to the consuming project's database and
  cross-user access is blocked.
- Confirm no package module imports a project-local `@/` path.