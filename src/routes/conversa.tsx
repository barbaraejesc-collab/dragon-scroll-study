import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowLeft, Send, Volume2, Eye, EyeOff, Languages } from "lucide-react";
import { pinyin } from "pinyin-pro";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conversa")({
  component: ConversaPage,
});

function speakZh(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.8;
    window.speechSynthesis.speak(u);
  } catch {
    // silent
  }
}

function parseAssistantText(raw: string): { zh: string; pt: string } {
  const zhMatch = raw.match(/\[ZH\]\s*([\s\S]*?)(?:\[PT\]|$)/i);
  const ptMatch = raw.match(/\[PT\]\s*([\s\S]*?)$/i);
  const zh = zhMatch ? zhMatch[1].trim() : raw.trim();
  const pt = ptMatch ? ptMatch[1].trim() : "";
  return { zh, pt };
}

function ConversaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});
  const [showPinyin, setShowPinyin] = useState<Record<string, boolean>>({});
  const spokenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  // Auto-speak assistant messages once they finish streaming
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

  return (
    <main className="min-h-screen flex flex-col max-w-2xl mx-auto px-4 py-4">
      <header className="flex items-center justify-between mb-3 pb-3 border-b border-border">
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
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 hanzi text-lg">
                  {raw}
                </div>
              </div>
            );
          }
          const { zh, pt } = parseAssistantText(raw);
          const show = !!showTranslation[m.id];
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground px-4 py-2">
                <div className="hanzi text-xl leading-relaxed">{zh}</div>
                {show && pt && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-sm text-muted-foreground italic">
                    {pt}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-1 -ml-1">
                  <button
                    onClick={() => speakZh(zh)}
                    className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition"
                    title="Ouvir"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
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

      <div className="pt-3 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva em 中文…"
            className={cn(
              "flex-1 rounded-full bg-muted px-4 py-2.5 text-base outline-none",
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
