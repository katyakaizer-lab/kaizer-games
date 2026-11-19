/**
 * Crucigramas: data types, a seeded grid generator, numbering, checking, hint limits and the no-repeat rules.
 * No DOM here (used by the build validator and the tests too).
 *
 * A puzzle takes one topic of a level and places some of its words on a grid, crossing each other. Every word
 * crosses at least one other, words never touch side by side, and the grid stays within the level's size.
 * Accents count: a cell needs exactly its letter (Ó is not O); ñ is its own letter. A letter that only lacks its
 * accent or tilde is a near miss (see ../shared/accents.ts), never a mistake.
 */
import { bare } from '../shared/accents.ts';

export { bare };
export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type Level = (typeof LEVELS)[number];
/** def: definition; gap: a sentence with ___ for the word; syn / ant: synonym / opposite; use: what it is for or where it is. */
export type ClueKind = 'def' | 'gap' | 'syn' | 'ant' | 'use';
export const CLUE_KINDS: ClueKind[] = ['def', 'gap', 'syn', 'ant', 'use'];
export const BORDER_STYLES = ['leaves', 'dots', 'stars', 'waves'] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export interface Clue { kind: ClueKind; text: string }
export interface Entry { es: string; clues: Partial<Record<ClueKind, string>> }
export interface Topic {
  id: string; level: Level; name_es: string; en: string; ru: string; reviewed: boolean;
  /** small objects shown around the grid (art ids decor.<topic>.<name>) and the ornament border style */
  decor?: { style: BorderStyle; items: string[] };
  words: Entry[];
}
export interface LevelConfig {
  /** words in one puzzle */
  words: number;
  /** largest grid (columns x rows) */
  maxCols: number; maxRows: number;
  /** clue kinds this level uses (each word gets one of those it has, at random) */
  clueKinds: ClueKind[];
}
export interface CrucigramaData { levels: Partial<Record<Level, LevelConfig>>; topics: Topic[] }

export type Dir = 'across' | 'down';
export interface Placed {
  /** the word in capitals, accents kept (CAMIÓN) */
  answer: string[];
  es: string;
  clue: Clue;
  row: number; col: number; dir: Dir;
  /** clue number shown in the grid */
  num: number;
}
/** A puzzle (plain data: it is saved as is while the game is in progress). */
export interface Puzzle { rows: number; cols: number; words: Placed[]; topicId: string; seed: number }

export const DEFAULT_LEVEL: LevelConfig = { words: 6, maxCols: 9, maxRows: 9, clueKinds: [...CLUE_KINDS] };

/** Capital letters of a word, one per cell (á -> Á, ñ -> Ñ, ü -> Ü). */
export const lettersOf = (es: string): string[] => [...es.normalize('NFC').toLocaleUpperCase('es')];

/** Clues of an entry as a list. */
export const cluesOf = (e: Entry): Clue[] => CLUE_KINDS.filter((k) => e.clues[k]).map((k) => ({ kind: k, text: e.clues[k]! }));

/** Small seeded random generator (mulberry32). */
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
function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

interface Cell { ch: string; dirs: Set<Dir> }
type Grid = Map<string, Cell>;
const key = (r: number, c: number) => `${r},${c}`;
const step = (d: Dir) => (d === 'across' ? [0, 1] : [1, 0]);

/** Can `w` go at (r, c) in direction d? Returns the number of crossings, or -1 if not allowed. */
function fits(g: Grid, w: string[], r: number, c: number, d: Dir): number {
  const [dr, dc] = step(d);
  if (g.has(key(r - dr, c - dc)) || g.has(key(r + dr * w.length, c + dc * w.length))) return -1; // ends must be free
  let crossings = 0;
  for (let i = 0; i < w.length; i++) {
    const rr = r + dr * i, cc = c + dc * i;
    const cell = g.get(key(rr, cc));
    if (cell) {
      if (cell.ch !== w[i] || cell.dirs.has(d)) return -1;
      crossings++;
    } else if (g.has(key(rr + dc, cc + dr)) || g.has(key(rr - dc, cc - dr))) return -1; // no side-by-side letters
  }
  return crossings;
}
function put(g: Grid, w: string[], r: number, c: number, d: Dir) {
  const [dr, dc] = step(d);
  w.forEach((ch, i) => {
    const k = key(r + dr * i, c + dc * i);
    const cell = g.get(k) ?? { ch, dirs: new Set<Dir>() };
    cell.dirs.add(d);
    g.set(k, cell);
  });
}
function bounds(g: Grid) {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const k of g.keys()) { const [r, c] = k.split(',').map(Number); r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  return { r0, r1, c0, c1, rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
}

/** One attempt: place words longest first, each at the allowed crossing that keeps the grid smallest. */
function attempt(entries: Entry[], cfg: LevelConfig, r: () => number) {
  const order = entries.map((e) => ({ e, w: lettersOf(e.es), k: r() })).sort((a, b) => b.w.length - a.w.length || a.k - b.k);
  const g: Grid = new Map();
  const placed: { e: Entry; w: string[]; row: number; col: number; dir: Dir }[] = [];
  const first = order[0];
  const dir0: Dir = r() < 0.5 ? 'across' : 'down';
  put(g, first.w, 0, 0, dir0);
  placed.push({ ...first, row: 0, col: 0, dir: dir0 });
  let rest = order.slice(1);
  for (let pass = 0; pass < 2 && rest.length; pass++) {
    const left: typeof rest = [];
    for (const item of rest) {
      let best: { row: number; col: number; dir: Dir; score: number } | null = null;
      const b = bounds(g);
      for (const [k, cell] of g) {
        const [cr, cc] = k.split(',').map(Number);
        for (let i = 0; i < item.w.length; i++) {
          if (item.w[i] !== cell.ch) continue;
          for (const d of ['across', 'down'] as Dir[]) {
            if (cell.dirs.has(d)) continue;
            const [dr, dc] = step(d);
            const row = cr - dr * i, col = cc - dc * i;
            const x = fits(g, item.w, row, col, d);
            if (x < 1) continue;
            const rows = Math.max(b.r1, row + dr * (item.w.length - 1)) - Math.min(b.r0, row) + 1;
            const cols = Math.max(b.c1, col + dc * (item.w.length - 1)) - Math.min(b.c0, col) + 1;
            if (rows > cfg.maxRows || cols > cfg.maxCols) continue;
            // More crossings, a squarer and smaller grid; a little randomness for variety.
            const score = x * 12 - rows * cols * 0.4 - Math.abs(rows - cols) * 1.5 + r() * 2;
            if (!best || score > best.score) best = { row, col, dir: d, score };
          }
        }
      }
      if (best) { put(g, item.w, best.row, best.col, best.dir); placed.push({ ...item, row: best.row, col: best.col, dir: best.dir }); }
      else left.push(item);
    }
    rest = left;
  }
  return placed;
}

/** Clue for a word: one of the kinds the level uses, picked at random among those the word has. */
export function clueFor(e: Entry, cfg: LevelConfig, r: () => number): Clue {
  const all = cluesOf(e);
  const ok = all.filter((c) => cfg.clueKinds.includes(c.kind));
  const pool = ok.length ? ok : all;
  return pool[Math.floor(r() * pool.length)];
}

/**
 * Word order for a new puzzle: words not seen in the recent puzzles first (shuffled), then the ones seen longest
 * ago. `recent` is the list of recent puzzles' words, newest first.
 */
export function freshFirst(words: Entry[], recent: string[][], r: () => number): Entry[] {
  const age = (w: string) => { const i = recent.findIndex((p) => p.includes(w)); return i < 0 ? Infinity : i; };
  const groups = new Map<number, Entry[]>();
  for (const e of words) { const a = age(e.es); groups.set(a, [...(groups.get(a) ?? []), e]); }
  return [...groups.keys()].sort((a, b) => b - a).flatMap((a) => shuffle(groups.get(a)!, r));
}

/**
 * A puzzle for a topic. Tries several random choices of the topic's words (fresh words first, see freshFirst);
 * keeps the first grid with `cfg.words` words, or the fullest after all attempts. Null if fewer than 3 words cross.
 */
export function generate(topic: Topic, cfg: LevelConfig = DEFAULT_LEVEL, seed = Date.now() % 1e9, recent: string[][] = []): Puzzle | null {
  const r = rng(seed * 7919 + 13);
  const want = Math.min(cfg.words, topic.words.length);
  let best: ReturnType<typeof attempt> | null = null;
  for (let a = 0; a < 80; a++) {
    // Candidates: the freshest words, a few more than needed so the grid has choices.
    const pick = freshFirst(topic.words, recent, r).slice(0, Math.min(topic.words.length, want + 3));
    const placed = attempt(pick, cfg, r).slice(0, want); // placement order keeps every prefix connected
    if (!best || placed.length > best.length) best = placed;
    if (best.length >= want) break;
  }
  if (!best || best.length < 3) return null;
  const g: Grid = new Map();
  for (const p of best) put(g, p.w, p.row, p.col, p.dir);
  const b = bounds(g);
  const words = best.map((p) => ({ answer: p.w, es: p.e.es, clue: clueFor(p.e, cfg, r), row: p.row - b.r0, col: p.col - b.c0, dir: p.dir, num: 0 }));
  number(words);
  return { rows: b.rows, cols: b.cols, words, topicId: topic.id, seed };
}

/** Standard numbering: cells that start a word get numbers in reading order; across and down share a number. */
export function number(words: Placed[]) {
  const starts = [...new Set(words.map((w) => key(w.row, w.col)))].map((k) => k.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const nums = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]));
  for (const w of words) w.num = nums.get(key(w.row, w.col))!;
  words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
}

/** Cells of a word, as "row,col" keys. */
export const cellsOf = (w: Placed): string[] => w.answer.map((_, i) => (w.dir === 'across' ? key(w.row, w.col + i) : key(w.row + i, w.col)));
/** A stable id for a word in a puzzle ("3-across"). */
export const wordId = (w: Placed) => `${w.num}-${w.dir}`;

/** The solution letter of every cell. */
export function solution(p: Puzzle): Map<string, string> {
  const m = new Map<string, string>();
  for (const w of p.words) cellsOf(w).forEach((k, i) => m.set(k, w.answer[i]));
  return m;
}

export type Letters = Record<string, string>;
export const wordDone = (w: Placed, letters: Letters) => cellsOf(w).every((k, i) => letters[k] === w.answer[i]);
export const isSolved = (p: Puzzle, letters: Letters) => p.words.every((w) => wordDone(w, letters));

/** Filled cells that are not right. `near` = only the accent or the tilde of ñ differs (not counted as a mistake). */
export function mistakes(p: Puzzle, letters: Letters): { key: string; near: boolean }[] {
  const out: { key: string; near: boolean }[] = [];
  for (const [k, ch] of solution(p)) {
    const got = letters[k];
    if (got && got !== ch) out.push({ key: k, near: bare(got) === bare(ch) });
  }
  return out;
}

/** Words a cell belongs to (one or two). */
export const wordsAt = (p: Puzzle, k: string) => p.words.filter((w) => cellsOf(w).includes(k));

/* ---------------- Help ---------------- */
export type HelpLevel = 'none' | 'little' | 'normal';
export const HELP_LEVELS: HelpLevel[] = ['none', 'little', 'normal'];
/**
 * Letters a hint may reveal in one word: Sin ayuda 0; Poca ayuda 1; Ayuda normal up to 2, never more than a
 * third of the word's letters (at least 1).
 */
export function hintLimit(help: HelpLevel, length: number): number {
  if (help === 'none') return 0;
  if (help === 'little') return 1;
  return Math.max(1, Math.min(2, Math.floor(length / 3)));
}
/** The cell a hint fills: the first empty cell of the word, else its first wrong one; null if the word is right. */
export function hintCell(w: Placed, letters: Letters): string | null {
  const cells = cellsOf(w);
  return cells.find((k) => !letters[k]) ?? cells.find((k, i) => letters[k] !== w.answer[i]) ?? null;
}

/* ---------------- Variety ---------------- */
/** Recent puzzles kept per topic for the no-repeat rule. */
export const RECENT_PUZZLES = 5;
/** Adds a puzzle's words to a topic's history (newest first, at most RECENT_PUZZLES). */
export const pushRecent = (recent: string[][], p: Puzzle): string[][] => [p.words.map((w) => w.es), ...recent].slice(0, RECENT_PUZZLES);
/** "Sorpréndeme": a topic not played recently (the least recent if all were), at random among equals. */
export function surpriseTopic(topics: Topic[], recentTopicIds: string[], r: () => number): Topic {
  const age = (id: string) => { const i = recentTopicIds.indexOf(id); return i < 0 ? Infinity : i; };
  const best = Math.max(...topics.map((t) => age(t.id)));
  const pool = topics.filter((t) => age(t.id) === best);
  return pool[Math.floor(r() * pool.length)];
}
