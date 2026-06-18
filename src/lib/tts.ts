// Client TTS helper. Hits /api/tts (Lovable AI gateway → openai/gpt-4o-mini-tts)
// and caches the resulting audio per text so repeated plays don't re-bill.

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let currentAudio: HTMLAudioElement | null = null;

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
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    const url = await getAudioUrl(clean);
    const audio = new Audio(url);
    currentAudio = audio;
    await audio.play().catch(() => {});
  } catch {
    // swallow — TTS is a nice-to-have
  }
}

/** Optional: preload audio for a text without playing. */
export function preloadZh(text: string): void {
  const clean = text?.trim();
  if (!clean) return;
  getAudioUrl(clean).catch(() => {});
}
