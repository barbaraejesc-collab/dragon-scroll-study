import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedVocab: string | null = null;
let cachedHanziArr: string[] | null = null;

async function getVocab() {
  if (cachedVocab && cachedHanziArr) return { vocab: cachedVocab, hanziArr: cachedHanziArr };
  const { data, error } = await supabaseAdmin
    .from("cards")
    .select("hanzi,pinyin,meaning,category")
    .order("category");
  if (error || !data) return { vocab: "", hanziArr: [] as string[] };
  cachedVocab = data.map((c) => `${c.hanzi} | ${c.pinyin} | ${c.meaning} [${c.category}]`).join("\n");
  cachedHanziArr = data.map((c) => c.hanzi);
  return { vocab: cachedVocab, hanziArr: cachedHanziArr };
}

// Extract conversation text and compute which vocab entries have appeared.
function computeUsage(messages: UIMessage[], hanziArr: string[]) {
  const allText = messages
    .flatMap((m) =>
      m.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text as string)
    )
    .join("\n");
  const used: string[] = [];
  const remaining: string[] = [];
  for (const h of hanziArr) {
    if (h && allText.includes(h)) used.push(h);
    else remaining.push(h);
  }
  return { used, remaining };
}

function buildSystemPrompt(
  vocab: string,
  hanziList: string,
  used: string[],
  remaining: string[],
  total: number,
) {
  const coverage = total > 0 ? Math.round((used.length / total) * 100) : 0;
  const canFinish = remaining.length === 0;
  // Show up to ~40 remaining ideograms to keep prompt focused.
  const remainingPreview = remaining.slice(0, 40).join(" ");
  const usedPreview = used.slice(-40).join(" ");

  return `Você é 小红 (Xiǎo Hóng), uma TUTORA brasileira de mandarim tendo uma CONVERSA REAL em chinês com seu(sua) aluno(a). Não é quiz, não é aula de tradução: é bate-papo natural limitado ao vocabulário que ele(a) conhece.

VOCABULÁRIO PERMITIDO:
${vocab}

LISTA COMPACTA DE TODOS OS IDEOGRAMAS APRENDIDOS:
${hanziList}

PARTÍCULAS/CONECTIVOS ESTRUTURAIS sempre permitidos:
吗 呢 吧 啊 和 也 在 的 了 不 很 是 你 我 他 她 我们 你们 他们 这 那 什么 哪儿 谁

ESTADO DA CONVERSA (calculado pelo sistema, NÃO chute):
- Total de ideogramas no baralho: ${total}
- Já apareceram nesta conversa: ${used.length} (${coverage}%)
- Ainda NÃO usados (${remaining.length}): ${remainingPreview}${remaining.length > 40 ? " …" : ""}
- Últimos usados: ${usedPreview}

REGRAS
- Converse de verdade: cumprimente, pergunte coisas simples, comente, mude de assunto. NUNCA pergunte "como se diz X em mandarim".
- Use APENAS ideogramas da lista permitida + partículas estruturais. Se uma palavra desejada não está na lista, REFORMULE.
- Mensagens CURTAS, 1–2 frases, estilo WhatsApp.
- A CADA TURNO seu, escolha 1–3 ideogramas da lista "Ainda NÃO usados" acima e tente encaixá-los naturalmente no que você diz. Puxe assuntos que justifiquem usá-los (clima, comida, atividades, tempo, sentimentos, etc.).
- ${canFinish
    ? "TODOS os ideogramas já apareceram. Você PODE enviar a mensagem final de conclusão (formato abaixo)."
    : `AINDA FALTAM ${remaining.length} ideogramas. É PROIBIDO enviar a mensagem de conclusão "我们聊了很多！" ou afirmar que já usou todos. Continue a conversa normalmente.`}

MENSAGEM FINAL (apenas quando o sistema indicar que pode finalizar):
[ZH]
我们聊了很多！
[PT]
Conversamos bastante! Já usei todos os seus ideogramas nessa sessão 🎉 Quer continuar conversando ou encerrar?

CORREÇÃO
- Se o aluno errar, corrija GENTILMENTE em UMA linha em português dentro do bloco [PT], e siga a conversa.

FORMATO DE RESPOSTA — OBRIGATÓRIO
Toda mensagem DEVE seguir exatamente:

[ZH]
<fala em mandarim, só hanzi, sem pinyin>
[PT]
<tradução natural em português; correção como primeira linha se houver>

Sem pinyin, sem markdown, sem explicações longas, sem quebrar o personagem.

INÍCIO: na primeira mensagem, cumprimente curto e caloroso e já puxe assunto.`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { vocab, hanziArr } = await getVocab();
        const { used, remaining } = computeUsage(messages, hanziArr);
        const hanziList = hanziArr.join(" ");

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system: buildSystemPrompt(vocab, hanziList, used, remaining, hanziArr.length),
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
