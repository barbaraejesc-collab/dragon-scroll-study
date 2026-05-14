import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const PROMPT = `Gere UMA curiosidade fascinante e pouco conhecida sobre a China — pode ser sobre história, cultura, comida, costumes, dialetos, festivais, dinastias, filosofia (Confúcio, Tao), arquitetura, mitologia, superstições, ou a etimologia de um ideograma específico. Varie o tema a cada chamada. Seja específico, evite generalidades. Tom: amigável, em português brasileiro.

Responda APENAS com um objeto JSON válido (sem markdown, sem \`\`\`, sem texto antes ou depois) com EXATAMENTE este formato:
{
  "titulo": "título curto e instigante em português",
  "conteudo": "2 a 4 parágrafos curtos em português brasileiro, separados por \\n\\n",
  "hanzi": "um ideograma ou palavra em chinês central à curiosidade",
  "pinyin": "pinyin com marcas de tom",
  "significado": "tradução curta em português"
}`;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error("Invalid JSON from model");
  }
}

export const Route = createFileRoute("/api/curiosidade")({
  server: {
    handlers: {
      POST: async () => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const { text } = await generateText({
            model: gateway("google/gemini-2.5-flash"),
            prompt: PROMPT,
            temperature: 0.9,
          });
          const obj = extractJson(text) as Record<string, unknown>;
          return Response.json({
            titulo: String(obj.titulo ?? ""),
            conteudo: String(obj.conteudo ?? ""),
            hanzi: String(obj.hanzi ?? ""),
            pinyin: String(obj.pinyin ?? ""),
            significado: String(obj.significado ?? ""),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "AI error";
          console.error("[curiosidade] error:", msg);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
