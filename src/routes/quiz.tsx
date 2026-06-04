import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RotateCw, Check, X } from "lucide-react";
import { playCorrect, playWrong } from "@/lib/sounds";

export const Route = createFileRoute("/quiz")({
  component: QuizPage,
});

type Card = { id: string; hanzi: string; pinyin: string; meaning: string; category: string };

const QUIZ_SIZE = 10;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function QuizPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [questions, setQuestions] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("cards").select("*");
      const c = data ?? [];
      setCards(c);
      setQuestions(shuffle(c).slice(0, Math.min(QUIZ_SIZE, c.length)));
      setLoaded(true);
      const today = new Date().toISOString().slice(0, 10);
      supabase.from("study_sessions").insert({ user_id: user.id, study_date: today }).then(() => {});
    })();
  }, [user]);

  const current = questions[idx] ?? null;

  const options = useMemo(() => {
    if (!current || cards.length < 4) return [];
    const distractors = shuffle(cards.filter((c) => c.id !== current.id)).slice(0, 3);
    return shuffle([current, ...distractors]);
  }, [current, cards]);

  const handlePick = useCallback(async (cardId: string) => {
    if (picked || !current || !user) return;
    setPicked(cardId);
    const correct = cardId === current.id;
    if (correct) {
      playCorrect();
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
    } else {
      playWrong();
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
    // persist progress
    const { data: existing } = await supabase
      .from("card_progress")
      .select("correct_count,wrong_count")
      .eq("user_id", user.id)
      .eq("card_id", current.id)
      .maybeSingle();
    const prev = existing ?? { correct_count: 0, wrong_count: 0 };
    await supabase.from("card_progress").upsert(
      {
        user_id: user.id,
        card_id: current.id,
        correct_count: prev.correct_count + (correct ? 1 : 0),
        wrong_count: prev.wrong_count + (correct ? 0 : 1),
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,card_id" }
    );
  }, [picked, current, user]);

  const next = useCallback(() => {
    setPicked(null);
    setIdx((i) => i + 1);
  }, []);

  const restart = useCallback(() => {
    setQuestions(shuffle(cards).slice(0, Math.min(QUIZ_SIZE, cards.length)));
    setIdx(0);
    setPicked(null);
    setScore({ correct: 0, wrong: 0 });
  }, [cards]);

  if (!user) return null;

  const finished = loaded && idx >= questions.length;
  const total = questions.length;

  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <span className="text-xs uppercase tracking-widest text-accent font-serif">Quiz rápido</span>
        <Button variant="ghost" size="sm" onClick={restart} className="text-accent">
          <RotateCw className="w-4 h-4 mr-1" /> Recomeçar
        </Button>
      </header>

      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-2 font-serif">
          <span>{score.correct}✓ · {score.wrong}✗</span>
          <span>{Math.min(idx, total)} / {total}</span>
        </div>
        <Progress value={total ? (idx / total) * 100 : 0} className="h-1.5" />
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="hanzi text-6xl text-accent/40 shimmer-gold">学</div>
        </div>
      ) : finished ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-12">
          <div className="hanzi text-8xl text-accent shimmer-gold">完</div>
          <h2 className="text-3xl font-serif">Quiz completo!</h2>
          <p className="text-lg">
            <span className="text-success font-serif">{score.correct}</span>
            <span className="text-muted-foreground"> de </span>
            <span className="font-serif">{total}</span>
            <span className="text-muted-foreground"> · {Math.round((score.correct / total) * 100)}%</span>
          </p>
          <div className="flex gap-3">
            <Button onClick={restart} size="lg" className="bg-gradient-to-r from-primary to-primary/80">
              <RotateCw className="w-4 h-4 mr-2" /> Novo quiz
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>
      ) : current ? (
        <div className="flex-1 flex flex-col">
          <div className="bg-gradient-to-br from-card to-secondary border border-border rounded-3xl shadow-[var(--shadow-elegant)] flex items-center justify-center p-10 mb-6">
            <span className="hanzi text-[22vw] md:text-[160px] leading-none text-cream">{current.hanzi}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt) => {
              const isCorrect = opt.id === current.id;
              const isPicked = opt.id === picked;
              let cls = "border-border hover:border-accent/50 hover:bg-card/80";
              if (picked) {
                if (isCorrect) cls = "border-success/60 bg-success/15 text-success";
                else if (isPicked) cls = "border-destructive/60 bg-destructive/15 text-destructive";
                else cls = "border-border opacity-50";
              }
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePick(opt.id)}
                  disabled={!!picked}
                  className={`text-left rounded-xl border p-4 transition-all ${cls}`}
                >
                  <div className="font-serif italic text-sm text-accent/80 mb-1">{opt.pinyin}</div>
                  <div className="font-serif">{opt.meaning}</div>
                </button>
              );
            })}
          </div>

          {picked && (
            <Button onClick={next} size="lg" className="mt-6 bg-gradient-to-r from-primary to-primary/80">
              {picked === current.id ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
              Próxima
            </Button>
          )}
        </div>
      ) : null}
    </main>
  );
}
