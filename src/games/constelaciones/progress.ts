/**
 * Progress: which constellations are lit, and when each is due for review (Constelación fantasma).
 * No streaks, no penalties, no notifications. Hints are recorded, never penalised.
 */
import { store } from '../../data/storage';
import schedule from './schedule.json';

export const REVIEW_DAYS: number[] = schedule.reviewDays;
export const DAY = 86_400_000;

export interface Entry { firstAt: number; step: number; due: number | null; reviews: number; hints: number }
interface Progress { cleared: Record<string, Entry> }

const KEY = 'cz.progress';
const read = (): Progress => { const p = store.get<Partial<Progress>>(KEY, {}); return { cleared: p.cleared ?? {} }; };
const write = (p: Progress) => store.set(KEY, p);

export const entry = (id: string): Entry | undefined => read().cleared[id];
export const isCleared = (id: string): boolean => !!entry(id);
export const clearedIds = (): string[] => Object.keys(read().cleared);

export function isDue(id: string, now = Date.now()): boolean {
  const e = entry(id);
  return !!e && e.due !== null && e.due <= now;
}

/** First time a constellation is lit: due again after REVIEW_DAYS[0] days. Replays change nothing. */
export function markCleared(id: string, now = Date.now()): Entry {
  const p = read();
  p.cleared[id] ??= { firstAt: now, step: 0, due: now + REVIEW_DAYS[0] * DAY, reviews: 0, hints: 0 };
  write(p);
  return p.cleared[id];
}

/** A finished review moves to the next interval, whatever hints were used. */
export function markReviewed(id: string, hintsUsed: number, now = Date.now()): Entry | undefined {
  const p = read();
  const e = p.cleared[id];
  if (!e) return undefined;
  e.step += 1;
  e.reviews += 1;
  e.hints += hintsUsed;
  e.due = e.step < REVIEW_DAYS.length ? now + REVIEW_DAYS[e.step] * DAY : null;
  write(p);
  return e;
}
