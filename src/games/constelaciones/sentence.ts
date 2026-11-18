/**
 * Pure sentence logic for Constelaciones (no DOM, no imports), shared by the game,
 * the validator (tools/validate-constelaciones.ts) and the tests.
 */
export interface Accent { index: number; options: string[]; correct: string }
export interface Constellation {
  id: string;
  level: Level;
  topic?: string;
  story: { id: string; part: number } | null;
  text: string;
  tokens: string[];
  orders: number[][];
  proper: number[];
  open: string;
  close: string;
  commas: number[];
  accents: Accent[];
  en: string;
  ru: string;
  image?: string;
  audio?: string | null;
  reviewed: boolean;
}
export interface Story {
  id: string; title_es: string; level: Level; constellations: string[]; image: string; reviewed: boolean;
  /** parts after which the finished story starts a new paragraph */
  breaks?: number[];
}
export interface ConstellationData { constellations: Constellation[]; stories: Story[] }

/** All data files merged into one set. */
export function mergeData(files: Partial<ConstellationData>[]): ConstellationData {
  return { constellations: files.flatMap((f) => f.constellations ?? []), stories: files.flatMap((f) => f.stories ?? []) };
}

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

export const capitalize = (w: string): string => (w ? w.charAt(0).toLocaleUpperCase('es') + w.slice(1) : w);

/* ---------- Order checking ---------- */

/** True when `seq` (token indexes tapped so far) is the start of at least one accepted order. */
export function isPrefixOfAnyOrder(c: Pick<Constellation, 'orders'>, seq: number[]): boolean {
  return c.orders.some((o) => seq.length <= o.length && seq.every((t, i) => o[i] === t));
}

/** The full accepted order that `seq` equals, or null. */
export function matchedOrder(c: Pick<Constellation, 'orders'>, seq: number[]): number[] | null {
  return c.orders.find((o) => o.length === seq.length && o.every((t, i) => seq[i] === t)) ?? null;
}

/** The next token that keeps `seq` on an accepted order (for "Pista"), or null. */
export function nextHint(c: Pick<Constellation, 'orders'>, seq: number[]): number | null {
  const o = c.orders.find((ord) => seq.length < ord.length && seq.every((t, i) => ord[i] === t));
  return o ? o[seq.length] : null;
}

/**
 * Which token a tap on star `p` stands for. Identical words are interchangeable: tapping either
 * "a" in "voy a viajar a Valencia" is right when an "a" comes next. Returns the token index that
 * keeps the sequence on an accepted order (preferring `p` itself), or null when the word does not fit.
 */
export function resolveTap(c: Pick<Constellation, 'orders' | 'tokens'>, seq: number[], p: number): number | null {
  const word = c.tokens[p];
  const candidates = c.tokens.map((_, i) => i).filter((i) => c.tokens[i] === word && !seq.includes(i));
  candidates.sort((a, b) => Number(b === p) - Number(a === p));
  return candidates.find((i) => isPrefixOfAnyOrder(c, [...seq, i])) ?? null;
}

/* ---------- Canonical sentence ---------- */

const accentFor = (c: Pick<Constellation, 'accents'>, i: number): string | undefined => c.accents.find((a) => a.index === i)?.correct;

/** The target sentence for a given accepted order: accents restored, capitals, commas, opening and closing marks. */
export function targetSentence(c: Constellation, order: number[] = c.orders[0]): string {
  const words = order.map((t, pos) => {
    let w = accentFor(c, t) ?? c.tokens[t];
    if (pos === 0 || c.proper.includes(t)) w = capitalize(w);
    if (c.commas.includes(t) && pos < order.length - 1) w += ',';
    return w;
  });
  return c.open + words.join(' ') + c.close;
}

/* ---------- "Ilumina la frase" ---------- */

export type Task = 'capital' | 'close' | 'accent' | 'comma' | 'open';

/** A1: capital and closing mark. A2: plus accents. B1 and above: plus commas and opening marks. */
export function tasksFor(level: Level): Set<Task> {
  const t = new Set<Task>(['capital', 'close']);
  if (levelRank(level) >= 1) t.add('accent');
  if (levelRank(level) >= 2) { t.add('comma'); t.add('open'); }
  return t;
}

/**
 * What the learner has set. Positions follow `order`.
 * gaps[0] is before the first word (opening mark), gaps[n] after the last (closing mark),
 * gaps[i] (0 < i < n) sits between word i-1 and word i (comma).
 */
export interface LightState {
  order: number[];
  caps: boolean[];
  accents: Record<number, string>;
  gaps: string[];
}

/** Start state: nothing done for the level's tasks; everything that is not a task is already filled in. */
export function initialLightState(c: Constellation, order: number[], tasks: Set<Task>): LightState {
  const n = order.length;
  const gaps = Array.from({ length: n + 1 }, () => '');
  if (!tasks.has('open')) gaps[0] = c.open;
  if (!tasks.has('comma')) order.forEach((t, pos) => { if (pos < n - 1 && c.commas.includes(t)) gaps[pos + 1] = ','; });
  const accents: Record<number, string> = {};
  for (const a of c.accents) accents[a.index] = tasks.has('accent') ? c.tokens[a.index] : a.correct;
  return { order: [...order], caps: order.map(() => false), accents, gaps };
}

export function wordAt(c: Constellation, s: LightState, pos: number): string {
  const t = s.order[pos];
  const w = s.accents[t] ?? c.tokens[t];
  return s.caps[pos] ? capitalize(w) : w;
}

export function renderLight(c: Constellation, s: LightState): string {
  const n = s.order.length;
  let out = s.gaps[0];
  for (let pos = 0; pos < n; pos++) {
    out += wordAt(c, s, pos);
    if (pos < n - 1) out += s.gaps[pos + 1] + ' ';
  }
  return out + s.gaps[n];
}

/** Which kinds of mistake remain, in the order hints are given. Empty means correct. */
export function lightIssues(c: Constellation, s: LightState): Task[] {
  const n = s.order.length;
  const issues: Task[] = [];
  const capsOk = s.order.every((t, pos) => s.caps[pos] === (pos === 0 || c.proper.includes(t)));
  if (!capsOk) issues.push('capital');
  if (s.gaps[n] !== c.close) issues.push('close');
  if (s.gaps[0] !== c.open) issues.push('open');
  if (c.accents.some((a) => s.accents[a.index] !== a.correct)) issues.push('accent');
  const commasOk = s.order.every((t, pos) => pos === n - 1 || s.gaps[pos + 1] === (c.commas.includes(t) ? ',' : ''));
  if (!commasOk) issues.push('comma');
  if (!issues.length && renderLight(c, s) !== targetSentence(c, s.order)) issues.push('capital');
  return issues;
}

/* ---------- Seeded randomness ---------- */

export function hashString(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/** mulberry32: small seeded PRNG, same sequence for the same seed on every device. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
