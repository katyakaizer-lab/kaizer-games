// Fails the build if the Crucigramas data breaks a rule (see src/games/crucigramas/validate.ts).
// Data: src/data/crucigramas/levels.json (per-level settings) and src/data/crucigramas/<level>/<topic>.json.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { validateCrucigramas } from '../src/games/crucigramas/validate.ts';
import type { Topic } from '../src/games/crucigramas/engine.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? join(ROOT, 'src/data/crucigramas');
const levelsFile = join(dir, 'levels.json');
const levels = existsSync(levelsFile) ? JSON.parse(readFileSync(levelsFile, 'utf8')).levels ?? {} : {};
const topics: Topic[] = [];
const errors: string[] = [];
for (const lv of readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort()) {
  for (const f of readdirSync(join(dir, lv)).filter((x) => x.endsWith('.json')).sort()) {
    const t = JSON.parse(readFileSync(join(dir, lv, f), 'utf8')) as Topic;
    if (t.level !== lv) errors.push(`${lv}/${f}: level is ${t.level} but the file is in ${lv}/`);
    if (t.id !== basename(f, '.json')) errors.push(`${lv}/${f}: id is ${t.id}; the file must be named ${t.id}.json`);
    topics.push(t);
  }
}
const res = validateCrucigramas({ topics, levels });
errors.push(...res.errors);
if (errors.length) {
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-crucigramas: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-crucigramas: ${res.total} topics, ${res.words} words valid, ${res.unreviewed.length} topics not reviewed yet`);
