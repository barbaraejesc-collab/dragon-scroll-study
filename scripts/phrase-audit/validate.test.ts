import { describe, expect, test } from 'bun:test';
import audit from './phrases.json';

const hanziOnly = (text: string) => text.replace(/[^\u3400-\u9fff]/g, '');
const learned = new Set(audit.learnedWords);

describe('Phrase vocabulary audit', () => {
  test('keeps the original 84 phrases and three additions distinct', () => {
    expect(audit.phrases).toHaveLength(94);
    expect(new Set(audit.phrases.map((phrase) => phrase.id)).size).toBe(94);
  });

  for (const word of ['颜色', '耐心', '事儿']) {
    test(`includes the newly learned complete word ${word} in a phrase`, () => {
      expect(learned.has(word)).toBe(true);
      expect(audit.phrases.some((phrase) => phrase.tokens.includes(word))).toBe(true);
    });
  }

  test('practices 家 as a classifier for a commercial establishment', () => {
    const phrase = audit.phrases.find((item) => item.id === '335ca943-5a14-42f0-b1af-5869a7f903e7');
    expect(phrase?.tokens.slice(0, 3)).toEqual(['这', '家', '商店']);
  });

  for (const phrase of audit.phrases) {
    test(`uses complete learned words: ${phrase.id}`, () => {
      expect(phrase.tokens.every((word) => learned.has(word))).toBe(true);
      expect(hanziOnly(phrase.tokens.join(''))).toBe(hanziOnly(phrase.hanzi));
      for (const word of audit.forbiddenLexicalCompounds) {
        expect(phrase.hanzi.includes(word)).toBe(false);
      }
    });
  }

  test('does not authorize 大家 from 大 and 家', () => {
    expect(learned.has('大')).toBe(true);
    expect(learned.has('家')).toBe(true);
    expect(learned.has('大家')).toBe(false);
    expect(audit.phrases.some((phrase) => phrase.hanzi.includes('大家'))).toBe(false);
  });

  test('does not extract 怕 from 恐怕', () => {
    expect(learned.has('恐怕')).toBe(true);
    expect(learned.has('怕')).toBe(false);
    expect(audit.phrases.flatMap((phrase) => phrase.tokens).includes('怕')).toBe(false);
  });

  test('allows 教 and 教授 separately, and confirmed 学习', () => {
    for (const word of ['教', '教授', '学习']) expect(learned.has(word)).toBe(true);
    expect(audit.phrases.some((phrase) => phrase.tokens.includes('学习'))).toBe(true);
  });
});