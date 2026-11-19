/** Loads the Crucigramas data the way the build does: levels.json and decor.json, with topics from the word bank. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';
import type { CrucigramaData } from '../src/games/crucigramas/engine';
import { crosswordTopics, type DecorConfig } from '../src/games/crucigramas/bank-topics';
import { loadWordFiles } from '../tools/words-lib';

export function loadCrucigramas(): CrucigramaData {
  const dir = join(ROOT, 'src/data/crucigramas');
  const levels = JSON.parse(readFileSync(join(dir, 'levels.json'), 'utf8')).levels;
  const decor = JSON.parse(readFileSync(join(dir, 'decor.json'), 'utf8')) as DecorConfig;
  const { entries, topics } = loadWordFiles();
  return { levels, topics: crosswordTopics(entries, topics, levels, decor) };
}
