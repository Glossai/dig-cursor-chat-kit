-- 1. Drop the runs mirror table — Cursor API is the source of truth
DROP TABLE IF EXISTS public.cursor_runs CASCADE;

-- 2. Slim cursor_messages to user prompts only.
--    Wipe legacy assistant rows and any user prompts that were never linked to a Cursor run.
DELETE FROM public.cursor_messages
 WHERE role <> 'user' OR cursor_run_id IS NULL;

-- 3. Drop columns/constraints that no longer apply
ALTER TABLE public.cursor_messages
  DROP CONSTRAINT IF EXISTS cursor_messages_role_check,
  DROP CONSTRAINT IF EXISTS cursor_messages_status_check,
  DROP CONSTRAINT IF EXISTS cursor_messages_agent_name_check;

ALTER TABLE public.cursor_messages
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS error_message,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS agent_name;

-- 4. cursor_run_id is now required and unique (one prompt per Cursor run)
ALTER TABLE public.cursor_messages
  ALTER COLUMN cursor_run_id SET NOT NULL;

ALTER TABLE public.cursor_messages
  ADD CONSTRAINT cursor_messages_cursor_run_id_key UNIQUE (cursor_run_id);