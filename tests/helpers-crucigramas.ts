/** Loads the Crucigramas data the way the build does: levels.json plus <level>/<topic>.json. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';
import type { CrucigramaData, Topic } from '../src/games/crucigramas/engine';

export function loadCrucigramas(): CrucigramaData {
  const dir = join(ROOT, 'src/data/crucigramas');
  const levels = JSON.parse(readFileSync(join(dir, 'levels.json'), 'utf8')).levels;
  const topics: Topic[] = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort()
    .flatMap((lv) => readdirSync(join(dir, lv)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, lv, f), 'utf8'))));
  return { levels, topics };
}
