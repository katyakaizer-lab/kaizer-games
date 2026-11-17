// Build report: placeholder art by game, un-reviewed content, bundle and first-screen size, contrast, fonts, i18n.
// Writes dist/build-report.md and prints a short summary.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, read, isMain } from './lib.mjs';
import { checkContrast } from './check-contrast.mjs';
import { checkFonts } from './check-fonts.mjs';
import { checkArt } from './check-art.mjs';
import { checkHardcoded } from './check-hardcoded.mjs';

const DIST = join(ROOT, 'dist');
const FIRST_SCREEN_BUDGET = 1024 * 1024;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** The files a first visit to index.html loads: html, its scripts/styles (and their preloads), tokens, fonts, manifest, rig, pet, background. */
function firstScreen() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const refs = new Set([...html.matchAll(/(?:src|href)="\.?\/?([^"]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('http')));
  const files = new Set(['index.html', ...refs]);
  // follow static JS imports
  const queue = [...files].filter((f) => f.endsWith('.js'));
  while (queue.length) {
    const f = queue.pop();
    const p = join(DIST, f);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/(?:import|from)\s*["']\.\/([^"']+\.js)["']/g)) {
      const dep = `assets/${m[1]}`;
      if (!files.has(dep)) { files.add(dep); queue.push(dep); }
    }
  }
  for (const f of ['fonts/caveat-brush-latin-400-normal.woff2', 'fonts/nunito-latin-400-normal.woff2', 'fonts/nunito-latin-700-normal.woff2',
    'assets/manifest.json', 'assets/pets/rig.json', 'assets/pets/brote-alegria.svg', 'assets/backgrounds/paper.svg']) files.add(f);
  let total = 0;
  const list = [];
  for (const f of files) {
    const p = join(DIST, f);
    if (existsSync(p) && statSync(p).isFile()) { const s = statSync(p).size; total += s; list.push([f, s]); }
  }
  return { total, list: list.sort((a, b) => b[1] - a[1]) };
}

function content() {
  const dir = join(ROOT, 'src/data');
  const out = [];
  for (const f of walk(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    for (const [key, arr] of Object.entries(j)) {
      if (!Array.isArray(arr)) continue;
      const items = arr.filter((x) => x && typeof x === 'object' && 'reviewed' in x);
      if (items.length) out.push({ file: relative(ROOT, f).replace(/\\/g, '/'), key, total: items.length, unreviewed: items.filter((x) => !x.reviewed).length });
    }
  }
  return out;
}

function i18n() {
  const load = (l) => JSON.parse(read(`src/i18n/${l}.json`));
  const en = Object.keys(load('en'));
  return ['es', 'ru'].map((l) => { const d = load(l); return { lang: l, missing: en.filter((k) => !(k in d)).length, total: en.length }; });
}

export function buildReport() {
  const art = checkArt();
  const placeholders = art.assets.filter((a) => a.status === 'placeholder');
  const byGame = {};
  for (const a of placeholders) for (const g of a.games ?? ['(none)']) (byGame[g] ??= []).push(a);
  const contrastRes = checkContrast();
  const fonts = checkFonts();
  const hard = checkHardcoded();
  const files = existsSync(DIST) ? walk(DIST).map((p) => [relative(DIST, p).replace(/\\/g, '/'), statSync(p).size]) : [];
  const sum = (re) => files.filter(([f]) => re.test(f)).reduce((n, [, s]) => n + s, 0);
  const fs1 = existsSync(join(DIST, 'index.html')) ? firstScreen() : { total: 0, list: [] };
  const cont = content();

  const L = [];
  L.push('# Build report', '', `Generated ${new Date().toISOString()}`, '');
  L.push('## Summary', '');
  L.push(`- Contrast: ${contrastRes.filter((r) => r.ok).length}/${contrastRes.length} pairs pass (${[...new Set(contrastRes.map((r) => r.theme))].join(', ')})`);
  L.push(`- Fonts: ${fonts.every((r) => r.ok) ? 'pass' : 'FAIL'}${fonts.some((r) => r.note) ? ' (with notes)' : ''}`);
  L.push(`- Hard-coded colours or fonts: ${hard.problems.length}`);
  L.push(`- Art: ${art.assets.length} ids, ${placeholders.length} on placeholders, ${art.errors.length} errors`);
  L.push(`- Un-reviewed content: ${cont.reduce((n, c) => n + c.unreviewed, 0)} item(s)`);
  L.push(`- Bundle: ${kb(files.reduce((n, [, s]) => n + s, 0))} total, JS ${kb(sum(/\.js$/))}, CSS ${kb(sum(/\.css$/))}, fonts ${kb(sum(/\.woff2$/))}`);
  L.push(`- First screen: ${kb(fs1.total)} (budget ${kb(FIRST_SCREEN_BUDGET)}) ${fs1.total <= FIRST_SCREEN_BUDGET ? 'ok' : 'OVER BUDGET'}`, '');

  L.push('## Placeholder art by game', '');
  for (const [g, list] of Object.entries(byGame).sort()) L.push(`- **${g}** (${list.length}): ${list.map((a) => `\`${a.id}\`${a.files?.['1x'] ? '' : ' (no file)'}`).join(', ')}`);
  if (art.warnings.length) { L.push('', 'Notes:'); art.warnings.forEach((w) => L.push(`- ${w}`)); }
  L.push('', '## Un-reviewed content', '');
  if (!cont.length) L.push('- none');
  cont.forEach((c) => L.push(`- \`${c.file}\` ${c.key}: ${c.unreviewed} of ${c.total} not reviewed`));
  L.push('', '## Contrast', '', '| theme | pair | kind | ratio | result |', '|---|---|---|---|---|');
  contrastRes.forEach((r) => L.push(`| ${r.theme} | \`${r.fg}\` on \`${r.bg}\` | ${r.kind} | ${r.ratio.toFixed(2)} | ${r.ok ? 'pass' : 'LOW'} |`));
  L.push('', '## Fonts', '');
  fonts.forEach((r) => L.push(`- ${r.ok ? (r.note ? 'note' : 'ok') : 'FAIL'}: ${r.msg}`));
  L.push('', '## Interface strings', '');
  i18n().forEach((x) => L.push(`- ${x.lang}: ${x.total - x.missing}/${x.total} keys (missing fall back to English)`));
  L.push('', '## First-screen files', '');
  fs1.list.forEach(([f, s]) => L.push(`- ${f}: ${kb(s)}`));

  return { md: L.join('\n') + '\n', ok: contrastRes.every((r) => r.ok) && fonts.every((r) => r.ok) && !hard.problems.length && !art.errors.length && fs1.total <= FIRST_SCREEN_BUDGET };
}

if (isMain(import.meta.url)) {
  const { md, ok } = buildReport();
  if (existsSync(DIST)) writeFileSync(join(DIST, 'build-report.md'), md);
  console.log(md.split('## Placeholder')[0].trim());
  console.log(existsSync(DIST) ? '\n(full report: dist/build-report.md)' : '');
  if (!ok) process.exit(1);
}
