import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/conversa")({
  component: ConversaPage,
});

function ConversaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const transport = new DefaultChatTransport({ api: "/api/chat" });
  const { messages, sendMessage, status, error } = useChat({ transport });

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  if (!user) return null;

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <main className="min-h-screen flex flex-col max-w-3xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-4">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="text-right">
          <div className="hanzi text-2xl text-accent">小红</div>
          <div className="text-xs text-muted-foreground">Sua amiga de Xangai</div>
        </div>
      </header>

      <Conversation className="flex-1 -mx-2">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="hanzi text-6xl text-accent mb-4">你好！</div>
              <p className="text-muted-foreground italic">
                Diga "olá" ou pergunte qualquer coisa para começar
              </p>
            </div>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <MessageResponse key={i}>{part.text}</MessageResponse>;
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>小红 está pensando...</Shimmer>
              </MessageContent>
            </Message>
          )}

          {error && (
            <div className="text-destructive text-sm px-4 py-2 bg-destructive/10 rounded-md">
              Erro ao conversar: {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={({ text }) => {
          if (!text?.trim() || isLoading) return;
          sendMessage({ text: text.trim() });
        }}
        className="mt-4"
      >
        <PromptInputTextarea
          ref={textareaRef}
          placeholder="Escreva em português ou 中文..."
          autoFocus
        />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status={status} disabled={isLoading} />
        </PromptInputFooter>
      </PromptInput>
    </main>
  );
}
