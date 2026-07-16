import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let vocabCache: string | null = null;
async function getVocab() {
  if (vocabCache) return vocabCache;
  const { data } = await supabaseAdmin.from("cards").select("hanzi,pinyin,meaning");
  vocabCache = (data ?? [])
    .map((c) => `${c.hanzi} (${c.pinyin}) ${c.meaning}`)
    .join("\n");
  return vocabCache;
}

export const Route = createFileRoute("/api/check")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { text } = (await request.json()) as { text?: string };
        if (!text || !text.trim()) {
          return new Response("Missing text", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const vocab = await getVocab();
        const gateway = createLovableAiGatewayProvider(key);
        const { text: out } = await generateText({
          model: gateway("google/gemini-2.5-flash"),
          temperature: 0.1,
          system: `Você é uma professora brasileira de mandarim. O aluno vai enviar uma frase em mandarim. Sua tarefa:

1. Avaliar se está gramaticalmente correta e natural.
2. Apontar erros de gramática, ordem, uso de partículas ou caracteres.
3. Se estiver correta, elogiar rapidamente.
4. Sempre dar a tradução em português.

VOCABULÁRIO CONHECIDO PELO ALUNO (use como referência do que ele já viu):
${vocab}

Formato de resposta (curto, em português, sem markdown pesado):
Status: ✅ Correto | ⚠️ Quase | ❌ Erro
Correção: <frase corrigida em hanzi, se houver erro; senão repita a frase>
Pinyin: <pinyin com tons corretos ā á ǎ à>
Tradução: <em português>
Comentário: <1-2 linhas explicando o erro ou elogiando>`,
          prompt: text,
        });

        return new Response(JSON.stringify({ result: out }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
