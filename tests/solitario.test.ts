import { describe, expect, it } from 'vitest';
import catsFile from '../src/data/solitario/categories.json';
import {
  canPlace, dealOnce, drawCard, hintFor, isWon, move, newGame, pickCategories, runAt, solve, undo,
  type Category, type GameState, type SolitarioData,
} from '../src/games/solitario/engine';
import { validateSolitario } from '../src/games/solitario/validate';

const data = catsFile as unknown as SolitarioData;
const pool = (l: string) => data.categories.filter((c) => c.level === l) as Category[];
const clone = (): SolitarioData => structuredClone(data);

/** A hand-built table for rule tests: categories a and b, each with a category card and words. */
function table(): GameState {
  const s = dealOnce(pool('A1'), { seed: 1, columns: 3, categories: 2, rows: 0 });
  const card = (id: string, cat: string, kind: 'cat' | 'word') => ({ id, cat, kind, item: { es: id, en: '', ru: '' } });
  s.cats = [{ ...s.cats[0], id: 'a' }, { ...s.cats[1], id: 'b' }];
  s.cards = { 'a:cat': card('a:cat', 'a', 'cat'), 'a:0': card('a:0', 'a', 'word'), 'a:1': card('a:1', 'a', 'word'), 'b:cat': card('b:cat', 'b', 'cat'), 'b:0': card('b:0', 'b', 'word') };
  s.size = { a: 2, b: 1 };
  s.cols = [['b:0', 'a:0'], ['a:cat'], []];
  s.stock = ['b:cat', 'a:1'];
  s.waste = [];
  s.slots = [{ cat: null, words: [] }, { cat: null, words: [] }];
  return s;
}

describe('rules', () => {
  it('an empty slot takes only a category card; then only that category\'s words', () => {
    const s = table();
    expect(canPlace(s, ['a:0'], { kind: 'slot', index: 0 })).toBe(false);
    expect(move(s, { kind: 'col', col: 0, index: 1 }, { kind: 'slot', index: 0 })).toBe(false);
    expect(move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'slot', index: 0 })).toBe(true);
    expect(s.slots[0].cat).toBe('a');
    expect(canPlace(s, ['b:0'], { kind: 'slot', index: 0 })).toBe(false);
    expect(move(s, { kind: 'col', col: 0, index: 1 }, { kind: 'slot', index: 0 })).toBe(true);
    expect(s.slots[0].words).toEqual(['a:0']);
  });
  it('on the columns a card goes on the same category (word or category card) or an empty column', () => {
    const s = table();
    expect(canPlace(s, ['a:0'], { kind: 'col', col: 1 })).toBe(true); // a word on its category card
    expect(canPlace(s, ['a:cat'], { kind: 'col', col: 0 })).toBe(true); // a category card on its word
    expect(canPlace(s, ['b:0'], { kind: 'col', col: 1 })).toBe(false); // another category's word
    expect(canPlace(s, ['a:0'], { kind: 'col', col: 2 })).toBe(true); // an empty column takes anything
    expect(move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'col', col: 0 })).toBe(true);
    expect(s.cols[0]).toEqual(['b:0', 'a:0', 'a:cat']);
  });
  it('a run of one category moves together; mixed runs do not', () => {
    const s = table();
    expect(runAt(s, { kind: 'col', col: 0, index: 0 })).toBe(null); // b:0 + a:0 mixed
    move(s, { kind: 'col', col: 0, index: 1 }, { kind: 'col', col: 1 }); // a:0 onto a:cat
    expect(runAt(s, { kind: 'col', col: 1, index: 0 })).toEqual(['a:cat', 'a:0']);
    // the whole run opens a slot: category card first, its words on it
    expect(move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'slot', index: 1 })).toBe(true);
    expect(s.slots[1]).toEqual({ cat: 'a', words: ['a:0'] });
  });
  it('a complete category leaves the table and frees its slot', () => {
    const s = table();
    move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'slot', index: 0 });
    move(s, { kind: 'col', col: 0, index: 1 }, { kind: 'slot', index: 0 });
    drawCard(s); // a:1
    expect(move(s, { kind: 'waste' }, { kind: 'slot', index: 0 })).toBe(true);
    expect(s.done).toEqual(['a']);
    expect(s.slots[0]).toEqual({ cat: null, words: [] });
  });
  it('every move and every turn of the deck counts; undo goes back one step', () => {
    const s = table();
    drawCard(s);
    move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'slot', index: 0 });
    expect(s.moves).toBe(2);
    expect(undo(s)).toBe(true);
    expect(s.moves).toBe(1);
    expect(s.slots[0].cat).toBe(null);
    expect(s.cols[1]).toEqual(['a:cat']);
    expect(undo(s)).toBe(true);
    expect(s.waste).toEqual([]);
    expect(undo(s)).toBe(false);
  });
  it('the deck turns over one card, then starts again when empty', () => {
    const s = table();
    expect(drawCard(s)).toBe('drawn');
    expect(drawCard(s)).toBe('drawn');
    expect(drawCard(s)).toBe('recycled');
    expect(s.stock).toEqual(['b:cat', 'a:1']);
  });
  it('Pista prefers an open slot, then an empty slot for a category card', () => {
    const s = table();
    expect(hintFor(s, { kind: 'col', col: 1, index: 0 })).toEqual({ kind: 'slot', index: 0 });
    move(s, { kind: 'col', col: 1, index: 0 }, { kind: 'slot', index: 1 });
    expect(hintFor(s, { kind: 'col', col: 0, index: 1 })).toEqual({ kind: 'slot', index: 1 });
  });
});

describe('dealing', () => {
  it('mixes categories of one level, each with its category card and 4 to 6 words', () => {
    const s = newGame(pool('A1'), { seed: 4, columns: 5, categories: 5 });
    expect(s.cats.length).toBe(5);
    expect(s.cats.every((c) => c.level === 'A1')).toBe(true);
    for (const c of s.cats) {
      expect(s.cards[`${c.id}:cat`].kind).toBe('cat');
      expect(s.size[c.id]).toBeGreaterThanOrEqual(4);
      expect(s.size[c.id]).toBeLessThanOrEqual(6);
    }
    expect(s.cols.every((c) => c.length === 4)).toBe(true);
    expect(s.slots.length).toBe(5);
  });
  it('different deals use different categories', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) pickCategories(pool('A1'), seed, 5).forEach((c) => seen.add(c.id));
    expect(seen.size).toBe(10);
  });
  it('the same seed gives the same deal', () => {
    expect(JSON.stringify(newGame(pool('B1'), { seed: 9 }).cols)).toBe(JSON.stringify(newGame(pool('B1'), { seed: 9 }).cols));
  });
});

describe('every deal can be won', () => {
  for (const level of ['A1', 'A2', 'B1', 'B2']) {
    it(level, () => {
      for (let seed = 0; seed < 40; seed++) {
        for (const lay of [{ columns: 5, categories: 5 }, { columns: 7, categories: 6 }]) {
          const s = newGame(pool(level), { ...lay, seed });
          const steps = solve(s);
          expect(steps, level + ' seed ' + seed).not.toBe(null);
          // replay the steps on the real state
          for (const st of steps!) { if (st.kind === 'draw') drawCard(s); else expect(move(s, st.src, st.dst)).toBe(true); }
          expect(isWon(s)).toBe(true);
        }
      }
    });
  }
});

describe('validator', () => {
  it('passes the categories and counts them as unreviewed', () => {
    const r = validateSolitario(clone());
    expect(r.errors).toEqual([]);
    expect(r.unreviewed.length).toBe(data.categories.length);
  });
  const broken = (f: (d: SolitarioData) => void) => { const d = clone(); f(d); return validateSolitario(d).errors.join('\n'); };
  it('fails a word used twice in one level', () => expect(broken((d) => { const a1 = d.categories.filter((c) => c.level === 'A1'); a1[1].items.push({ ...a1[0].items[0] }); })).toMatch(/is in both/));
  it('fails too few cards', () => expect(broken((d) => { d.categories[0].items.length = 2; })).toMatch(/3 to 8 cards/));
  it('fails an unknown avoid', () => expect(broken((d) => { d.categories[0].avoid = ['nope']; })).toMatch(/unknown category/));
  it('fails a level that cannot deal six categories', () => expect(broken((d) => { d.categories = d.categories.filter((c) => !(c.level === 'B2' && (c.id === 'aves' || c.id === 'teatro' || c.id === 'especias'))); })).toMatch(/B2: fewer than 6/));
  it('fails a missing translation', () => expect(broken((d) => { d.categories[0].items[0].ru = ''; })).toMatch(/needs en and ru/));
});

describe('move limit', () => {
  it('every deal can be won within the chosen limit', async () => {
    const { movesLeft, outOfMoves } = await import('../src/games/solitario/engine');
    for (const limit of [50, 65, 80]) {
      for (let seed = 0; seed < 15; seed++) {
        for (const lay of [{ columns: 5, categories: 5 }, { columns: 9, categories: 7 }]) {
          const s = newGame(pool('A2'), { ...lay, seed, limit });
          expect(s.limit).toBeGreaterThanOrEqual(limit);
          const steps = solve(s)!;
          expect(steps.length).toBeLessThanOrEqual(s.limit!);
          expect(movesLeft(s)).toBe(s.limit);
          expect(outOfMoves(s)).toBe(false);
        }
      }
    }
  });
  it('running out stops nothing permanently: undo and restart bring moves back', async () => {
    const { outOfMoves, restart, movesLeft } = await import('../src/games/solitario/engine');
    const s = newGame(pool('A1'), { seed: 3, limit: 50 });
    const start = JSON.stringify(s.cols);
    while (!outOfMoves(s)) drawCard(s);
    expect(movesLeft(s)).toBe(0);
    expect(undo(s)).toBe(true);
    expect(outOfMoves(s)).toBe(false);
    restart(s);
    expect(s.moves).toBe(0);
    expect(JSON.stringify(s.cols)).toBe(start);
    expect(s.history).toEqual([]);
  });
});
