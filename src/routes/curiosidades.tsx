import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, Star, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/curiosidades")({
  component: CuriosidadesPage,
});

type Curiosidade = {
  titulo: string;
  conteudo: string;
  hanzi: string;
  pinyin: string;
  significado: string;
};

type Saved = Curiosidade & { id: string; created_at: string };

function CuriosidadesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Curiosidade | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [tab, setTab] = useState<"nova" | "favoritas">("nova");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) loadSaved();
  }, [user]);

  async function loadSaved() {
    const { data } = await supabase
      .from("curiosidades_favoritas")
      .select("*")
      .order("created_at", { ascending: false });
    setSaved((data ?? []) as Saved[]);
  }

  async function gerar() {
    setGenerating(true);
    setCurrent(null);
    try {
      const res = await fetch("/api/curiosidade", { method: "POST" });
      if (!res.ok) throw new Error("Falha na geração");
      const data = (await res.json()) as Curiosidade;
      setCurrent(data);
    } catch (e) {
      toast.error("Não consegui gerar a curiosidade. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  async function favoritar() {
    if (!current || !user) return;
    const { error } = await supabase.from("curiosidades_favoritas").insert({
      user_id: user.id,
      ...current,
    });
    if (error) return toast.error("Não foi possível salvar");
    toast.success("Salva nas favoritas! ⭐");
    loadSaved();
  }

  async function remover(id: string) {
    await supabase.from("curiosidades_favoritas").delete().eq("id", id);
    setSaved((s) => s.filter((c) => c.id !== id));
  }

  if (!user) return null;

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-6">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <h1 className="hanzi text-2xl text-accent">中国文化</h1>
      </header>

      <div className="flex gap-2 mb-6 border-b border-border">
        {(["nova", "favoritas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-serif transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "nova" ? "Nova curiosidade" : `Favoritas (${saved.length})`}
          </button>
        ))}
      </div>

      {tab === "nova" && (
        <section>
          {!current && !generating && (
            <div className="text-center py-12">
              <div className="hanzi text-7xl text-accent/40 mb-6">？</div>
              <p className="text-muted-foreground mb-6 italic">
                Descubra algo fascinante sobre a China
              </p>
              <Button size="lg" onClick={gerar} className="bg-gradient-to-r from-primary to-primary/70">
                <Sparkles className="w-4 h-4 mr-2" /> Gerar curiosidade
              </Button>
            </div>
          )}

          {generating && (
            <div className="text-center py-16 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
              <p className="italic">Buscando uma curiosidade...</p>
            </div>
          )}

          {current && !generating && (
            <article className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-elegant)]">
              <HanziHeader c={current} />
              <h2 className="text-2xl md:text-3xl font-serif italic mb-4 text-cream">
                {current.titulo}
              </h2>
              <div className="prose prose-invert max-w-none text-foreground/90 whitespace-pre-line leading-relaxed">
                {current.conteudo}
              </div>
              <div className="flex gap-2 mt-6 pt-6 border-t border-border">
                <Button onClick={favoritar} variant="outline" className="border-accent/40 text-accent hover:bg-accent/10">
                  <Star className="w-4 h-4 mr-2" /> Salvar
                </Button>
                <Button onClick={gerar} variant="ghost">
                  <Sparkles className="w-4 h-4 mr-2" /> Outra
                </Button>
              </div>
            </article>
          )}
        </section>
      )}

      {tab === "favoritas" && (
        <section className="space-y-4">
          {saved.length === 0 && (
            <p className="text-center text-muted-foreground py-12 italic">
              Nenhuma curiosidade salva ainda. Gere uma e clique em Salvar ⭐
            </p>
          )}
          {saved.map((c) => (
            <article key={c.id} className="bg-card border border-border rounded-xl p-5">
              <HanziHeader c={c} compact />
              <h3 className="text-xl font-serif italic mb-2 text-cream">{c.titulo}</h3>
              <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{c.conteudo}</p>
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => remover(c.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function HanziHeader({ c, compact }: { c: Curiosidade; compact?: boolean }) {
  if (!c.hanzi) return null;
  return (
    <div className={`flex items-baseline gap-4 mb-4 ${compact ? "" : "pb-4 border-b border-border"}`}>
      <span className={`hanzi text-accent ${compact ? "text-3xl" : "text-5xl"}`}>{c.hanzi}</span>
      <div>
        <div className="text-sm text-accent/80 italic">{c.pinyin}</div>
        <div className="text-xs text-muted-foreground">{c.significado}</div>
      </div>
    </div>
  );
}
