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

CREATE TABLE public.cursor_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  cursor_agent_id text UNIQUE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursor_threads TO authenticated;
GRANT ALL ON public.cursor_threads TO service_role;
ALTER TABLE public.cursor_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor threads" ON public.cursor_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their cursor threads" ON public.cursor_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their cursor threads" ON public.cursor_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their cursor threads" ON public.cursor_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX cursor_threads_user_agent_updated_idx ON public.cursor_threads (user_id, agent_name, updated_at DESC);
CREATE TRIGGER cursor_threads_set_updated_at BEFORE UPDATE ON public.cursor_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cursor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.cursor_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 1000000),
  cursor_run_id text,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'streaming', 'complete', 'error', 'cancelled')),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursor_messages TO authenticated;
GRANT ALL ON public.cursor_messages TO service_role;
ALTER TABLE public.cursor_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor messages" ON public.cursor_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their cursor messages" ON public.cursor_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.cursor_threads t WHERE t.id = thread_id AND t.user_id = auth.uid() AND t.agent_name = agent_name));
CREATE POLICY "Users can update their cursor messages" ON public.cursor_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their cursor messages" ON public.cursor_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX cursor_messages_thread_created_idx ON public.cursor_messages (thread_id, created_at, id);
CREATE INDEX cursor_messages_agent_created_idx ON public.cursor_messages (agent_name, created_at);
CREATE INDEX cursor_messages_user_agent_created_idx ON public.cursor_messages (user_id, agent_name, created_at);

CREATE TABLE public.cursor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.cursor_threads(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL REFERENCES public.cursor_messages(id) ON DELETE CASCADE,
  assistant_message_id uuid NOT NULL REFERENCES public.cursor_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  cursor_agent_id text NOT NULL,
  cursor_run_id text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('automation_webhook', 'followup')),
  model_id text,
  status text NOT NULL CHECK (status IN ('creating', 'running', 'finished', 'error', 'cancelled', 'expired')),
  last_event_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_tokens bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cache_read_tokens bigint CHECK (cache_read_tokens IS NULL OR cache_read_tokens >= 0),
  cache_write_tokens bigint CHECK (cache_write_tokens IS NULL OR cache_write_tokens >= 0),
  total_tokens bigint CHECK (total_tokens IS NULL OR total_tokens >= 0),
  input_cost_micros bigint CHECK (input_cost_micros IS NULL OR input_cost_micros >= 0),
  output_cost_micros bigint CHECK (output_cost_micros IS NULL OR output_cost_micros >= 0),
  cache_read_cost_micros bigint CHECK (cache_read_cost_micros IS NULL OR cache_read_cost_micros >= 0),
  cache_write_cost_micros bigint CHECK (cache_write_cost_micros IS NULL OR cache_write_cost_micros >= 0),
  total_cost_micros bigint CHECK (total_cost_micros IS NULL OR total_cost_micros >= 0),
  cost_currency text NOT NULL DEFAULT 'USD',
  cost_source text NOT NULL DEFAULT 'unavailable' CHECK (cost_source IN ('provider', 'static_table', 'unavailable')),
  pricing_version text,
  provider_usage jsonb,
  provider_cost jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursor_runs TO authenticated;
GRANT ALL ON public.cursor_runs TO service_role;
ALTER TABLE public.cursor_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their cursor runs" ON public.cursor_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their cursor runs" ON public.cursor_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.cursor_threads t WHERE t.id = thread_id AND t.user_id = auth.uid() AND t.agent_name = agent_name));
CREATE POLICY "Users can update their cursor runs" ON public.cursor_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their cursor runs" ON public.cursor_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX cursor_runs_agent_started_idx ON public.cursor_runs (agent_name, started_at DESC);
CREATE INDEX cursor_runs_user_agent_started_idx ON public.cursor_runs (user_id, agent_name, started_at DESC);
CREATE INDEX cursor_runs_model_started_idx ON public.cursor_runs (model_id, started_at DESC);
CREATE INDEX cursor_runs_thread_started_idx ON public.cursor_runs (thread_id, started_at DESC);
CREATE TRIGGER cursor_runs_set_updated_at BEFORE UPDATE ON public.cursor_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();