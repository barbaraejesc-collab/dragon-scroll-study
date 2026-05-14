import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Flame, BookOpen, Target, LogOut, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

type Stats = {
  totalCards: number;
  studiedCards: number;
  accuracy: number | null;
  streak: number;
  displayName: string;
};

function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: totalCards }, { data: progress }, { data: sessions }, { data: profile }] = await Promise.all([
        supabase.from("cards").select("*", { count: "exact", head: true }),
        supabase.from("card_progress").select("correct_count,wrong_count").eq("user_id", user.id),
        supabase.from("study_sessions").select("study_date").eq("user_id", user.id).order("study_date", { ascending: false }),
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      ]);
      const answeredRows = (progress ?? []).filter((p) => p.correct_count + p.wrong_count > 0);
      const totalCorrect = answeredRows.reduce((s, p) => s + p.correct_count, 0);
      const totalWrong = answeredRows.reduce((s, p) => s + p.wrong_count, 0);
      const totalAnswers = totalCorrect + totalWrong;
      const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : null;
      const streak = computeStreak((sessions ?? []).map((s) => s.study_date));
      setStats({
        totalCards: totalCards ?? 0,
        studiedCards: answeredRows.length,
        accuracy,
        streak,
        displayName: profile?.display_name ?? user.email ?? "",
      });
    })();
  }, [user]);

  if (!user) return null;

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <Link to="/" className="hanzi text-3xl text-accent">中文学习</Link>
        <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-muted-foreground">
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </header>

      <section className="mb-10">
        <p className="text-sm text-accent/80 uppercase tracking-widest mb-2">Olá, {stats?.displayName}</p>
        <h1 className="text-4xl md:text-5xl font-serif italic">Pronto para estudar?</h1>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <StatCard icon={<BookOpen />} label="Cards" value={stats ? `${stats.studiedCards}/${stats.totalCards}` : "—"} />
        <StatCard icon={<Target />} label="Acerto" value={stats ? (stats.accuracy === null ? "--" : `${stats.accuracy}%`) : "—"} />
        <StatCard icon={<Flame />} label="Streak" value={stats ? `${stats.streak}d` : "—"} highlight />
        <StatCard icon={<Sparkles />} label="Total" value={stats ? `${stats.totalCards}` : "—"} />
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <Link to="/flashcards" className="md:col-span-2 group">
          <div className="bg-gradient-to-br from-primary to-primary/70 rounded-2xl p-8 h-full shadow-[var(--shadow-elegant)] transition-transform group-hover:scale-[1.01]">
            <div className="hanzi text-7xl text-accent mb-4">卡</div>
            <h3 className="text-2xl font-serif text-cream mb-1">Flashcards</h3>
            <p className="text-cream/80 text-sm">Repetição espaçada com todos os ideogramas embaralhados</p>
          </div>
        </Link>
        <Link to="/conversa" className="group">
          <div className="bg-card border border-border rounded-2xl p-6 h-full transition-all group-hover:border-accent/50 group-hover:shadow-[var(--shadow-gold)]">
            <div className="hanzi text-5xl text-accent mb-3">话</div>
            <h3 className="text-xl font-serif text-cream mb-1">Conversa com 小红</h3>
            <p className="text-muted-foreground text-xs">Pratique mandarim com uma amiga IA de Xangai</p>
          </div>
        </Link>
        <Link to="/curiosidades" className="md:col-span-3 group">
          <div className="bg-card border border-border rounded-2xl p-6 transition-all group-hover:border-accent/50">
            <div className="flex items-center gap-4">
              <div className="hanzi text-5xl text-accent">文</div>
              <div>
                <h3 className="text-xl font-serif text-cream mb-1">Curiosidades da China</h3>
                <p className="text-muted-foreground text-xs">Descubra histórias, cultura e ideogramas</p>
              </div>
            </div>
          </div>
        </Link>
      </section>
    </main>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${highlight ? "border-accent/40 shadow-[var(--shadow-gold)]" : "border-border"}`}>
      <div className={`flex items-center gap-2 mb-2 ${highlight ? "text-accent" : "text-muted-foreground"}`}>
        <span className="w-4 h-4">{icon}</span>
        <span className="text-xs uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-serif">{value}</div>
    </div>
  );
}

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates);
  let streak = 0;
  const d = new Date();
  // Allow today OR yesterday as start
  const todayStr = d.toISOString().slice(0, 10);
  if (!days.has(todayStr)) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
