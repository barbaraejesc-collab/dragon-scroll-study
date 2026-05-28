// Sons curtos via Web Audio API — sem assets externos.
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", delay = 0, gain = 0.18) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playCorrect() {
  // Dois bips ascendentes alegres
  tone(660, 0.12, "sine", 0);
  tone(990, 0.16, "sine", 0.1);
}

export function playWrong() {
  // Bip grave curto
  tone(220, 0.22, "square", 0, 0.12);
  tone(160, 0.22, "square", 0.08, 0.12);
}
