-- @lovable/cursor-chat-kit — initial schema (consolidated from the host
-- project's 4 historical migrations). Copy this file into the consuming
-- project's `supabase/migrations/` folder when installing the kit.
--
-- Tables: cursor_threads, cursor_messages (user prompts only), cursor_run_usage.
-- The legacy `cursor_runs` mirror table has been removed; the Cursor API is
-- the source of truth for run state and `cursor_run_usage` is the local
-- analytics ledger.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- threads -------------------------------------------------------------------
CREATE TABLE public.cursor_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  cursor_agent_id text UNIQUE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  active_run_id text,
  pinned_at timestamptz,
  archived_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursor_threads TO authenticated;
GRANT ALL ON public.cursor_threads TO service_role;
ALTER TABLE public.cursor_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor threads"   ON public.cursor_threads FOR SELECT TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY "Users can create their cursor threads" ON public.cursor_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY "Users can update their cursor threads" ON public.cursor_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE) WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY "Users can delete their cursor threads" ON public.cursor_threads FOR DELETE TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX cursor_threads_user_agent_updated_idx ON public.cursor_threads (user_id, agent_name, updated_at DESC);
CREATE INDEX cursor_threads_user_agent_active_idx ON public.cursor_threads (user_id, agent_name, pinned_at DESC NULLS LAST, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX cursor_threads_user_archived_idx ON public.cursor_threads (user_id, archived_at DESC) WHERE archived_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.set_cursor_thread_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(NEW.agent_name, NEW.cursor_agent_id, NEW.title, NEW.active_run_id, NEW.pinned_at, NEW.archived_at)
     IS DISTINCT FROM
     ROW(OLD.agent_name, OLD.cursor_agent_id, OLD.title, OLD.active_run_id, OLD.pinned_at, OLD.archived_at) THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cursor_threads_set_updated_at BEFORE UPDATE ON public.cursor_threads FOR EACH ROW EXECUTE FUNCTION public.set_cursor_thread_updated_at();

-- user prompts --------------------------------------------------------------
CREATE TABLE public.cursor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.cursor_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 1000000),
  cursor_run_id text NOT NULL UNIQUE,
  retry_of_run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursor_messages TO authenticated;
GRANT ALL ON public.cursor_messages TO service_role;
ALTER TABLE public.cursor_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor messages"   ON public.cursor_messages FOR SELECT TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY "Users can create their cursor messages" ON public.cursor_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.cursor_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
);
CREATE POLICY "Users can update their cursor messages" ON public.cursor_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE) WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE POLICY "Users can delete their cursor messages" ON public.cursor_messages FOR DELETE TO authenticated USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX cursor_messages_thread_created_idx ON public.cursor_messages (thread_id, created_at, id);
CREATE INDEX cursor_messages_retry_of_run_idx ON public.cursor_messages (retry_of_run_id) WHERE retry_of_run_id IS NOT NULL;
CREATE INDEX cursor_messages_content_search_idx ON public.cursor_messages USING gin (to_tsvector('simple', content));

-- usage ledger --------------------------------------------------------------
CREATE TABLE public.cursor_run_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.cursor_threads(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  cursor_agent_id text NOT NULL,
  cursor_run_id text NOT NULL UNIQUE,
  model text,
  status text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS
    (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) STORED,
  total_cost_micros bigint,
  cost_source text NOT NULL DEFAULT 'unavailable',
  duration_ms integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cursor_run_usage TO authenticated;
GRANT ALL    ON public.cursor_run_usage TO service_role;
ALTER TABLE public.cursor_run_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor usage"
  ON public.cursor_run_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX cursor_run_usage_user_created_idx  ON public.cursor_run_usage (user_id, created_at DESC);
CREATE INDEX cursor_run_usage_agent_created_idx ON public.cursor_run_usage (agent_name, created_at DESC);
CREATE INDEX cursor_run_usage_thread_idx        ON public.cursor_run_usage (thread_id);
