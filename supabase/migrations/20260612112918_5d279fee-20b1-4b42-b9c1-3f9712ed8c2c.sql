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
GRANT ALL ON public.cursor_run_usage TO service_role;

ALTER TABLE public.cursor_run_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their cursor usage"
  ON public.cursor_run_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX cursor_run_usage_user_created_idx
  ON public.cursor_run_usage (user_id, created_at DESC);
CREATE INDEX cursor_run_usage_agent_created_idx
  ON public.cursor_run_usage (agent_name, created_at DESC);
CREATE INDEX cursor_run_usage_thread_idx
  ON public.cursor_run_usage (thread_id);