// Fails the build if the Crucigramas data breaks a rule (see src/games/crucigramas/validate.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateCrucigramas } from '../src/games/crucigramas/validate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? join(ROOT, 'src/data/crucigramas');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const parsed = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const topics = parsed.flatMap((p) => p.topics ?? []);
const levels = Object.assign({}, ...parsed.map((p) => p.levels ?? {}));
const res = validateCrucigramas({ topics, levels });
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-crucigramas: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-crucigramas: ${files.length} file(s), ${res.total} topics, ${res.words} words valid, ${res.unreviewed.length} topics not reviewed yet`);
