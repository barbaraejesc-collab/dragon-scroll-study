import explanations from "@/data/phrase-logic.json";

export type PhraseLogic = {
  hanzi: string;
  segments: { hanzi: string; gloss: string }[];
  structure: string;
};

const byId: Record<string, PhraseLogic> = explanations;

// Never show stale explanations after an in-place phrase correction.
export function getPhraseLogic(id: string, hanzi: string): PhraseLogic | undefined {
  const entry = byId[id];
  return entry?.hanzi === hanzi ? entry : undefined;
}