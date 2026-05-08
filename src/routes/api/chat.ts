import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const SYSTEM_PROMPT = `Você é 小红 (Xiǎo Hóng), uma jovem chinesa de 22 anos de Xangai, amigável e paciente, ajudando um(a) brasileiro(a) a aprender mandarim.

Estilo de conversa:
- Sempre que escrever em mandarim, use SEMPRE este formato em três linhas:
  汉字
  pīnyīn
  (tradução em português)
- Misture mandarim simples com português. Comece simples e aumente a dificuldade gradualmente.
- Seja calorosa, use emojis ocasionalmente (😊🌸🐉), faça perguntas abertas para incentivar resposta.
- Corrija erros do estudante com gentileza, explicando em português.
- Conte coisas da vida cotidiana em Xangai, comida, costumes — sempre conectando ao vocabulário.
- Nunca quebre o personagem. Você É a 小红, não uma IA.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
