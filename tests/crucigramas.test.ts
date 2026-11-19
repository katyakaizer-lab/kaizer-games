import { describe, expect, it } from 'vitest';
import {
  LEVELS, bare, cellsOf, cluesOf, freshFirst, generate, hintCell, hintLimit, isSolved, lettersOf, mistakes, pushRecent, rng, solution,
  surpriseTopic, wordDone, type CrucigramaData, type Level, type Puzzle,
} from '../src/games/crucigramas/engine';
import { validateCrucigramas } from '../src/games/crucigramas/validate';
import { loadCrucigramas } from './helpers-crucigramas';

const data = loadCrucigramas();
const clone = (): CrucigramaData => structuredClone(data);

/** Grid rules every puzzle must keep. */
function gridProblems(p: Puzzle, maxCols: number, maxRows: number): string[] {
  const out: string[] = [];
  if (p.cols > maxCols || p.rows > maxRows) out.push(`grid ${p.cols}x${p.rows}`);
  const seen = new Map<string, string>();
  for (const w of p.words) cellsOf(w).forEach((k, i) => { const s = seen.get(k); if (s && s !== w.answer[i]) out.push(`${w.es}: clash at ${k}`); seen.set(k, w.answer[i]); });
  const sol = solution(p);
  for (const k of sol.keys()) {
    const [r, c] = k.split(',').map(Number);
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const n = `${r + dr},${c + dc}`;
      if (sol.has(n) && !p.words.some((w) => cellsOf(w).includes(k) && cellsOf(w).includes(n))) out.push(`stray neighbours ${k} ${n}`);
    }
  }
  const reach = new Set([p.words[0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const w of p.words) if (!reach.has(w) && [...reach].some((s) => cellsOf(s).some((k) => cellsOf(w).includes(k)))) { reach.add(w); changed = true; }
  }
  if (reach.size !== p.words.length) out.push('not connected');
  return out;
}

describe('content', () => {
  it('at least 9 topics per level, each with at least 20 words with 2-3 clues of different kinds', () => {
    expect(data.topics.length).toBeGreaterThanOrEqual(37);
    for (const l of LEVELS) expect(data.topics.filter((t) => t.level === l).length).toBeGreaterThanOrEqual(9);
    for (const t of data.topics) {
      expect(t.words.length, t.id).toBeGreaterThanOrEqual(20);
      for (const e of t.words) expect(cluesOf(e).length).toBeGreaterThanOrEqual(2);
      expect(t.reviewed).toBe(false);
    }
  });
  it('validator passes, and counts every topic as unreviewed', () => {
    const r = validateCrucigramas(clone(), 8);
    expect(r.errors).toEqual([]);
    expect(r.unreviewed.length).toBe(data.topics.length);
  });
  const broken = (f: (d: CrucigramaData) => void) => { const d = clone(); f(d); return validateCrucigramas(d, 3).errors.join('\n'); };
  it('fails a clue that gives the answer away', () => expect(broken((d) => { d.topics[0].words[0].clues.def = `Una ${d.topics[0].words[0].es} grande`; })).toMatch(/gives the answer away/));
  it('fails a gap clue without ___', () => expect(broken((d) => { d.topics[0].words[0].clues.gap = 'Sin hueco'; })).toMatch(/exactly one ___/));
  it('fails a duplicate word in a topic', () => expect(broken((d) => { d.topics[0].words.push(structuredClone(d.topics[0].words[0])); })).toMatch(/repeats in the topic/));
  it('fails a word that does not fit the grid', () => expect(broken((d) => { d.topics[0].words[0].es = 'electrodoméstico'; })).toMatch(/fits the A1 grid/));
  it('fails an accent stored as two characters, and -cion without accent', () => {
    expect(broken((d) => { d.topics[0].words[0].es = 'limón'; })).toMatch(/NFC/);
    expect(broken((d) => { d.topics[0].words[0].es = 'cancion'; })).toMatch(/-ción/);
  });
  it('fails a word with only one clue, and a topic with fewer than 20 words', () => {
    expect(broken((d) => { d.topics[0].words[0].clues = { def: 'Solo una pista' }; })).toMatch(/2 or 3 clues/);
    expect(broken((d) => { d.topics[0].words.length = 12; })).toMatch(/at least 20 words/);
  });
  it('ñ is not n when checking clues (uña vs una)', () => {
    const d = clone();
    d.topics[0].words[0] = { es: 'uña', clues: { def: 'Parte dura en la punta de cada dedo', gap: 'Me corto una ___' } };
    expect(validateCrucigramas(d, 2).errors.filter((e) => e.includes('"uña"'))).toEqual([]);
  });
  it('words removed in the level review stay out of their levels', () => {
    const at = (l: string) => new Set(data.topics.filter((t) => t.level === l).flatMap((t) => t.words.map((w) => w.es)));
    for (const w of ['mosto', 'horchata', 'sidra', 'cava', 'granizado', 'infusión', 'alcachofa', 'remolacha', 'rábano', 'puerro', 'tiza', 'pupitre']) expect(at('A2').has(w), w).toBe(false);
    for (const w of ['frambuesa', 'higo', 'granada', 'esfera', 'rombo', 'suegra', 'gemelos', 'barriga', 'tejado']) expect(at('A1').has(w), w).toBe(false);
    for (const w of ['hojaldre', 'gominola', 'horquilla', 'bisutería', 'riñonera', 'ganchillo', 'abrelatas', 'fregadero']) expect(at('B1').has(w), w).toBe(false);
    for (const w of ['nazareno', 'ofrenda', 'petardo', 'carroza', 'banderilla', 'salmorejo', 'fabada', 'pisto', 'migas', 'acantilado', 'musgo']) expect(at('B2').has(w), w).toBe(false);
  });
});

describe('generator', () => {
  for (const level of LEVELS) {
    it(`${level}: every topic gives valid, full grids`, () => {
      const cfg = data.levels[level as Level]!;
      for (const topic of data.topics.filter((t) => t.level === level)) {
        for (let seed = 1; seed <= 12; seed++) {
          const p = generate(topic, cfg, seed)!;
          expect(gridProblems(p, cfg.maxCols, cfg.maxRows), `${topic.id} ${seed}`).toEqual([]);
          expect(p.words.length).toBeGreaterThanOrEqual(cfg.words - 1);
        }
      }
    });
  }
  it('keeps accents and ñ in the cells', () => {
    expect(lettersOf('camión')).toEqual(['C', 'A', 'M', 'I', 'Ó', 'N']);
    expect(lettersOf('baño')).toEqual(['B', 'A', 'Ñ', 'O']);
  });
  it('picks one of each word\'s clues at random (different kinds appear)', () => {
    const kinds = new Set<string>();
    const t = data.topics.find((x) => x.id === 'frutas')!;
    for (let s = 1; s < 30; s++) for (const w of generate(t, data.levels.A1, s)!.words) kinds.add(w.clue.kind);
    expect(kinds.has('def') && kinds.has('gap')).toBe(true);
  });
});

describe('no repeats', () => {
  it('over 10 puzzles of a topic, consecutive puzzles never share a word and words are used evenly', () => {
    const t = data.topics.find((x) => x.id === 'frutas')!; // 21 words, 6 per puzzle
    let recent: string[][] = [];
    const count = new Map<string, number>();
    let prev: string[] = [];
    for (let i = 0; i < 10; i++) {
      const p = generate(t, data.levels.A1, 100 + i, recent)!;
      const words = p.words.map((w) => w.es);
      expect(words.filter((w) => prev.includes(w)), `puzzle ${i}`).toEqual([]);
      for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
      prev = words;
      recent = pushRecent(recent, p);
    }
    expect(recent.length).toBe(5);
    // Every word is used before any word is used a fourth time (60 slots over 21 words: about 3 each).
    expect(Math.max(...count.values())).toBeLessThanOrEqual(4);
    expect(count.size).toBeGreaterThanOrEqual(18);
  });
  it('fresh words come first', () => {
    const t = data.topics[0];
    const recent = [t.words.slice(0, 6).map((w) => w.es)];
    const order = freshFirst(t.words, recent, rng(1)).map((w) => w.es);
    expect(order.slice(0, t.words.length - 6).some((w) => recent[0].includes(w))).toBe(false);
  });
  it('"Sorpréndeme" picks a topic not played recently', () => {
    const a1 = data.topics.filter((x) => x.level === 'A1');
    const recentIds = a1.slice(0, -1).map((x) => x.id);
    expect(surpriseTopic(a1, recentIds, rng(3)).id).toBe(a1[a1.length - 1].id);
    // Pressing it again and again goes round all topics before repeating one.
    let ids: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < a1.length; i++) { const tp = surpriseTopic(a1, ids, rng(i)); seen.add(tp.id); ids = [tp.id, ...ids].slice(0, a1.length - 1); }
    expect(seen.size).toBe(a1.length);
  });
});

describe('help and hints', () => {
  it('limits per word: none 0, little 1, normal up to 2 and never more than a third', () => {
    expect(hintLimit('none', 8)).toBe(0);
    expect(hintLimit('little', 8)).toBe(1);
    expect(hintLimit('normal', 3)).toBe(1);
    expect(hintLimit('normal', 5)).toBe(1);
    expect(hintLimit('normal', 6)).toBe(2);
    expect(hintLimit('normal', 10)).toBe(2);
    for (let n = 3; n <= 12; n++) expect(hintLimit('normal', n)).toBeLessThanOrEqual(Math.max(1, Math.floor(n / 3)));
  });
  it('a hint fills the first empty cell of the word, then a wrong one; never a whole word', () => {
    const p = generate(data.topics[0], data.levels.A1, 5)!;
    const w = p.words[0];
    const cells = cellsOf(w);
    expect(hintCell(w, {})).toBe(cells[0]);
    const letters = { [cells[0]]: w.answer[0] };
    expect(hintCell(w, letters)).toBe(cells[1]);
    const full = Object.fromEntries(cells.map((k, i) => [k, w.answer[i]]));
    full[cells[2]] = 'X';
    expect(hintCell(w, full)).toBe(cells[2]);
    full[cells[2]] = w.answer[2];
    expect(hintCell(w, full)).toBe(null);
  });
});

describe('checking', () => {
  it('a missing accent or tilde is a near miss, not a mistake; a word is done only when exact', () => {
    const t = data.topics.find((x) => x.id === 'ropa')!;
    let p: Puzzle | null = null;
    for (let s = 1; s < 50 && !p; s++) { const q = generate(t, data.levels.A1, s)!; if (q.words.some((w) => w.answer.some((c) => bare(c) !== c))) p = q; }
    const sol = solution(p!);
    const letters = Object.fromEntries(sol);
    expect(isSolved(p!, letters)).toBe(true);
    const [k, ch] = [...sol].find(([, c]) => bare(c) !== c)!;
    letters[k] = bare(ch);
    expect(isSolved(p!, letters)).toBe(false);
    expect(mistakes(p!, letters)).toEqual([{ key: k, near: true }]);
    const w = p!.words.find((x) => cellsOf(x).includes(k))!;
    expect(wordDone(w, letters)).toBe(false);
  });
});
