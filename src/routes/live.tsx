import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, Square, ArrowLeft, RotateCw } from "lucide-react";
import { speakZh } from "@/lib/tts";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Modo Live — 中文学习" },
      { name: "description", content: "Estudo automático de ideogramas: frente e verso com áudio e tempo controlado." },
      { property: "og:title", content: "Modo Live — 中文学习" },
      { property: "og:description", content: "Flashcards automáticos de mandarim com áudio e timer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LivePage,
});

type Card = { id: string; hanzi: string; pinyin: string; meaning: string; semester: number };
type SemChoice = "all" | 1 | 2;

const SPEEDS = [10, 15, 30] as const;
const PREF_KEY = "live-mode-prefs";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function LivePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [semester, setSemester] = useState<SemChoice>("all");
  const [speed, setSpeed] = useState<number>(15);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [deck, setDeck] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [remaining, setRemaining] = useState(speed);
  const [starting, setStarting] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load saved preferences
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { semester?: SemChoice; speed?: number };
        if (p.semester === "all" || p.semester === 1 || p.semester === 2) setSemester(p.semester);
        if (p.speed && SPEEDS.includes(p.speed as (typeof SPEEDS)[number])) setSpeed(p.speed);
      }
    } catch {
      /* ignore */
    }
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ semester, speed }));
    } catch {
      /* ignore */
    }
  }, [semester, speed, prefsLoaded]);

  const start = useCallback(async () => {
    setStarting(true);
    const query = supabase.from("cards").select("id,hanzi,pinyin,meaning,semester");
    const { data } = semester === "all" ? await query : await query.eq("semester", semester);
    const cards = shuffle((data ?? []) as Card[]);
    setStarting(false);
    if (cards.length === 0) return;
    setDeck(cards);
    setIdx(0);
    setSide("front");
    setRemaining(speed);
    setFinished(false);
    setPaused(false);
    setRunning(true);
  }, [semester, speed]);

  const current = deck[idx];

  // Speak the hanzi whenever the back (pinyin + meaning) is revealed.
  useEffect(() => {
    if (!running || side !== "back" || !current) return;
    void speakZh(current.hanzi);
  }, [running, side, current?.id]);

  const advance = useCallback(() => {
    if (side === "front") {
      setSide("back");
      setRemaining(speed);
      return;
    }
    const next = idx + 1;
    if (next >= deck.length) {
      setRunning(false);
      setFinished(true);
      return;
    }
    setSide("front");
    setIdx(next);
    setRemaining(speed);
  }, [side, idx, deck.length, speed]);

  const skip = useCallback(() => {
    const next = idx + 1;
    if (next >= deck.length) {
      setRunning(false);
      setFinished(true);
      return;
    }
    setSide("front");
    setIdx(next);
    setRemaining(speed);
  }, [idx, deck.length, speed]);

  // Timer tick
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    if (!running || paused) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        const nr = +(r - 0.1).toFixed(1);
        if (nr <= 0) {
          advanceRef.current();
          return speed;
        }
        return nr;
      });
    }, 100);
    return () => clearInterval(t);
  }, [running, paused, speed]);

  const stop = () => {
    setRunning(false);
    setFinished(false);
    setDeck([]);
    setIdx(0);
  };

  if (!user) return null;

  // ---- Setup screen ----
  if (!running && !finished) {
    return (
      <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center text-muted-foreground text-sm mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Link>
        <div className="hanzi text-6xl text-accent mb-4">自动</div>
        <h1 className="text-4xl font-serif italic mb-2">Modo Live</h1>
        <p className="text-muted-foreground mb-10 text-sm">
          Os ideogramas passam sozinhos, com áudio e tempo controlado. Sem cliques.
        </p>

        <section className="mb-8">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Semestre</p>
          <div className="grid grid-cols-3 gap-3">
            {([1, 2, "all"] as SemChoice[]).map((s) => (
              <button
                key={String(s)}
                onClick={() => setSemester(s)}
                className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
                  semester === s ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground"
                }`}
              >
                {s === "all" ? "Tudo junto" : `${s}º semestre`}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Velocidade por etapa</p>
          <div className="grid grid-cols-3 gap-3">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
                  speed === s ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground"
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </section>

        <Button size="lg" className="w-full" onClick={() => void start()} disabled={starting}>
          <Play className="w-4 h-4 mr-2" /> {starting ? "Preparando..." : "Iniciar sessão"}
        </Button>
      </main>
    );
  }

  // ---- Finished ----
  if (finished) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="hanzi text-7xl text-accent">完成</div>
        <h2 className="text-3xl font-serif italic">Você passou por todos os ideogramas! 🎉</h2>
        <p className="text-muted-foreground text-sm">{deck.length} cards nesta sessão</p>
        <div className="flex gap-3">
          <Button onClick={() => void start()}>
            <RotateCw className="w-4 h-4 mr-2" /> Nova sessão embaralhada
          </Button>
          <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
            Voltar
          </Button>
        </div>
      </main>
    );
  }

  // ---- Live screen ----
  const pct = Math.max(0, Math.min(100, (remaining / speed) * 100));

  return (
    <main className="min-h-[100dvh] flex flex-col bg-background">
      <div className="h-1.5 w-full bg-border/40">
        <div className="h-full bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground">
        <span>{side === "front" ? "Ideograma" : "Pinyin + significado"}</span>
        <span>
          {idx + 1}/{deck.length}
        </span>
      </div>

      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {current && side === "front" ? (
          <div className="hanzi text-[26vw] md:text-[16rem] leading-none text-cream">{current.hanzi}</div>
        ) : current ? (
          <div className="space-y-5">
            <div className="hanzi text-6xl text-accent/70">{current.hanzi}</div>
            <div className="text-4xl md:text-5xl font-serif text-accent">{current.pinyin}</div>
            <div className="text-xl md:text-2xl text-cream/90">{current.meaning}</div>
          </div>
        ) : null}
        <div className="mt-10 text-sm text-muted-foreground tabular-nums">{Math.ceil(remaining)}s</div>
      </section>

      <div className="flex items-center justify-center gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
        {paused ? (
          <Button size="lg" onClick={() => setPaused(false)}>
            <Play className="w-4 h-4 mr-2" /> Continuar
          </Button>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => setPaused(true)}>
            <Pause className="w-4 h-4 mr-2" /> Pausar
          </Button>
        )}
        <Button size="lg" variant="outline" onClick={skip}>
          <SkipForward className="w-4 h-4 mr-2" /> Pular
        </Button>
        <Button size="lg" variant="ghost" onClick={stop}>
          <Square className="w-4 h-4 mr-2" /> Encerrar
        </Button>
      </div>
    </main>
  );
}
