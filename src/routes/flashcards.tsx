import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X, RotateCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/flashcards")({
  component: FlashcardsPage,
});

type Card = { id: string; hanzi: string; pinyin: string; meaning: string; category: string };
type Progress = Record<string, { correct: number; wrong: number }>;

function FlashcardsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [queue, setQueue] = useState<string[]>([]); // card ids in study order
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load cards + progress
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: cardsData }, { data: progressData }] = await Promise.all([
        supabase.from("cards").select("*"),
        supabase.from("card_progress").select("card_id,correct_count,wrong_count").eq("user_id", user.id),
      ]);
      const c = cardsData ?? [];
      const p: Progress = {};
      (progressData ?? []).forEach((row) => {
        p[row.card_id] = { correct: row.correct_count, wrong: row.wrong_count };
      });
      setCards(c);
      setProgress(p);
      setQueue(buildSession(c, p));
      setLoaded(true);
      // log study session for streak (one per day)
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("study_sessions").insert({ user_id: user.id, study_date: today }).then(() => {});
    })();
  }, [user]);

  const current = useMemo(() => cards.find((c) => c.id === queue[idx]) ?? null, [cards, queue, idx]);
  const total = queue.length;
  const done = idx;

  async function answer(correct: boolean) {
    if (!current || !user) return;
    const prev = progress[current.id] ?? { correct: 0, wrong: 0 };
    const next = {
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
    };
    setProgress((p) => ({ ...p, [current.id]: next }));

    // Upsert
    await supabase.from("card_progress").upsert(
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

    setFlipped(false);
    setTimeout(() => setIdx((i) => i + 1), 250);
  }

  function restart() {
    setProgress((cur) => {
      setQueue(buildSession(cards, cur));
      return cur;
    });
    setIdx(0);
    setFlipped(false);
  }

  if (!user) return null;

  if (loaded && cards.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted-foreground">Nenhum card disponível.</p>
      </main>
    );
  }

  const finished = loaded && idx >= total;

  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={restart} className="text-accent">
          <RotateCw className="w-4 h-4 mr-1" /> Recomeçar
        </Button>
      </header>

      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-2 font-serif">
          <span>Sessão</span>
          <span>{Math.min(done, total)} / {total}</span>
        </div>
        <Progress value={total ? (done / total) * 100 : 0} className="h-1.5" />
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="hanzi text-6xl text-accent/40 shimmer-gold">学</div>
        </div>
      ) : finished ? (
        <FinishedView total={total} onRestart={restart} />
      ) : current ? (
        <FlashcardView card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onAnswer={answer} />
      ) : null}
    </main>
  );
}

function FlashcardView({
  card, flipped, onFlip, onAnswer,
}: {
  card: Card; flipped: boolean; onFlip: () => void; onAnswer: (c: boolean) => void;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className={`flip-card flex-1 min-h-[380px] cursor-pointer ${flipped ? "flipped" : ""}`}
        onClick={() => !flipped && onFlip()}
      >
        <div className="flip-card-inner">
          {/* Frente */}
          <div className="flip-face bg-gradient-to-br from-card to-secondary border border-border rounded-3xl shadow-[var(--shadow-elegant)] flex flex-col">
            <div className="p-5 text-xs uppercase tracking-widest text-accent/70">{card.category}</div>
            <div className="flex-1 flex items-center justify-center p-6">
              <span className="hanzi text-[22vw] md:text-[180px] leading-none text-cream drop-shadow-[0_0_40px_rgba(255,215,0,0.1)]">
                {card.hanzi}
              </span>
            </div>
            <div className="p-5 text-center text-xs text-muted-foreground italic">toque para virar</div>
          </div>
          {/* Verso */}
          <div className="flip-face flip-back bg-gradient-to-br from-primary/90 to-primary/60 border border-accent/30 rounded-3xl shadow-[var(--shadow-gold)] flex flex-col items-center justify-center p-8 text-center">
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

function FinishedView({ total, onRestart }: { total: number; onRestart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-12">
      <div className="hanzi text-8xl text-accent shimmer-gold">完</div>
      <h2 className="text-3xl font-serif">Sessão completa!</h2>
      <p className="text-muted-foreground">Você revisou {total} cards. 加油!</p>
      <Button onClick={onRestart} size="lg" className="bg-gradient-to-r from-primary to-primary/80">
        <RotateCw className="w-4 h-4 mr-2" /> Nova sessão
      </Button>
    </div>
  );
}

// Spaced repetition simples: cards com mais erros aparecem com peso maior
function buildSession(cards: Card[], progress: Progress): string[] {
  const weighted: string[] = [];
  for (const c of cards) {
    const p = progress[c.id] ?? { correct: 0, wrong: 0 };
    const seen = p.correct + p.wrong;
    // weight: novos = 1, errados = 1 + min(3, wrong - correct)
    let weight = 1;
    if (seen > 0) {
      const diff = p.wrong - p.correct;
      if (diff > 0) weight = 1 + Math.min(3, diff);
    }
    for (let i = 0; i < weight; i++) weighted.push(c.id);
  }
  // shuffle (Fisher-Yates)
  for (let i = weighted.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weighted[i], weighted[j]] = [weighted[j], weighted[i]];
  }
  // ensure every card appears at least once before repeats by putting one of each first
  const seen = new Set<string>();
  const first: string[] = [];
  const rest: string[] = [];
  for (const id of weighted) {
    if (!seen.has(id)) { first.push(id); seen.add(id); }
    else rest.push(id);
  }
  // shuffle first too
  for (let i = first.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [first[i], first[j]] = [first[j], first[i]];
  }
  return [...first, ...rest];
}

// avoid unused import warning if toast not used elsewhere
void toast;
