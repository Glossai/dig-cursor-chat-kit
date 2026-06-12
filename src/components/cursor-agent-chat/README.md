# CursorAgentChat

Reusable assistant-ui chat for Cursor Cloud Agents.

```tsx
<CursorAgentChat agentName="demo-agent" thread={thread} messages={messages} />
```

The consuming app must provide the three Cloud secrets derived from the normalized agent name: `CURSOR_<AGENT>_WEBHOOK_URL`, `CURSOR_<AGENT>_WEBHOOK_TOKEN`, and `CURSOR_<AGENT>_API_KEY`. The initial prompt uses the automation webhook; follow-ups reuse the thread's `cursor_agent_id` through Cursor API v1. Copy this folder with `src/lib/cursor`, the API stream route, and the three database tables.