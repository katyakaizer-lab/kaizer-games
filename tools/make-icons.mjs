// Renders the PWA icons from public/icons/icon.svg (our own simple shape).
import sharp from 'sharp';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from './lib.mjs';

const svg = readFileSync(join(ROOT, 'public/icons/icon.svg'));
const out = (f) => join(ROOT, 'public/icons', f);
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#2A7360' }).png().toFile(out('apple-touch-icon.png'));
// maskable: full-bleed background, artwork inside the 80% safe zone
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2A7360' } }).composite([{ input: inner, gravity: 'centre' }]).png().toFile(out('icon-maskable-512.png'));
console.log('icons: written');
