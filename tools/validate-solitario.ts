// Fails the build if the Solitario de categorías data breaks a rule (see src/games/solitario/validate.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSolitario } from '../src/games/solitario/validate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? join(ROOT, 'src/data/solitario');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const sets = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).sets ?? []);
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/assets/manifest.json'), 'utf8'));
const res = validateSolitario({ sets }, new Set(manifest.assets.map((a: { id: string }) => a.id)));
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-solitario: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-solitario: ${files.length} file(s), ${res.total} sets valid, ${res.unreviewed.length} not reviewed yet`);
