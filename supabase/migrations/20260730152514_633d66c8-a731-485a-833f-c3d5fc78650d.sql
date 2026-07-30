ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS semester integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS cards_semester_idx ON public.cards (semester);