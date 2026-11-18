/**
 * Solitario de categorías: pure game logic (no DOM).
 * Classic solitaire layout, adapted to word cards (no ranks or suits):
 * - a deal uses four categories of one level, mixed from every topic;
 * - foundations: one per category (Modo experto: unnamed, the first card decides);
 * - columns: face-down cards with a face-up card on top; a card (with the cards on it) may be put
 *   on a column whose top card is of the same category, or on an empty column;
 * - the deck turns over one card at a time onto the waste and can be turned again any number of times.
 * Every uncovered card can always go to a foundation, so a game can never get stuck.
 */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];

export interface Item { es: string; en: string; ru: string; art?: string }
export interface Category { id: string; level: Level; name_es: string; en: string; ru: string; items: Item[]; avoid?: string[]; reviewed: boolean }
export interface SolitarioData { categories: Category[] }

export type Mode = 'normal' | 'experto';
export const CATS_PER_GAME = 4;
export const CARDS_PER_CAT = 5;

export interface Card { id: string; cat: string; item: Item; up: boolean }
export interface GameState {
  mode: Mode;
  /** the categories dealt in this game */
  cats: Category[];
  cards: Record<string, Card>;
  /** face-down deck, top = end */
  stock: string[];
  /** turned-over cards, top = end */
  waste: string[];
  /** columns, bottom card first */
  cols: string[][];
  /** foundation key -> cards. Normal: key = category id. Experto: "0".."3" */
  piles: Record<string, string[]>;
  pileCat: Record<string, string | null>;
  misses: number;
  hintsUsed: number;
}

export type Source = { kind: 'waste' } | { kind: 'col'; col: number; index: number };
export type Target = { kind: 'pile'; key: string } | { kind: 'col'; col: number };

/* ---------- seeded randomness ---------- */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Four categories of one level, never two that "avoid" each other. */
export function pickCategories(pool: Category[], seed: number, n = CATS_PER_GAME): Category[] {
  const picked: Category[] = [];
  for (const c of shuffle(pool, seed)) {
    if (picked.length === n) break;
    const clash = picked.some((p) => p.avoid?.includes(c.id) || c.avoid?.includes(p.id));
    if (!clash) picked.push(c);
  }
  return picked;
}

/** Deal a game. `columns` is 3 on phones and 4 or 5 on wider screens. */
export function newGame(pool: Category[], mode: Mode, o: { seed?: number; columns?: number } = {}): GameState {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  const columns = o.columns ?? 4;
  const cats = pickCategories(pool, seed);
  const cards: Record<string, Card> = {};
  for (const c of cats) {
    shuffle(c.items.map((it, i) => ({ it, i })), seed + c.id.length).slice(0, CARDS_PER_CAT)
      .forEach(({ it, i }) => { cards[`${c.id}:${i}`] = { id: `${c.id}:${i}`, cat: c.id, item: it, up: false }; });
  }
  const deck = shuffle(Object.keys(cards), seed ^ 0x9e3779b9);
  const cols: string[][] = Array.from({ length: columns }, () => []);
  for (let i = 0; i < columns; i++) for (let k = 0; k <= i && deck.length; k++) cols[i].push(deck.pop()!);
  for (const col of cols) if (col.length) cards[col[col.length - 1]].up = true;
  const piles: Record<string, string[]> = {};
  const pileCat: Record<string, string | null> = {};
  cats.forEach((c, i) => { const key = mode === 'normal' ? c.id : String(i); piles[key] = []; pileCat[key] = mode === 'normal' ? c.id : null; });
  return { mode, cats, cards, stock: deck, waste: [], cols, piles, pileCat, misses: 0, hintsUsed: 0 };
}

/* ---------- reading the table ---------- */

/** The cards that would move from a source (the waste's top card, or a face-up card with everything on it). */
export function runAt(s: GameState, src: Source): string[] | null {
  if (src.kind === 'waste') return s.waste.length ? [s.waste[s.waste.length - 1]] : null;
  const col = s.cols[src.col];
  if (!col || src.index < 0 || src.index >= col.length) return null;
  const run = col.slice(src.index);
  return run.every((id) => s.cards[id].up) ? run : null;
}

export function canPlace(s: GameState, run: string[], t: Target): boolean {
  if (!run.length) return false;
  const first = s.cards[run[0]];
  if (t.kind === 'pile') {
    if (run.length !== 1 || !(t.key in s.piles)) return false;
    const cat = s.pileCat[t.key];
    return cat !== null ? cat === first.cat : !Object.values(s.pileCat).includes(first.cat);
  }
  const col = s.cols[t.col];
  if (!col || run.includes(col[col.length - 1])) return false;
  if (!col.length) return true;
  const top = s.cards[col[col.length - 1]];
  return top.up && top.cat === first.cat;
}

/** Move cards. A wrong move changes nothing except the miss count (never shown as a score). */
export function move(s: GameState, src: Source, t: Target): boolean {
  const run = runAt(s, src);
  if (!run || !canPlace(s, run, t)) { s.misses++; return false; }
  if (src.kind === 'waste') s.waste.pop();
  else {
    const col = s.cols[src.col];
    col.splice(src.index);
    if (col.length) s.cards[col[col.length - 1]].up = true; // uncover the next card
  }
  if (t.kind === 'pile') { s.piles[t.key].push(run[0]); s.pileCat[t.key] ??= s.cards[run[0]].cat; }
  else s.cols[t.col].push(...run);
  return true;
}

/** Tap on the deck: turn one card over, or turn the waste back into the deck when it is empty. */
export function drawCard(s: GameState): 'drawn' | 'recycled' | 'none' {
  if (s.stock.length) { const id = s.stock.pop()!; s.cards[id].up = true; s.waste.push(id); return 'drawn'; }
  if (s.waste.length) { s.stock = s.waste.reverse().map((id) => { s.cards[id].up = false; return id; }); s.waste = []; return 'recycled'; }
  return 'none';
}

/** The foundation a single card can go to right now, or null. */
export function pileFor(s: GameState, cardId: string): string | null {
  const keys = Object.keys(s.piles);
  return keys.find((k) => s.pileCat[k] !== null && canPlace(s, [cardId], { kind: 'pile', key: k }))
    ?? keys.find((k) => canPlace(s, [cardId], { kind: 'pile', key: k })) ?? null;
}

/** A good place for the cards at `src` (for "Pista"): its foundation if it is a single card, else a matching column. */
export function hintFor(s: GameState, src: Source): Target | null {
  const run = runAt(s, src);
  if (!run) return null;
  if (run.length === 1) { const k = pileFor(s, run[0]); if (k) return { kind: 'pile', key: k }; }
  const col = s.cols.findIndex((c, i) => (src.kind !== 'col' || i !== src.col) && c.length > 0 && canPlace(s, run, { kind: 'col', col: i }));
  return col >= 0 ? { kind: 'col', col } : null;
}

export const isWon = (s: GameState): boolean => Object.values(s.piles).reduce((n, p) => n + p.length, 0) === Object.keys(s.cards).length;
export const catOf = (s: GameState, key: string): Category | undefined => s.cats.find((c) => c.id === s.pileCat[key]);
export const pileSize = (s: GameState, catId: string): number => Object.values(s.cards).filter((c) => c.cat === catId).length;

/* ---------- experto: naming the foundations ---------- */

/** The four real names plus two other categories of the same level as wrong options. */
export function nameOptions(s: GameState, pool: Category[], seed = 7): string[] {
  const others = shuffle(pool.filter((c) => !s.cats.some((x) => x.id === c.id)), seed).slice(0, 2);
  return shuffle([...s.cats, ...others].map((c) => c.name_es), seed + 1);
}
export function wrongNames(s: GameState, names: Record<string, string>): string[] {
  return Object.keys(s.piles).filter((k) => catOf(s, k)?.name_es !== names[k]);
}
