// Content check for Solitario: which words do not fit a card of their level on a 375px phone with the
// level's column count (at most 6 under 400px), using the game's own rule (sizing.ts): 16px down to 13px
// on one line, then wrapped at a syllable, 2 lines at most (category names 3).
// Character widths of the real card font are measured in Chrome/Edge (playwright-core); writes
// dist/card-words.json for the build report. A word listed here makes the game use fewer columns on
// small phones: shorten it, or lower the level's columns.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, read, parseTokens } from './lib.mjs';
import { cardWidthFor, fitSpanish, innerWidth, MAX_NAME_LINES, MAX_WORD_LINES } from '../src/games/solitario/sizing.ts';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const OUT = join(ROOT, 'dist/card-words.json');
const PHONE_W = 375;

const dir = join(ROOT, 'src/data/solitario');
const parsed = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const categories = parsed.flatMap((p) => p.categories ?? []);
const levels = Object.assign({}, ...parsed.map((p) => p.levels ?? {}));
const base = parseTokens(read('public/tokens.css')).base;
const px = (name, fb) => { const v = base[name]; if (!v) return fb; return v.endsWith('px') ? parseFloat(v) : parseFloat(v) * 16; };
const tk = {
  boardPad: px('--board-pad', 12), colGap: px('--col-gap', 10), cardMax: px('--card-max', 72), edge: px('--card-edge', 4), frame: px('--card-frame-w', 1.5),
  pad: px('--card-pad', 2), wordMax: px('--card-word-max', 16), wordMin: px('--card-word-min', 13), nameMin: px('--card-name-min', 13),
};

const exe = CANDIDATES.find((p) => existsSync(p));
mkdirSync(join(ROOT, 'dist'), { recursive: true });
if (!exe) {
  writeFileSync(OUT, JSON.stringify({ checked: false, reason: 'no Chrome or Edge found (set CHROME_PATH)' }, null, 1));
  console.log('check-card-words: skipped (no browser)');
  process.exit(0);
}
// Measure every character (and the hyphen) of the card font at 1px bold; widths scale linearly with size.
const chars = [...new Set([...categories.flatMap((c) => [c.name_es, ...c.items.map((i) => i.es)]).join(''), '-', ' '])];
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const fontUrl = pathToFileURL(join(ROOT, 'public/fonts/nunito-latin-700-normal.woff2')).href;
const fontExt = pathToFileURL(join(ROOT, 'public/fonts/nunito-latin-ext-700-normal.woff2')).href;
await page.goto(pathToFileURL(join(ROOT, 'tools/blank.html')).href).catch(() => page.setContent('<!doctype html><title>m</title>'));
const widths = await page.evaluate(async ({ fontUrl, fontExt, chars }) => {
  const f1 = new FontFace('CardFont', `url(${fontUrl})`, { weight: '700' });
  const f2 = new FontFace('CardFont', `url(${fontExt})`, { weight: '700', unicodeRange: 'U+0100-024F' });
  await Promise.all([f1.load(), f2.load()]).then((fs) => fs.forEach((f) => document.fonts.add(f)));
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '700 100px CardFont';
  return Object.fromEntries(chars.map((c) => [c, ctx.measureText(c).width / 100]));
}, { fontUrl, fontExt, chars });
await browser.close();
// Sum of character widths plus 2% for kerning differences (errs on the side of reporting).
const measure = (text, size) => [...text].reduce((n, c) => n + (widths[c] ?? 0.6), 0) * size * 1.02;

const result = {};
for (const [level, cfg] of Object.entries(levels)) {
  if (level.startsWith('_')) continue;
  const configured = Math.min(6, cfg.columns);
  const cats = categories.filter((c) => c.level === level);
  const check = (cols) => {
    const cardW = Math.floor(cardWidthFor(PHONE_W, cols, tk));
    const inner = innerWidth(cardW, tk);
    const words = cats.flatMap((c) => c.items.map((i) => ({ es: i.es, cat: c.id, lines: fitSpanish(i.es, inner, tk, measure).lines, max: MAX_WORD_LINES })));
    const names = cats.map((c) => ({ es: c.name_es, cat: c.id, lines: fitSpanish(c.name_es, inner, tk, measure, tk.nameMin).lines, max: MAX_NAME_LINES }));
    return { cardW, inner: Math.floor(inner), tooLong: [...words, ...names].filter((w) => w.lines > w.max).map(({ es, cat, lines }) => ({ es, cat, lines: lines === 99 ? 'no syllable break fits' : lines })) };
  };
  const first = check(configured);
  let used = configured;
  while (used > 2 && check(used).tooLong.length) used--;
  result[level] = { columns: configured, usedColumns: used, ...first };
}
writeFileSync(OUT, JSON.stringify({ checked: true, phoneWidth: PHONE_W, minPx: tk.wordMin, levels: result }, null, 1));
const total = Object.values(result).reduce((n, l) => n + l.tooLong.length, 0);
console.log(`check-card-words: ${total} word(s) too long for their level's cards on a ${PHONE_W}px phone (${tk.wordMin}px, wrapped at a syllable, ${MAX_WORD_LINES} lines; names ${MAX_NAME_LINES})`);
for (const [l, r] of Object.entries(result)) {
  for (const w of r.tooLong) console.log(`  ${l}: "${w.es}" (${w.cat}) at ${r.columns} columns: ${typeof w.lines === "number" ? `needs ${w.lines} lines` : w.lines}`);
  if (r.usedColumns !== r.columns) console.log(`  ${l}: the game uses ${r.usedColumns} columns instead of ${r.columns} on this phone`);
}
