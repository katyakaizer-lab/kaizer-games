/**
 * Solitario de categorías: pure game logic (no DOM). A generic "sort cards into piles" engine,
 * also meant for later sorting games (for example Dos buzones: por / para).
 *
 * Normal mode: one pile per named category; a card fits only its own category's pile.
 * Experto: the piles have no names. A card may start an empty pile if no other pile already holds
 * its category; otherwise it must join the pile of its own category. At the end the learner names
 * each pile. No lives, no timer, no failure state.
 */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];

export interface Item { es: string; en: string; ru: string; art?: string }
export interface Category { id: string; name_es: string; en: string; ru: string; items: Item[] }
export interface CardSet {
  id: string;
  level: Level;
  title_es: string;
  /** what the set practises, shown in the list (UI language) */
  about?: { en: string; es?: string; ru?: string };
  categories: Category[];
  /** wrong names offered next to the real ones when naming piles in experto */
  decoyNames?: string[];
  reviewed: boolean;
}
export interface SolitarioData { sets: CardSet[] }

export type Mode = 'normal' | 'experto';
export const OPEN_SLOTS = 3;

export interface Card { id: string; cat: string; item: Item }

export interface GameState {
  mode: Mode;
  cards: Record<string, Card>;
  /** face-down pile, top is the end of the array */
  deck: string[];
  /** open cards on the table (null = empty slot) */
  open: (string | null)[];
  /** pile key -> card ids. Normal: key = category id. Experto: key = "0", "1", ... */
  piles: Record<string, string[]>;
  /** experto: which category each pile turned out to hold (null while empty) */
  pileCat: Record<string, string | null>;
  misses: number;
  hintsUsed: number;
}

/* ---------- seeded shuffle (tests pass a seed; play uses a random one) ---------- */
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

export function newGame(set: CardSet, mode: Mode, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const cards: Record<string, Card> = {};
  for (const c of set.categories) c.items.forEach((item, i) => { cards[`${c.id}:${i}`] = { id: `${c.id}:${i}`, cat: c.id, item }; });
  const deck = shuffle(Object.keys(cards), seed);
  const piles: Record<string, string[]> = {};
  const pileCat: Record<string, string | null> = {};
  set.categories.forEach((c, i) => {
    const key = mode === 'normal' ? c.id : String(i);
    piles[key] = [];
    pileCat[key] = mode === 'normal' ? c.id : null;
  });
  const s: GameState = { mode, cards, deck, open: Array(OPEN_SLOTS).fill(null), piles, pileCat, misses: 0, hintsUsed: 0 };
  refill(s);
  return s;
}

/** Fill empty table slots from the face-down pile. */
export function refill(s: GameState): void {
  for (let i = 0; i < s.open.length; i++) if (s.open[i] === null && s.deck.length) s.open[i] = s.deck.pop()!;
}

/** Would `cardId` fit on pile `key`? */
export function canPlace(s: GameState, cardId: string, key: string): boolean {
  const card = s.cards[cardId];
  if (!card || !(key in s.piles)) return false;
  const cat = s.pileCat[key];
  if (cat !== null) return cat === card.cat;
  // experto, empty pile: only if no other pile already holds this category
  return !Object.values(s.pileCat).includes(card.cat);
}

/** The pile a card belongs on right now (for "Pista"), or null. */
export function rightPile(s: GameState, cardId: string): string | null {
  const keys = Object.keys(s.piles);
  return keys.find((k) => s.pileCat[k] !== null && canPlace(s, cardId, k)) ?? keys.find((k) => canPlace(s, cardId, k)) ?? null;
}

/** Try to put an open card on a pile. A miss changes nothing except the (never shown as a score) miss count. */
export function place(s: GameState, cardId: string, key: string): boolean {
  const slot = s.open.indexOf(cardId);
  if (slot < 0) return false;
  if (!canPlace(s, cardId, key)) { s.misses++; return false; }
  s.piles[key].push(cardId);
  s.pileCat[key] ??= s.cards[cardId].cat;
  s.open[slot] = null;
  refill(s);
  return true;
}

/** "Otras cartas": the open cards go under the pile and new ones are turned over. */
export function cycle(s: GameState): void {
  if (!s.deck.length) return;
  const back = s.open.filter((x): x is string => x !== null);
  s.open = Array(OPEN_SLOTS).fill(null);
  s.deck = [...back.reverse(), ...s.deck];
  refill(s);
}

export const isSorted = (s: GameState): boolean => !s.deck.length && s.open.every((x) => x === null);
export const pileTotal = (set: CardSet, s: GameState, key: string): number => {
  const cat = s.pileCat[key];
  return cat ? set.categories.find((c) => c.id === cat)!.items.length : 0;
};

/* ---------- experto: naming the piles ---------- */

/** Names to choose from for every pile: all real category names plus the decoys, in a stable shuffled order. */
export function nameOptions(set: CardSet, seed = 7): string[] {
  return shuffle([...set.categories.map((c) => c.name_es), ...(set.decoyNames ?? [])], seed);
}

/** Which piles have the wrong name (empty list = all named correctly). */
export function wrongNames(set: CardSet, s: GameState, names: Record<string, string>): string[] {
  return Object.keys(s.piles).filter((k) => set.categories.find((c) => c.id === s.pileCat[k])?.name_es !== names[k]);
}
