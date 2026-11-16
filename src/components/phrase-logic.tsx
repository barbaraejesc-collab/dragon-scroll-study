import { getPhraseLogic } from "@/lib/phrase-logic";

export function PhraseLogicView({ id, hanzi }: { id: string; hanzi: string }) {
  const logic = getPhraseLogic(id, hanzi);
  if (!logic) return null;

  return (
    <div className="w-full text-left space-y-5 border-t border-accent/30 pt-5">
      <section aria-label="Ao pé da letra">
        <h3 className="text-xs text-accent font-semibold mb-3">Ao pé da letra</h3>
        <ol className="flex flex-wrap gap-x-4 gap-y-3">
          {logic.segments.map((segment, index) => (
            <li key={`${index}-${segment.hanzi}`} className="flex flex-col max-w-full gap-1 border-b border-accent/20 pb-2">
              <span lang="zh-CN" className="font-hanzi text-lg text-accent break-words">{segment.hanzi}</span>
              <span className="text-sm leading-relaxed text-cream break-words">{segment.gloss}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Estrutura gramatical">
        <h3 className="text-xs text-accent font-semibold mb-2">Estrutura gramatical</h3>
        <p className="text-sm leading-relaxed text-cream/90 break-words">{logic.structure}</p>
      </section>
    </div>
  );
}