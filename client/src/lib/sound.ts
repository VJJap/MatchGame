import { useSyncExternalStore } from 'react';
import { loadMuted, saveMuted } from './storage';

// Tiny synthesized sound effects (Web Audio) — no audio files needed.

type Wave = OscillatorType;
let ctx: AudioContext | null = null;
let muted = loadMuted();
const subs = new Set<() => void>();

/** Must run inside a user gesture at least once (mobile Safari requirement). */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

function tone(freq: number, at: number, dur: number, type: Wave = 'sine', gain = 0.16, toFreq?: number): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  tick: () => tone(660, 0, 0.16, 'sine', 0.2),
  ready: () => {
    tone(520, 0, 0.09, 'triangle', 0.14);
    tone(780, 0.07, 0.12, 'triangle', 0.14);
  },
  join: () => {
    tone(587, 0, 0.14, 'sine', 0.14);
    tone(880, 0.12, 0.2, 'sine', 0.14);
  },
  match: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.32, 'triangle', 0.18));
    tone(1319, 0.42, 0.5, 'sine', 0.12);
  },
  mismatch: () => {
    tone(392, 0, 0.18, 'triangle', 0.16);
    tone(294, 0.16, 0.3, 'triangle', 0.16);
  },
  timeout: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.09, 180);
    tone(180, 0.2, 0.32, 'sawtooth', 0.09, 120);
  },
  // ---- MatchCharacter (quiz show) ----
  buzzer: () => {
    tone(880, 0, 0.12, 'square', 0.1);
    tone(660, 0.1, 0.12, 'square', 0.1);
    tone(990, 0.2, 0.28, 'square', 0.1);
  },
  whoosh: () => tone(300, 0, 0.35, 'sine', 0.12, 1200),
  agree: () => {
    tone(784, 0, 0.14, 'triangle', 0.16);
    tone(1175, 0.12, 0.3, 'triangle', 0.16);
  },
  wrong: () => {
    tone(196, 0, 0.22, 'sawtooth', 0.09);
    tone(147, 0.2, 0.36, 'sawtooth', 0.09);
  },
  point: () => {
    [988, 1319].forEach((f, i) => tone(f, i * 0.08, 0.22, 'square', 0.07));
  },
  fanfare: () => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.7 : 0.18, 'triangle', 0.17));
  },
};

export function setMuted(m: boolean): void {
  muted = m;
  saveMuted(m);
  if (!m) unlockAudio();
  subs.forEach((f) => f());
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => muted,
  );
}
