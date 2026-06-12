-- 1. Fix tautological INSERT policy on cursor_messages.
--    The `agent_name` column was removed from cursor_messages in an earlier
--    migration, leaving `t.agent_name = t.agent_name` as a no-op condition.
DROP POLICY IF EXISTS "Users can create their cursor messages" ON public.cursor_messages;
CREATE POLICY "Users can create their cursor messages"
  ON public.cursor_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.cursor_threads t
      WHERE t.id = cursor_messages.thread_id
        AND t.user_id = auth.uid()
    )
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- 2. Harden cursor_threads policies: explicitly deny anonymous Supabase users.
DROP POLICY IF EXISTS "Users can view their cursor threads"   ON public.cursor_threads;
DROP POLICY IF EXISTS "Users can create their cursor threads" ON public.cursor_threads;
DROP POLICY IF EXISTS "Users can update their cursor threads" ON public.cursor_threads;
DROP POLICY IF EXISTS "Users can delete their cursor threads" ON public.cursor_threads;

CREATE POLICY "Users can view their cursor threads"
  ON public.cursor_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can create their cursor threads"
  ON public.cursor_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can update their cursor threads"
  ON public.cursor_threads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can delete their cursor threads"
  ON public.cursor_threads FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

-- 3. Harden the remaining cursor_messages policies (SELECT/UPDATE/DELETE).
DROP POLICY IF EXISTS "Users can view their cursor messages"   ON public.cursor_messages;
DROP POLICY IF EXISTS "Users can update their cursor messages" ON public.cursor_messages;
DROP POLICY IF EXISTS "Users can delete their cursor messages" ON public.cursor_messages;

CREATE POLICY "Users can view their cursor messages"
  ON public.cursor_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can update their cursor messages"
  ON public.cursor_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can delete their cursor messages"
  ON public.cursor_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

-- 4. Harden cursor_run_usage SELECT policy.
DROP POLICY IF EXISTS "Users can view their cursor usage" ON public.cursor_run_usage;
CREATE POLICY "Users can view their cursor usage"
  ON public.cursor_run_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
