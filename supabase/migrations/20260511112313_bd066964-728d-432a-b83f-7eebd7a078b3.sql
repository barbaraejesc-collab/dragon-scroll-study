CREATE TABLE public.flashcard_session_state (
  user_id uuid PRIMARY KEY,
  queue uuid[] NOT NULL DEFAULT '{}',
  current_index integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flashcard_session_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_state select own" ON public.flashcard_session_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_state insert own" ON public.flashcard_session_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "session_state update own" ON public.flashcard_session_state
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "session_state delete own" ON public.flashcard_session_state
  FOR DELETE USING (auth.uid() = user_id);