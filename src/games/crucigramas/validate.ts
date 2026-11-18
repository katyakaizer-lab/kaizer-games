/** Content rules for Crucigramas. Used by tools/validate-crucigramas.ts (build) and the tests. */
import { CLUE_KINDS, DEFAULT_LEVEL, LEVELS, bare, generate, lettersOf, type CrucigramaData } from './engine.ts';

export interface CrucigramaValidation { errors: string[]; unreviewed: string[]; total: number; words: number }

/** Longest clue (characters): it must fit the clue bar above the keyboard on a 360px phone in 2 lines. */
export const MAX_CLUE = 70;
const fold = (s: string) => bare(s.toLocaleLowerCase('es'));

export function validateCrucigramas(data: CrucigramaData, seeds = 30): CrucigramaValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  let words = 0;
  for (const level of LEVELS) {
    const cfg = data.levels[level];
    if (!cfg) continue;
    if (!(cfg.words >= 4 && cfg.words <= 10)) errors.push(`${level}: words per puzzle must be 4 to 10 (is ${cfg.words})`);
    if (!(cfg.maxCols >= 6 && cfg.maxCols <= 11 && cfg.maxRows >= 6 && cfg.maxRows <= 12)) errors.push(`${level}: grid must be 6-11 columns and 6-12 rows`);
    if (!cfg.clueKinds.length || cfg.clueKinds.some((k) => !CLUE_KINDS.includes(k))) errors.push(`${level}: clueKinds must be some of ${CLUE_KINDS.join(', ')}`);
  }
  for (const t of data.topics) {
    const w = `topic ${t.id || '(no id)'}`;
    if (ids.has(t.id)) errors.push(`${w}: id repeats`);
    ids.add(t.id);
    if (!LEVELS.includes(t.level)) { errors.push(`${w}: unknown level ${t.level}`); continue; }
    if (!t.name_es || !t.en || !t.ru) errors.push(`${w}: needs name_es, en and ru`);
    const cfg = data.levels[t.level] ?? DEFAULT_LEVEL;
    if (t.words.length < cfg.words + 2) errors.push(`${w}: needs at least ${cfg.words + 2} words so puzzles vary (has ${t.words.length})`);
    const seen = new Set<string>();
    for (const e of t.words) {
      words++;
      const at = `${w}: "${e.es}"`;
      if (!/^[a-záéíóúüñ]+$/.test(e.es)) errors.push(`${at}: one word, small letters only (accents and ñ allowed)`);
      const len = lettersOf(e.es).length;
      if (len < 3 || len > Math.min(cfg.maxCols, cfg.maxRows)) errors.push(`${at}: needs 3 to ${Math.min(cfg.maxCols, cfg.maxRows)} letters`);
      if (seen.has(e.es)) errors.push(`${at}: repeats in the topic`);
      seen.add(e.es);
      if (!e.clues?.length) { errors.push(`${at}: needs a clue`); continue; }
      if (!e.clues.some((c) => cfg.clueKinds.includes(c.kind))) errors.push(`${at}: needs a clue of a kind ${t.level} uses (${cfg.clueKinds.join(', ')})`);
      for (const c of e.clues) {
        if (!CLUE_KINDS.includes(c.kind)) errors.push(`${at}: unknown clue kind ${c.kind}`);
        if (!c.text?.trim()) errors.push(`${at}: empty clue`);
        else if (c.text.length > MAX_CLUE) errors.push(`${at}: clue longer than ${MAX_CLUE} characters`);
        // The answer (or its stem, for longer words) must not appear in its own clue.
        const stem = fold(e.es).slice(0, Math.max(4, Math.min(5, e.es.length - 1)));
        if (c.text && fold(c.text).split(/[^a-zñ]+/).some((x) => x === fold(e.es) || (e.es.length > 4 && x.startsWith(stem)))) errors.push(`${at}: the clue gives the answer away ("${c.text}")`);
      }
    }
    // Every topic must give full puzzles that fit the level's grid, for many seeds.
    let short = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const p = generate(t, cfg, seed);
      if (!p) { errors.push(`${w}: no puzzle for seed ${seed}`); break; }
      if (p.cols > cfg.maxCols || p.rows > cfg.maxRows) errors.push(`${w}: seed ${seed} grid ${p.cols}x${p.rows} is too big`);
      if (p.words.length < cfg.words) short++;
    }
    if (short > seeds / 10) errors.push(`${w}: ${short} of ${seeds} puzzles have fewer than ${cfg.words} words (add words that share letters)`);
  }
  return { errors, unreviewed: data.topics.filter((t) => !t.reviewed).map((t) => t.id), total: data.topics.length, words };
}
