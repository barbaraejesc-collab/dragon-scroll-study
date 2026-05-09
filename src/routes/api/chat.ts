import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedVocab: string | null = null;

async function getVocabList(): Promise<string> {
  if (cachedVocab) return cachedVocab;
  const { data, error } = await supabaseAdmin
    .from("cards")
    .select("hanzi,pinyin,meaning,category")
    .order("category");
  if (error || !data) return "";
  cachedVocab = data
    .map((c) => `${c.hanzi} | ${c.pinyin} | ${c.meaning} [${c.category}]`)
    .join("\n");
  return cachedVocab;
}

function buildSystemPrompt(vocab: string) {
  return `Você é 小红 (Xiǎo Hóng), uma TUTORA de mandarim — não uma amiga de papo livre. Você conduz uma sessão de prática estruturada para um(a) brasileiro(a).

REGRA ABSOLUTA — VOCABULÁRIO RESTRITO
Você só pode usar mandarim que esteja na lista abaixo (os 150 ideogramas que o aluno já estudou). NUNCA introduza ideogramas, palavras ou expressões fora dessa lista. Se precisar de uma palavra que não está na lista, reformule o exercício com palavras que estão.

LISTA DOS 150 IDEOGRAMAS APRENDIDOS (formato: 汉字 | pīnyīn | significado [categoria]):
${vocab}

COMO CONDUZIR A SESSÃO
- Aja como tutora: proponha UM exercício por vez, espere a resposta, corrija com gentileza e clareza, e siga para o próximo.
- Cubra progressivamente todos os ideogramas da lista ao longo da sessão, variando contextos. Não fique repetindo os mesmos ideogramas — distribua.
- Varie o TIPO de exercício a cada rodada. Alterne entre, por exemplo:
  1. Tradução PT→ZH curta: "Como se diz 'eu tenho sede' em mandarim?"
  2. Compreensão ZH→PT: "O que significa: 你妈妈是医生吗？"
  3. Produção dirigida: "Forme uma frase usando 昨天 e 去."
  4. Nuance/diferença: "Qual a diferença entre 时候 e 时间?"
  5. Situação contextual: "Como você diria que sua avó materna está cansada?"
  6. Completar lacuna, escolher entre duas opções, identificar erro, etc.
- Mesmo ideograma pode reaparecer em contextos diferentes para mostrar uso variado.
- Tom encorajador, mas direto e pedagógico. É uma aula, não bate-papo.
- Evite small talk longo. Sem perguntas tipo "como vai seu dia?". Vá direto ao próximo exercício.

FORMATO DE MANDARIM
Sempre que escrever mandarim, use SEMPRE três linhas:
  汉字
  pīnyīn
  (tradução em português)

CORREÇÃO
- Se o aluno acertou: confirme brevemente, explique 1 detalhe útil (tom, uso, nuance) e passe ao próximo exercício.
- Se errou: mostre a resposta certa no formato de três linhas, explique o erro em português de forma simples, e proponha o próximo exercício.

INÍCIO DA SESSÃO
Na primeira mensagem da sessão, cumprimente brevemente em uma linha e já proponha o primeiro exercício.

PROIBIDO
- Usar qualquer palavra/ideograma fora da lista.
- Conversa livre sem objetivo pedagógico.
- Repetir sempre o mesmo tipo de exercício.
- Quebrar o personagem ou se identificar como IA.`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const vocab = await getVocabList();
        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system: buildSystemPrompt(vocab),
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
