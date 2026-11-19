// Fails the build if the Crucigramas data breaks a rule (see src/games/crucigramas/validate.ts).
// Words and clues come from the word bank (src/data/words), turned into topics per level by
// src/games/crucigramas/bank-topics.ts; levels.json has the settings per level and decor.json the decorations.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCrucigramas } from '../src/games/crucigramas/validate.ts';
import { crosswordTopics, type DecorConfig } from '../src/games/crucigramas/bank-topics.ts';
import { loadWordFiles, ROOT } from './words-lib.ts';

const dir = join(ROOT, 'src/data/crucigramas');
const levels = JSON.parse(readFileSync(join(dir, 'levels.json'), 'utf8')).levels ?? {};
const decor = JSON.parse(readFileSync(join(dir, 'decor.json'), 'utf8')) as DecorConfig;
const { entries, topics: bankTopics } = loadWordFiles();
const topics = crosswordTopics(entries, bankTopics, levels, decor);
const errors: string[] = [];
for (const t of bankTopics) if (!decor.topicSet[t.id]) errors.push(`decor.json: topic ${t.id} has no decoration set`);
for (const [t, set] of Object.entries(decor.topicSet)) if (!decor.sets[set]) errors.push(`decor.json: topic ${t} uses unknown set ${set}`);
const res = validateCrucigramas({ topics, levels });
errors.push(...res.errors);
if (errors.length) {
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-crucigramas: ${errors.length} error(s)`);
  process.exit(1);
}
const per = Object.keys(levels).map((l) => `${l} ${topics.filter((t) => t.level === l).length}`).join(', ');
console.log(`validate-crucigramas: ${res.total} topics from the word bank (${per}), ${res.words} words valid, ${res.unreviewed.length} topics not reviewed yet`);
