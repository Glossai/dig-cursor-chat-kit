CREATE OR REPLACE FUNCTION public.set_cursor_thread_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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

DROP TRIGGER IF EXISTS cursor_threads_set_updated_at ON public.cursor_threads;
CREATE TRIGGER cursor_threads_set_updated_at
BEFORE UPDATE ON public.cursor_threads
FOR EACH ROW EXECUTE FUNCTION public.set_cursor_thread_updated_at();