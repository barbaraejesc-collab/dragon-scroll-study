// Offline support: cache the current session (cards + index) and queue progress
// writes so studying keeps working on a weak/absent connection.

export type OfflineCard = {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  category?: string;
  semester?: number;
};

type CachedSession = {
  cards: OfflineCard[];
  queue: string[];
  index: number;
  savedAt: number;
};

type PendingProgress = {
  user_id: string;
  card_id: string;
  correct_count: number;
  wrong_count: number;
  last_seen_at: string;
  updated_at: string;
};

const SESSION_PREFIX = "offline-session:";
const PENDING_KEY = "offline-pending-progress";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function saveOfflineSession(
  scope: string,
  cards: OfflineCard[],
  queue: string[],
  index: number,
) {
  write(SESSION_PREFIX + scope, { cards, queue, index, savedAt: Date.now() } satisfies CachedSession);
}

export function saveOfflineIndex(scope: string, index: number) {
  const cached = read<CachedSession>(SESSION_PREFIX + scope);
  if (!cached) return;
  write(SESSION_PREFIX + scope, { ...cached, index });
}

export function loadOfflineSession(scope: string): CachedSession | null {
  return read<CachedSession>(SESSION_PREFIX + scope);
}

/** Store a progress row locally so it can be pushed once the connection is back. */
export function queueProgress(row: PendingProgress) {
  const pending = read<PendingProgress[]>(PENDING_KEY) ?? [];
  const rest = pending.filter((p) => !(p.user_id === row.user_id && p.card_id === row.card_id));
  write(PENDING_KEY, [...rest, row]);
}

export function takePendingProgress(): PendingProgress[] {
  const pending = read<PendingProgress[]>(PENDING_KEY) ?? [];
  if (pending.length) write(PENDING_KEY, []);
  return pending;
}

export function restorePendingProgress(rows: PendingProgress[]) {
  if (!rows.length) return;
  const pending = read<PendingProgress[]>(PENDING_KEY) ?? [];
  write(PENDING_KEY, [...rows, ...pending]);
}
