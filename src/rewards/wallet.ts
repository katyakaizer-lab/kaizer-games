/**
 * The star wallet. Stars are earned only by playing (awardStars), never bought, never expire and are never taken
 * away: nothing here subtracts stars except spend(), which will only be used by the pet shop (not built yet), when
 * the learner chooses an item. The wallet lives in progress storage, so it is part of save/load to a file and of
 * "reset progress".
 */
import { store } from '../data/storage';

export interface Wallet {
  /** stars available to spend */
  balance: number;
  /** all stars ever earned (never goes down) */
  earned: number;
  /** stars earned per game */
  byGame: Record<string, number>;
  /** items bought in the pet shop (later), by id */
  owned: string[];
  /** the last few awards, newest first (for a "how you earned them" list) */
  recent: { game: string; amount: number; reason: string; at: number }[];
}

const KEY = 'rewards.wallet';
const RECENT = 20;
const EMPTY: Wallet = { balance: 0, earned: 0, byGame: {}, owned: [], recent: [] };
type Listener = (w: Wallet, award?: { game: string; amount: number; reason: string }) => void;
const listeners = new Set<Listener>();

export function getWallet(): Wallet {
  const w = store.get<Partial<Wallet>>(KEY, {});
  return { ...EMPTY, ...w, byGame: { ...(w.byGame ?? {}) }, owned: [...(w.owned ?? [])], recent: [...(w.recent ?? [])] };
}
export const getStars = (): number => getWallet().balance;

/** Adds stars for something done in a game. Amounts below 1 are ignored (stars are never taken away). */
export function awardStars(gameId: string, amount: number, reason: string, now = Date.now()): Wallet {
  const n = Math.floor(amount);
  const w = getWallet();
  if (!(n >= 1)) return w;
  w.balance += n;
  w.earned += n;
  w.byGame[gameId] = (w.byGame[gameId] ?? 0) + n;
  w.recent = [{ game: gameId, amount: n, reason, at: now }, ...w.recent].slice(0, RECENT);
  store.set(KEY, w);
  for (const l of listeners) l(w, { game: gameId, amount: n, reason });
  return w;
}

/** For the pet shop (later): can the learner afford this? */
export const canSpend = (price: number): boolean => price >= 0 && getWallet().balance >= price;

/** For the pet shop (later): the learner chooses an item. Returns false (and changes nothing) if not affordable. */
export function spend(price: number, itemId: string): boolean {
  const w = getWallet();
  if (!(price >= 0) || w.balance < price) return false;
  w.balance -= price;
  if (!w.owned.includes(itemId)) w.owned.push(itemId);
  store.set(KEY, w);
  for (const l of listeners) l(w);
  return true;
}

/** Called after every change (e.g. to update a star counter on screen). Returns an unsubscribe function. */
export function onWallet(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
