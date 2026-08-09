ALTER TABLE public.flashcard_session_state ADD COLUMN IF NOT EXISTS semester integer NOT NULL DEFAULT 0;
ALTER TABLE public.flashcard_session_state DROP CONSTRAINT IF EXISTS flashcard_session_state_pkey;
ALTER TABLE public.flashcard_session_state ADD PRIMARY KEY (user_id, semester);