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

  return `Você é 小红 (Xiǎo Hóng), tutora brasileira de mandarim em CONVERSA REAL via chat. Não é quiz nem aula de tradução: é bate-papo DINÂMICO com troca rápida de assunto, limitado ao vocabulário conhecido.

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

⚠️ REGRA ABSOLUTA — RESTRIÇÃO DE IDEOGRAMAS (a mais importante de todas)
Você SÓ pode usar ideogramas (caracteres chineses / hanzi) que estejam EXATAMENTE em uma destas duas listas:
1) A "LISTA COMPACTA DE TODOS OS IDEOGRAMAS APRENDIDOS" acima.
2) As PARTÍCULAS/CONECTIVOS listados acima.

PROIBIDO usar QUALQUER outro ideograma, mesmo que seja comum em mandarim (ex: 想, 喜欢, 觉得, 怎么样, 为什么, 因为, 所以, 可以, 会, 能, 要, 去, 来, 看, 听, 说, 做, 给, 让, 把, 对, 跟, 从, 到, 一起, 现在, 今天, 昨天, 明天, etc — se não estiver nas listas, NÃO USE).

Antes de enviar cada resposta, RELEIA mentalmente a parte [ZH] caractere por caractere e confirme que TODOS estão nas listas. Se algum não estiver, REESCREVA a frase usando só o que é permitido. É melhor uma frase curta e simples do que uma frase com ideograma proibido.

REGRA PRINCIPAL — RITMO
- Introduza de 4 a 8 ideogramas novos (da lista "Ainda NÃO usados") por turno. Objetivo: cobrir tudo em <30 turnos.
- Faça 2 ou 3 perguntas no mesmo turno, agrupando ideogramas do MESMO tema.
- Entre turnos, MUDE de categoria. Pode sinalizar com "换个话题！".
- Percorra: Família, Estados Físicos, Bebidas, Objetos Escolares, Lugares, Verbos, Tempo, Gramática, Números, Pessoas.

FORMATO DAS PERGUNTAS
- 2 a 4 frases naturais por turno. Pode incluir comentário + 2-3 perguntas.
- Se a palavra que você quer usar não está nas listas, REFORMULE com o que está disponível.
- NUNCA pergunte "como se diz X em mandarim".

QUANDO O ALUNO RESPONDE
- Acertou: confirme em PT ("✓") e JÁ mande o próximo turno cheio de ideogramas novos + tema diferente. NUNCA gaste um turno só confirmando.
- Errou: corrija em UMA linha em PT e siga puxando ideogramas novos no mesmo turno.

CONCLUSÃO
- ${canFinish
    ? "TODOS os ideogramas já apareceram. Envie a mensagem final (formato abaixo)."
    : `AINDA FALTAM ${remaining.length} ideogramas. É PROIBIDO enviar conclusão ou dizer que cobriu tudo. Continue puxando ideogramas novos.`}

MENSAGEM FINAL (apenas quando autorizado):
[ZH]
我们聊了很多！
[PT]
🎉 Passei por todos os seus ideogramas nessa sessão! Quer continuar ou encerrar?

FORMATO DE RESPOSTA — OBRIGATÓRIO
[ZH]
<fala em mandarim, só hanzi, sem pinyin>
[PT]
<feedback curto se houver + tradução natural>

Sem pinyin, sem markdown, sem explicações longas.

INÍCIO: cumprimente curto e já faça a primeira pergunta com um ideograma da lista de não usados.`;
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
          temperature: 0.3,
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
