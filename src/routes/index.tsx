import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl text-center space-y-10">
          <div className="space-y-4">
            <p className="text-accent/80 tracking-[0.4em] text-xs uppercase shimmer-gold">学习汉语</p>
            <h1 className="hanzi text-7xl md:text-9xl text-accent leading-none drop-shadow-[0_0_30px_rgba(255,215,0,0.15)]">
              中文学习
            </h1>
            <p className="text-2xl md:text-3xl font-serif italic text-cream/90">
              Meu sistema pessoal de mandarim
            </p>
          </div>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Flashcards com repetição espaçada, progresso salvo, e um caderno digital
            elegante para acompanhar sua jornada pelo idioma chinês.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button asChild size="lg" className="bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 shadow-[var(--shadow-elegant)] text-base px-8">
              <Link to="/auth">Começar a estudar</Link>
            </Button>
          </div>
          <div className="pt-12 grid grid-cols-3 gap-6 text-sm max-w-md mx-auto">
            {[
              { h: "卡", t: "Flashcards" },
              { h: "记", t: "Progresso" },
              { h: "火", t: "Streak diário" },
            ].map((f) => (
              <div key={f.h} className="space-y-2">
                <div className="hanzi text-4xl text-accent/70">{f.h}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">{f.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
