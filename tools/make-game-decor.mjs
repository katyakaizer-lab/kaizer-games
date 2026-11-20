// Registers the decoration sets of the generated-content games (src/data/games-decor.json) in the art manifest:
// decor.<game>.<item> -> decor/<item>.svg (the silhouettes made by make-decor.mjs, plus caldero and carta drawn for
// these games). Replaces only those ids. Run: node tools/make-game-decor.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const sets = JSON.parse(readFileSync(join(ROOT, 'src/data/games-decor.json'), 'utf8')).sets;
const manifestPath = join(ROOT, 'public/assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const games = Object.keys(sets);
const missing = [];
manifest.assets = manifest.assets.filter((a) => !games.some((g) => a.id.startsWith(`decor.${g}.`)));
for (const [game, items] of Object.entries(sets)) for (const it of items) {
  if (!existsSync(join(ROOT, 'public/assets/decor', `${it}.svg`))) missing.push(`${game}: ${it}`);
  manifest.assets.push({
    id: `decor.${game}.${it}`, kind: 'decor', files: { '1x': `decor/${it}.svg` }, alt: '', status: 'placeholder', aiGenerated: true,
    source: { tool: 'Claude', date: '2026-11-20', terms: 'own', prompt: `simple one-colour silhouette: ${it}` }, licence: 'own', games: [game],
  });
}
if (missing.length) { console.error(`make-game-decor: no file for ${missing.join(', ')}`); process.exit(1); }
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`make-game-decor: ${Object.values(sets).flat().length} ids for ${games.length} games`);
