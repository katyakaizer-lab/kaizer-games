// Draws the pet parts library (simple original vector art in the app's style) on the shared 200x240 rig and
// registers every part in the manifest as kind "pet-part". Run: node tools/make-pet-parts.mjs
//
// Colours: fillable shapes carry classes, coloured by CSS variables set on each pet (see .k-pet rules in
// src/ui/ui.css): f1/f2/f3 = --fur-1/2/3, fe = --eyes, fn = --nose, ff = feet (--feet, default --fur-2),
// fc = chest (--chest, default --fur-2), fcx = a chest patch shown only when --chest is set, fk = points (ears; --points, default
// --fur-1); s1/s3/se/sn/sk = the same as stroke colours. Outlines stay ink (#2B2D42).
// Body and head parts contain only plain shapes (no groups): the composer reuses them to clip pattern overlays.
// Moods: eyes and mouth parts come in calma, alegria and siesta.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const INK = '#2B2D42';
const P = (d, cls = '', extra = '') => `<path d="${d}"${cls ? ` class="${cls}"` : ''}${extra ? ` ${extra}` : ''}/>`;
const E = (cx, cy, rx, ry, cls = '', extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${cls ? ` class="${cls}"` : ''}${extra ? ` ${extra}` : ''}/>`;
const C = (cx, cy, r, cls = '', extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${cls ? ` class="${cls}"` : ''}${extra ? ` ${extra}` : ''}/>`;
const NOS = 'stroke="none"';
const LINE = (d, w = 1.6, extra = '') => `<path d="${d}" fill="none" stroke-width="${w}"${extra ? ` ${extra}` : ''}/>`;
/** A thick stroked tail: an ink outline under a coloured stroke (class s1 / s3). */
const TAIL = (d, w = 14, cls = 's1') => `<path d="${d}" fill="none" stroke-width="${w}"/><path d="${d}" fill="none" class="${cls}" stroke-width="${w - 4}"/>`;
const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${+(200 - x).toFixed(1)} ${y}`);
const pair = (d, cls, extra = '') => P(d, cls, extra) + P(mirror(d), cls, extra);
const BLUSH = E(68, 94, 7, 4.5, '', `fill="#F08A73" ${NOS}`) + E(132, 94, 7, 4.5, '', `fill="#F08A73" ${NOS}`);

/* ---------------- Shared ---------------- */
const SHARED = {
  shadow: E(100, 226, 54, 6, '', `fill="#F0DDB8" ${NOS}`),
};
/**
 * Pattern overlays, one group per part they belong to (<g data-on="body">, <g data-on="head">). The composer draws
 * each group right after its part, clipped to that part's fur shapes, then redraws the part's outline and its
 * details (muzzle, blush) on top, so a pattern never crosses an outline or covers eyes, nose or beak, and never
 * reaches ears or wings (a breed can list more parts in "patternOn" if a pattern draws a group for them).
 * No outlines: markings are fill only; spots get a soft edge.
 */
const ON = (part, body) => `<g data-on="${part}">${body}</g>`;
const SPOT = (cx, cy, r) => C(cx, cy, r, 'f3 s3', 'stroke-width="2.6" stroke-opacity=".4"');
const STRIPE = (d, w) => LINE(d, w, 'class="s3"');
const PATTERNS = () => ({
  spots: ON('body', [SPOT(78, 150, 9), SPOT(122, 172, 11), SPOT(92, 192, 7), SPOT(120, 142, 6), SPOT(70, 180, 6), SPOT(130, 196, 6)].join(''))
    + ON('head', [SPOT(90, 58, 6), SPOT(114, 62, 5), SPOT(100, 71, 4), SPOT(137, 84, 5), SPOT(63, 82, 4)].join('')),
  stripes: ON('body', [
    STRIPE('M48 150 Q62 146 74 156', 5), STRIPE('M152 150 Q138 146 126 156', 5),
    STRIPE('M46 172 Q60 168 72 178', 5), STRIPE('M154 172 Q140 168 128 178', 5),
    STRIPE('M50 194 Q62 190 72 198', 5), STRIPE('M150 194 Q138 190 128 198', 5)].join(''))
    + ON('head', [STRIPE('M90 48 L93 62', 4), STRIPE('M100 44 L100 62', 4), STRIPE('M110 48 L107 62', 4), STRIPE('M58 82 L68 83', 4), STRIPE('M142 82 L132 83', 4)].join('')),
  // From the front, a saddle (back colour) shows on the sides of the body and as a cap on the head.
  saddle: ON('body', pair('M38 132 C50 122 66 122 74 130 C70 160 70 186 74 210 L38 210 Z', 'f3')) + ON('head', P('M54 40 L146 40 L146 64 C124 56 76 56 54 64 Z', 'f3')),
  mask: ON('head', P('M54 66 C74 56 126 56 146 66 L146 92 C126 102 74 102 54 92 Z', 'f3')),
  patches: ON('body', P('M44 140 C56 128 76 134 78 150 C80 168 60 176 48 168 Z', 'f3') + P('M116 168 C126 156 150 160 152 176 C154 196 132 204 120 194 Z', 'f3'))
    + ON('head', P('M58 60 C64 48 86 48 90 58 C92 68 76 72 64 70 Z', 'f3') + P('M124 90 C130 84 142 86 144 96 C144 106 132 110 126 104 Z', 'f3')),
  // Colour points (Siamese): a darker oval centred on the muzzle; ears, paws and tail tip use --points (= --fur-2).
  points: ON('head', E(100, 100, 27, 20, 'f2')),
});
/** One clean curly outline (n bumps) around an ellipse: for the poodle's tuft, ears and pom-pom. */
function scallop(cx, cy, rx, ry, n, start = -90) {
  const pt = (a, k = 1) => { const t = (a * Math.PI) / 180; return `${+(cx + rx * k * Math.cos(t)).toFixed(1)} ${+(cy + ry * k * Math.sin(t)).toFixed(1)}`; };
  let d = `M${pt(start)}`;
  for (let i = 0; i < n; i++) { const a = start + (i * 360) / n, b = start + ((i + 1) * 360) / n; d += ` Q${pt((a + b) / 2, 1.32)} ${pt(b)}`; }
  return d + ' Z';
}

/* ---------------- Dog ---------------- */
const dogEyes = {
  calma: C(82, 78, 5, 'fe', NOS) + C(118, 78, 5, 'fe', NOS) + C(83.6, 76.2, 1.7, '', `fill="#FFFFFF" ${NOS}`) + C(119.6, 76.2, 1.7, '', `fill="#FFFFFF" ${NOS}`),
  alegria: LINE('M75 79 Q82 71 89 79', 3) + LINE('M111 79 Q118 71 125 79', 3),
  siesta: LINE('M75 79 Q82 84.6 89 79', 3) + LINE('M111 79 Q118 84.6 125 79', 3),
};
const dogMouth = {
  calma: LINE('M100 101 L100 105 M100 105 Q94 111 89 107 M100 105 Q106 111 111 107', 1.8),
  alegria: P('M91 105 Q100 121 109 105 Z', '', 'fill="#D9786A" stroke-width="1.8"') + P('M96 112 Q100 119 104 112 Q100 110 96 112 Z', '', `fill="#F08A73" ${NOS}`),
  siesta: LINE('M100 101 L100 105 M95 108 Q100 111 105 108', 1.8),
};
const DOG = {
  'body-round': P('M62 204 C50 156 68 108 100 108 C132 108 150 156 138 204 C124 214 76 214 62 204 Z', 'f1'),
  'body-long': P('M46 206 C34 166 60 106 100 106 C140 106 166 166 154 206 C136 216 64 216 46 206 Z', 'f1'),
  'body-fluffy': P('M64 204 C48 198 50 176 60 170 C50 156 62 136 78 140 C80 98 120 98 122 140 C138 136 150 156 140 170 C150 176 152 198 136 204 C124 214 76 214 64 204 Z', 'f1'),
  'body-slim': P('M70 204 C62 158 76 108 100 108 C124 108 138 158 130 204 C120 212 80 212 70 204 Z', 'f1'),
  'belly-round': P('M84 142 C90 134 110 134 116 142 C122 162 116 190 100 204 C84 190 78 162 84 142 Z', 'fc', 'stroke-width="1.6"'),
  'belly-long': P('M80 158 C88 152 112 152 120 158 C126 174 118 196 100 206 C82 196 74 174 80 158 Z', 'fc', 'stroke-width="1.6"'),
  'belly-slim': P('M88 148 C92 142 108 142 112 148 C116 166 112 190 100 202 C88 190 84 166 88 148 Z', 'fc', 'stroke-width="1.6"'),
  'tail-wag': TAIL('M136 204 C170 206 180 178 164 160', 15),
  'tail-bushy': E(162, 178, 16, 40, 'f1', 'transform="rotate(28 162 178)"') + E(176, 150, 9, 12, 'f2', `${NOS} transform="rotate(28 176 150)"`),
  'tail-pom': TAIL('M134 200 C158 200 166 184 160 168', 10) + P(scallop(160, 160, 12, 12, 6), 'f1'),
  'tail-thin': TAIL('M134 204 C166 204 174 182 166 162', 9),
  'ears-floppy': pair('M66 60 C48 60 42 92 52 110 C64 112 72 98 74 80 Z', 'f1'),
  'ears-long': pair('M66 62 C46 62 38 104 46 132 C60 134 70 112 74 82 Z', 'f1'),
  'ears-pointy': pair('M68 66 L58 24 L92 50 Z', 'f1') + pair('M70 58 L64 34 L84 50 Z', 'f2', NOS),
  'ears-curly': P(scallop(60, 100, 13, 22, 6), 'f1') + P(scallop(140, 100, 13, 22, 6), 'f1'),
  'ears-big': pair('M72 70 L44 26 L94 56 Z', 'f1') + pair('M74 62 L54 36 L86 56 Z', 'f2', NOS),
  'head-round': E(100, 84, 38, 34, 'f1') + BLUSH,
  'head-long': P('M64 80 C64 58 80 48 100 48 C120 48 136 58 136 80 C136 98 124 116 100 120 C76 116 64 98 64 80 Z', 'f1') + BLUSH,
  'head-fluffy': P(scallop(100, 58, 22, 13, 5), 'f1') + E(100, 88, 34, 30, 'f1') + BLUSH,
  'head-small': E(100, 86, 34, 31, 'f1') + BLUSH,
  'snout-round': E(100, 100, 21, 14, 'f2', NOS) + E(100, 95, 7, 5, 'fn', NOS) + E(98, 93.5, 2, 1.2, '', `fill="#FFFFFF" ${NOS}`),
  'snout-long': E(100, 101, 17, 15, 'f2') + E(100, 94, 7, 5, 'fn', NOS) + E(98, 92.5, 2, 1.2, '', `fill="#FFFFFF" ${NOS}`),
  'feet-paws': E(84, 209, 12, 8, 'ff') + E(116, 209, 12, 8, 'ff'),
  'feet-short': E(74, 211, 14, 7, 'ff') + E(126, 211, 14, 7, 'ff'),
};
for (const m of ['calma', 'alegria', 'siesta']) { DOG[`eyes-dot-${m}`] = dogEyes[m]; DOG[`mouth-dog-${m}`] = dogMouth[m]; }

/* ---------------- Cat ---------------- */
const CAT = {
  'body-sit': P('M60 204 C48 152 68 120 100 120 C132 120 152 152 140 204 C126 214 74 214 60 204 Z', 'f1'),
  'body-fluffy': P('M58 206 C40 196 44 170 56 162 C48 144 64 124 82 128 C90 116 110 116 118 128 C136 124 152 144 144 162 C156 170 160 196 142 206 C128 216 72 216 58 206 Z', 'f1'),
  'belly-sit': P('M82 140 C88 132 112 132 118 140 C124 160 118 190 100 204 C82 190 76 160 82 140 Z', 'fc', 'stroke-width="1.6"') + LINE('M84 198 l-4 8 M92 202 l-2 8 M108 202 l2 8 M116 198 l4 8', 1.5),
  'belly-fluffy': P('M78 144 C86 132 114 132 122 144 C130 166 122 194 100 206 C78 194 70 166 78 144 Z', 'fc', 'stroke-width="1.6"'),
  'tail-long': TAIL('M136 208 C176 216 192 178 170 152', 14) + `<path d="M136 208 C176 216 192 178 170 152" fill="none" class="sk" stroke="none" stroke-width="10" pathLength="100" stroke-dasharray="0 78 22"/>`,
  'belly-patch': P('M88 140 C92 134 108 134 112 140 C114 150 108 160 100 164 C92 160 86 150 88 140 Z', 'fcx', NOS),
  'tail-fluffy': E(164, 176, 17, 40, 'f1', 'transform="rotate(25 164 176)"'),
  'ears-pointed': pair('M64 70 L60 34 L88 52 Z', 'fk') + pair('M67 62 L65 44 L80 53 Z', '', `fill="#E8A78F" ${NOS}`),
  'ears-small': pair('M70 64 L68 46 L88 56 Z', 'fk') + pair('M72 59 L71 50 L82 56 Z', '', `fill="#E8A78F" ${NOS}`),
  'head-round': P('M62 84 C62 58 80 46 100 46 C120 46 138 58 138 84 C138 106 120 118 100 118 C80 118 62 106 62 84 Z', 'f1') + E(100, 102, 23, 15, 'f2', NOS),
  'head-flat': P('M56 88 C56 62 78 50 100 50 C122 50 144 62 144 88 C144 110 124 122 100 122 C76 122 56 110 56 88 Z', 'f1') + E(100, 104, 26, 15, 'f2', NOS),
  'snout-cat': P('M96 96 L104 96 L100 101 Z', 'fn', 'stroke-width="1.6"') + LINE('M72 98 L40 92 M72 102 L40 104 M128 98 L160 92 M128 102 L160 104', 1),
  'feet-paws': E(84, 208, 12, 8, 'ff') + E(116, 208, 12, 8, 'ff'),
  'eyes-cat-calma': P('M78 84 Q86 76 94 84 Q86 90 78 84 Z', 'fe', 'stroke-width="1.8"') + P('M106 84 Q114 76 122 84 Q114 90 106 84 Z', 'fe', 'stroke-width="1.8"')
    + E(86, 83.5, 1.8, 4.5, '', `fill="${INK}" ${NOS}`) + E(114, 83.5, 1.8, 4.5, '', `fill="${INK}" ${NOS}`),
  'eyes-cat-alegria': LINE('M78 84 Q86 76 94 84', 3.2, 'class="se"') + LINE('M106 84 Q114 76 122 84', 3.2, 'class="se"'),
  'eyes-cat-siesta': LINE('M78 84 Q86 89.6 94 84', 3, 'class="se"') + LINE('M106 84 Q114 89.6 122 84', 3, 'class="se"'),
  'mouth-cat-calma': LINE('M100 101 L100 105 M100 105 Q94 109 90 106 M100 105 Q106 109 110 106'),
  'mouth-cat-alegria': P('M93 105 Q100 115 107 105 Z', '', 'fill="#D9786A" stroke-width="1.6"'),
  'mouth-cat-siesta': LINE('M100 101 L100 105 M95 107 Q100 109 105 107'),
};

/* ---------------- Fox ---------------- */
const FOX = {
  'body-sit': CAT['body-sit'],
  'belly-sit': CAT['belly-sit'],
  'tail-brush': E(168, 172, 19, 46, 'f2', 'transform="rotate(25 168 172)"') + E(164, 184, 18, 38, 'f1', `${NOS} transform="rotate(25 164 184)"`) + E(168, 172, 19, 46, '', 'fill="none" transform="rotate(25 168 172)"'),
  'ears-pointed': pair('M62 70 L58 26 L92 54 Z', 'f1') + pair('M64 60 L62 38 L80 54 Z', 'f3', NOS),
  'ears-small': pair('M68 66 L64 40 L90 56 Z', 'f1') + pair('M70 59 L68 46 L82 56 Z', 'f3', NOS),
  'ears-huge': pair('M66 72 L34 8 L96 50 Z', 'f1') + pair('M68 62 L44 22 L86 52 Z', '', `fill="#E8A78F" ${NOS}`),
  'head-fox': P('M60 76 C60 58 78 50 100 50 C122 50 140 58 140 76 C140 92 124 106 100 124 C76 106 60 92 60 76 Z', 'f1')
    + P('M64 86 C78 92 88 98 100 98 C112 98 122 92 136 86 C130 100 116 112 100 124 C84 112 70 100 64 86 Z', 'f2', NOS),
  'snout-fox': E(100, 113, 5, 3.4, 'fn', NOS) + LINE('M70 96 L50 92 M72 101 L52 104 M130 96 L150 92 M128 101 L148 104', 1),
  'feet-socks': E(84, 208, 12, 8, 'f3') + E(116, 208, 12, 8, 'f3'),
  'eyes-fox-calma': E(84, 76, 4.2, 3.6, 'fe', `${NOS} transform="rotate(15 84 76)"`) + E(116, 76, 4.2, 3.6, 'fe', `${NOS} transform="rotate(-15 116 76)"`)
    + C(85.5, 74.8, 1.2, '', `fill="#FFF4E0" ${NOS}`) + C(117.5, 74.8, 1.2, '', `fill="#FFF4E0" ${NOS}`) + LINE('M75 74 L68 71 M125 74 L132 71', 1.8),
  'eyes-fox-alegria': LINE('M78 77 Q84 70 90 77', 3) + LINE('M110 77 Q116 70 122 77', 3),
  'eyes-fox-siesta': LINE('M78 75 Q84 80 90 75', 3) + LINE('M110 75 Q116 80 122 75', 3),
  'mouth-fox-calma': LINE('M100 116 L100 118 M100 118 Q95 122 91 119 M100 118 Q105 122 109 119', 1.5),
  'mouth-fox-alegria': P('M93 117 Q100 126 107 117 Z', '', 'fill="#D9786A" stroke-width="1.5"'),
  'mouth-fox-siesta': LINE('M100 116 L100 118 M96 120 Q100 122 104 120', 1.5),
};

/* ---------------- Birds (Pájaro: cuervo, urraca, búho, loro, canario, petirrojo, pingüino) ---------------- */
const birdEyes = (r, cy) => ({
  calma: E(80, cy, r, r + 0.5, '', 'fill="#FFF4E0" stroke-width="1.6"') + E(120, cy, r, r + 0.5, '', 'fill="#FFF4E0" stroke-width="1.6"')
    + C(81, cy + 1, r * 0.55, 'fe', NOS) + C(119, cy + 1, r * 0.55, 'fe', NOS) + C(81, cy + 1, r * 0.28, '', `fill="${INK}" ${NOS}`) + C(119, cy + 1, r * 0.28, '', `fill="${INK}" ${NOS}`)
    + C(82.4, cy - 0.6, r * 0.16, '', `fill="#FFFFFF" ${NOS}`) + C(120.4, cy - 0.6, r * 0.16, '', `fill="#FFFFFF" ${NOS}`),
  alegria: LINE(`M${80 - r} ${cy + 1} Q80 ${cy - r} ${80 + r} ${cy + 1}`, 3, 'class="se"') + LINE(`M${120 - r} ${cy + 1} Q120 ${cy - r} ${120 + r} ${cy + 1}`, 3, 'class="se"'),
  siesta: LINE(`M${80 - r} ${cy} Q80 ${cy + r * 0.7} ${80 + r} ${cy}`, 3, 'class="se"') + LINE(`M${120 - r} ${cy} Q120 ${cy + r * 0.7} ${120 + r} ${cy}`, 3, 'class="se"'),
});
const BIRD = {
  'body-round': E(100, 158, 54, 52, 'f1'),
  'belly-round': E(100, 176, 30, 28, 'fc', 'stroke-width="1.8"') + LINE('M86 172 q4 4 8 0 M100 172 q4 4 8 0 M92 184 q4 4 8 0', 1.2),
  'wings-wing': E(50, 164, 16, 34, 'f3', 'transform="rotate(12 50 164)"') + E(150, 164, 16, 34, 'f3', 'transform="rotate(-12 150 164)"'),
  'tail-fan': E(86, 214, 8, 20, 'f3', 'transform="rotate(14 86 214)"') + E(114, 214, 8, 20, 'f3', 'transform="rotate(-14 114 214)"') + E(100, 216, 8, 20, 'f3'),
  'feet-talons': LINE('M82 206 L80 218 M82 206 L86 218 M82 206 L74 216 M118 206 L120 218 M118 206 L114 218 M118 206 L126 216', 3.5, 'class="sn"'),
  'ears-crest': P('M92 66 Q94 50 100 44 Q106 50 108 66 Z', 'f3'),
  'ears-tufts': pair('M66 74 L58 46 L84 66 Z', 'f1'),
  'head-round': E(100, 94, 38, 33, 'f1') + E(68, 102, 7, 4.5, '', `fill="#F08A73" ${NOS}`) + E(132, 102, 7, 4.5, '', `fill="#F08A73" ${NOS}`),
  'head-owl': E(100, 96, 42, 36, 'f1') + C(80, 92, 16, 'f2', 'stroke-width="1.4"') + C(120, 92, 16, 'f2', 'stroke-width="1.4"'),
  'snout-beak': P('M89 98 Q100 92 111 98 L103 117 Q100 120 97 117 Z', 'fn', 'stroke-width="2"'),
  'snout-hook': P('M94 102 Q100 97 106 102 L101 114 Q100 116 99 114 Z', 'fn', 'stroke-width="1.8"'),
  'mouth-bird-calma': LINE('M95 108 L105 108', 1.3),
  'mouth-bird-alegria': LINE('M95 107 Q100 111 105 107', 1.5),
  'mouth-bird-siesta': LINE('M96 108 L104 108', 1.3),
};
for (const [name, r, cy] of [['bird', 7, 88], ['owl', 10, 92]]) for (const [m, s] of Object.entries(birdEyes(r, cy))) BIRD[`eyes-${name}-${m}`] = s;

/* ---------------- Dragon ---------------- */
const DRAGON = {
  'body-round': E(100, 166, 46, 44, 'f1'),
  'belly-round': E(100, 180, 28, 30, 'fc', 'stroke-width="1.8"') + LINE('M80 170 Q100 175 120 170 M78 182 Q100 188 122 182 M82 194 Q100 199 118 194', 1.4),
  'wings-bat': pair('M64 152 C30 148 10 122 12 84 Q24 100 34 96 Q38 110 48 114 Q54 124 66 134 Z', 'f3') + LINE('M64 150 L12 84 M64 150 L34 96 M64 150 L48 114 M136 150 L188 84 M136 150 L166 96 M136 150 L152 114', 1.3),
  'wings-leaf': pair('M66 152 C28 154 12 116 22 80 C40 94 58 118 68 138 Z', 'f3') + LINE('M66 150 C48 132 34 110 22 80 M136 150 C152 132 166 110 178 80 M48 128 L34 126 M52 112 L40 104 M152 128 L166 126 M148 112 L160 104', 1.3),
  'wings-fin': pair('M62 152 C40 152 26 132 32 110 C46 118 56 130 66 140 Z', 'f3') + LINE('M62 150 L34 114 M62 150 L40 128 M138 150 L166 114 M138 150 L160 128', 1.2),
  'tail-spike': TAIL('M138 204 C170 216 192 202 190 176 C189 164 184 156 178 150', 15) + P('M170 150 L186 138 L188 156 Z', 'f3'),
  'tail-fin': TAIL('M138 204 C170 216 192 202 190 176 C189 164 184 156 178 150', 15) + P('M172 156 C170 140 180 128 194 128 C192 142 186 152 180 158 Z', 'f3'),
  'arms-claws': E(55, 172, 9, 12, 'f1', 'transform="rotate(20 55 172)"') + E(145, 172, 9, 12, 'f1', 'transform="rotate(-20 145 172)"') + LINE('M48 180 l-3 5 M54 182 l-1 5 M60 181 l1 5 M152 180 l3 5 M146 182 l1 5 M140 181 l-1 5'),
  'feet-claws': E(78, 212, 14, 7, 'f3') + E(122, 212, 14, 7, 'f3') + LINE('M68 216 l-2 5 M76 218 l0 5 M84 217 l2 5 M116 217 l-2 5 M124 218 l0 5 M132 216 l2 5', 1.8),
  'ears-frill': pair('M60 96 L44 88 L50 100 L40 106 L52 110 L62 106 Z', 'f3'),
  'horns-nubs': P('M94 68 L100 54 L106 68 Z', 'f3') + P('M84 70 L88 60 L92 69 Z', 'f3', 'stroke-width="1.6"') + P('M108 69 L112 60 L116 70 Z', 'f3', 'stroke-width="1.6"'),
  'horns-curved': pair('M82 70 C72 64 62 58 54 44 C70 48 82 58 90 68 Z', 'f2') + P('M94 68 L100 56 L106 68 Z', 'f3'),
  'head-dragon': P('M62 98 C62 70 80 62 100 62 C120 62 138 70 138 98 C138 114 124 124 100 124 C76 124 62 114 62 98 Z', 'f1'),
  'snout-dragon': P('M80 108 C80 100 120 100 120 108 L123 121 C123 130 77 130 77 121 Z', 'f1', 'stroke-width="2"') + LINE('M91 108 q2.5 -3.5 5 0 M104 108 q2.5 -3.5 5 0', 1.8) + LINE('M72 86 Q82 79 92 86 M108 86 Q118 79 128 86', 2.4),
  'eyes-dragon-calma': E(82, 96, 6.5, 6, 'fe', 'stroke-width="1.6"') + E(118, 96, 6.5, 6, 'fe', 'stroke-width="1.6"') + E(82, 96, 1.7, 5, '', `fill="${INK}" ${NOS}`) + E(118, 96, 1.7, 5, '', `fill="${INK}" ${NOS}`),
  'eyes-dragon-alegria': LINE('M75 97 Q82 89 89 97', 3) + LINE('M111 97 Q118 89 125 97', 3),
  'eyes-dragon-siesta': LINE('M75 96 Q82 101 89 96', 3) + LINE('M111 96 Q118 101 125 96', 3),
  'mouth-dragon-calma': LINE('M86 122 Q100 128 114 122', 2) + P('M89 123 l2.5 6 l2.5 -6 Z M107 123 l2.5 6 l2.5 -6 Z', '', 'fill="#FFF4E0" stroke-width="1.2"'),
  'mouth-dragon-alegria': P('M86 120 Q100 134 114 120 Z', '', 'fill="#D9786A" stroke-width="2"') + P('M89 121 l2.5 5 l2.5 -5 Z M107 121 l2.5 5 l2.5 -5 Z', '', 'fill="#FFF4E0" stroke-width="1.2"'),
  'mouth-dragon-siesta': LINE('M90 123 Q100 126 110 123', 2),
};

// New birds: a smaller body (canario, petirrojo), a parrot's hooked beak and long tail, a penguin's egg body, white
// front, flippers and webbed feet (beak and feet share the nose colour, "Pico y patas").
Object.assign(BIRD, {
  'body-small': E(100, 166, 44, 42, 'f1'),
  'belly-small': E(100, 180, 24, 22, 'fc', 'stroke-width="1.8"'),
  'head-small': E(100, 100, 32, 28, 'f1') + E(72, 106, 6, 4, '', `fill="#F08A73" ${NOS}`) + E(128, 106, 6, 4, '', `fill="#F08A73" ${NOS}`),
  'snout-small': P('M94 100 Q100 95 106 100 L100 111 Z', 'fn', 'stroke-width="1.8"'),
  'snout-parrot': P('M88 98 C92 88 110 88 114 98 C116 108 110 118 101 123 C103 114 99 108 88 104 Z', 'fn', 'stroke-width="2"') + LINE('M90 104 Q98 108 104 116', 1.4),
  'tail-long': E(88, 214, 7, 24, 'f3', 'transform="rotate(14 88 214)"') + E(112, 214, 7, 24, 'f3', 'transform="rotate(-14 112 214)"') + E(100, 220, 7, 26, 'f1'),
  'body-penguin': P('M100 100 C136 100 150 150 146 186 C142 210 124 216 100 216 C76 216 58 210 54 186 C50 150 64 100 100 100 Z', 'f1'),
  'belly-penguin': P('M100 120 C122 120 132 152 130 182 C128 204 116 210 100 210 C84 210 72 204 70 182 C68 152 78 120 100 120 Z', 'fc', 'stroke-width="1.8"'),
  'head-penguin': E(100, 92, 36, 32, 'f1') + P('M100 82 C112 72 126 78 126 92 C126 106 114 116 100 116 C86 116 74 106 74 92 C74 78 88 72 100 82 Z', 'f2', NOS),
  'wings-flipper': pair('M60 128 C44 144 38 170 44 190 C52 184 58 162 64 140 Z', 'f1'),
  'feet-webbed': P('M76 212 L72 222 L80 219 L86 223 L92 219 L96 222 L92 212 Z', 'fn', 'stroke-width="1.8"') + P('M104 212 L108 222 L114 219 L120 223 L126 219 L130 222 L124 212 Z', 'fn', 'stroke-width="1.8"'),
});
// New dragons: De aire (cloud wings, a wisp tail with a puff, curled horns) and Eléctrico (zigzag wings, bolt horns,
// a lightning-bolt tail tip).
Object.assign(DRAGON, {
  'wings-cloud': P(scallop(48, 130, 22, 24, 6, -90), 'f3') + P(mirror(scallop(48, 130, 22, 24, 6, -90)), 'f3'),
  'tail-wisp': TAIL('M138 204 C170 214 190 196 184 172', 13) + P(scallop(180, 162, 12, 11, 5), 'f3'),
  'horns-wisp': pair('M86 68 C80 56 70 50 62 54 C70 56 76 62 80 70 Z', 'f3') + C(62, 54, 3.5, 'f3'),
  'wings-bolt': pair('M66 150 C38 148 20 132 14 104 L30 112 L28 94 L44 108 L46 90 L58 116 Q62 128 68 138 Z', 'f3'),
  'horns-bolt': pair('M88 68 L80 56 L86 56 L80 42 L94 58 L88 58 L93 68 Z', 'f3'),
  'tail-bolt': TAIL('M138 204 C170 216 192 202 190 176 C189 166 186 160 182 156', 15) + P('M178 160 L188 132 L184 146 L196 140 L182 170 L186 154 Z', 'f3'),
});

const LIBRARY = { dog: DOG, cat: CAT, fox: FOX, bird: BIRD, dragon: DRAGON };
const svg = (slot, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240"><g data-slot="${slot}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>\n`;
const slotOf = (name) => name.split('-')[0];
const base = join(ROOT, 'public/assets/pet-parts');
const entries = [];
const date = '2026-11-19';
const entry = (id, file, prompt) => ({ id, kind: 'pet-part', files: { '1x': file }, alt: '', status: 'placeholder', aiGenerated: true,
  source: { tool: 'Claude', date, terms: 'own', prompt }, licence: 'own', games: ['hub'] });

mkdirSync(join(base, 'shared'), { recursive: true });
for (const [name, body] of Object.entries(SHARED)) { writeFileSync(join(base, 'shared', `${name}.svg`), svg(name, body)); entries.push(entry(`pet-part.shared.${name}`, `pet-parts/shared/${name}.svg`, `pet part: ${name}`)); }
mkdirSync(join(base, 'pattern'), { recursive: true });
for (const [name, body] of Object.entries(PATTERNS())) { writeFileSync(join(base, 'pattern', `${name}.svg`), svg('pattern', body).replace(`stroke="${INK}"`, 'stroke="none"')); entries.push(entry(`pet-part.pattern.${name}`, `pet-parts/pattern/${name}.svg`, `pet pattern overlay: ${name}`)); }
for (const [species, parts] of Object.entries(LIBRARY)) {
  mkdirSync(join(base, species), { recursive: true });
  for (const [name, body] of Object.entries(parts)) {
    writeFileSync(join(base, species, `${name}.svg`), svg(slotOf(name), body));
    // Mood parts (eyes-dot-calma) are registered as pet-part.dog.eyes-dot.calma
    const m = name.match(/^(.*)-(calma|alegria|siesta)$/);
    const id = m ? `pet-part.${species}.${m[1]}.${m[2]}` : `pet-part.${species}.${name}`;
    entries.push(entry(id, `pet-parts/${species}/${name}.svg`, `pet part (${species}): ${name}`));
  }
}
const manifestPath = join(ROOT, 'public/assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.assets = manifest.assets.filter((a) => a.kind !== 'pet-part').concat(entries);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`make-pet-parts: ${entries.length} parts`);
