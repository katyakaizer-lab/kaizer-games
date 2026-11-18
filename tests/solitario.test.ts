import { describe, expect, it } from 'vitest';
import catsFile from '../src/data/solitario/categories.json';
import {
  canPlace, drawCard, hintFor, isWon, move, nameOptions, newGame, pickCategories, pileFor, runAt, wrongNames,
  type Category, type GameState, type SolitarioData, type Source,
} from '../src/games/solitario/engine';
import { validateSolitario } from '../src/games/solitario/validate';

const data = catsFile as unknown as SolitarioData;
const pool = (l: string) => data.categories.filter((c) => c.level === l) as Category[];
const clone = (): SolitarioData => structuredClone(data);

/** Plays greedily: any uncovered card to its foundation, otherwise turn the deck. */
function autoplay(s: GameState): boolean {
  for (let guard = 0; guard < 2000 && !isWon(s); guard++) {
    const srcs: Source[] = [{ kind: 'waste' }, ...s.cols.map((c, col) => ({ kind: 'col' as const, col, index: c.length - 1 }))];
    const src = srcs.find((x) => { const r = runAt(s, x); return r?.length === 1 && pileFor(s, r[0]); });
    if (src) move(s, src, { kind: 'pile', key: pileFor(s, runAt(s, src)![0])! });
    else drawCard(s);
  }
  return isWon(s);
}

describe('dealing', () => {
  it('picks four categories of one level and never two that avoid each other', () => {
    for (let seed = 0; seed < 200; seed++) {
      const cats = pickCategories(pool('A1'), seed);
      expect(cats.length).toBe(4);
      for (const a of cats) for (const b of cats) expect(a.avoid?.includes(b.id) ?? false).toBe(false);
    }
  });
  it('mixes topics: different deals use different categories', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) pickCategories(pool('A1'), seed).forEach((c) => seen.add(c.id));
    expect(seen.size).toBeGreaterThan(8);
  });
  it('deals classic columns: 1, 2, 3, 4 cards, only the top one face up; the rest is the deck', () => {
    const s = newGame(pool('A1'), 'normal', { seed: 3, columns: 4 });
    expect(s.cols.map((c) => c.length)).toEqual([1, 2, 3, 4]);
    for (const col of s.cols) col.forEach((id, i) => expect(s.cards[id].up).toBe(i === col.length - 1));
    expect(Object.keys(s.cards).length).toBe(20);
    expect(s.stock.length).toBe(10);
  });
});

describe('moves', () => {
  it('a card goes only on a same-category card or an empty column; uncovering flips the next card', () => {
    const s = newGame(pool('A1'), 'normal', { seed: 11, columns: 4 });
    const card = (id: string, cat: string, es: string, up: boolean) => ({ id, cat, item: { es, en: '', ru: '' }, up });
    s.cols = [['a:0'], ['b:0'], ['x:0', 'a:1'], []];
    s.cards = { 'a:0': card('a:0', 'a', 'uno', true), 'a:1': card('a:1', 'a', 'dos', true), 'b:0': card('b:0', 'b', 'tres', true), 'x:0': card('x:0', 'x', 'cuatro', false) };
    expect(canPlace(s, ['a:1'], { kind: 'col', col: 1 })).toBe(false);
    expect(move(s, { kind: 'col', col: 2, index: 1 }, { kind: 'col', col: 1 })).toBe(false);
    expect(s.misses).toBe(1);
    expect(move(s, { kind: 'col', col: 2, index: 1 }, { kind: 'col', col: 0 })).toBe(true);
    expect(s.cols[0]).toEqual(['a:0', 'a:1']);
    expect(s.cards['x:0'].up).toBe(true);
    // a run moves together, onto an empty column
    expect(runAt(s, { kind: 'col', col: 0, index: 0 })).toEqual(['a:0', 'a:1']);
    expect(move(s, { kind: 'col', col: 0, index: 0 }, { kind: 'col', col: 3 })).toBe(true);
    expect(s.cols[3]).toEqual(['a:0', 'a:1']);
    // only one card at a time goes up to a category
    expect(canPlace(s, ['a:0', 'a:1'], { kind: 'pile', key: Object.keys(s.piles)[0] })).toBe(false);
  });
  it('the deck turns over one card, then turns back over when empty', () => {
    const s = newGame(pool('A2'), 'normal', { seed: 5, columns: 3 });
    const n = s.stock.length;
    expect(drawCard(s)).toBe('drawn');
    expect(s.waste.length).toBe(1);
    expect(s.cards[s.waste[0]].up).toBe(true);
    for (let i = 1; i < n; i++) drawCard(s);
    expect(drawCard(s)).toBe('recycled');
    expect(s.stock.length).toBe(n);
    expect(s.waste.length).toBe(0);
  });
  it('Pista points to the foundation for a single card', () => {
    const s = newGame(pool('B1'), 'normal', { seed: 8, columns: 3 });
    expect(hintFor(s, { kind: 'col', col: 0, index: 0 })).toEqual({ kind: 'pile', key: s.cards[s.cols[0][0]].cat });
  });
});

describe('every game can be finished', () => {
  for (const level of ['A1', 'A2', 'B1', 'B2']) {
    it(level, () => {
      for (let seed = 0; seed < 25; seed++) {
        for (const columns of [3, 4, 5]) {
          expect(autoplay(newGame(pool(level), 'normal', { seed, columns })), level + ' seed ' + seed).toBe(true);
          expect(autoplay(newGame(pool(level), 'experto', { seed, columns })), level + ' experto seed ' + seed).toBe(true);
        }
      }
    });
  }
  it('experto groups are named at the end, with decoys from the same level', () => {
    const s = newGame(pool('A1'), 'experto', { seed: 2 });
    autoplay(s);
    const right: Record<string, string> = {};
    for (const k of Object.keys(s.piles)) right[k] = s.cats.find((c) => c.id === s.pileCat[k])!.name_es;
    expect(wrongNames(s, right)).toEqual([]);
    expect(wrongNames(s, { ...right, 0: 'nada' })).toEqual(['0']);
    const opts = nameOptions(s, pool('A1'));
    expect(opts.length).toBe(6);
    expect(opts).toEqual(expect.arrayContaining(Object.values(right)));
  });
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
  it('fails a level that cannot deal four categories', () => expect(broken((d) => { d.categories = d.categories.filter((c) => !(c.level === 'B2' && c.id === 'por')); })).toMatch(/B2: fewer than 4/));
  it('fails a missing translation', () => expect(broken((d) => { d.categories[0].items[0].ru = ''; })).toMatch(/needs en and ru/));
});
