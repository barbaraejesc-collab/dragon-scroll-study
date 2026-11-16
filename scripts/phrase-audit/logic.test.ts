import { describe, expect, test } from 'bun:test';
import audit from './phrases.json';
import logic from '../../src/data/phrase-logic.json';
import { getPhraseLogic } from '../../src/lib/phrase-logic';

const entries: Record<string, { hanzi: string; segments: { hanzi: string; gloss: string }[]; structure: string }> = logic;
const hanziOnly = (text: string) => text.replace(/[^\u3400-\u9fff]/g, '');

describe('Literal phrase explanations', () => {
  test('covers every existing phrase in its original word order', () => {
    expect(Object.keys(entries)).toHaveLength(116);
    for (const phrase of audit.phrases) {
      const item = entries[phrase.id];
      expect(item?.hanzi).toBe(phrase.hanzi);
      expect(hanziOnly(item.segments.map((s) => s.hanzi).join(''))).toBe(hanziOnly(phrase.hanzi));
      expect(item.segments.every((s) => audit.learnedWords.includes(s.hanzi))).toBe(true);
      expect(item.segments.every((s) => s.gloss.length > 0)).toBe(true);
      expect(item.structure.length).toBeGreaterThan(10);
    }
  });

  test('distinguishes the two learned uses of 只', () => {
    const only = entries['bd4a6b36-7dcf-47df-a297-376357bd68bc'];
    const classifier = entries['35f2d984-a5f4-44e1-b722-301d0c5bbb53'];
    expect(only.segments.find((s) => s.hanzi === '只')?.gloss).toBe('apenas (zhǐ)');
    expect(classifier.segments.find((s) => s.hanzi === '只')?.gloss).toBe('classificador de animais (zhī)');
  });

  test('keeps learned compounds intact in explanations', () => {
    const segments = Object.values(entries).flatMap((e) => e.segments.map((s) => s.hanzi));
    for (const word of ['恐怕', '学习', '学生', '天气', '开车', '蛋糕']) {
      expect(segments.includes(word)).toBe(true);
    }
    expect(segments.includes('怕')).toBe(false);
  });

  test('does not attach stale explanations to a corrected phrase', () => {
    expect(getPhraseLogic('bd4a6b36-7dcf-47df-a297-376357bd68bc', '我只喝茶。')?.segments).toHaveLength(4);
    expect(getPhraseLogic('bd4a6b36-7dcf-47df-a297-376357bd68bc', '我只喝水。')).toBeUndefined();
  });
});