ALTER TABLE public.cursor_threads
  ADD COLUMN pinned_at timestamptz,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN last_viewed_at timestamptz;

CREATE INDEX cursor_threads_user_agent_active_idx
  ON public.cursor_threads (user_id, agent_name, pinned_at DESC NULLS LAST, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX cursor_threads_user_archived_idx
  ON public.cursor_threads (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

CREATE INDEX cursor_messages_content_search_idx
  ON public.cursor_messages USING gin (to_tsvector('simple', content));