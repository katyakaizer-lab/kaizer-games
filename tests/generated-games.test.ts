// Scoring and content rules of the five generated-content games (Pociones, Golpe de voz, Libros de hechizos,
// Cartas de verbos, ¿Pero o perro?) and the shared answer check.
import { describe, expect, it } from 'vitest';
import { loadWordFiles } from '../tools/words-lib';
import { checkAnswer, roundStars, rng } from '../src/games/kit/answer';
import * as poc from '../src/games/pociones/engine';
import * as gv from '../src/games/golpe/engine';
import * as lib from '../src/games/libros/engine';
import * as cv from '../src/games/cartas/engine';
import * as par from '../src/games/pares/engine';
import { STARS } from '../src/rewards/config';
import { stress } from '../src/lang/es/stress';

const { entries } = loadWordFiles();

describe('shared answer check', () => {
  it('ok ignores case and spaces; accents and ñ are near misses; anything else is wrong', () => {
    expect(checkAnswer('  Veintiún ', 'veintiún').verdict).toBe('ok');
    expect(checkAnswer('veintiun', 'veintiún')).toMatchObject({ verdict: 'near', note: '¡Casi! Falta la tilde: Ú' });
    expect(checkAnswer('una', 'uña')).toMatchObject({ verdict: 'near', note: '¡Casi! Es Ñ' });
    expect(checkAnswer('veintiuno', 'veintiún').verdict).toBe('wrong');
    expect(checkAnswer('x', ['a', 'x']).verdict).toBe('ok');
  });
  it('round stars: one per item right first time, plus the bonus only when finished', () => {
    expect(roundStars(5, true, 2)).toBe(7);
    expect(roundStars(5, false, 2)).toBe(5);
    expect(roundStars(-1, false, 2)).toBe(0);
  });
  it('every game has star values, all positive (stars are never taken away)', () => {
    for (const g of ['pociones', 'golpe', 'libros', 'cartas', 'pares'] as const) for (const v of Object.values(STARS[g])) expect(v).toBeGreaterThan(0);
  });
});

describe('Pociones de números', () => {
  const task = (mode: poc.ModeId, seed: number) => poc.makeRound(mode, seed)[0];
  it('the word answer goes before its noun: gender and apocope', () => {
    expect(poc.numberBefore(21, { singular: 'globo', plural: 'globos', gender: 'm' })).toBe('veintiún');
    expect(poc.numberBefore(21, { singular: 'estrella', plural: 'estrellas', gender: 'f' })).toBe('veintiuna');
    expect(poc.numberBefore(200, { singular: 'persona', plural: 'personas', gender: 'f' })).toBe('doscientas');
    expect(poc.numberBefore(1, { singular: 'libro', plural: 'libros', gender: 'm' })).toBe('un');
    expect(poc.numberBefore(2_000_000, { singular: 'euro', plural: 'euros', gender: 'm' })).toBe('dos millones de');
  });
  it('a wrong form of the right number gets a gender / apocope hint; accents are near misses', () => {
    const t: poc.Task = { mode: 'contar', show: { kind: 'count', n: 21, tens: 0, shape: 'globo' }, suffix: 'globos', accepted: ['veintiún'], n: 21, digits: '21', spoken: 'veintiún globos' };
    expect(poc.checkWords(t, 'veintiún').verdict).toBe('ok');
    expect(poc.checkWords(t, 'veintiun').verdict).toBe('near');
    const w = poc.checkWords(t, 'veintiuno');
    expect(w.verdict).toBe('wrong');
    expect(w.hint).toMatch(/género o la forma corta/);
    expect(poc.checkWords(t, 'veintidós').hint).toBeUndefined();
  });
  it('digits: spaces, dots and decimal commas are tolerated', () => {
    const t = { ...task('contar', 1), digits: '2500000' } as poc.Task;
    expect(poc.checkDigits(t, '2 500 000')).toBe(true);
    expect(poc.checkDigits(t, '2.500.000')).toBe(true);
    const p = { ...t, mode: 'precios', digits: '3,50' } as poc.Task;
    expect(poc.checkDigits(p, '3,5')).toBe(true);
    expect(poc.checkDigits(p, '3.50')).toBe(true);
    expect(poc.checkDigits(p, '3,05')).toBe(false);
  });
  it('every mode makes 8 different tasks whose spoken phrase contains an accepted answer', () => {
    for (const m of poc.MODES) for (const seed of [1, 2, 3]) {
      const r = poc.makeRound(m.id, seed);
      expect(r.length, m.id).toBe(8);
      expect(new Set(r.map((x) => x.spoken)).size).toBe(8);
      for (const x of r) expect(x.spoken, m.id).toContain(x.accepted[0]);
    }
  });
  it('counting shows as many things as the answer (jars of ten in "cien")', () => {
    for (const x of poc.makeRound('cien', 4)) if (x.show.kind === 'count') { expect(x.show.tens).toBe(Math.floor(x.show.n / 10)); expect(String(x.show.n)).toBe(x.digits); }
  });
  it('prices accept "con" and "y ... céntimos"', () => {
    const r = poc.makeRound('precios', 9, 30).find((x) => x.accepted.length > 1)!;
    expect(r.accepted.some((a) => / y .* céntimos?$/.test(a))).toBe(true);
  });
});

describe('Golpe de voz', () => {
  it('words are usable bank words, shown without accents, and the round mixes the kinds', () => {
    const r = gv.makeWordRound('tipos', entries, 7);
    expect(r).toHaveLength(10);
    for (const t of r) { expect(t.shown.join('')).not.toMatch(/[áéíóú]/); expect(t.shown.length).toBe(t.info.syllables.length); }
    expect(new Set(r.map((t) => t.info.type)).size).toBeGreaterThanOrEqual(3);
    expect(r.some((t) => t.info.hasAccent) && r.some((t) => !t.info.hasAccent)).toBe(true);
  });
  it('hiatus mode has words with a hiatus or diphthong; país shows as pa-is', () => {
    for (const t of gv.makeWordRound('hiatos', entries, 3)) expect(t.info.hiatus.length + t.info.diphthongs.length).toBeGreaterThan(0);
    const pais = gv.wordTask({ lemma: 'país', translations: { en: 'country', ru: 'страна' } } as never);
    expect(pais.shown).toEqual(['pa', 'is']);
  });
  it('a word scores only when both the syllable and the accent answer are right', () => {
    const t = gv.wordTask({ lemma: 'árbol', translations: { en: 'tree', ru: 'дерево' } } as never);
    expect(gv.wordRight(t, 0, true)).toBe(true);
    expect(gv.wordRight(t, 1, true)).toBe(false);
    expect(gv.wordRight(t, 0, false)).toBe(false);
  });
  it('every diacritic sentence has a choice and is spelled the way the engine expects', () => {
    expect(gv.SENTENCES.length).toBeGreaterThanOrEqual(30);
    for (const s of gv.SENTENCES) {
      const t = gv.sentenceTask(s);
      const words = t.parts.filter((p) => 'plain' in p);
      expect(words.length, s).toBeGreaterThan(0);
      expect(t.parts.map((p) => ('text' in p ? p.text : p.answer)).join('')).toBe(s);
      // The right choices score, all-plain scores only when nothing needs an accent.
      const right = words.map((w) => 'plain' in w && w.answer !== w.plain);
      expect(gv.sentenceRight(t, right), s).toBe(true);
      expect(gv.sentenceRight(t, right.map(() => false))).toBe(right.every((x) => !x));
    }
    expect(gv.accentedForm('Que')).toBe('Qué');
    expect(stress('tú').needsAccent).toBe(true);
  });
});

describe('Libros de hechizos', () => {
  it('every mode makes a page whose targets join from its own pieces', () => {
    for (const m of lib.MODES) for (const seed of [1, 2, 3, 4]) {
      const page = lib.makePage(m.id, entries, seed);
      expect(page, `${m.id} seed ${seed}`).not.toBeNull();
      expect(page!.targets.length, m.id).toBeGreaterThanOrEqual(4);
      expect(new Set(page!.targets.map((t) => t.word)).size).toBe(page!.targets.length);
      for (const t of page!.targets) {
        expect(t.start + t.end).toBe(t.word);
        expect(page!.starts.some((p) => p.text === t.start), `${m.id}: start ${t.start}`).toBe(true);
        expect(page!.ends.some((p) => p.text === t.end), `${m.id}: end ${t.end}`).toBe(true);
      }
    }
  });
  it('joining: a target counts once, another real word is an extra, nonsense is nothing; the page completes', () => {
    const page = lib.makePage('presente', entries, 5)!;
    const found = new Set<string>();
    const [t0] = page.targets;
    expect(lib.join(page, found, t0.start, t0.end)).toMatchObject({ kind: 'target' });
    found.add(t0.word);
    expect(lib.join(page, found, t0.start, t0.end).kind).not.toBe('target');
    expect(lib.join(page, found, t0.start, 'zzz').kind).toBe('none');
    for (const t of page.targets) found.add(t.word);
    expect(lib.pageDone(page, found)).toBe(true);
  });
  it('verb pieces come from the conjugation engine (habl + amos)', () => {
    const e = entries.find((x) => x.lemma === 'hablar')!;
    const v = lib.verbForms(e, { mood: 'indicative', tense: 'presente' })!;
    expect(v.stem).toBe('habl');
    expect(v.forms[3]).toMatchObject({ form: 'hablamos', end: 'amos' });
    expect(lib.verbForms(e, { mood: 'indicative', tense: 'futuro' })!.forms[0]).toMatchObject({ form: 'hablaré', end: 'é' });
  });
  it('suffix words split at the suffix and -mente adverbs use the feminine form', () => {
    const s = lib.suffixWords(entries, 'C1');
    expect(s.find((x) => x.word === 'cafetería')).toMatchObject({ stem: 'cafet', suffix: 'ería' });
    expect(s.find((x) => x.word === 'rápidamente')).toMatchObject({ stem: 'rápida', suffix: 'mente' });
    expect(s.some((x) => x.word === 'ciudad' || x.word === 'febrero')).toBe(false);
  });
});

describe('Cartas de verbos', () => {
  it('cards match by tense or person, and their answers come from the engine', () => {
    const s = cv.deal(entries, 'B1', 2, 11);
    expect(s.players).toHaveLength(3);
    for (const p of s.players) expect(p.hand).toHaveLength(cv.HAND);
    const a = { ...s.pile[0] };
    expect(cv.canPlay({ ...a, person: (a.person + 1) % 6 }, a)).toBe(true);
    expect(cv.canPlay({ ...a, tense: a.tense === 'presente' ? 'futuro' : 'presente' }, a)).toBe(true);
    expect(cv.canPlay({ ...a, person: (a.person + 1) % 6, tense: a.tense === 'presente' ? 'futuro' : 'presente' }, a)).toBe(false);
    expect(cv.formOf('hablar', 'regular', 'indefinido', 3)).toBe('hablamos');
    expect(cv.formOf('tener', 'tener', 'subjuntivo', 0)).toBe('tenga');
  });
  it('each level only uses its tenses; A1 has no reflexive verbs', () => {
    for (const l of ['A1', 'A2', 'B1', 'B2', 'C1'] as const) {
      const deck = cv.makeDeck(entries, l, rng(3));
      expect(deck.length).toBeGreaterThan(30);
      for (const c of deck) { expect(cv.LEVEL_TENSES[l]).toContain(c.tense); expect(c.answer).toBeTruthy(); }
      if (l === 'A1') expect(deck.some((c) => /se$/.test(c.verb))).toBe(false);
    }
  });
  it('playing passes the turn and an empty hand wins; drawing refills from the pile', () => {
    const s = cv.deal(entries, 'A1', 1, 2);
    s.players[0].hand = [{ ...cv.top(s) }];
    cv.play(s, 0, 0);
    expect(s.winner).toBe(0);
    const s2 = cv.deal(entries, 'A1', 1, 3);
    s2.deck = [];
    s2.pile = [s2.players[1].hand[0], s2.players[1].hand[1]];
    const before = s2.players[0].hand.length;
    cv.draw(s2, 0, rng(1));
    expect(s2.players[0].hand.length).toBe(before + 1);
    expect(s2.turn).toBe(1);
  });
  it('a whole game between bots always ends', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = cv.deal(entries, 'B1', 3, seed);
      s.players[0].bot = true;
      const r = rng(seed);
      for (let k = 0; k < 2000 && s.winner === null; k++) cv.botTurn(s, r);
      expect(s.winner, `seed ${seed}`).not.toBeNull();
    }
  });
});

describe('¿Pero o perro?', () => {
  it('classifies pairs from the spelling', () => {
    expect(par.classify('perro', 'pero')).toBe('r');
    expect(par.classify('caña', 'cana')).toBe('n');
    expect(par.classify('peso', 'piso')).toBe('vocales');
    expect(par.classify('papá', 'papa')).toBe('acento');
    expect(par.classify('término', 'terminó')).toBe('acento');
    expect(par.classify('casa', 'caza')).toBe('sz');
    expect(par.classify('cocer', 'coser')).toBe('sz');
    expect(par.classify('gato', 'mesa')).toBeNull();
  });
  it('the bank has pairs in every set, each once', () => {
    const pairs = par.bankPairs(entries);
    for (const s of ['r', 'n', 'vocales', 'acento', 'sz'] as const) expect(pairs.filter((p) => p.set === s).length, s).toBeGreaterThanOrEqual(3);
    expect(new Set(pairs.map((p) => [p.a, p.b].sort().join('|'))).size).toBe(pairs.length);
  });
  it('a round has 10 questions; the heard word is one of the two options; scoring', () => {
    const qs = par.makeRound(par.bankPairs(entries), 'r', 4);
    expect(qs).toHaveLength(10);
    for (const q of qs) { expect(q.options).toContain(q.heard); expect(par.isRight(q, q.heard)).toBe(true); expect(par.isRight(q, q.options.find((o) => o !== q.heard)!)).toBe(false); }
  });
  it('recording file names are ASCII and tell stress pairs apart', () => {
    expect(par.audioId('papá')).toBe('papa_');
    expect(par.audioId('papa')).toBe('papa');
    expect(par.audioId('caña')).toBe('canya');
    expect(par.audioId('término')).not.toBe(par.audioId('terminó'));
  });
});
