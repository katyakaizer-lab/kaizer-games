// Fails the build if the pet data or parts break a rule (see src/pets/validate.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validatePets } from '../src/pets/validate.ts';
import type { PatternDef, Species } from '../src/pets/species.ts';
import { parseTokens, resolve } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'src/data/pets');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const species = files.filter((f) => Array.isArray(f.breeds)) as Species[];
const patterns = (files.find((f) => f.patterns)?.patterns ?? {}) as Record<string, PatternDef>;
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/assets/manifest.json'), 'utf8')) as { assets: { id: string; files?: { '1x'?: string } }[] };
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
const partText = (id: string) => {
  const f = byId.get(id)?.files?.['1x'];
  const p = f && join(ROOT, 'public/assets', f);
  return p && existsSync(p) ? readFileSync(p, 'utf8') : undefined;
};
// Pets sit on the day background; on the night theme they get a light halo (--art-halo), so outlines meet that.
const t = parseTokens(readFileSync(join(ROOT, 'public/tokens.css'), 'utf8'));
const vars = (theme: string) => ({ ...t.base, ...t.themes[theme] });
const backgrounds = { 'brote --bg': resolve(vars('brote'), '--bg'), 'night --art-halo': resolve(vars('night'), '--art-halo') };
// Outlines of pets and items are ink, the same colour as the art's line work (tools/make-pet-parts.mjs).
const res = validatePets(species, patterns, { partText, backgrounds, ink: '#2B2D42' });
if (res.errors.length) {
  console.error(res.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`validate-pets: ${res.errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate-pets: ${species.length} species, ${res.breeds} breeds, ${res.parts.size} parts in use, outlines visible on both themes`);
