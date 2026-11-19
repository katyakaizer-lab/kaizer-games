// Draws the Crucigramas decorations: simple original silhouettes (one colour; the game colours them with tokens
// through CSS masks, so they follow the theme) and four ornament borders. Writes public/assets/decor/*.svg and
// registers decor.<topic>.<item> and decor.border.<style> in the manifest (status placeholder, aiGenerated, tool
// Claude). No text, no known characters or brands. Run: node tools/make-decor.mjs
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const E = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
const R = (x, y, w, hh, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}"/>`;
const P = (d) => `<path d="${d}"/>`;
const H = (d) => `<path fill-rule="evenodd" d="${d}"/>`; // shapes with holes
const L = (d, w = 3) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const O = (x, y, r, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#000" stroke-width="${w}"/>`;
const POLY = (pts) => `<polygon points="${pts}"/>`;
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`; // path circle (for holes)
const star = (cx, cy, ro, ri, n = 5) => POLY(Array.from({ length: n * 2 }, (_, i) => {
  const a = (Math.PI / n) * i - Math.PI / 2, r = i % 2 ? ri : ro;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' '));
const rays = (cx, cy, r1, r2, n = 8) => L(Array.from({ length: n }, (_, i) => {
  const a = (Math.PI * 2 * i) / n;
  return `M${(cx + r1 * Math.cos(a)).toFixed(1)} ${(cy + r1 * Math.sin(a)).toFixed(1)}L${(cx + r2 * Math.cos(a)).toFixed(1)} ${(cy + r2 * Math.sin(a)).toFixed(1)}`;
}).join(''), 3);

/** 48x48 silhouettes by name. */
const SHAPES = {
  manzana: E(24, 28, 14, 14) + L('M24 15C24 11 26 9 28 7') + P('M26 12C30 6 36 8 36 8C34 13 29 14 26 12Z'),
  pera: P('M24 10C20 10 19 16 18 20C12 24 11 32 14 37C17 42 31 42 34 37C37 32 36 24 30 20C29 16 28 10 24 10Z') + L('M24 10L25 5'),
  cereza: C(15, 34, 7) + C(32, 36, 7) + L('M15 27C18 16 24 10 30 8M32 29C30 20 30 14 30 8', 2.5) + P('M30 8C34 4 40 6 40 6C38 10 33 11 30 8Z'),
  uva: C(18, 18, 5) + C(28, 18, 5) + C(23, 26, 5) + C(13, 26, 5) + C(33, 26, 5) + C(18, 34, 5) + C(28, 34, 5) + C(23, 41, 5) + L('M23 13L25 6', 2.5),
  circulo: C(24, 24, 16),
  cuadrado: R(9, 9, 30, 30, 3),
  triangulo: POLY('24,7 42,39 6,39'),
  estrella: star(24, 25, 18, 8),
  casa: POLY('24,6 42,22 38,22 38,42 10,42 10,22 6,22'),
  corazon: P('M24 41C10 31 5 24 5 17C5 11 10 7 15 7C19 7 22 9 24 12C26 9 29 7 33 7C38 7 43 11 43 17C43 24 38 31 24 41Z'),
  foto: H('M6 10H42V38H6Z M10 14V34H38V14Z') + POLY('12,32 20,22 26,28 30,24 36,32') + C(32, 19, 3),
  globo: E(24, 19, 12, 14) + POLY('22,33 26,33 24,36') + L('M24 36C22 40 26 42 24 46', 2),
  huella: E(24, 32, 9, 8) + C(13, 21, 4) + C(20, 15, 4) + C(28, 15, 4) + C(35, 21, 4),
  hueso: L('M14 34L34 14', 8) + C(11, 32, 5) + C(16, 37, 5) + C(32, 11, 5) + C(37, 16, 5),
  pluma: P('M38 6C24 8 14 18 12 34L10 42L13 40C28 38 38 26 38 6Z'),
  pez: P('M8 24C14 14 28 12 36 24C28 36 14 34 8 24Z') + POLY('34,24 44,16 44,32'),
  bufanda: R(8, 12, 32, 9, 4) + R(26, 18, 8, 22, 3) + R(26, 40, 2, 4) + R(29, 40, 2, 4) + R(32, 40, 2, 4),
  guante: P('M16 40V20C16 12 22 8 27 8C32 8 34 12 34 18V24C36 20 41 21 40 26L34 36V40Z') + R(14, 40, 22, 5, 2),
  gorro: P('M10 34C10 20 16 12 24 12C32 12 38 20 38 34Z') + R(8, 33, 32, 7, 3) + C(24, 9, 4),
  calcetin: P('M18 6H30V26L38 32C42 35 40 42 34 42H22C16 42 14 36 18 32Z'),
  llave: O(15, 24, 8, 4) + R(22, 22, 20, 4, 1) + R(34, 26, 3, 6) + R(39, 26, 3, 5),
  lampara: P('M14 22L18 8H30L34 22Z') + R(22, 22, 4, 14) + R(14, 36, 20, 5, 2),
  ventana: H('M8 6H40V42H8Z M12 10V24H22V10Z M26 10V24H36V10Z M12 28V38H22V28Z M26 28V38H36V28Z'),
  maceta: P('M14 26H34L31 42H17Z') + P('M24 26C24 18 20 12 14 10C16 16 18 20 24 26Z') + P('M24 26C24 16 30 10 36 9C34 16 30 21 24 26Z'),
  mano: P('M14 42V24C14 21 18 21 18 24V12C18 9 22 9 22 12V10C22 7 26 7 26 10V12C26 9 30 9 30 12V16C30 13 34 13 34 16V30C34 37 30 42 24 42Z'),
  ojo: H(`M4 24C12 12 36 12 44 24C36 36 12 36 4 24Z ${circ(24, 24, 7)}`) + C(24, 24, 3),
  oreja: P('M30 6C20 6 14 13 14 22C14 28 18 30 18 36C18 41 22 43 26 42C30 41 30 37 32 34C35 29 38 24 38 16C38 10 35 6 30 6Z'),
  diente: P('M12 10C12 6 18 6 24 9C30 6 36 6 36 10C36 20 33 24 32 40C31 44 27 44 27 38C26 32 22 32 21 38C21 44 17 44 16 40C15 24 12 20 12 10Z'),
  zanahoria: P('M28 16C33 14 36 17 34 22L12 42C10 44 8 42 10 40Z') + P('M30 16C28 10 30 6 32 4C33 9 33 12 31 16Z') + P('M32 18C38 16 42 18 44 20C39 21 36 21 32 18Z'),
  tomate: E(24, 28, 15, 13) + star(24, 15, 8, 3),
  lechuga: C(16, 22, 8) + C(32, 22, 8) + C(24, 17, 9) + C(24, 30, 14),
  berenjena: P('M30 12C40 18 38 34 26 40C16 45 8 38 12 30C16 22 22 22 26 14Z') + P('M26 14C28 8 34 8 36 10C34 14 30 14 30 14Z') + L('M32 9L36 4'),
  taza: R(10, 16, 24, 22, 4) + O(36, 26, 6, 4) + R(8, 40, 30, 3, 1.5),
  huevo: E(24, 26, 12, 16),
  tostada: P('M10 18C8 10 14 6 20 8C22 6 26 6 28 8C34 6 40 10 38 18V40H10Z'),
  cafetera: P('M14 42L18 26H30L34 42Z') + P('M16 24L18 12H30L32 24Z') + R(21, 6, 6, 4, 1) + L('M32 16C38 16 38 24 32 24'),
  vaso: P('M12 8H36L32 42H16Z'),
  botella: P('M20 4H28V12C34 16 34 18 34 24V42C34 44 32 45 30 45H18C16 45 14 44 14 42V24C14 18 14 16 20 12Z'),
  pajita: P('M14 18H34L31 42H17Z') + L('M26 26L32 6L38 6'),
  lapiz: P('M8 40L12 30L34 8L40 14L18 36Z'),
  libro: P('M6 10C12 8 20 9 23 12V40C20 37 12 36 6 38Z') + P('M42 10C36 8 28 9 25 12V40C28 37 36 36 42 38Z'),
  regla: H('M4 30L30 4L44 18L18 44Z M12 30L16 26L18 28L14 32Z M18 24L22 20L24 22L20 26Z M24 18L28 14L30 16L26 20Z'),
  mochila: R(12, 12, 24, 30, 6) + P('M18 12C18 6 30 6 30 12H27C27 9 21 9 21 12Z'),
  sol: C(24, 24, 9) + rays(24, 24, 13, 19),
  nube: C(16, 28, 8) + C(26, 22, 10) + C(34, 28, 8) + R(12, 28, 26, 8, 4),
  gota: P('M24 6C24 6 12 22 12 30C12 37 17 42 24 42C31 42 36 37 36 30C36 22 24 6 24 6Z'),
  rayo: POLY('28,4 10,26 22,26 18,44 38,18 26,18 32,4'),
  rueda: O(24, 24, 16, 5) + C(24, 24, 4) + L('M24 10V38M10 24H38M14 14L34 34M34 14L14 34', 2),
  ancla: O(24, 9, 4) + L('M24 13V42M14 20H34', 3.5) + L('M8 30C10 40 18 42 24 42C30 42 38 40 40 30', 3.5),
  volante: O(24, 24, 16, 4) + C(24, 24, 5) + L('M8 24H19M29 24H40M24 29V40', 4),
  billete: P('M6 14H42V20C39 20 39 28 42 28V34H6V28C9 28 9 20 6 20Z'),
  semaforo: H(`M16 4H32V36H16Z ${circ(24, 11, 4)} ${circ(24, 20, 4)} ${circ(24, 29, 4)}`) + R(22, 36, 4, 10),
  farola: R(22, 14, 4, 30) + R(16, 42, 16, 3, 1) + P('M16 14L20 4H28L32 14Z'),
  edificio: H('M10 6H38V44H10Z M15 11H21V16H15Z M27 11H33V16H27Z M15 20H21V25H15Z M27 20H33V25H27Z M15 29H21V34H15Z M27 29H33V34H27Z M21 37H27V44H21Z'),
  banco: R(6, 18, 36, 4, 1) + R(6, 25, 36, 4, 1) + R(9, 29, 4, 12) + R(35, 29, 4, 12),
  tarta: R(8, 26, 32, 16, 3) + R(12, 18, 24, 9, 3) + R(23, 10, 2, 8) + E(24, 7, 2, 3),
  helado: POLY('15,22 33,22 24,44') + C(19, 18, 7) + C(29, 18, 7) + C(24, 11, 7),
  caramelo: C(24, 24, 9) + POLY('15,24 4,16 4,32') + POLY('33,24 44,16 44,32'),
  galleta: H(`${circ(24, 24, 18)} ${circ(17, 18, 2.5)} ${circ(29, 15, 2)} ${circ(31, 27, 2.5)} ${circ(19, 31, 2)} ${circ(25, 24, 1.8)}`),
  gafas: O(14, 26, 8, 4) + O(34, 26, 8, 4) + L('M22 25C23 23 25 23 26 25M6 24L3 18M42 24L45 18'),
  reloj: O(24, 24, 11, 4) + R(19, 4, 10, 9, 2) + R(19, 35, 10, 9, 2) + L('M24 18V24L28 27', 2.5),
  bolso: P('M8 20H40L37 42H11Z') + L('M16 20C16 8 32 8 32 20', 3.5),
  anillo: O(24, 30, 12, 4) + POLY('18,14 30,14 34,9 30,4 18,4 14,9'),
  sarten: C(18, 26, 13) + R(29, 23, 17, 6, 3),
  olla: R(8, 18, 32, 22, 4) + R(4, 20, 6, 4, 2) + R(38, 20, 6, 4, 2) + R(10, 14, 28, 4, 2) + R(21, 9, 6, 4, 2),
  cuchara: E(17, 14, 7, 9) + L('M20 22L36 42', 4),
  tenedor: R(13, 16, 15, 7, 3) + L('M14 6V18M20.5 6V18M27 6V18', 3) + L('M20 22L32 44', 4),
  casco: P('M6 32C6 18 14 10 24 10C34 10 42 18 42 32Z') + R(4, 32, 40, 6, 3),
  maletin: R(6, 16, 36, 26, 4) + L('M18 16V11C18 9 19 8 21 8H27C29 8 30 9 30 11V16'),
  tijeras: O(13, 36, 6, 3.5) + O(30, 38, 6, 3.5) + L('M17 32L38 6M27 34L14 8', 3.5),
  pincel: L('M8 42L28 18', 4) + P('M28 18L36 8C40 6 42 8 40 12L30 20Z'),
  balon: H(`${circ(24, 24, 17)} M24 15L32 21L29 30H19L16 21Z`),
  raqueta: O(28, 18, 12, 4) + L('M20 27L8 42', 5) + L('M20 10L36 26M18 18L30 30M24 8L38 22', 1.5),
  medalla: C(24, 32, 10) + POLY('14,4 22,4 26,22 20,22') + POLY('34,4 26,4 22,22 28,22'),
  silbato: P('M6 22H26C34 22 40 26 40 32C40 38 34 42 28 42C22 42 18 38 18 32H6Z') + R(22, 16, 8, 6, 1),
  nota: E(16, 36, 7, 5) + R(21, 8, 3, 28) + P('M21 8C30 10 32 16 36 18C32 22 28 16 24 16Z'),
  guitarra: E(18, 34, 10, 9) + E(25, 24, 7, 7) + L('M28 20L42 6', 4) + R(39, 3, 6, 6, 1),
  tambor: R(10, 16, 28, 22, 3) + E(24, 16, 14, 5) + L('M30 10L40 2M18 10L8 2', 2.5),
  microfono: R(18, 4, 12, 20, 6) + L('M12 20C12 30 36 30 36 20M24 29V40M16 42H32'),
  camara: H(`M6 16H16L19 11H29L32 16H42V38H6Z ${circ(24, 27, 8)}`) + C(24, 27, 4),
  dado: H(`M12 8H36Q40 8 40 12V36Q40 40 36 40H12Q8 40 8 36V12Q8 8 12 8Z ${circ(16, 16, 3)} ${circ(32, 16, 3)} ${circ(24, 24, 3)} ${circ(16, 32, 3)} ${circ(32, 32, 3)}`),
  ovillo: C(24, 26, 15) + L('M38 34C42 40 36 44 44 46', 2.5),
  vela: R(18, 18, 12, 26, 2) + P('M24 4C28 9 29 12 24 16C19 12 20 9 24 4Z'),
  regalo: R(8, 20, 32, 22, 2) + R(6, 14, 36, 8, 2) + C(19, 11, 4) + C(29, 11, 4),
  farolillo: E(24, 26, 13, 15) + R(20, 8, 8, 4, 1) + R(20, 40, 8, 4, 1) + L('M24 3V8', 2),
  aceituna: E(22, 28, 11, 14) + L('M24 14C26 8 30 6 34 6', 2.5) + P('M30 8C34 3 41 5 41 5C39 10 34 11 30 8Z'),
  gamba: P('M36 10C24 8 12 16 12 28C12 36 18 40 24 38C20 34 20 28 26 24C32 20 38 20 40 14Z') + POLY('24,38 16,44 30,44'),
  cazuela: E(24, 30, 18, 10) + R(6, 24, 36, 6, 3) + C(4, 27, 3) + C(44, 27, 3),
  barra: P('M6 32C4 26 30 6 38 8C44 10 42 16 40 18C30 30 12 38 6 32Z'),
  arbol: C(24, 18, 13) + C(16, 24, 9) + C(32, 24, 9) + R(21, 28, 6, 16, 2),
  hoja: P('M8 40C8 20 20 8 42 6C40 28 28 40 8 40Z'),
  montana: POLY('2,42 18,14 26,26 32,18 46,42'),
  flor: C(24, 12, 6) + C(34, 18, 6) + C(31, 29, 6) + C(17, 29, 6) + C(14, 18, 6) + C(24, 21, 5) + L('M24 28V46'),
  tirita: P('M8 32L32 8C36 4 44 12 40 16L16 40C12 44 4 36 8 32Z'),
  termometro: R(20, 4, 8, 30, 4) + C(24, 37, 7),
  pastilla: P('M12 36L30 18C34 14 40 20 36 24L18 42C14 46 8 40 12 36Z'),
  movil: H('M18 4H30Q34 4 34 8V40Q34 44 30 44H18Q14 44 14 40V8Q14 4 18 4Z M17 9H31V35H17Z') ,
  bombilla: C(24, 18, 13) + R(18, 30, 12, 6, 2) + R(20, 37, 8, 4, 2),
  enchufe: R(14, 18, 20, 16, 4) + R(18, 8, 4, 10, 1) + R(26, 8, 4, 10, 1) + R(22, 34, 4, 10, 1),
  antena: L('M24 18V44M16 44H32M24 18L10 4M24 18L38 4') + C(24, 18, 4),
  maleta: R(8, 14, 32, 28, 4) + L('M18 14V9H30V14') + C(14, 44, 2.5) + C(34, 44, 2.5),
  avion: P('M24 4C26 4 27 6 27 9V19L44 28V32L27 27V38L32 42V44L24 41L16 44V42L21 38V27L4 32V28L21 19V9C21 6 22 4 24 4Z'),
  brujula: O(24, 24, 17, 4) + POLY('24,10 28,24 24,38 20,24'),
  mapa: POLY('4,10 16,6 32,12 44,8 44,38 32,42 16,36 4,40'),
  sonrisa: H(`${circ(24, 24, 18)} ${circ(17, 19, 2.5)} ${circ(31, 19, 2.5)} M14 26C16 34 32 34 34 26C30 30 18 30 14 26Z`),
  lagrima: P('M30 6C30 6 14 22 14 31C14 38 19 42 26 42C33 42 38 37 38 30C38 20 30 6 30 6Z'),
};

/** 32x16 border tiles, repeated along a line. */
const BORDERS = {
  leaves: L('M0 8H32', 1.5) + P('M8 8C10 2 16 2 18 4C16 8 12 9 8 8Z') + P('M22 8C24 14 30 14 32 12C30 8 26 7 22 8Z'),
  dots: C(8, 8, 3) + C(24, 8, 2),
  stars: star(8, 8, 6, 2.6) + C(24, 8, 1.8),
  waves: L('M0 8C4 2 12 2 16 8C20 14 28 14 32 8', 2.5),
};

const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="#000">${body}</svg>\n`;
const outDir = join(ROOT, 'public/assets/decor');
mkdirSync(outDir, { recursive: true });

// Topics and their decoration items.
const dataDir = join(ROOT, 'src/data/crucigramas');
const topics = readdirSync(dataDir).filter((d) => statSync(join(dataDir, d)).isDirectory())
  .flatMap((lv) => readdirSync(join(dataDir, lv)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dataDir, lv, f), 'utf8'))));
const missing = [];
const used = new Set();
for (const t of topics) for (const it of t.decor?.items ?? []) { if (!SHAPES[it]) missing.push(`${t.id}: ${it}`); used.add(it); }
if (missing.length) { console.error(`make-decor: no shape for ${missing.join(', ')}`); process.exit(1); }
for (const name of used) writeFileSync(join(outDir, `${name}.svg`), svg('0 0 48 48', SHAPES[name]));
for (const [style, body] of Object.entries(BORDERS)) writeFileSync(join(outDir, `border-${style}.svg`), svg('0 0 32 16', body));

// Manifest: replace every decor.* entry.
const manifestPath = join(ROOT, 'public/assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const date = '2026-11-19';
const entry = (id, file, prompt) => ({
  id, kind: 'decor', files: { '1x': file }, alt: '', status: 'placeholder', aiGenerated: true,
  source: { tool: 'Claude', date, terms: 'own', prompt }, licence: 'own', games: ['crucigramas'],
});
manifest.assets = manifest.assets.filter((a) => !a.id.startsWith('decor.'));
for (const t of topics) for (const it of t.decor?.items ?? []) manifest.assets.push(entry(`decor.${t.id}.${it}`, `decor/${it}.svg`, `simple one-colour silhouette: ${it}`));
for (const style of Object.keys(BORDERS)) manifest.assets.push(entry(`decor.border.${style}`, `decor/border-${style}.svg`, `repeating ornament border: ${style}`));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`make-decor: ${used.size} silhouettes, ${Object.keys(BORDERS).length} borders, ${manifest.assets.filter((a) => a.id.startsWith('decor.')).length} manifest ids`);
