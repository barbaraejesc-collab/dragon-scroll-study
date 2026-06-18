CREATE POLICY "sessions update own" ON public.study_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions delete own" ON public.study_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);