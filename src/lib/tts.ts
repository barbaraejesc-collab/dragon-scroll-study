// Client TTS helper. Hits /api/tts (Lovable AI gateway → openai/gpt-4o-mini-tts)
// and caches the resulting audio per text so repeated plays don't re-bill.

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let currentAudio: HTMLAudioElement | null = null;

const VOLUME_KEY = "tts-volume";
let volume = 1;

if (typeof window !== "undefined") {
  const raw = window.localStorage.getItem(VOLUME_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) volume = parsed;
}

export function getTtsVolume(): number {
  return volume;
}

export function setTtsVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
  if (currentAudio) currentAudio.volume = volume;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* ignore */
    }
  }
}

function getAudioElement(): HTMLAudioElement {
  if (!currentAudio) {
    currentAudio = new Audio();
    currentAudio.preload = "auto";
  }
  currentAudio.volume = volume;
  return currentAudio;
}

/** Unlock media playback during a user gesture so subsequent automatic cards work on mobile. */
export function unlockTts(): void {
  if (typeof window === "undefined") return;
  const audio = getAudioElement();
  if (audio.src) return;
  audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";
  void audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
  }).catch(() => {});
}

function speakWithDeviceVoice(text: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.8;
  utterance.volume = volume;
  window.speechSynthesis.speak(utterance);
}

async function getAudioUrl(text: string): Promise<string> {
  const cached = blobUrlCache.get(text);
  if (cached) return cached;
  const pending = inflight.get(text);
  if (pending) return pending;

  const p = (async () => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(text, url);
    return url;
  })();
  inflight.set(text, p);
  try {
    return await p;
  } finally {
    inflight.delete(text);
  }
}

/** Speak a Chinese string. Cancels any currently-playing TTS first. */
export async function speakZh(text: string): Promise<void> {
  if (typeof window === "undefined") return;
  const clean = text?.trim();
  if (!clean) return;
  if (volume === 0) return;
  try {
    const audio = getAudioElement();
    audio.pause();
    const url = await getAudioUrl(clean);
    audio.src = url;
    audio.volume = volume;
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Keep pronunciation available if the professional voice is blocked or unavailable.
    speakWithDeviceVoice(clean);
  }
}

/** Optional: preload audio for a text without playing. */
export function preloadZh(text: string): void {
  const clean = text?.trim();
  if (!clean) return;
  getAudioUrl(clean).catch(() => {});
}

export function isPreloaded(text: string): boolean {
  return blobUrlCache.has(text.trim());
}

let prefetchToken = 0;

/**
 * Warm the whole session in the background: current card first, then the next 5,
 * then everything else — sequential so we don't hammer a weak connection.
 */
export function prefetchSession(texts: string[], startIndex = 0): () => void {
  if (typeof window === "undefined") return () => {};
  const token = ++prefetchToken;
  const ordered = [
    ...texts.slice(startIndex, startIndex + 6),
    ...texts.slice(startIndex + 6),
    ...texts.slice(0, startIndex),
  ].filter(Boolean);

  void (async () => {
    for (const text of ordered) {
      if (token !== prefetchToken) return;
      if (isPreloaded(text)) continue;
      try {
        await getAudioUrl(text);
      } catch {
        // Offline or throttled: back off a bit and keep going.
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();

  return () => {
    if (token === prefetchToken) prefetchToken++;
  };
}
