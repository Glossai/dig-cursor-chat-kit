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

8. Mount `CursorChatProvider` and `CursorAgentChat` with the route-derived
   hydrated thread. Keep dedicated thread URLs and host-owned navigation.

## Verify

- Create two threads, send a message in each, switch, and reload each URL.
- Confirm optimistic user text and the thinking indicator appear before
  streamed assistant text.
- Confirm markdown code blocks use syntax highlighting and copy works.
- Confirm the sidebar collapses on desktop, opens as a sheet on mobile, and
  its collapse preference/keyboard shortcut work.
- Confirm stop/cancel, delete, new thread, status dots, and Open in Cursor.
- Confirm a usage row is written only to the consuming project's database and
  cross-user access is blocked.
- Confirm no package module imports a project-local `@/` path.