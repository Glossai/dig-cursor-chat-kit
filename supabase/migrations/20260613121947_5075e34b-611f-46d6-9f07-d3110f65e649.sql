ALTER TABLE public.cursor_messages
  ADD COLUMN retry_of_run_id text;

CREATE INDEX cursor_messages_retry_of_run_idx
  ON public.cursor_messages (retry_of_run_id)
  WHERE retry_of_run_id IS NOT NULL;