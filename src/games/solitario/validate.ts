/** Content rules for Solitario de categorías. Used by tools/validate-solitario.ts (build) and the tests. */
import { LEVELS, pickCategories, type SolitarioData } from './engine.ts';

/** The most categories one deal uses (wide screens). */
export const MAX_CATS_PER_GAME = 7;

export interface SolitarioValidation { errors: string[]; unreviewed: string[]; total: number }

const norm = (s: string) => s.toLocaleLowerCase('es').replace(/[….]/g, '').trim();

export function validateSolitario(data: SolitarioData, artIds?: Set<string>): SolitarioValidation {
  const errors: string[] = [];
  const ids = new Set(data.categories.map((c) => c.id));
  const seenIds = new Set<string>();
  for (const c of data.categories) {
    const w = `category ${c.id || '(no id)'}`;
    if (seenIds.has(c.id)) errors.push(`${w}: id repeats`);
    seenIds.add(c.id);
    if (!LEVELS.includes(c.level)) errors.push(`${w}: unknown level ${c.level}`);
    if (!c.en || !c.ru) errors.push(`${w}: needs en and ru`);
    if (c.items.length < 3 || c.items.length > 8) errors.push(`${w}: needs 3 to 8 cards (has ${c.items.length})`);
    for (const it of c.items) {
      if (!it.en || !it.ru) errors.push(`${w}: "${it.es}" needs en and ru`);
      if (it.art && artIds && !artIds.has(it.art)) errors.push(`${w}: "${it.es}" uses art id ${it.art}, which is not in the manifest`);
    }
    for (const a of c.avoid ?? []) {
      const other = data.categories.find((x) => x.id === a);
      if (!ids.has(a)) errors.push(`${w}: avoid lists unknown category ${a}`);
      else if (other && other.level !== c.level) errors.push(`${w}: avoid lists ${a}, which is another level`);
    }
  }
  // Categories of one level are dealt together, so a word may appear only once per level,
  // and category names must differ within a level.
  for (const level of LEVELS) {
    const cats = data.categories.filter((c) => c.level === level);
    if (!cats.length) continue;
    const words = new Map<string, string>();
    const names = new Map<string, string>();
    for (const c of cats) {
      const n = norm(c.name_es);
      if (names.has(n)) errors.push(`${level}: category name "${c.name_es}" is used by ${names.get(n)} and ${c.id}`);
      names.set(n, c.id);
      for (const it of c.items) {
        const k = norm(it.es);
        if (words.has(k)) errors.push(`${level}: "${it.es}" is in both ${words.get(k)} and ${c.id}`);
        words.set(k, c.id);
      }
    }
    // Every level needs as many categories as its columns (one category per column), dealt together.
    const cfg = data.levels?.[level];
    if (cfg && !(cfg.columns >= 2 && cfg.columns <= 7)) errors.push(`${level}: columns must be 2 to 7 (is ${cfg.columns})`);
    if (cfg && !(cfg.down >= 0 && cfg.down <= 5)) errors.push(`${level}: face-down cards per column must be 0 to 5 (is ${cfg.down})`);
    const needCats = cfg?.columns ?? MAX_CATS_PER_GAME;
    for (let seed = 0; seed < 20; seed++) {
      if (pickCategories(cats, seed, needCats).length < needCats) { errors.push(`${level}: fewer than ${needCats} categories can be dealt together`); break; }
    }
  }
  return { errors, unreviewed: data.categories.filter((c) => !c.reviewed).map((c) => c.id), total: data.categories.length };
}
