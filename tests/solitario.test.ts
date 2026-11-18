import { describe, expect, it } from 'vitest';
import setsFile from '../src/data/solitario/sets.json';
import { canPlace, cycle, isSorted, nameOptions, newGame, place, rightPile, wrongNames, type CardSet, type SolitarioData } from '../src/games/solitario/engine';
import { validateSolitario } from '../src/games/solitario/validate';

const data = setsFile as unknown as SolitarioData;
const casa = data.sets.find((s) => s.id === 'casa')!;
const clone = (): SolitarioData => structuredClone(data);

describe('solitario engine, normal mode', () => {
  it('deals three open cards and refills after a correct placement', () => {
    const s = newGame(casa, 'normal', 1);
    expect(s.open.filter(Boolean).length).toBe(3);
    const total = casa.categories.reduce((n, c) => n + c.items.length, 0);
    expect(s.deck.length).toBe(total - 3);
    const card = s.open[0]!;
    expect(place(s, card, s.cards[card].cat)).toBe(true);
    expect(s.open.filter(Boolean).length).toBe(3);
    expect(s.deck.length).toBe(total - 4);
  });
  it('a card only fits its own category; a miss changes nothing but the miss count', () => {
    const s = newGame(casa, 'normal', 2);
    const card = s.open[0]!;
    const other = casa.categories.find((c) => c.id !== s.cards[card].cat)!.id;
    expect(canPlace(s, card, other)).toBe(false);
    const before = JSON.stringify({ open: s.open, piles: s.piles, deck: s.deck });
    expect(place(s, card, other)).toBe(false);
    expect(JSON.stringify({ open: s.open, piles: s.piles, deck: s.deck })).toBe(before);
    expect(s.misses).toBe(1);
    expect(rightPile(s, card)).toBe(s.cards[card].cat);
  });
  it('"Otras cartas" swaps the open cards and keeps every card', () => {
    const s = newGame(casa, 'normal', 3);
    const all = () => [...s.deck, ...s.open.filter(Boolean)].sort();
    const before = all();
    const open = [...s.open];
    cycle(s);
    expect(all()).toEqual(before);
    expect(s.open).not.toEqual(open);
  });
  it('can always be finished', () => {
    for (const set of data.sets) {
      const s = newGame(set, 'normal', 4);
      let guard = 0;
      while (!isSorted(s) && guard++ < 200) { const c = s.open.find(Boolean)!; place(s, c, s.cards[c].cat); }
      expect(isSorted(s), set.id).toBe(true);
    }
  });
});

describe('solitario engine, experto', () => {
  it('a card starts an empty group only if its category has no group yet, then groups stay pure', () => {
    const s = newGame(casa, 'experto', 5);
    const [a] = s.open as string[];
    expect(place(s, a, '0')).toBe(true);
    const same = Object.values(s.cards).find((c) => c.cat === s.cards[a].cat && s.open.includes(c.id));
    const diff = s.open.find((id) => id && s.cards[id].cat !== s.cards[a].cat)!;
    expect(canPlace(s, diff, '0')).toBe(false);
    expect(canPlace(s, diff, '1')).toBe(true);
    if (same) expect(canPlace(s, same.id, '1')).toBe(false);
  });
  it('can always be finished, and the groups must then be named', () => {
    const s = newGame(casa, 'experto', 6);
    let guard = 0;
    while (!isSorted(s) && guard++ < 200) { const c = s.open.find(Boolean)!; place(s, c, rightPile(s, c)!); }
    expect(isSorted(s)).toBe(true);
    const right: Record<string, string> = {};
    for (const k of Object.keys(s.piles)) right[k] = casa.categories.find((c) => c.id === s.pileCat[k])!.name_es;
    expect(wrongNames(casa, s, right)).toEqual([]);
    expect(wrongNames(casa, s, { ...right, 0: 'El jardín' })).toEqual(['0']);
    expect(nameOptions(casa)).toEqual(expect.arrayContaining(['La cocina', 'El dormitorio', 'El baño', 'El jardín']));
  });
});

describe('solitario validator', () => {
  it('passes the sets and counts them as unreviewed', () => {
    const r = validateSolitario(clone());
    expect(r.errors).toEqual([]);
    expect(r.unreviewed.length).toBe(data.sets.length);
  });
  const broken = (f: (d: SolitarioData) => void) => { const d = clone(); f(d); return validateSolitario(d).errors.join('\n'); };
  it('fails a word that sits in two categories', () => expect(broken((d) => { d.sets[0].categories[1].items.push({ ...d.sets[0].categories[0].items[0] }); })).toMatch(/is in both/));
  it('fails too few cards in a category', () => expect(broken((d) => { d.sets[0].categories[0].items.length = 2; })).toMatch(/3 to 8 cards/));
  it('fails a decoy name that is a real name', () => expect(broken((d) => { (d.sets[0] as CardSet).decoyNames = ['La cocina']; })).toMatch(/decoy name/));
  it('fails repeated set ids', () => expect(broken((d) => { d.sets[1].id = d.sets[0].id; })).toMatch(/id repeats/));
  it('fails a missing translation', () => expect(broken((d) => { d.sets[0].categories[0].items[0].ru = ''; })).toMatch(/needs en and ru/));
});
