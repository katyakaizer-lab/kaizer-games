// Fails the build if the Constelaciones data breaks a rule (see src/games/constelaciones/validate.ts).
// Run with Node 22.18+ / 24 (built-in TypeScript type stripping): node tools/validate-constelaciones.ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateConstelaciones } from '../src/games/constelaciones/validate.ts';
import { mergeData } from '../src/games/constelaciones/sentence.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// All files in the folder are validated together (ids must be unique across files; stories may use any file's constellations).
const dir = process.argv[2] ?? join(ROOT, 'src/data/constelaciones');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const res = validateConstelaciones(mergeData(files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))));
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-constelaciones: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-constelaciones: ${files.length} files, ${res.total} items valid, ${res.unreviewed.length} not reviewed yet`);
