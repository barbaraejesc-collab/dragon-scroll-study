import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowLeft, Send, Volume2, Eye, EyeOff, Languages, CheckCircle2, Loader2 } from "lucide-react";
import { pinyin } from "pinyin-pro";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { speakZh } from "@/lib/tts";

export const Route = createFileRoute("/conversa")({
  component: ConversaPage,
});


function parseAssistantText(raw: string): { zh: string; pt: string } {
  const zhMatch = raw.match(/\[ZH\]\s*([\s\S]*?)(?:\[PT\]|$)/i);
  const ptMatch = raw.match(/\[PT\]\s*([\s\S]*?)$/i);
  const zh = zhMatch ? zhMatch[1].trim() : raw.trim();
  const pt = ptMatch ? ptMatch[1].trim() : "";
  return { zh, pt };
}

// Structural particles/pronouns always considered valid, matching the server prompt.
const ALWAYS_ALLOWED = new Set(
  "吗呢吧啊和也在的了不很是你我他她们这那什么哪儿谁".split("")
);

function isHanzi(ch: string) {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff;
}

function ConversaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});
  const [showPinyin, setShowPinyin] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState<Record<string, { loading: boolean; result?: string }>>({});
  const [allowedSet, setAllowedSet] = useState<Set<string> | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load full hanzi vocabulary once to highlight out-of-vocab characters.
  useEffect(() => {
    fetch("/api/vocab")
      .then((r) => r.json())
      .then((d: { hanzi: string[] }) => {
        const s = new Set<string>();
        for (const w of d.hanzi ?? []) for (const c of w) s.add(c);
        for (const c of ALWAYS_ALLOWED) s.add(c);
        setAllowedSet(s);
      })
      .catch(() => {});
  }, []);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    const text = last.parts.filter((p) => p.type === "text").map((p: any) => p.text).join("");
    const { zh } = parseAssistantText(text);
    if (zh) {
      speakZh(zh);
      spokenIdsRef.current.add(last.id);
    }
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status]);

  if (!user) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  };

  const handleStart = () => {
    if (isLoading) return;
    sendMessage({ text: "你好" });
  };

  const handleCheck = async (id: string, text: string) => {
    setChecks((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const r = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      setChecks((s) => ({ ...s, [id]: { loading: false, result: d.result ?? "Erro na verificação." } }));
    } catch {
      setChecks((s) => ({ ...s, [id]: { loading: false, result: "Erro na verificação." } }));
    }
  };

  const renderZh = (zh: string) => {
    if (!allowedSet) return zh;
    return Array.from(zh).map((ch, i) => {
      if (isHanzi(ch) && !allowedSet.has(ch)) {
        return (
          <span
            key={i}
            className="underline decoration-wavy decoration-destructive underline-offset-4"
            title="Fora do vocabulário aprendido"
          >
            {ch}
          </span>
        );
      }
      return <span key={i}>{ch}</span>;
    });
  };

  return (
    <main
      className="flex flex-col max-w-2xl mx-auto px-4 pt-4"
      style={{ height: "100dvh" }}
    >
      <header className="flex items-center justify-between mb-3 pb-3 border-b border-border shrink-0">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="text-right">
          <div className="hanzi text-2xl text-accent leading-none">小红</div>
          <div className="text-xs text-muted-foreground">Tutora de mandarim</div>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto py-4 space-y-3"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="hanzi text-5xl text-accent mb-4">你好！</div>
            <p className="text-muted-foreground italic mb-6">
              小红 vai conversar com você em mandarim usando só os ideogramas que você já aprendeu.
            </p>
            <Button onClick={handleStart}>Começar conversa</Button>
          </div>
        )}

        {messages.map((m) => {
          const raw = m.parts.filter((p) => p.type === "text").map((p: any) => p.text).join("");
          if (m.role === "user") {
            const chk = checks[m.id];
            return (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 hanzi text-lg">
                  {raw}
                </div>
                <button
                  onClick={() => handleCheck(m.id, raw)}
                  disabled={chk?.loading}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5"
                >
                  {chk?.loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  {chk?.result ? "verificar de novo" : "verificar frase"}
                </button>
                {chk?.result && (
                  <div className="max-w-[85%] rounded-xl bg-muted text-foreground px-3 py-2 text-xs whitespace-pre-wrap">
                    {chk.result}
                  </div>
                )}
              </div>
            );
          }
          const { zh, pt } = parseAssistantText(raw);
          const show = !!showTranslation[m.id];
          const showPy = !!showPinyin[m.id];
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground px-4 py-2">
                <div className="hanzi text-xl leading-relaxed">{renderZh(zh)}</div>
                {showPy && (
                  <div className="mt-1 text-sm text-accent">
                    {pinyin(zh, { toneType: "symbol", nonZh: "consecutive" })}
                  </div>
                )}
                {show && pt && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-sm text-muted-foreground italic">
                    {pt}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-1 flex-wrap -ml-1">
                  <button
                    onClick={() => speakZh(zh)}
                    className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition"
                    title="Ouvir"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      setShowPinyin((s) => ({ ...s, [m.id]: !s[m.id] }))
                    }
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition"
                  >
                    <Languages className="w-3 h-3" />
                    {showPy ? "ocultar pinyin" : "ver pinyin"}
                  </button>
                  {pt && (
                    <button
                      onClick={() =>
                        setShowTranslation((s) => ({ ...s, [m.id]: !s[m.id] }))
                      }
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition"
                    >
                      {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {show ? "ocultar tradução" : "ver tradução"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-muted-foreground text-sm italic">
              小红 está digitando…
            </div>
          </div>
        )}

        {error && (
          <div className="text-destructive text-sm px-4 py-2 bg-destructive/10 rounded-md">
            Erro: {error.message}
          </div>
        )}
      </div>

      <div
        className="pt-3 border-t border-border shrink-0"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2 items-center"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva em 中文…"
            className={cn(
              "flex-1 min-w-0 rounded-full bg-muted px-4 py-2.5 text-base outline-none",
              "focus:ring-2 focus:ring-ring",
              "hanzi"
            )}
            autoFocus
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full h-11 w-11 shrink-0"
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </main>
  );
}
