/**
 * Solitario de categorías: pure game logic (no DOM).
 * - A deal uses some categories of one level. Each category is a card too, shuffled in with its words.
 * - Slots at the top start empty. A category card opens a slot; then that category's word cards go on it.
 *   When every word of a category is in its slot, the category is complete and leaves the table.
 * - Columns: all cards face up. A card (or a run of same-category cards) may go on a column whose last
 *   card is of the same category (word or category card), or on an empty column.
 * - The deck at the top turns over one card at a time and can be turned again any number of times.
 * - Moves are counted (no limit, no failure). Undo is always available. Every deal is checked by a
 *   solver before it is shown, so it can always be won.
 */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];

export interface Item { es: string; en: string; ru: string; art?: string }
export interface Category { id: string; level: Level; name_es: string; en: string; ru: string; items: Item[]; avoid?: string[]; reviewed: boolean }
/** Per level: columns on phones (2 to 7) and face-down cards under the face-up card of each column. */
export interface LevelConfig { columns: number; down: number }
export interface SolitarioData { categories: Category[]; levels?: Partial<Record<Level, LevelConfig>> }

export interface Card { id: string; cat: string; kind: 'cat' | 'word'; item: Item }
export interface Slot { cat: string | null; words: string[] }
export interface GameState {
  cats: Category[];
  cards: Record<string, Card>;
  /** how many word cards each category has in this deal */
  size: Record<string, number>;
  stock: string[];
  waste: string[];
  cols: string[][];
  /** per column: how many cards at the bottom are face down (never tappable; the next one turns up when uncovered) */
  down: number[];
  slots: Slot[];
  done: string[];
  moves: number;
  /** move limit for this game (null = no limit); every deal can be won within it */
  limit: number | null;
  /** how many moves the solver needed (for the record; a person may need more or fewer) */
  par: number;
  misses: number;
  hintsUsed: number;
  history: string[];
  /** the deal as it started, for "try this deal again" */
  start: string;
}

export type Source = { kind: 'waste' } | { kind: 'col'; col: number; index: number };
export type Target = { kind: 'slot'; index: number } | { kind: 'col'; col: number };
export type Step = { kind: 'draw' } | { kind: 'move'; src: Source; dst: Target };

export interface DealOptions { seed?: number; columns?: number; categories?: number; down?: number; limit?: number | null }

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

export function pickCategories(pool: Category[], seed: number, n: number): Category[] {
  const picked: Category[] = [];
  for (const c of shuffle(pool, seed)) {
    if (picked.length === n) break;
    if (!picked.some((p) => p.avoid?.includes(c.id) || c.avoid?.includes(p.id))) picked.push(c);
  }
  return picked;
}

/** One random deal (not yet checked). */
export function dealOnce(pool: Category[], o: Omit<Required<DealOptions>, 'limit'>): GameState {
  const r = rng(o.seed);
  const cats = pickCategories(pool, o.seed, o.categories);
  const cards: Record<string, Card> = {};
  const size: Record<string, number> = {};
  for (const c of cats) {
    cards[`${c.id}:cat`] = { id: `${c.id}:cat`, cat: c.id, kind: 'cat', item: { es: c.name_es, en: c.en, ru: c.ru } };
    const n = Math.min(c.items.length, 4 + Math.floor(r() * 3)); // 4 to 6 words
    size[c.id] = n;
    shuffle(c.items.map((it, i) => ({ it, i })), o.seed + c.id.length * 31).slice(0, n)
      .forEach(({ it, i }) => { cards[`${c.id}:${i}`] = { id: `${c.id}:${i}`, cat: c.id, kind: 'word', item: it }; });
  }
  const deck = shuffle(Object.keys(cards), o.seed ^ 0x9e3779b9);
  const cols: string[][] = Array.from({ length: o.columns }, () => []);
  // Each column: o.down face-down cards and one face-up card on top.
  for (let row = 0; row <= o.down; row++) for (const col of cols) if (deck.length) col.push(deck.pop()!);
  const down = cols.map((c) => Math.max(0, c.length - 1));
  return {
    cats, cards, size, stock: deck, waste: [], cols, down,
    slots: cats.map(() => ({ cat: null, words: [] })),
    done: [], moves: 0, limit: null, par: 0, misses: 0, hintsUsed: 0, history: [], start: '',
  };
}

/**
 * A deal the solver can win, within the move limit if there is one (tries further seeds if needed).
 * If no deal fits a very tight limit, the shortest winnable deal found is used and the limit is raised to it.
 */
export function newGame(pool: Category[], o: DealOptions = {}): GameState {
  const base = {
    seed: o.seed ?? Math.floor(Math.random() * 2 ** 31),
    columns: o.columns ?? 5,
    categories: o.categories ?? 5,
    down: o.down ?? 2,
  };
  const limit = o.limit ?? null;
  let shortest: { s: GameState; n: number } | null = null;
  for (let k = 0; k < 400; k++) {
    const s = dealOnce(pool, { ...base, seed: base.seed + k * 7919 });
    const steps = solve(s);
    if (!steps) continue;
    if (limit === null || steps.length <= limit) return finishDeal(s, limit, steps.length);
    if (!shortest || steps.length < shortest.n) shortest = { s, n: steps.length };
  }
  if (shortest) return finishDeal(shortest.s, Math.max(limit ?? 0, shortest.n), shortest.n);
  return finishDeal(dealOnce(pool, base), null, 0); // not reached in practice (tested)
}

function finishDeal(s: GameState, limit: number | null, par: number): GameState {
  s.limit = limit;
  s.par = par;
  s.start = snapshot(s);
  return s;
}

/** Back to the start of this deal (moves to 0, history cleared). */
export function restart(s: GameState): void {
  Object.assign(s, JSON.parse(s.start));
  s.history = [];
}

export const movesLeft = (s: GameState): number | null => (s.limit === null ? null : Math.max(0, s.limit - s.moves));
export const outOfMoves = (s: GameState): boolean => s.limit !== null && s.moves >= s.limit && !isWon(s);

/* ---------- reading the table ---------- */

/** The cards that would move: the waste's top card, or a column's cards from `index` to the end if they share one category. */
export function runAt(s: GameState, src: Source): string[] | null {
  if (src.kind === 'waste') return s.waste.length ? [s.waste[s.waste.length - 1]] : null;
  const col = s.cols[src.col];
  if (!col || src.index < (s.down[src.col] ?? 0) || src.index >= col.length) return null; // face-down cards never move
  const run = col.slice(src.index);
  const cat = s.cards[run[0]].cat;
  return run.every((id) => s.cards[id].cat === cat) ? run : null;
}

export function canPlace(s: GameState, run: string[], t: Target): boolean {
  if (!run.length) return false;
  const cat = s.cards[run[0]].cat;
  if (t.kind === 'slot') {
    const slot = s.slots[t.index];
    if (!slot) return false;
    if (slot.cat === null) return s.cards[run[0]].kind === 'cat' && run.slice(1).every((id) => s.cards[id].kind === 'word');
    return slot.cat === cat && run.every((id) => s.cards[id].kind === 'word');
  }
  const col = s.cols[t.col];
  if (!col || run.includes(col[col.length - 1])) return false;
  return !col.length || s.cards[col[col.length - 1]].cat === cat;
}

const snapshot = (s: GameState) => JSON.stringify({ stock: s.stock, waste: s.waste, cols: s.cols, down: s.down, slots: s.slots, done: s.done, moves: s.moves });

/** Is this card face down? */
export const isFaceDown = (s: GameState, col: number, index: number): boolean => index < (s.down[col] ?? 0);

/** Move cards. A wrong move changes nothing except the miss count. */
export function move(s: GameState, src: Source, t: Target, record = true): boolean {
  const run = runAt(s, src);
  if (!run || !canPlace(s, run, t)) { s.misses++; return false; }
  if (record) s.history.push(snapshot(s));
  if (src.kind === 'waste') s.waste.pop();
  else {
    const col = s.cols[src.col];
    col.splice(src.index);
    // Uncovered a face-down card: it turns face up.
    if (col.length && s.down[src.col] >= col.length) s.down[src.col] = col.length - 1;
    if (!col.length) s.down[src.col] = 0;
  }
  if (t.kind === 'col') s.cols[t.col].push(...run);
  else {
    const slot = s.slots[t.index];
    for (const id of run) { if (s.cards[id].kind === 'cat') slot.cat = s.cards[id].cat; else slot.words.push(id); }
    if (slot.cat && slot.words.length === s.size[slot.cat]) { s.done.push(slot.cat); s.slots[t.index] = { cat: null, words: [] }; }
  }
  s.moves++;
  return true;
}

/** Tap on the deck: turn one card over, or turn the waste back into the deck. */
export function drawCard(s: GameState, record = true): 'drawn' | 'recycled' | 'none' {
  if (!s.stock.length && !s.waste.length) return 'none';
  if (record) s.history.push(snapshot(s));
  s.moves++;
  if (s.stock.length) { s.waste.push(s.stock.pop()!); return 'drawn'; }
  s.stock = s.waste.reverse();
  s.waste = [];
  return 'recycled';
}

export function undo(s: GameState): boolean {
  const last = s.history.pop();
  if (!last) return false;
  Object.assign(s, JSON.parse(last));
  return true;
}

export const isWon = (s: GameState): boolean => s.done.length === s.cats.length;
export const catName = (s: GameState, id: string): string => s.cats.find((c) => c.id === id)?.name_es ?? '';
export const slotOf = (s: GameState, cat: string): number => s.slots.findIndex((x) => x.cat === cat);

/** A useful place for the cards at `src` (for "Pista"): a slot first, then a matching column. */
export function hintFor(s: GameState, src: Source): Target | null {
  const run = runAt(s, src);
  if (!run) return null;
  const slot = s.slots.findIndex((_, i) => canPlace(s, run, { kind: 'slot', index: i }) && s.slots[i].cat !== null);
  if (slot >= 0) return { kind: 'slot', index: slot };
  const empty = s.slots.findIndex((_, i) => canPlace(s, run, { kind: 'slot', index: i }));
  if (empty >= 0) return { kind: 'slot', index: empty };
  const col = s.cols.findIndex((c, i) => (src.kind !== 'col' || i !== src.col) && c.length > 0 && canPlace(s, run, { kind: 'col', col: i }));
  return col >= 0 ? { kind: 'col', col } : null;
}

/* ---------- solver (greedy, used to check deals and by the tests) ---------- */

/** Sources worth trying: the waste, and for each column its longest movable run. */
function sources(s: GameState): Source[] {
  const out: Source[] = s.waste.length ? [{ kind: 'waste' }] : [];
  s.cols.forEach((col, ci) => {
    if (!col.length) return;
    let i = col.length - 1;
    while (i > (s.down[ci] ?? 0) && s.cards[col[i - 1]].cat === s.cards[col[i]].cat) i--;
    out.push({ kind: 'col', col: ci, index: i });
    if (i < col.length - 1) out.push({ kind: 'col', col: ci, index: col.length - 1 });
  });
  return out;
}

/** One sensible next step, or a draw, or null when nothing is left. */
export function nextStep(s: GameState): Step | null {
  const srcs = sources(s);
  // 1. Into an open slot, or open a slot with a category card (with its words, if they sit on it).
  for (const src of srcs) {
    const run = runAt(s, src)!;
    const open = s.slots.findIndex((x) => x.cat !== null && canPlace(s, run, { kind: 'slot', index: s.slots.indexOf(x) }));
    if (open >= 0) return { kind: 'move', src, dst: { kind: 'slot', index: open } };
  }
  for (const src of srcs) {
    const run = runAt(s, src)!;
    const empty = s.slots.findIndex((_, i) => s.slots[i].cat === null && canPlace(s, run, { kind: 'slot', index: i }));
    if (empty >= 0) return { kind: 'move', src, dst: { kind: 'slot', index: empty } };
  }
  // 2. Onto a same-category column, when that frees a card (or comes from the waste).
  for (const src of srcs) {
    const run = runAt(s, src)!;
    const frees = src.kind === 'waste' || src.index > 0;
    if (!frees) continue;
    const col = s.cols.findIndex((c, i) => (src.kind !== 'col' || i !== src.col) && c.length > 0 && canPlace(s, run, { kind: 'col', col: i }));
    if (col >= 0) return { kind: 'move', src, dst: { kind: 'col', col } };
  }
  // 3. Into an empty column, when that frees a card underneath.
  const emptyCol = s.cols.findIndex((c) => !c.length);
  if (emptyCol >= 0) {
    for (const src of srcs) if (src.kind === 'col' && src.index > 0) return { kind: 'move', src, dst: { kind: 'col', col: emptyCol } };
    if (s.waste.length) return { kind: 'move', src: { kind: 'waste' }, dst: { kind: 'col', col: emptyCol } };
  }
  // 4. Turn the deck.
  return s.stock.length || s.waste.length ? { kind: 'draw' } : null;
}

/** Plays a copy greedily. Returns the winning steps, or null if it gets stuck. */
export function solve(start: GameState, maxSteps = 4000): Step[] | null {
  const s: GameState = JSON.parse(JSON.stringify({ ...start, history: [] }));
  const steps: Step[] = [];
  // Progress = cards in slots (or finished). Without progress for a long stretch (two full turns of
  // the deck plus room for rearranging the columns), the greedy play is going round in circles.
  const placed = () => s.done.reduce((n, c) => n + s.size[c] + 1, 0) + s.slots.reduce((n, x) => n + x.words.length + (x.cat ? 1 : 0), 0);
  const total = Object.keys(s.cards).length;
  let best = placed();
  let idle = 0;
  for (let i = 0; i < maxSteps && !isWon(s); i++) {
    const step = nextStep(s);
    if (!step) return null;
    if (step.kind === 'draw') drawCard(s, false); else move(s, step.src, step.dst, false);
    steps.push(step);
    const p = placed();
    if (p > best) { best = p; idle = 0; } else if (++idle > 2 * (s.stock.length + s.waste.length) + total) return null;
  }
  return isWon(s) ? steps : null;
}
