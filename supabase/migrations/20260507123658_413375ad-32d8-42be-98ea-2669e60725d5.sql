
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CARDS (vocabulário compartilhado, leitura pública para autenticados)
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  meaning TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards readable by authenticated" ON public.cards FOR SELECT TO authenticated USING (true);

-- CARD PROGRESS por usuário
CREATE TABLE public.card_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_id)
);
ALTER TABLE public.card_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress select own" ON public.card_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "progress insert own" ON public.card_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "progress update own" ON public.card_progress FOR UPDATE USING (auth.uid() = user_id);

-- STUDY SESSIONS (um registro por dia por usuário, para streak)
CREATE TABLE public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, study_date)
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions select own" ON public.study_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions insert own" ON public.study_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
