import { expect, test } from 'bun:test';
import { activeStudyCards, canResumeStudyQueue } from '../../src/lib/study-deck';

test('adding vocabulary preserves the saved queue of an existing round', () => {
  expect(canResumeStudyQueue([{ id: 'a' }, { id: 'b' }, { id: 'new' }], ['b', 'a'])).toBe(true);
});
test('retired phrases stay available to saved rounds but not new rounds', () => {
  const cards = [{ id: 'old', is_active: false }, { id: 'new', is_active: true }];
  expect(canResumeStudyQueue(cards, ['old'])).toBe(true);
  expect(activeStudyCards(cards).map((c) => c.id)).toEqual(['new']);
});
test('missing cards and duplicate IDs cannot resume a corrupt saved round', () => {
  expect(canResumeStudyQueue([{ id: 'a' }], ['missing'])).toBe(false);
  expect(canResumeStudyQueue([{ id: 'a' }], ['a', 'a'])).toBe(false);
});