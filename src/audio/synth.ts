/**
 * Soft sounds made with the Web Audio API (a pentatonic scale). No audio files.
 * Silent unless the sound setting is on. The AudioContext is created on first use, after a tap.
 */
import { getSettings } from '../app/settings';

// C major pentatonic from C5: C D E G A, then the next octave.
const BASE = 523.25;
const STEPS = [0, 2, 4, 7, 9];
const freq = (n: number) => BASE * 2 ** ((STEPS[n % 5] + 12 * Math.floor(n / 5)) / 12);

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!getSettings().sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(ac: AudioContext, f: number, at: number, dur = 0.5, vol = 0.12): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = f;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** One soft note; `step` climbs the pentatonic scale (used for each correct star). */
export function playNote(step: number): void {
  const ac = audio();
  if (ac) tone(ac, freq(step), ac.currentTime);
}

/** A short, calm melody for a lit constellation. */
export function playMelody(): void {
  const ac = audio();
  if (!ac) return;
  [0, 2, 4, 7].forEach((n, i) => tone(ac, freq(n), ac.currentTime + i * 0.16, 0.7, 0.1));
}
