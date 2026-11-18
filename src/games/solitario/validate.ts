/** Content rules for Solitario de categorías. Used by tools/validate-solitario.ts (build) and the tests. */
import { LEVELS, type SolitarioData } from './engine.ts';

export interface SolitarioValidation { errors: string[]; unreviewed: string[]; total: number }

const norm = (s: string) => s.toLocaleLowerCase('es').replace(/[….]/g, '').trim();

export function validateSolitario(data: SolitarioData, artIds?: Set<string>): SolitarioValidation {
  const errors: string[] = [];
  const setIds = new Set<string>();
  for (const set of data.sets) {
    const w = `set ${set.id || '(no id)'}`;
    if (setIds.has(set.id)) errors.push(`${w}: id repeats`);
    setIds.add(set.id);
    if (!LEVELS.includes(set.level)) errors.push(`${w}: unknown level ${set.level}`);
    if (set.categories.length < 2 || set.categories.length > 4) errors.push(`${w}: needs 2 to 4 categories (has ${set.categories.length})`);
    const catIds = new Set<string>();
    const names = new Set<string>();
    const seen = new Map<string, string>();
    for (const c of set.categories) {
      if (catIds.has(c.id)) errors.push(`${w}: category id ${c.id} repeats`);
      catIds.add(c.id);
      if (names.has(norm(c.name_es))) errors.push(`${w}: category name "${c.name_es}" repeats`);
      names.add(norm(c.name_es));
      if (!c.en || !c.ru) errors.push(`${w}: category ${c.id} needs en and ru`);
      if (c.items.length < 3 || c.items.length > 8) errors.push(`${w}: category ${c.id} needs 3 to 8 cards (has ${c.items.length})`);
      for (const it of c.items) {
        const k = norm(it.es);
        // A card that could belong to two categories would be unfair: every word appears once per set.
        if (seen.has(k)) errors.push(`${w}: "${it.es}" is in both ${seen.get(k)} and ${c.id}`);
        seen.set(k, c.id);
        if (!it.en || !it.ru) errors.push(`${w}: "${it.es}" needs en and ru`);
        if (it.art && artIds && !artIds.has(it.art)) errors.push(`${w}: "${it.es}" uses art id ${it.art}, which is not in the manifest`);
      }
    }
    for (const d of set.decoyNames ?? []) if (names.has(norm(d))) errors.push(`${w}: decoy name "${d}" is also a real category name`);
  }
  return { errors, unreviewed: data.sets.filter((s) => !s.reviewed).map((s) => s.id), total: data.sets.length };
}
