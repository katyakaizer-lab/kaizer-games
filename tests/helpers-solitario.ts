/** Solitario categories the way the game builds them: categories.json lists word ids, resolved from the word bank. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';
import type { Category } from '../src/games/solitario/engine';
import { resolveCategories, type RawCategory } from '../src/games/solitario/bank-items';
import { loadWordFiles } from '../tools/words-lib';

export function loadSolitarioCategories(): Category[] {
  const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/solitario/categories.json'), 'utf8')).categories as RawCategory[];
  const byId = new Map(loadWordFiles().entries.map((e) => [e.id, e]));
  return resolveCategories(raw, (id) => byId.get(id));
}
