import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Volume2 } from "lucide-react";
import { speakZh } from "@/lib/tts";

export const Route = createFileRoute("/vocabulario")({
  component: VocabularioPage,
});

type Card = { id: string; hanzi: string; pinyin: string; meaning: string; category: string };
type Prog = Record<string, { correct: number; wrong: number }>;

function speak(text: string) {
  void speakZh(text);
}


function VocabularioPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Prog>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [filter, setFilter] = useState<"all" | "errors" | "new" | "mastered">("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: cardsData }, { data: progressData }] = await Promise.all([
        supabase.from("cards").select("*").order("category"),
        supabase.from("card_progress").select("card_id,correct_count,wrong_count").eq("user_id", user.id),
      ]);
      setCards(cardsData ?? []);
      const p: Prog = {};
      (progressData ?? []).forEach((r) => {
        p[r.card_id] = { correct: r.correct_count, wrong: r.wrong_count };
      });
      setProgress(p);
    })();
  }, [user]);

  const categories = useMemo(() => {
    const set = new Set(cards.map((c) => c.category));
    return Array.from(set).sort();
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      const pr = progress[c.id];
      if (filter === "errors" && (!pr || pr.wrong === 0)) return false;
      if (filter === "new" && pr && pr.correct + pr.wrong > 0) return false;
      if (filter === "mastered" && (!pr || pr.correct < 3 || pr.wrong > pr.correct)) return false;
      if (!q) return true;
      return (
        c.hanzi.includes(q) ||
        c.pinyin.toLowerCase().includes(q) ||
        c.meaning.toLowerCase().includes(q)
      );
    });
  }, [cards, query, category, filter, progress]);

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <span className="text-xs uppercase tracking-widest text-accent font-serif">Vocabulário</span>
      </header>

      <h1 className="text-3xl md:text-4xl font-serif italic mb-1">Todos os ideogramas</h1>
      <p className="text-sm text-muted-foreground mb-6">{filtered.length} de {cards.length}</p>

      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar hanzi, pinyin ou significado…"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(["all", "errors", "new", "mastered"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f ? "bg-accent text-background border-accent" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "Todos" : f === "errors" ? "Com erros" : f === "new" ? "Não vistos" : "Dominados"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setCategory("all")}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            category === "all" ? "bg-primary/30 border-primary text-cream" : "border-border text-muted-foreground"
          }`}
        >
          Todas categorias
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              category === cat ? "bg-primary/30 border-primary text-cream" : "border-border text-muted-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
        {filtered.map((c) => {
          const pr = progress[c.id];
          const total = pr ? pr.correct + pr.wrong : 0;
          const acc = total ? Math.round((pr!.correct / total) * 100) : null;
          return (
            <li key={c.id} className="flex items-center gap-4 p-3 hover:bg-card/50">
              <div className="hanzi text-3xl text-cream w-14 text-center">{c.hanzi}</div>
              <div className="flex-1 min-w-0">
                <div className="text-accent font-serif italic text-sm">{c.pinyin}</div>
                <div className="text-sm truncate">{c.meaning}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{c.category}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground tabular-nums">
                {acc !== null ? (
                  <>
                    <div className={acc >= 70 ? "text-success" : acc >= 40 ? "text-accent" : "text-destructive"}>{acc}%</div>
                    <div>{pr!.correct}✓ / {pr!.wrong}✗</div>
                  </>
                ) : (
                  <span className="italic">novo</span>
                )}
              </div>
              <button
                onClick={() => speak(c.hanzi)}
                aria-label="Ouvir"
                className="p-2 rounded-full text-muted-foreground hover:text-accent hover:bg-card transition-colors"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="p-8 text-center text-muted-foreground text-sm">Nenhum card encontrado.</li>
        )}
      </ul>
    </main>
  );
}
