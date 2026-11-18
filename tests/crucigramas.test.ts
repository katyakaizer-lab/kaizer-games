import { describe, expect, it } from 'vitest';
import topicsFile from '../src/data/crucigramas/topics.json';
import {
  LEVELS, bare, cellsOf, generate, isSolved, lettersOf, mistakes, solution, wordDone, type CrucigramaData, type Level, type Puzzle,
} from '../src/games/crucigramas/engine';
import { validateCrucigramas } from '../src/games/crucigramas/validate';

const data = topicsFile as unknown as CrucigramaData;
const clone = (): CrucigramaData => structuredClone(data);

/** Grid rules every puzzle must keep. */
function gridProblems(p: Puzzle, maxCols: number, maxRows: number): string[] {
  const out: string[] = [];
  if (p.cols > maxCols || p.rows > maxRows) out.push(`grid ${p.cols}x${p.rows}`);
  const sol = solution(p);
  // Crossing letters agree (solution() would overwrite a clash: rebuild and compare per word).
  for (const w of p.words) cellsOf(w).forEach((k, i) => { if (sol.get(k) !== w.answer[i]) out.push(`${w.es}: clash at ${k}`); });
  // Two filled cells side by side always belong to one word (no accidental words).
  for (const k of sol.keys()) {
    const [r, c] = k.split(',').map(Number);
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const n = `${r + dr},${c + dc}`;
      if (sol.has(n) && !p.words.some((w) => cellsOf(w).includes(k) && cellsOf(w).includes(n))) out.push(`stray neighbours ${k} ${n}`);
    }
  }
  // Every word is reachable from the first through crossings (one connected grid).
  const seen = new Set([p.words[0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const w of p.words) if (!seen.has(w) && [...seen].some((s) => cellsOf(s).some((k) => cellsOf(w).includes(k)))) { seen.add(w); changed = true; }
  }
  if (seen.size !== p.words.length) out.push('not connected');
  // Numbers: in reading order, starting at 1, shared by across and down words that start in the same cell.
  const starts = [...new Set(p.words.map((w) => `${w.row},${w.col}`))];
  const nums = new Set(p.words.map((w) => w.num));
  if (nums.size !== starts.length || Math.max(...nums) !== starts.length) out.push('numbering');
  return out;
}

describe('crossword generator', () => {
  for (const level of LEVELS) {
    it(`${level}: every topic gives valid, full grids`, () => {
      const cfg = data.levels[level as Level]!;
      for (const topic of data.topics.filter((t) => t.level === level)) {
        for (let seed = 1; seed <= 25; seed++) {
          const p = generate(topic, cfg, seed)!;
          expect(p, `${topic.id} ${seed}`).not.toBe(null);
          expect(gridProblems(p, cfg.maxCols, cfg.maxRows), `${topic.id} ${seed}`).toEqual([]);
          expect(p.words.length).toBeGreaterThanOrEqual(cfg.words - 1);
          for (const w of p.words) expect(cfg.clueKinds).toContain(w.clue.kind);
        }
      }
    });
  }
  it('the same seed gives the same puzzle; another seed another one', () => {
    const t = data.topics[0];
    const a = JSON.stringify(generate(t, data.levels.A1, 7)!.words);
    expect(JSON.stringify(generate(t, data.levels.A1, 7)!.words)).toBe(a);
    expect(JSON.stringify(generate(t, data.levels.A1, 8)!.words)).not.toBe(a);
  });
  it('keeps accents and ñ in the cells', () => {
    expect(lettersOf('camión')).toEqual(['C', 'A', 'M', 'I', 'Ó', 'N']);
    expect(lettersOf('baño')).toEqual(['B', 'A', 'Ñ', 'O']);
    expect(lettersOf('vergüenza')).toContain('Ü');
    expect(bare('Ó')).toBe('O');
  });
});

describe('checking', () => {
  const t = data.topics.find((x) => x.id === 'ropa')!;
  const p = generate(t, data.levels.A1, 3)!;
  const sol = solution(p);
  it('accents count: O for Ó is a mistake, marked as an accent slip', () => {
    const letters = Object.fromEntries(sol);
    expect(isSolved(p, letters)).toBe(true);
    const withAccent = [...sol].find(([, ch]) => bare(ch) !== ch);
    if (withAccent) {
      letters[withAccent[0]] = bare(withAccent[1]);
      expect(isSolved(p, letters)).toBe(false);
      expect(mistakes(p, letters)).toEqual([{ key: withAccent[0], accent: true }]);
    }
    const [k, ch] = [...sol][0];
    letters[k] = ch === 'X' ? 'Y' : 'X';
    expect(mistakes(p, letters).find((m) => m.key === k)).toEqual({ key: k, accent: false });
  });
  it('a word is done only when all its letters are right; empty cells are not mistakes', () => {
    const w = p.words[0];
    const letters = Object.fromEntries(cellsOf(w).map((k, i) => [k, w.answer[i]]));
    expect(wordDone(w, letters)).toBe(true);
    expect(mistakes(p, {})).toEqual([]);
  });
});

describe('validator', () => {
  it('passes the topics and counts them as unreviewed', () => {
    const r = validateCrucigramas(clone(), 10);
    expect(r.errors).toEqual([]);
    expect(r.unreviewed.length).toBe(data.topics.length);
  });
  const broken = (f: (d: CrucigramaData) => void) => { const d = clone(); f(d); return validateCrucigramas(d, 5).errors.join('\n'); };
  it('fails a clue that gives the answer away', () => expect(broken((d) => { d.topics[0].words[0].clues[0].text = 'Una mesa grande'; })).toMatch(/gives the answer away/));
  it('fails capitals, spaces or two words', () => expect(broken((d) => { d.topics[0].words[0].es = 'Mesa alta'; })).toMatch(/small letters only/));
  it('fails a word longer than the grid', () => expect(broken((d) => { d.topics[0].words[0].es = 'electrodoméstico'; })).toMatch(/needs 3 to 9 letters/));
  it('fails too few words for varied puzzles', () => expect(broken((d) => { d.topics[0].words.length = 6; })).toMatch(/at least 8 words/));
  it('fails an A1 word with no definition (A1 uses definitions)', () => expect(broken((d) => { d.topics[0].words[0].clues = [{ kind: 'syn', text: 'Sinónimo de «tabla»' }]; })).toMatch(/kind A1 uses/));
  it('fails an over-long clue', () => expect(broken((d) => { d.topics[0].words[0].clues[0].text = 'x'.repeat(90); })).toMatch(/longer than/));
});
