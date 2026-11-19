// Fails the build if the Solitario de categorías data breaks a rule (see src/games/solitario/validate.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSolitario } from '../src/games/solitario/validate.ts';
import { missingWords, resolveCategories, type RawCategory } from '../src/games/solitario/bank-items.ts';
import { loadWordFiles } from './words-lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? join(ROOT, 'src/data/solitario');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const parsed = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
// Categories list word bank ids (src/data/words); words and translations come from the bank.
const raw = parsed.flatMap((p) => p.categories ?? []) as RawCategory[];
const byId = new Map(loadWordFiles().entries.map((e) => [e.id, e]));
const lookup = (id: string) => byId.get(id);
const categories = resolveCategories(raw, lookup);
const missing = missingWords(raw, lookup).map((m) => `${m} is not in the word bank`);
const levels = Object.assign({}, ...parsed.map((p) => p.levels ?? {}));
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/assets/manifest.json'), 'utf8'));
const res = validateSolitario({ categories, levels }, new Set(manifest.assets.map((a: { id: string }) => a.id)));
res.errors.unshift(...missing);
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-solitario: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-solitario: ${files.length} file(s), ${res.total} categories valid, ${res.unreviewed.length} not reviewed yet`);
