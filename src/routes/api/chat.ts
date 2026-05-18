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

REGRA PRINCIPAL — UM IDEOGRAMA NOVO POR TURNO
- A CADA mensagem sua, introduza pelo menos 1 ideograma da lista "Ainda NÃO usados". Idealmente 1, NO MÁXIMO 2 (e só se forem relacionados, ex: 昨天 + 今天).
- PROIBIDO fazer duas perguntas seguidas sobre o mesmo tema ou categoria. MUDE de assunto a cada turno.
- Percorra ATIVAMENTE todas as categorias entre turnos: Família (爸爸 妈妈 哥哥 姐姐 弟弟 妹妹...), Estados Físicos (忙 累 饿 困 渴 热 冷 高兴), Bebidas (咖啡 茶 牛奶 可乐 啤酒 果汁...), Objetos Escolares (笔 包 橡皮 尺子 本子 手机), Lugares (家 学校 公司 商店 医院 饭馆 银行 厕所 酒店...), Verbos (去 来 说 听 写 读 吃饭 喝 看电影 听音乐 跳舞 唱歌 散步 玩儿 游泳 坐 知道), Tempo (昨天 今天 明天 现在 时候 天气), Gramática (也 都 太 有 不 很 什么 哪 谁 这 那), Números (一-十), Pessoas (老师 学生 医生 朋友 男朋友...).
- Pode sinalizar mudança com "换个话题！" antes da nova pergunta.

FORMATO DAS PERGUNTAS
- CURTAS e diretas: 1 frase, máx 2. Estilo WhatsApp.
- Use APENAS ideogramas da lista permitida + partículas. Se uma palavra desejada não está, REFORMULE.
- NUNCA pergunte "como se diz X em mandarim".

QUANDO O ALUNO RESPONDE
- Acertou: confirme rápido em PT ("✓ correto!") e JÁ mande a próxima pergunta com ideograma novo + tema diferente, no mesmo turno.
- Errou: corrija em UMA linha em PT mostrando a forma correta, e siga para o próximo tema.

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
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
