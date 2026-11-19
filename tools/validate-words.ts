// Fails the build if the word bank breaks a rule (see src/words/rules.ts): unique ids, valid topics and levels,
// 2-3 clues of different types that never contain the answer, plurals and genders as the engines predict (or marked
// as exceptions), every verb conjugates, translations present. Also checks that each entry sits in the file of its
// first topic. Prints reviewed / unreviewed counts.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateWords, reviewCounts } from '../src/words/rules.ts';
import type { TopicDef, TopicFile, WordEntry } from '../src/words/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'src/data/words');
const topics = (JSON.parse(readFileSync(join(dir, '_topics.json'), 'utf8')) as { topics: TopicDef[] }).topics;
const entries: WordEntry[] = [];
const errors: string[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
  const file = JSON.parse(readFileSync(join(dir, f), 'utf8')) as TopicFile;
  if (`${file.topic}.json` !== f) errors.push(`${f}: topic is "${file.topic}"; the file must be named ${file.topic}.json`);
  for (const e of file.entries) {
    if (e.topics?.[0] !== file.topic) errors.push(`${f}: ${e.id} belongs in ${e.topics?.[0]}.json (its first topic)`);
    entries.push(e);
  }
}
const res = validateWords(entries, topics);
errors.push(...res.errors);
const quiet = process.argv.includes('--quiet');
if (res.warnings.length && !quiet) console.warn(res.warnings.map((w) => `  warning: ${w}`).join('\n'));
if (errors.length) {
  console.error(errors.slice(0, 200).map((e) => `  ${e}`).join('\n'));
  console.error(`validate-words: ${errors.length} error(s)`);
  process.exit(1);
}
const { byLevel } = reviewCounts(entries);
const lv = Object.entries(byLevel).sort().map(([k, [r, u]]) => `${k} ${r + u}${r ? ` (${r} reviewed)` : ''}`).join(', ');
console.log(`validate-words: ${entries.length} entries valid (${lv}), ${res.overrides.length} engine overrides, ${entries.filter((e) => !e.reviewed).length} not reviewed yet`);
