CREATE TABLE public.curiosidades_favoritas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  hanzi text,
  pinyin text,
  significado text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.curiosidades_favoritas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curiosidades select own" ON public.curiosidades_favoritas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "curiosidades insert own" ON public.curiosidades_favoritas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "curiosidades delete own" ON public.curiosidades_favoritas
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_curiosidades_user ON public.curiosidades_favoritas(user_id, created_at DESC);