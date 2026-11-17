// One-off: writes the starting public/assets/manifest.json. After this, the manifest is hand-edited data.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const today = '2026-11-17';
const claude = (prompt = '') => ({ tool: 'Claude', date: today, terms: 'https://www.anthropic.com/legal/consumer-terms', prompt });
const assets = [];
const pets = { cat: 'gato', dog: 'perro', dragon: 'dragón', raven: 'cuervo', fox: 'zorro', brote: 'Brote' };
const moodEs = { calma: 'tranquilo', alegria: 'alegre', siesta: 'descansando' };
for (const [p, es] of Object.entries(pets)) for (const m of ['calma', 'alegria', 'siesta']) {
  assets.push({ id: `pet.${p}.${m}`, kind: 'pet', files: { '1x': `pets/${p}-${m}.svg` }, alt: p === 'brote' ? `Brote, ${moodEs[m]}` : `El ${es}, ${moodEs[m]}`,
    status: 'placeholder', aiGenerated: true, source: claude('Original starter pet in the Brote style, 200x240 shared rig.'), licence: 'own', games: ['hub'] });
}
assets.push({ id: 'pet-item.boina', kind: 'pet-item', files: { '1x': 'pet-items/boina.svg' }, alt: 'una boina', word: 'la boina', level: 'A2',
  status: 'placeholder', aiGenerated: true, source: claude('Simple beret on the 200x240 item canvas.'), licence: 'own', games: ['hub'], anchor: 'head-top', pivot: [100, 104], z: 20 });
assets.push({ id: 'background.brote', kind: 'background', files: { '1x': 'backgrounds/paper.svg' }, alt: '', status: 'placeholder', aiGenerated: true, source: claude('Warm paper with soft washes.'), licence: 'own', games: ['hub', 'style-test'] });
assets.push({ id: 'ui.frame.card', kind: 'ui', files: { '1x': 'ui/frame-card.svg' }, alt: '', status: 'placeholder', aiGenerated: true, source: claude('Nine-slice card frame.'), licence: 'own', games: ['style-test'], nineSlice: { slice: 24, width: 20 }, themes: ['brote'] });
const objects = [['silla', 'la silla'], ['mesa', 'la mesa'], ['libro', 'el libro'], ['taza', 'la taza'], ['lampara', 'la lámpara'], ['ventana', 'la ventana']];
for (const [id, word] of objects) assets.push({ id: `object.${id}`, kind: 'object', alt: word.split(' ')[1], word, level: 'A1', status: 'placeholder', aiGenerated: false,
  source: { tool: 'generated placeholder', date: today, terms: 'own', prompt: '' }, licence: 'own', games: ['style-test'] });
assets.push({ id: 'scene.house.room1', kind: 'scene', alt: 'una habitación', status: 'placeholder', aiGenerated: false, source: { tool: 'generated placeholder', date: today, terms: 'own', prompt: '' }, licence: 'own', games: ['hub'] });

writeFileSync(join(ROOT, 'public/assets/manifest.json'), JSON.stringify({ _note: 'Every picture by id. Add art here; never reference files by path in code. See RESKIN.md.', assets }, null, 1) + '\n');
console.log(`manifest: ${assets.length} entries`);
