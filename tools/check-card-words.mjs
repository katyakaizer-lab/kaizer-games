// Content check for Solitario: which words do not fit a card of their level at the minimum size
// (13px Spanish word, one line) on a 375px phone with the level's column count.
// Measures with the real card font in Chrome/Edge (playwright-core); writes dist/card-words.json for the
// build report. A word listed here is a content problem: shorten it, or lower the level's columns.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, read, parseTokens } from './lib.mjs';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const OUT = join(ROOT, 'dist/card-words.json');
const PHONE_W = 375;

const dir = join(ROOT, 'src/data/solitario');
const parsed = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const categories = parsed.flatMap((p) => p.categories ?? []);
const levels = Object.assign({}, ...parsed.map((p) => p.levels ?? {}));
const base = parseTokens(read('public/tokens.css')).base;
const rem = (name, fb) => (base[name] ? parseFloat(base[name]) * 16 : fb);
const tk = { pad: rem('--card-pad', 3), gap: rem('--card-gap', 5), boardPad: rem('--board-pad', 8), wordMin: rem('--card-word-min', 13) };

const exe = CANDIDATES.find((p) => existsSync(p));
mkdirSync(join(ROOT, 'dist'), { recursive: true });
if (!exe) {
  writeFileSync(OUT, JSON.stringify({ checked: false, reason: 'no Chrome or Edge found (set CHROME_PATH)' }, null, 1));
  console.log('check-card-words: skipped (no browser)');
  process.exit(0);
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const fontUrl = pathToFileURL(join(ROOT, 'public/fonts/nunito-latin-700-normal.woff2')).href;
const fontExt = pathToFileURL(join(ROOT, 'public/fonts/nunito-latin-ext-700-normal.woff2')).href;
await page.goto(pathToFileURL(join(ROOT, 'tools/blank.html')).href).catch(() => page.setContent('<!doctype html><title>m</title>'));
const result = await page.evaluate(async ({ fontUrl, fontExt, categories, levels, tk, PHONE_W }) => {
  const f1 = new FontFace('CardFont', `url(${fontUrl})`, { weight: '700' });
  const f2 = new FontFace('CardFont', `url(${fontExt})`, { weight: '700', unicodeRange: 'U+0100-024F' });
  await Promise.all([f1.load(), f2.load()]).then((fs) => fs.forEach((f) => document.fonts.add(f)));
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `700 ${tk.wordMin}px CardFont`;
  const out = {};
  for (const [level, cfg] of Object.entries(levels)) {
    if (level.startsWith('_')) continue;
    const cols = Math.min(6, cfg.columns);
    const cardW = Math.floor((PHONE_W - 2 * tk.boardPad - tk.gap * (cols - 1)) / cols);
    const inner = cardW - 2 * tk.pad - 2 - 1;
    const words = categories.filter((c) => c.level === level).flatMap((c) => c.items.map((i) => ({ es: i.es, cat: c.id })));
    out[level] = { columns: cols, cardW, inner: Math.floor(inner), tooLong: words.map((w) => ({ ...w, width: Math.ceil(ctx.measureText(w.es).width) })).filter((w) => w.width > inner) };
  }
  return out;
}, { fontUrl, fontExt, categories, levels, tk, PHONE_W });
await browser.close();
writeFileSync(OUT, JSON.stringify({ checked: true, phoneWidth: PHONE_W, minPx: tk.wordMin, levels: result }, null, 1));
const total = Object.values(result).reduce((n, l) => n + l.tooLong.length, 0);
console.log(`check-card-words: ${total} word(s) too long for their level's cards at ${tk.wordMin}px on a ${PHONE_W}px phone`);
for (const [l, r] of Object.entries(result)) for (const w of r.tooLong) console.log(`  ${l}: "${w.es}" (${w.cat}) needs ${w.width}px, card has ${r.inner}px`);
