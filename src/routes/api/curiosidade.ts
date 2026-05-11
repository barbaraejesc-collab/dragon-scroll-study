import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

export const Route = createFileRoute("/api/curiosidade")({
  server: {
    handlers: {
      POST: async () => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const { object } = await generateObject({
            model: gateway("google/gemini-2.5-flash"),
            schema: z.object({
              titulo: z.string().describe("Título curto e instigante em português"),
              conteudo: z.string().describe("Curiosidade em português, 2-4 parágrafos curtos, tom envolvente"),
              hanzi: z.string().describe("Um ideograma OU palavra em chinês relacionado à curiosidade"),
              pinyin: z.string().describe("Pinyin com tons"),
              significado: z.string().describe("Significado em português"),
            }),
            prompt: `Gere UMA curiosidade fascinante e pouco conhecida sobre a China — pode ser sobre história, cultura, comida, costumes, dialetos, festivais, dinastias, filosofia (Confúcio, Tao), arquitetura, mitologia, supersticões, ou a etimologia de um ideograma específico. Varie o tema. Inclua um ideograma ou palavra em chinês central à curiosidade, com pinyin e tradução. Seja específico e evite generalidades. Tom: amigável, em português brasileiro.`,
          });
          return Response.json(object);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "AI error";
          console.error("[curiosidade] error:", msg);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
