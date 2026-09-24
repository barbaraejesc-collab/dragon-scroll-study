import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X, RotateCw, Volume2, WifiOff } from "lucide-react";
import { playCorrect, playWrong } from "@/lib/sounds";
import { speakZh, prefetchSession } from "@/lib/tts";
import {
  isOnline,
  loadOfflineSession,
  queueProgress,
  restorePendingProgress,
  saveOfflineIndex,
  saveOfflineSession,
  takePendingProgress,
} from "@/lib/offline";


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


// Fonte única, igual à do livro didático (serifada padrão de impressão).
const BOOK_FONT = { name: "Noto Serif SC", family: "'Noto Serif SC', serif" };

function pickRandomFont(_excludeName?: string) {
  return BOOK_FONT;
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
  const scoreRef = useRef({ correct: 0, wrong: 0 });
  const [offline, setOffline] = useState(false);




  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load cards + progress + saved session position
  useEffect(() => {
    if (!user) return;
    setLoaded(false);
    scoreRef.current = { correct: 0, wrong: 0 };
    setScore({ correct: 0, wrong: 0 });
    const semKey = sem ?? 0;
    const scope = `fc:${semKey}${errorsMode ? ":errors" : ""}`;
    (async () => {
      let cardsData: Card[] | null = null;
      let progressData: { card_id: string; correct_count: number; wrong_count: number }[] = [];
      type SessionState = { queue: string[]; current_index: number; session_correct?: number; session_wrong?: number };
      let stateData: SessionState | null = null;
      let failed = !isOnline();

      if (!failed) {
        try {
          const [c, pr, st] = await Promise.all([
            supabase.from("cards").select("*"),
            supabase.from("card_progress").select("card_id,correct_count,wrong_count").eq("user_id", user.id),
            supabase
              .from("flashcard_session_state")
              .select("queue,current_index,session_correct,session_wrong")
              .eq("user_id", user.id)
              .eq("semester", semKey)
              .maybeSingle(),
          ]);
          if (c.error) throw c.error;
          cardsData = (c.data ?? []) as Card[];
          progressData = pr.data ?? [];
          stateData = (st.data ?? null) as SessionState | null;
        } catch {
          failed = true;
        }
      }

      if (failed) {
        // Sem conexão: retoma a sessão guardada no aparelho.
        const cached = loadOfflineSession(scope);
        setOffline(true);
        if (cached) {
          setCards(cached.cards as Card[]);
          setQueue(cached.queue);
          setIdx(Math.min(cached.index, cached.queue.length));
          setLoaded(true);
          return;
        }
        setCards([]);
        setQueue([]);
        setLoaded(true);
        return;
      }
      setOffline(false);
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
        const savedIdx = Math.min(stateData?.current_index ?? 0, savedQueue.length);

        if (savedQueue.length === c.length && savedQueue.length > 0) {
          setQueue(savedQueue);
          setIdx(savedIdx > 0 ? savedIdx : 0);

          // Restaura o score salvo da rodada atual (limitado ao nº de cards respondidos).
          if (savedIdx > 0) {
            const sc = Math.max(0, stateData?.session_correct ?? 0);
            const sw = Math.max(0, stateData?.session_wrong ?? 0);
            const restored = sc + sw <= savedIdx ? { correct: sc, wrong: sw } : { correct: 0, wrong: 0 };
            scoreRef.current = restored;
            setScore(restored);
          }
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

  // Segurança: se o card da posição atual não existir mais, avança em vez de ficar em branco.
  useEffect(() => {
    if (!loaded || !queue.length) return;
    if (idx < queue.length && !cards.some((c) => c.id === queue[idx])) setIdx((i) => i + 1);
  }, [loaded, cards, queue, idx]);


  const persistIndex = useCallback(
    async (newIdx: number) => {
      if (!user || errorsMode) return;
      saveOfflineIndex(`fc:${sem ?? 0}`, newIdx);
      if (!isOnline()) return;
      await supabase.from("flashcard_session_state").upsert(
        {
          user_id: user.id, semester: sem ?? 0, queue, current_index: newIdx,
          session_correct: scoreRef.current.correct, session_wrong: scoreRef.current.wrong,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,semester" }
      );
    },
    [user, queue, errorsMode, sem]
  );


  const answer = useCallback(async (correct: boolean) => {
    if (!current || !user) return;
    if (correct) playCorrect(); else playWrong();
    scoreRef.current = {
      correct: scoreRef.current.correct + (correct ? 1 : 0),
      wrong: scoreRef.current.wrong + (correct ? 0 : 1),
    };
    setScore(scoreRef.current);
    const prev = progress[current.id] ?? { correct: 0, wrong: 0 };
    const next = {
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
    };
    setProgress((p) => ({ ...p, [current.id]: next }));

    const row = {
      user_id: user.id,
      card_id: current.id,
      correct_count: next.correct,
      wrong_count: next.wrong,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!isOnline()) {
      queueProgress(row);
    } else {
      const { error: upsertErr } = await supabase
        .from("card_progress")
        .upsert(row, { onConflict: "user_id,card_id" });
      if (upsertErr) {
        console.error("[flashcards] falha ao salvar pontuação:", upsertErr);
        queueProgress(row);
      }
    }

    const nextIdx = idx + 1;
    setFlipped(false);
    setTimeout(() => setIdx(nextIdx), 250);
    persistIndex(nextIdx);
  }, [current, user, progress, idx, persistIndex]);

  // Auto-speak when card is flipped
  useEffect(() => {
    if (flipped && current?.hanzi) speakHanzi(current.hanzi);
  }, [flipped, current?.hanzi]);

  // Warm the whole session's audio in the background (atual → próximos 5 → resto)
  // so o áudio continua funcionando com sinal fraco.
  useEffect(() => {
    if (!queue.length || !cards.length) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const texts = queue.map((id) => byId.get(id)?.hanzi ?? "").filter(Boolean);
    return prefetchSession(texts, idx);
  }, [queue, cards]);

  // Cache the session locally for offline study.
  useEffect(() => {
    if (!loaded || !queue.length || !cards.length) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const sessionCards = queue.map((id) => byId.get(id)).filter(Boolean) as Card[];
    saveOfflineSession(`fc:${sem ?? 0}${errorsMode ? ":errors" : ""}`, sessionCards, queue, idx);
  }, [loaded, queue, cards, sem, errorsMode]);

  // Flush progress saved while offline as soon as the connection returns.
  useEffect(() => {
    const sync = async () => {
      if (!user || !isOnline()) return;
      setOffline(false);
      const pending = takePendingProgress();
      if (!pending.length) return;
      const { error } = await supabase
        .from("card_progress")
        .upsert(pending, { onConflict: "user_id,card_id" });
      if (error) restorePendingProgress(pending);
    };
    void sync();
    const onOffline = () => setOffline(true);
    window.addEventListener("online", sync);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", onOffline);
    };
  }, [user]);


  const restart = useCallback(async () => {
    setHanziFont((prev) => pickRandomFont(prev.name));
    if (errorsMode) {
      navigate({ to: "/flashcards", search: { mode: undefined, sem } });
      return;
    }
    const fresh = buildSession(cards);
    setQueue(fresh);
    setIdx(0);
    scoreRef.current = { correct: 0, wrong: 0 };
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
            <Link to="/flashcards" search={{ mode: undefined, sem: undefined }}>Estudar todos os semestres</Link>
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
        <Button asChild><Link to="/flashcards" search={{ mode: undefined, sem }}>Sessão normal</Link></Button>
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

      {offline && (
        <div className="flex items-center gap-2 mb-4 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
          <WifiOff className="w-3.5 h-3.5" />
          Sem conexão — estudando offline. Seu progresso será sincronizado depois.
        </div>
      )}

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
          <div className="flip-face bg-gradient-to-br from-card to-secondary border border-border rounded-3xl shadow-[var(--shadow-elegant)] flex flex-col relative overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              <span
                className="text-[20vw] md:text-[160px] leading-none text-cream drop-shadow-[0_0_40px_rgba(255,215,0,0.1)] break-all text-center"
                style={{ fontFamily: hanziFont.family }}
              >
                {card.hanzi}
              </span>
            </div>
            <div className="p-5 text-center text-xs text-muted-foreground italic">toque para virar</div>
          </div>
          {/* Verso */}
          <div className="flip-face flip-back bg-gradient-to-br from-primary/90 to-primary/60 border border-accent/30 rounded-3xl shadow-[var(--shadow-gold)] flex flex-col overflow-hidden">
            <div className="flex items-start justify-end p-3 shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); speakHanzi(card.hanzi); }}
                aria-label="Ouvir pronúncia"
                className="p-2 rounded-full bg-background/20 hover:bg-background/40 text-cream transition-colors"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 text-center flex flex-col items-center justify-center gap-3">
              <div className="text-accent text-xl md:text-3xl font-serif italic break-words max-w-full">{card.pinyin}</div>
              <div className="text-cream text-base md:text-2xl font-serif leading-snug break-words max-w-full">
                {card.meaning}
              </div>
              <div
                className="text-4xl md:text-5xl text-accent/30 leading-none break-all"
                style={{ fontFamily: hanziFont.family }}
              >
                {card.hanzi}
              </div>
            </div>
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
