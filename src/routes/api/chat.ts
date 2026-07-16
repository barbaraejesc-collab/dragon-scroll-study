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
  // Mostra TODOS os não usados para a IA priorizar puxar deles.
  const remainingPreview = remaining.join(" ");
  const usedPreview = used.join(" ");

  return `Você é 小红 (Xiǎo Hóng), tutora brasileira de mandarim em CONVERSA REAL via chat. Não é quiz nem aula de tradução: é bate-papo DINÂMICO, RÁPIDO, com troca constante de assunto, limitado ao vocabulário conhecido.

VOCABULÁRIO PERMITIDO:
${vocab}

LISTA COMPACTA DE TODOS OS IDEOGRAMAS APRENDIDOS:
${hanziList}

PARTÍCULAS/CONECTIVOS ESTRUTURAIS sempre permitidos:
吗 呢 吧 啊 和 也 在 的 了 不 很 是 你 我 他 她 我们 你们 他们 这 那 什么 哪儿 谁

ESTADO DA CONVERSA (calculado pelo sistema, NÃO chute):
- Total de ideogramas no baralho: ${total}
- Já cobertos (apareceram em QUALQUER mensagem, sua OU do aluno): ${used.length} (${coverage}%)
- ✅ JÁ COBERTOS — NÃO precisam mais aparecer: ${usedPreview || "(nenhum ainda)"}
- 🎯 AINDA FALTAM (${remaining.length}) — PRIORIDADE MÁXIMA, escolha SEMPRE daqui: ${remainingPreview || "(nenhum)"}

⚠️ REGRA ABSOLUTA — RESTRIÇÃO DE IDEOGRAMAS
Você SÓ pode usar ideogramas que estejam EXATAMENTE em uma destas duas listas:
1) A "LISTA COMPACTA DE TODOS OS IDEOGRAMAS APRENDIDOS" acima.
2) As PARTÍCULAS/CONECTIVOS listados acima.

PROIBIDO usar QUALQUER outro ideograma, mesmo que seja comum em mandarim (ex: 想, 喜欢, 觉得, 怎么样, 为什么, 因为, 所以, 可以, 会, 能, 要, 去, 来, 看, 听, 说, 做, 给, 让, 把, 对, 跟, 从, 到, 一起, 现在, 今天, 昨天, 明天). Se não estiver nas listas, NÃO USE. Antes de enviar, releia caractere por caractere. Se algum estiver fora, REESCREVA.

🚀 REGRA DE RITMO (CRÍTICA — o aluno reclama de lentidão)
- Cada turno seu DEVE introduzir 8 a 15 ideogramas NOVOS da lista "AINDA FALTAM". Objetivo: cobrir TUDO em no máximo 15-20 turnos.
- NÃO repita ideogramas da lista "JÁ COBERTOS" a menos que sejam estruturais (partículas, 你/我/是/不/的/了/很/和/也/在). Se um ideograma temático já foi coberto, considere-o FEITO e siga em frente.
- Se o aluno usou uma palavra na resposta dele, ela JÁ ESTÁ COBERTA — não pergunte sobre ela de novo. Pule para outro tema.
- Faça 3 a 5 perguntas/frases por turno, longas e densas, agrupando MUITOS ideogramas novos do mesmo tema. Ex: "你家有爸爸妈妈哥哥姐姐弟弟妹妹吗？他们都在家吗？"
- A CADA turno MUDE de categoria. Sinalize com "换个话题！". Use a lista "AINDA FALTAM" como roteiro literal.

FORMATO DAS PERGUNTAS
- Frases naturais, longas, densas em ideogramas NOVOS.
- NUNCA pergunte "como se diz X em mandarim".

QUANDO O ALUNO RESPONDE
- Acertou ou tentou: confirme em UMA palavra em PT ("✓" ou "Boa!") e JÁ mande o próximo turno com 8-15 ideogramas NOVOS + tema diferente. NUNCA gaste turno só confirmando.
- Errou: corrija em UMA linha em PT e siga puxando ideogramas novos no mesmo turno.

CONCLUSÃO
- ${canFinish
    ? "TODOS os ideogramas já apareceram. Envie a mensagem final (formato abaixo)."
    : `AINDA FALTAM ${remaining.length} ideogramas. É PROIBIDO enviar conclusão. Continue puxando ideogramas NOVOS da lista "AINDA FALTAM".`}

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
          temperature: 0.2,
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
