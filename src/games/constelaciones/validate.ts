/** Content rules for Constelaciones data. Used by tools/validate-constelaciones.ts (build) and the tests. */
import { LEVELS, targetSentence, type ConstellationData } from './sentence.ts';

export interface ValidationResult { errors: string[]; unreviewed: string[]; total: number }

export function validateConstelaciones(data: ConstellationData): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of data.constellations) {
    const where = c.id || '(no id)';
    if (ids.has(c.id)) errors.push(`${where}: id repeats`);
    ids.add(c.id);
    if (!LEVELS.includes(c.level)) errors.push(`${where}: unknown level ${c.level}`);
    const n = c.tokens.length;
    if (!c.orders?.length) errors.push(`${where}: no accepted orders`);
    c.orders?.forEach((o, k) => {
      const sorted = [...o].sort((a, b) => a - b);
      if (o.length !== n || sorted.some((v, i) => v !== i)) errors.push(`${where}: order ${k + 1} is not a permutation of the token indexes 0..${n - 1}`);
    });
    for (const [field, list] of [['proper', c.proper], ['commas', c.commas]] as const) {
      for (const i of list) if (!(i >= 0 && i < n)) errors.push(`${where}: ${field} index ${i} is out of range`);
    }
    for (const a of c.accents) {
      if (!(a.index >= 0 && a.index < n)) errors.push(`${where}: accent index ${a.index} is out of range`);
      if (!a.options.includes(a.correct)) errors.push(`${where}: accent options [${a.options.join(', ')}] lack the correct form "${a.correct}"`);
      if (!a.options.includes(c.tokens[a.index])) errors.push(`${where}: accent options lack the unaccented token "${c.tokens[a.index]}"`);
    }
    for (const t of c.tokens) if (t !== t.toLocaleLowerCase('es')) errors.push(`${where}: token "${t}" must be lowercase`);
    if (c.orders?.[0]?.length === n) {
      const rebuilt = targetSentence(c);
      if (rebuilt !== c.text) errors.push(`${where}: canonical sentence "${rebuilt}" does not equal text "${c.text}"`);
    }
  }
  const storyIds = new Set<string>();
  for (const s of data.stories ?? []) {
    if (storyIds.has(s.id)) errors.push(`story ${s.id}: id repeats`);
    storyIds.add(s.id);
    s.constellations.forEach((cid, k) => {
      const c = data.constellations.find((x) => x.id === cid);
      if (!c) errors.push(`story ${s.id}: references missing constellation ${cid}`);
      else if (c.story && (c.story.id !== s.id || c.story.part !== k + 1)) errors.push(`story ${s.id}: ${cid} says it is part ${c.story.part} of ${c.story.id}`);
    });
  }
  for (const c of data.constellations) if (c.story && !storyIds.has(c.story.id)) errors.push(`${c.id}: belongs to missing story ${c.story.id}`);
  const unreviewed = [
    ...data.constellations.filter((c) => !c.reviewed).map((c) => c.id),
    ...(data.stories ?? []).filter((s) => !s.reviewed).map((s) => `story:${s.id}`),
  ];
  return { errors, unreviewed, total: data.constellations.length + (data.stories?.length ?? 0) };
}
