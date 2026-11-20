/**
 * Cartas de verbos: our own card game (no numbers, no special cards). Each card is a pronoun + infinitive + tense,
 * coloured by tense. A card may go on the pile when it matches the top card's tense or person, and only by typing
 * the right form (from the conjugation engine). A wrong form costs nothing: the card stays in the hand. The first
 * player with an empty hand wins. Bots use the same engine. Pure (tested).
 */
import { conjugate } from '../../lang/es/conjugate.ts';
import type { WordEntry } from '../../words/types.ts';
import { levelRank, pick, rng, shuffle, type Level } from '../kit/answer.ts';

export type TenseId = 'presente' | 'perfecto' | 'indefinido' | 'imperfecto' | 'futuro' | 'condicional' | 'subjuntivo' | 'subjuntivo-imperfecto' | 'pluscuamperfecto';
export const TENSE: Record<TenseId, { mood: 'indicative' | 'subjunctive'; key: string; name: string; colour: number }> = {
  presente: { mood: 'indicative', key: 'presente', name: 'presente', colour: 0 },
  perfecto: { mood: 'indicative', key: 'perfecto', name: 'pretérito perfecto', colour: 1 },
  indefinido: { mood: 'indicative', key: 'preterito', name: 'pretérito indefinido', colour: 2 },
  imperfecto: { mood: 'indicative', key: 'imperfecto', name: 'pretérito imperfecto', colour: 3 },
  futuro: { mood: 'indicative', key: 'futuro', name: 'futuro', colour: 4 },
  condicional: { mood: 'indicative', key: 'condicional', name: 'condicional', colour: 5 },
  subjuntivo: { mood: 'subjunctive', key: 'presente', name: 'presente de subjuntivo', colour: 1 },
  'subjuntivo-imperfecto': { mood: 'subjunctive', key: 'imperfecto', name: 'imperfecto de subjuntivo', colour: 3 },
  pluscuamperfecto: { mood: 'indicative', key: 'pluscuamperfecto', name: 'pluscuamperfecto', colour: 0 },
};
export const LEVEL_TENSES: Record<Level, TenseId[]> = {
  A1: ['presente'],
  A2: ['presente', 'perfecto', 'indefinido'],
  B1: ['presente', 'indefinido', 'imperfecto', 'futuro'],
  B2: ['indefinido', 'imperfecto', 'condicional', 'subjuntivo'],
  C1: ['subjuntivo', 'subjuntivo-imperfecto', 'condicional', 'pluscuamperfecto'],
};
/** Pronouns shown on cards (third persons vary: él, ella, usted). */
export const PRONOUNS: string[][] = [['yo'], ['tú'], ['él', 'ella', 'usted'], ['nosotros', 'nosotras'], ['vosotros', 'vosotras'], ['ellos', 'ellas', 'ustedes']];

export interface Card { id: string; person: number; pronoun: string; verb: string; model: string; tense: TenseId; answer: string }
export interface Player { name: string; bot: boolean; hand: Card[] }
export interface GameState { players: Player[]; deck: Card[]; pile: Card[]; turn: number; winner: number | null; level: Level }

export const formOf = (verb: string, model: string, tense: TenseId, person: number): string => {
  const tk = TENSE[tense];
  return (conjugate(verb, model)[tk.mood] as Record<string, string[]>)[tk.key][person];
};

/** Verbs for a level: bank verbs up to the level (no reflexives at A1), that conjugate. */
export function verbsFor(words: WordEntry[], level: Level): WordEntry[] {
  return words.filter((e) => e.pos === 'verb' && e.verbModel && levelRank(e.level) <= levelRank(level) && !(level === 'A1' && /se$/.test(e.lemma)));
}

export function makeDeck(words: WordEntry[], level: Level, r: () => number, size = 48): Card[] {
  const verbs = shuffle(verbsFor(words, level), r);
  const tenses = LEVEL_TENSES[level];
  const cards: Card[] = [];
  for (let k = 0; cards.length < size && k < size * 3; k++) {
    const v = verbs[k % verbs.length];
    const person = k % 6;
    const tense = tenses[Math.floor(k / 6) % tenses.length];
    const answer = formOf(v.lemma, v.verbModel!, tense, person);
    if (!answer) continue;
    cards.push({ id: `c${k}`, person, pronoun: pick(PRONOUNS[person], r), verb: v.lemma, model: v.verbModel!, tense, answer });
  }
  return shuffle(cards, r);
}

export const BOT_NAMES = ['Luna', 'Pino', 'Brisa'];
export const HAND = 5;
export function deal(words: WordEntry[], level: Level, bots: number, seed: number): GameState {
  const r = rng(seed);
  const deck = makeDeck(words, level, r);
  const players: Player[] = [{ name: 'Tú', bot: false, hand: [] }, ...BOT_NAMES.slice(0, Math.max(1, Math.min(3, bots))).map((name) => ({ name, bot: true, hand: [] }))];
  for (let k = 0; k < HAND; k++) for (const p of players) p.hand.push(deck.pop()!);
  return { players, deck, pile: [deck.pop()!], turn: 0, winner: null, level };
}

export const top = (s: GameState): Card => s.pile[s.pile.length - 1];
export const canPlay = (card: Card, onTop: Card): boolean => card.tense === onTop.tense || card.person === onTop.person;
export const playable = (s: GameState, p: number): number[] => s.players[p].hand.map((c, i) => (canPlay(c, top(s)) ? i : -1)).filter((i) => i >= 0);

/** Plays a card after the right form was typed; the turn passes. */
export function play(s: GameState, p: number, i: number): void {
  const [card] = s.players[p].hand.splice(i, 1);
  s.pile.push(card);
  if (!s.players[p].hand.length) s.winner = p;
  else pass(s);
}
/** Takes a card from the deck (the pile, except its top card, is shuffled back when the deck is empty); the turn passes. */
export function draw(s: GameState, p: number, r: () => number): Card | null {
  if (!s.deck.length && s.pile.length > 1) { s.deck = shuffle(s.pile.slice(0, -1), r); s.pile = [top(s)]; }
  const c = s.deck.pop() ?? null;
  if (c) s.players[p].hand.push(c);
  pass(s);
  return c;
}
export function pass(s: GameState): void { s.turn = (s.turn + 1) % s.players.length; }

/** A bot's turn: plays a matching card (its form comes from the engine), or now and then takes a card to think. */
export function botTurn(s: GameState, r: () => number): { played?: Card; drew?: boolean } {
  const p = s.turn;
  const options = playable(s, p);
  if (options.length && r() > 0.2) {
    const i = pick(options, r);
    const card = s.players[p].hand[i];
    play(s, p, i);
    return { played: card };
  }
  draw(s, p, r);
  return { drew: true };
}
