CREATE OR REPLACE FUNCTION public.set_cursor_thread_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at
     AND auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.updated_at = OLD.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cursor_threads_set_updated_at ON public.cursor_threads;
CREATE TRIGGER cursor_threads_set_updated_at
BEFORE UPDATE ON public.cursor_threads
FOR EACH ROW EXECUTE FUNCTION public.set_cursor_thread_updated_at();