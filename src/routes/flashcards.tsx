import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X, RotateCw, Volume2 } from "lucide-react";
import { playCorrect, playWrong } from "@/lib/sounds";
import { speakZh, preloadZh } from "@/lib/tts";


export const Route = createFileRoute("/flashcards")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: s.mode === "errors" ? ("errors" as const) : undefined,
    sem: s.sem !== undefined && s.sem !== null && !Number.isNaN(Number(s.sem))
      ? Number(s.sem)
      : undefined,
  }),
  component: FlashcardsPage,
});

type Card = { id: string; hanzi: string; pinyin: string; meaning: string; category: string; semester: number };
type Progress = Record<string, { correct: number; wrong: number }>;


// Pool of distinct Chinese fonts (loaded in __root.tsx). Each session picks one.
const HANZI_FONTS = [
  { name: "Noto Serif SC", family: "'Noto Serif SC', serif" },
  { name: "Noto Sans SC", family: "'Noto Sans SC', sans-serif" },
  { name: "Ma Shan Zheng", family: "'Ma Shan Zheng', cursive" },
  { name: "ZCOOL XiaoWei", family: "'ZCOOL XiaoWei', serif" },
  { name: "ZCOOL QingKe HuangYou", family: "'ZCOOL QingKe HuangYou', sans-serif" },
  { name: "Liu Jian Mao Cao", family: "'Liu Jian Mao Cao', cursive" },
  { name: "Long Cang", family: "'Long Cang', cursive" },
  { name: "Zhi Mang Xing", family: "'Zhi Mang Xing', cursive" },
];

function pickRandomFont(excludeName?: string) {
  const pool = excludeName ? HANZI_FONTS.filter((f) => f.name !== excludeName) : HANZI_FONTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function speakHanzi(text: string) {
  void speakZh(text);
}

function FlashcardsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { mode, sem } = Route.useSearch();
  const errorsMode = mode === "errors";
  const [cards, setCards] = useState<Card[]>([]);
  const [semesters, setSemesters] = useState<number[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hanziFont, setHanziFont] = useState(() => pickRandomFont());
  const [score, setScore] = useState({ correct: 0, wrong: 0 });




  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load cards + progress + saved session position
  useEffect(() => {
    if (!user) return;
    setLoaded(false);
    setScore({ correct: 0, wrong: 0 });
    const semKey = sem ?? 0;
    (async () => {
      const [{ data: cardsData }, { data: progressData }, { data: stateData }] = await Promise.all([
        supabase.from("cards").select("*"),
        supabase.from("card_progress").select("card_id,correct_count,wrong_count").eq("user_id", user.id),
        supabase
          .from("flashcard_session_state")
          .select("queue,current_index")
          .eq("user_id", user.id)
          .eq("semester", semKey)
          .maybeSingle(),
      ]);
      const all = (cardsData ?? []) as Card[];
      setSemesters(Array.from(new Set(all.map((x) => x.semester ?? 1))).sort((a, b) => a - b));
      const c = sem ? all.filter((x) => (x.semester ?? 1) === sem) : all;
      const p: Progress = {};
      (progressData ?? []).forEach((row) => {
        p[row.card_id] = { correct: row.correct_count, wrong: row.wrong_count };
      });
      setCards(c);
      setProgress(p);

      if (errorsMode) {
        // Build session from cards with most wrongs (top 20, min 1 wrong)
        const ranked = c
          .map((card) => ({ card, wrong: p[card.id]?.wrong ?? 0 }))
          .filter((x) => x.wrong > 0)
          .sort((a, b) => b.wrong - a.wrong)
          .slice(0, 20)
          .map((x) => x.card.id);
        // Shuffle for variety
        for (let i = ranked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
        }
        setQueue(ranked);
        setIdx(0);
      } else {
        const cardIds = new Set(c.map((x) => x.id));
        const savedQueue = (stateData?.queue ?? []).filter((id: string) => cardIds.has(id));
        const savedIdx = stateData?.current_index ?? 0;

        if (savedQueue.length === c.length && savedQueue.length > 0) {
          setQueue(savedQueue);
          setIdx(Math.min(savedIdx, savedQueue.length));
        } else {
          const fresh = buildSession(c);
          setQueue(fresh);
          setIdx(0);
          await supabase.from("flashcard_session_state").upsert(
            { user_id: user.id, semester: semKey, queue: fresh, current_index: 0, updated_at: new Date().toISOString() },
            { onConflict: "user_id,semester" }
          );
        }
      }

      setLoaded(true);
      const today = new Date().toISOString().slice(0, 10);
      supabase.from("study_sessions").insert({ user_id: user.id, study_date: today }).then(() => {});
    })();
  }, [user, errorsMode, sem]);


  const current = useMemo(() => cards.find((c) => c.id === queue[idx]) ?? null, [cards, queue, idx]);
  const total = queue.length;
  const done = idx;

  const persistIndex = useCallback(
    async (newIdx: number) => {
      if (!user || errorsMode) return;
      await supabase.from("flashcard_session_state").upsert(
        { user_id: user.id, semester: sem ?? 0, queue, current_index: newIdx, updated_at: new Date().toISOString() },
        { onConflict: "user_id,semester" }
      );
    },
    [user, queue, errorsMode, sem]
  );


  const answer = useCallback(async (correct: boolean) => {
    if (!current || !user) return;
    if (correct) playCorrect(); else playWrong();
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    const prev = progress[current.id] ?? { correct: 0, wrong: 0 };
    const next = {
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
    };
    setProgress((p) => ({ ...p, [current.id]: next }));

    const { error: upsertErr } = await supabase.from("card_progress").upsert(
      {
        user_id: user.id,
        card_id: current.id,
        correct_count: next.correct,
        wrong_count: next.wrong,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,card_id" }
    );
    if (upsertErr) console.error("[flashcards] falha ao salvar pontuação:", upsertErr);

    const nextIdx = idx + 1;
    setFlipped(false);
    setTimeout(() => setIdx(nextIdx), 250);
    persistIndex(nextIdx);
  }, [current, user, progress, idx, persistIndex]);

  // Auto-speak when card is flipped
  useEffect(() => {
    if (flipped && current?.hanzi) speakHanzi(current.hanzi);
  }, [flipped, current?.hanzi]);

  // Preload audio for the next few cards so flipping is instant
  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      const id = queue[idx + i];
      const c = id ? cards.find((x) => x.id === id) : null;
      if (c?.hanzi) preloadZh(c.hanzi);
    }
  }, [idx, queue, cards]);


  const restart = useCallback(async () => {
    setHanziFont((prev) => pickRandomFont(prev.name));
    if (errorsMode) {
      navigate({ to: "/flashcards", search: { sem } });
      return;
    }
    const fresh = buildSession(cards);
    setQueue(fresh);
    setIdx(0);
    setScore({ correct: 0, wrong: 0 });
    setFlipped(false);
    if (user) {
      await supabase.from("flashcard_session_state").upsert(
        { user_id: user.id, semester: sem ?? 0, queue: fresh, current_index: 0, updated_at: new Date().toISOString() },
        { onConflict: "user_id,semester" }
      );
    }
  }, [errorsMode, cards, user, navigate, sem]);


  // Keyboard shortcuts: Space=flip, ←=errei, →=acertei
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!current) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === "ArrowLeft") {
        e.preventDefault();
        answer(false);
      } else if (flipped && e.key === "ArrowRight") {
        e.preventDefault();
        answer(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, current, answer]);

  if (!user) return null;

  if (loaded && cards.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center space-y-4">
        <p className="text-muted-foreground">
          {sem ? `Nenhum ideograma cadastrado no ${sem}º semestre ainda.` : "Nenhum card disponível."}
        </p>
        {sem && (
          <Button asChild variant="outline">
            <Link to="/flashcards" search={{}}>Estudar todos os semestres</Link>
          </Button>
        )}
      </main>
    );
  }

  if (loaded && errorsMode && total === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center space-y-4">
        <div className="hanzi text-7xl text-accent">好</div>
        <h2 className="text-2xl font-serif">Nenhum erro registrado ainda!</h2>
        <p className="text-muted-foreground text-sm">Continue estudando para construir seu histórico.</p>
        <Button asChild><Link to="/flashcards" search={{ sem }}>Sessão normal</Link></Button>
      </main>
    );
  }

  const finished = loaded && idx >= total;

  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        {errorsMode && (
          <span className="text-xs uppercase tracking-widest text-accent font-serif">Revisão de erros</span>
        )}
        <Button variant="ghost" size="sm" onClick={restart} className="text-accent">
          <RotateCw className="w-4 h-4 mr-1" /> Recomeçar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-serif mr-1">
          Semestre
        </span>
        <Link
          to="/flashcards"
          search={{ mode, sem: undefined }}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !sem ? "bg-accent text-background border-accent" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos
        </Link>
        {semesters.map((s) => (
          <Link
            key={s}
            to="/flashcards"
            search={{ mode, sem: s }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sem === s ? "bg-accent text-background border-accent" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}º
          </Link>
        ))}
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-2 font-serif">
          <span>Sessão</span>
          <span className="flex items-center gap-3">
            <span className="text-success">✓ {score.correct}</span>
            <span className="text-destructive">✕ {score.wrong}</span>
            <span>{Math.min(done, total)} / {total}</span>
          </span>
        </div>
        <Progress value={total ? (done / total) * 100 : 0} className="h-1.5" />
      </div>


      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="hanzi text-6xl text-accent/40 shimmer-gold">学</div>
        </div>
      ) : finished ? (
        <FinishedView total={total} score={score} onRestart={restart} />

      ) : current ? (
        <FlashcardView card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onAnswer={answer} hanziFont={hanziFont} />
      ) : null}

      <p className="text-[10px] text-center text-muted-foreground/60 mt-4 hidden md:block">
        Atalhos: Espaço = virar · ← = errei · → = acertei
      </p>
    </main>
  );
}

function FlashcardView({
  card, flipped, onFlip, onAnswer, hanziFont,
}: {
  card: Card; flipped: boolean; onFlip: () => void; onAnswer: (c: boolean) => void;
  hanziFont: { name: string; family: string };
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className={`flip-card flex-1 min-h-[380px] cursor-pointer ${flipped ? "flipped" : ""}`}
        onClick={() => !flipped && onFlip()}
      >
        <div className="flip-card-inner">
          {/* Frente */}
          <div className="flip-face bg-gradient-to-br from-card to-secondary border border-border rounded-3xl shadow-[var(--shadow-elegant)] flex flex-col relative">
            <span className="absolute top-3 left-4 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-serif">
              {hanziFont.name}
            </span>
            <div className="flex-1 flex items-center justify-center p-6">
              <span
                className="text-[22vw] md:text-[180px] leading-none text-cream drop-shadow-[0_0_40px_rgba(255,215,0,0.1)]"
                style={{ fontFamily: hanziFont.family }}
              >
                {card.hanzi}
              </span>
            </div>
            <div className="p-5 text-center text-xs text-muted-foreground italic">toque para virar</div>
          </div>
          {/* Verso */}
          <div className="flip-face flip-back bg-gradient-to-br from-primary/90 to-primary/60 border border-accent/30 rounded-3xl shadow-[var(--shadow-gold)] flex flex-col items-center justify-center p-8 text-center relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); speakHanzi(card.hanzi); }}
              aria-label="Ouvir pronúncia"
              className="absolute top-4 right-4 p-2 rounded-full bg-background/20 hover:bg-background/40 text-cream transition-colors"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <div className="text-accent text-2xl md:text-3xl mb-3 font-serif italic">{card.pinyin}</div>
            <div className="text-cream text-2xl md:text-3xl font-serif">{card.meaning}</div>
            <div className="hanzi text-5xl text-accent/30 mt-6">{card.hanzi}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button
          size="lg"
          variant="outline"
          disabled={!flipped}
          onClick={() => onAnswer(false)}
          className="h-16 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
        >
          <X className="w-5 h-5 mr-2" /> Errei
        </Button>
        <Button
          size="lg"
          disabled={!flipped}
          onClick={() => onAnswer(true)}
          className="h-16 bg-gradient-to-r from-success/80 to-success hover:opacity-90 text-background disabled:opacity-30"
        >
          <Check className="w-5 h-5 mr-2" /> Acertei
        </Button>
      </div>
    </div>
  );
}

function FinishedView({
  total, score, onRestart,
}: {
  total: number; score: { correct: number; wrong: number }; onRestart: () => void;
}) {
  const answered = score.correct + score.wrong;
  const pct = answered > 0 ? Math.round((score.correct / answered) * 100) : null;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-12">
      <div className="hanzi text-8xl text-accent shimmer-gold">完</div>
      <h2 className="text-3xl font-serif">Sessão completa!</h2>
      <p className="text-muted-foreground">Você revisou {total} cards. 加油!</p>
      <div className="flex items-center gap-6 font-serif">
        <div>
          <div className="text-3xl text-success">{score.correct}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Acertos</div>
        </div>
        <div>
          <div className="text-3xl text-destructive">{score.wrong}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Erros</div>
        </div>
        <div>
          <div className="text-3xl text-accent">{pct === null ? "--" : `${pct}%`}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aproveitamento</div>
        </div>
      </div>
      <Button onClick={onRestart} size="lg" className="bg-gradient-to-r from-primary to-primary/80">
        <RotateCw className="w-4 h-4 mr-2" /> Nova sessão
      </Button>
    </div>
  );
}


function buildSession(cards: Card[]): string[] {
  const ids = cards.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
