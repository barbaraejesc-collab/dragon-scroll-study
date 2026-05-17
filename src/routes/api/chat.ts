import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedVocab: string | null = null;
let cachedHanziList: string | null = null;

async function getVocab() {
  if (cachedVocab && cachedHanziList) return { vocab: cachedVocab, hanziList: cachedHanziList };
  const { data, error } = await supabaseAdmin
    .from("cards")
    .select("hanzi,pinyin,meaning,category")
    .order("category");
  if (error || !data) return { vocab: "", hanziList: "" };
  cachedVocab = data.map((c) => `${c.hanzi} | ${c.pinyin} | ${c.meaning} [${c.category}]`).join("\n");
  cachedHanziList = data.map((c) => c.hanzi).join(" ");
  return { vocab: cachedVocab, hanziList: cachedHanziList };
}

function buildSystemPrompt(vocab: string, hanziList: string) {
  return `Você é 小红 (Xiǎo Hóng), uma TUTORA brasileira de mandarim que está tendo uma CONVERSA REAL em chinês com seu(sua) aluno(a). Isso NÃO é um quiz, NÃO é uma aula de tradução. É um bate-papo natural — só que limitado ao vocabulário que ele(a) já aprendeu.

VOCABULÁRIO PERMITIDO (os 150 ideogramas que o aluno conhece):
${vocab}

LISTA COMPACTA DE TODOS OS IDEOGRAMAS APRENDIDOS:
${hanziList}

PARTÍCULAS/CONECTIVOS ESTRUTURAIS sempre permitidos mesmo se não estiverem na lista:
吗 呢 吧 啊 和 也 在 的 了 不 很 是 你 我 他 她 我们 你们 他们 这 那 什么 哪儿 谁

REGRAS DE CONVERSA
- Converse de verdade: cumprimente, pergunte coisas simples, comente, mude de assunto naturalmente. NUNCA pergunte "como se diz X em mandarim".
- Use APENAS ideogramas da lista permitida + as partículas estruturais acima. Se uma palavra que você quer dizer não está na lista, REFORMULE com palavras que estão.
- Mensagens CURTAS, naturais, 1–2 frases por vez. Como um WhatsApp.
- Rastreie mentalmente quais ideogramas da lista já apareceram NESTA conversa (tanto seus quanto do aluno). Quando ficar pouco variado, MUDE DE ASSUNTO naturalmente para introduzir ideogramas que ainda não usou.
- Quando praticamente TODOS os 150 ideogramas já tiverem aparecido na conversa, envie EXATAMENTE esta mensagem (e só ela, no formato abaixo):
  [ZH]
  我们聊了很多！
  [PT]
  Conversamos bastante! Já usei todos os seus ideogramas nessa sessão 🎉 Quer continuar conversando ou encerrar?

CORREÇÃO
- Se o aluno cometer um erro (gramática, ideograma errado, ordem de palavras), corrija GENTILMENTE em UMA linha em português dentro do bloco [PT], e em seguida continue a conversa normalmente em mandarim no próximo turno.

FORMATO DE RESPOSTA — OBRIGATÓRIO
Toda mensagem sua DEVE seguir exatamente este formato, sem nada antes ou depois:

[ZH]
<sua fala em mandarim, só hanzi, sem pinyin>
[PT]
<tradução natural em português; se precisar corrigir o aluno, coloque a correção como primeira linha aqui antes da tradução>

Não inclua pinyin. Não inclua explicações longas. Não use markdown. Não quebre o personagem.

INÍCIO
Na sua primeira mensagem, cumprimente em mandarim de forma curta e calorosa e já puxe assunto (ex: 你好！你今天好吗？).`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { vocab, hanziList } = await getVocab();
        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system: buildSystemPrompt(vocab, hanziList),
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
