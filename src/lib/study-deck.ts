type StudyCard = { id: string; is_active?: boolean };

// Existing rounds retain their exact order and index, even after vocabulary additions or retirement.
export function canResumeStudyQueue(cards: StudyCard[], queue: string[]): boolean {
  const ids = new Set(cards.map((card) => card.id));
  return queue.length > 0 && new Set(queue).size === queue.length && queue.every((id) => ids.has(id));
}

export function activeStudyCards<T extends StudyCard>(cards: T[]): T[] {
  return cards.filter((card) => card.is_active !== false);
}