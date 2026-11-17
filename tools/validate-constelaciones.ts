// Fails the build if the Constelaciones data breaks a rule (see src/games/constelaciones/validate.ts).
// Run with Node 22.18+ / 24 (built-in TypeScript type stripping): node tools/validate-constelaciones.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateConstelaciones } from '../src/games/constelaciones/validate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? join(ROOT, 'src/data/constelaciones/sample-sentences.json');
const res = validateConstelaciones(JSON.parse(readFileSync(file, 'utf8')));
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-constelaciones: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-constelaciones: ${res.total} items valid, ${res.unreviewed.length} not reviewed yet`);
