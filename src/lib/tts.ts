// Client TTS helper. Hits /api/tts (Lovable AI gateway → openai/gpt-4o-mini-tts)
// and caches the resulting audio per text so repeated plays don't re-bill.

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let currentAudio: HTMLAudioElement | null = null;

function getAudioElement(): HTMLAudioElement {
  if (!currentAudio) {
    currentAudio = new Audio();
    currentAudio.preload = "auto";
  }
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
  try {
    const audio = getAudioElement();
    audio.pause();
    const url = await getAudioUrl(clean);
    audio.src = url;
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
