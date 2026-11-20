/**
 * Typed answers, shared by the generated-content games. Pure functions (tested).
 * - "ok": the same text (case and spacing ignored);
 * - "near": the same letters except accent marks, ü or ñ (accents are near misses, not errors: "¡Casi!");
 * - "wrong": anything else.
 * The near-miss window: a game lets the learner fix a near miss straight away, without it counting as a mistake.
 */
import { bare, nearMiss, nearMissText } from '../../lang/es/accents.ts';

export type Verdict = 'ok' | 'near' | 'wrong';
export interface Checked { verdict: Verdict; /** the expected answer that matched best */ expected: string; /** Spanish note for a near miss */ note?: string }

/** Lower case, single spaces, no spaces around the ends; keeps accents. */
export const tidy = (s: string): string => s.normalize('NFC').toLocaleLowerCase('es').replace(/[\s ]+/g, ' ').trim();
/** Without accent marks, ü or ñ (for comparing near misses). */
export const fold = (s: string): string => [...tidy(s)].map(bare).join('');

/** Checks a typed answer against one or more accepted answers (the first is the one shown when wrong). */
export function checkAnswer(typed: string, accepted: string | string[]): Checked {
  const list = (Array.isArray(accepted) ? accepted : [accepted]).filter(Boolean);
  const t = tidy(typed);
  for (const a of list) if (t === tidy(a)) return { verdict: 'ok', expected: a };
  for (const a of list) {
    if (fold(t) !== fold(a) || t.length !== tidy(a).length) continue;
    const ta = [...t], aa = [...tidy(a)];
    const i = ta.findIndex((c, k) => c !== aa[k]);
    const kind = i >= 0 ? nearMiss(ta[i], aa[i]) : null;
    return { verdict: 'near', expected: a, note: kind ? nearMissText(kind, aa[i]) : '¡Casi!' };
  }
  return { verdict: 'wrong', expected: list[0] ?? '' };
}

/** Seeded random numbers (mulberry32), so a round can be repeated in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(xs: readonly T[], r: () => number): T => xs[Math.floor(r() * xs.length)];
export function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const randInt = (lo: number, hi: number, r: () => number): number => lo + Math.floor(r() * (hi - lo + 1));

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: string): number => LEVELS.indexOf(l as Level);
/** Levels up to and including `l` (A2 -> A1, A2). */
export const levelsUpTo = (l: Level): Level[] => LEVELS.slice(0, levelRank(l) + 1) as Level[];

/** Stars for a round: one per item right first time (a fixed near miss counts), plus a bonus for finishing. */
export function roundStars(firstTry: number, finished: boolean, bonus: number): number {
  return Math.max(0, firstTry) + (finished ? bonus : 0);
}
