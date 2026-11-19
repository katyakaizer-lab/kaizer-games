/** Content rules for Crucigramas. Used by tools/validate-crucigramas.ts (build) and the tests. */
import { BORDER_STYLES, CLUE_KINDS, DEFAULT_LEVEL, LEVELS, bare, generate, lettersOf, type CrucigramaData } from './engine.ts';

export interface CrucigramaValidation { errors: string[]; unreviewed: string[]; total: number; words: number }

/** Longest clue (characters): it must fit the clue bar above the keyboard on a 360px phone in 2 lines. */
export const MAX_CLUE = 70;
/** Words a topic needs, so puzzles can pick different words each time. */
export const MIN_WORDS = 20;
// Accents removed for comparing, but ñ kept (uña is not una).
const fold = (s: string) => s.toLocaleLowerCase('es').split('ñ').map(bare).join('ñ');

export function validateCrucigramas(data: CrucigramaData, seeds = 30): CrucigramaValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  let words = 0;
  for (const level of LEVELS) {
    const cfg = data.levels[level];
    if (!cfg) continue;
    if (!(cfg.words >= 4 && cfg.words <= 10)) errors.push(`${level}: words per puzzle must be 4 to 10 (is ${cfg.words})`);
    if (!(cfg.maxCols >= 6 && cfg.maxCols <= 12 && cfg.maxRows >= 6 && cfg.maxRows <= 12)) errors.push(`${level}: grid must be 6-12 columns and 6-12 rows`);
    if (!cfg.clueKinds.length || cfg.clueKinds.some((k) => !CLUE_KINDS.includes(k))) errors.push(`${level}: clueKinds must be some of ${CLUE_KINDS.join(', ')}`);
  }
  for (const t of data.topics) {
    const w = `topic ${t.id || '(no id)'}`;
    if (ids.has(t.id)) errors.push(`${w}: id repeats`);
    ids.add(t.id);
    if (!/^[a-z0-9-]+$/.test(t.id ?? '')) errors.push(`${w}: id must be small letters, digits or -`);
    if (!LEVELS.includes(t.level)) { errors.push(`${w}: unknown level ${t.level}`); continue; }
    if (!t.name_es || !t.en || !t.ru) errors.push(`${w}: needs name_es, en and ru`);
    if (t.decor) {
      if (!BORDER_STYLES.includes(t.decor.style)) errors.push(`${w}: decor style must be one of ${BORDER_STYLES.join(', ')}`);
      if (!(t.decor.items?.length >= 4 && t.decor.items.length <= 6)) errors.push(`${w}: decor needs 4 to 6 items`);
      for (const it of t.decor.items ?? []) if (!/^[a-z0-9-]+$/.test(it)) errors.push(`${w}: decor item "${it}" must be small letters without accents (it is part of an art id)`);
    } else errors.push(`${w}: needs decor (style and 4 to 6 items)`);
    const cfg = data.levels[t.level] ?? DEFAULT_LEVEL;
    if (t.words.length < MIN_WORDS) errors.push(`${w}: needs at least ${MIN_WORDS} words so puzzles vary (has ${t.words.length})`);
    const seen = new Set<string>();
    for (const e of t.words) {
      words++;
      const at = `${w}: "${e.es}"`;
      // Accents stored correctly: one precomposed character each (á, not a + ´), small letters only.
      if (e.es !== e.es.normalize('NFC')) errors.push(`${at}: accents must be stored as single characters (NFC)`);
      if (!/^[a-záéíóúüñ]+$/.test(e.es)) errors.push(`${at}: one word, small letters only (accents and ñ allowed)`);
      if (/[cs]ion$/.test(e.es)) errors.push(`${at}: words ending in -ción / -sión carry an accent`);
      const len = lettersOf(e.es).length;
      if (len < 3 || len > Math.min(cfg.maxCols, cfg.maxRows)) errors.push(`${at}: needs 3 to ${Math.min(cfg.maxCols, cfg.maxRows)} letters (fits the ${t.level} grid)`);
      if (seen.has(fold(e.es))) errors.push(`${at}: repeats in the topic`);
      seen.add(fold(e.es));
      const kinds = Object.keys(e.clues ?? {});
      if (kinds.length < 2 || kinds.length > 3) errors.push(`${at}: needs 2 or 3 clues of different kinds (has ${kinds.length})`);
      if (!kinds.some((k) => cfg.clueKinds.includes(k as never))) errors.push(`${at}: needs a clue of a kind ${t.level} uses`);
      for (const [kind, text] of Object.entries(e.clues ?? {})) {
        if (!CLUE_KINDS.includes(kind as never)) errors.push(`${at}: unknown clue kind ${kind}`);
        if (!text?.trim()) { errors.push(`${at}: empty ${kind} clue`); continue; }
        if (text.length > MAX_CLUE) errors.push(`${at}: ${kind} clue longer than ${MAX_CLUE} characters`);
        const gaps = text.split('___').length - 1;
        if (kind === 'gap' && gaps !== 1) errors.push(`${at}: a gap clue needs exactly one ___`);
        if (kind !== 'gap' && gaps) errors.push(`${at}: only gap clues use ___`);
        // The answer (or its stem, for longer words) must not appear in its own clue.
        const stem = fold(e.es).slice(0, Math.max(4, Math.min(5, e.es.length - 1)));
        if (fold(text).split(/[^a-zñ]+/).some((x) => x === fold(e.es) || (e.es.length > 4 && x.startsWith(stem)))) errors.push(`${at}: the ${kind} clue gives the answer away ("${text}")`);
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
