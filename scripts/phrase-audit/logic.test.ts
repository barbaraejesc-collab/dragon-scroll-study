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
      expect(item.segments.every((s) => audit.learnedWords.includes(s.hanzi) || audit.numeralUnits.some((unit) => unit.hanzi === s.hanzi))).toBe(true);
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

  test('keeps 多少 together as quanto/quantos in both price questions', () => {
    for (const id of ['adeafe26-402a-4e62-aa2a-484d71a71ad0', 'de12861b-40b3-4c2e-bec6-8ce93a0466df']) {
      expect(entries[id].segments.find((s) => s.hanzi === '多少')?.gloss).toBe('quanto/quantos');
      expect(entries[id].segments.some((s) => s.hanzi === '少')).toBe(false);
    }
  });

  test('keeps 多大 together with its age-question sense', () => {
    expect(entries['a22276f2-9aec-452a-9ab0-34ecc00dd1b9'].segments.find((s) => s.hanzi === '多大')?.gloss).toBe('que idade');
  });

  for (const [id, hanzi, gloss] of [
    ['a534ba1d-5c60-4877-af20-bbf897b57b47', '十二', '12 / doze'],
    ['a22276f2-9aec-452a-9ab0-34ecc00dd1b9', '七十九', '79 / setenta e nove'],
    ['14e5a9da-33b6-47c1-8ec1-d5f572333e0e', '一九九八', '1998'],
    ['14e5a9da-33b6-47c1-8ec1-d5f572333e0e', '十四', '14 / quatorze'],
  ]) {
    test(`keeps the numeral ${hanzi} as one unit with its value`, () => {
      expect(entries[id].segments.find((s) => s.hanzi === hanzi)?.gloss).toBe(gloss);
    });
  }

  test('uses the reviewed segmentation fixture for every explanation', () => {
    for (const phrase of audit.phrases) {
      expect(entries[phrase.id].segments.map((s) => s.hanzi)).toEqual(phrase.tokens);
    }
  });

  test('never splits a learned compound across consecutive explanation segments', () => {
    const words = new Set(audit.learnedWords.filter((word) => /^[\u3400-\u9fff]{2,}$/.test(word)));
    for (const entry of Object.values(entries)) {
      for (let start = 0; start < entry.segments.length; start++) {
        for (let end = start + 2; end <= entry.segments.length; end++) {
          const text = entry.segments.slice(start, end).map((s) => s.hanzi).join('');
          if (entry.hanzi.includes(text)) expect(words.has(text)).toBe(false);
        }
      }
    }
  });
});