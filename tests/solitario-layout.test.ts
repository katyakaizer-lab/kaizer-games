// @vitest-environment node
// Smoke test, Solitario board (card-layout mockup v4).
// At 360, 375, 390 and 430px wide, levels set to 3, 5 and 7 columns (2 face-down cards each), normal and the
// largest text size, both themes:
// - no sideways scrolling; the board fits above the bottom bar;
// - card width = min(72px, available / columns), height = width x 1.36, one size for every card;
// - face-down cards show a 16px strip and are never tappable; face-up cards are fully visible;
// - no text overlaps, is clipped or ends in "…"; words >= 13px and at most 2 lines (category names 3);
// - top bar: back, title, translation; bottom bar: Pista, Deshacer, Reiniciar (60px, with labels);
// - filled slots: the label tab sits between the status row and the slot, not over anything.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { columnOffsets, type CardTokens } from '../src/games/solitario/sizing';
import { softHyphenate, syllabify } from '../src/games/solitario/syllables';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];

const item = (es: string, en: string) => ({ es, en, ru: en });
const cat = (id: string, name: string, items: [string, string][]) => ({ id, level: 'A1', name_es: name, en: name, ru: name, items: items.map(([a, b]) => item(a, b)), reviewed: false });
/** Seven categories with real words, long ones included (carnicería, floristería, zanahoria, "Animales salvajes"). */
const CATS = [
  cat('d1', 'Flores', [['rosa', 'rose'], ['lirio', 'lily'], ['clavel', 'carnation'], ['dalia', 'dahlia'], ['girasol', 'sunflower']]),
  cat('d2', 'Baño', [['toalla', 'towel'], ['ducha', 'shower'], ['jabón', 'soap'], ['espejo', 'mirror']]),
  cat('d3', 'Animales salvajes', [['tigre', 'tiger'], ['jirafa', 'giraffe'], ['león', 'lion'], ['cebra', 'zebra'], ['oso', 'bear']]),
  cat('d4', 'Tiendas', [['carnicería', "butcher's"], ['floristería', "florist's"], ['panadería', 'bakery'], ['frutería', "greengrocer's"]]),
  cat('d5', 'Verduras', [['zanahoria', 'carrot'], ['cebolla', 'onion'], ['patata', 'potato'], ['lechuga', 'lettuce']]),
  cat('d6', 'Deportes', [['tenis', 'tennis'], ['golf', 'golf'], ['esquí', 'skiing'], ['ciclismo', 'cycling']]),
  cat('d7', 'Ropa', [['falda', 'skirt'], ['abrigo', 'coat'], ['gorra', 'cap'], ['botas', 'boots']]),
];
const level = (columns: number) => ({ levels: { A1: { columns, down: 2 } }, categories: CATS });

let server: { close(): Promise<void>; httpServer: import('node:http').Server | null };
let browser: Browser;
let base = '';
beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  if (process.env.SMOKE_DIST === '1') {
    const p = await preview({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, logLevel: 'error', preview: { port: 0, host: '127.0.0.1' } });
    server = { close: () => p.close(), httpServer: p.httpServer as import('node:http').Server };
  } else {
    const d = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
    await d.listen();
    server = { close: () => d.close(), httpServer: d.httpServer as import('node:http').Server };
  }
  const addr = server.httpServer!.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 5173}/`;
  browser = await chromium.launch({ executablePath: exe, headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

async function open(width: number, data: unknown, size: string, theme: 'mesa' | 'night', height = 740): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(([d, sz]) => {
    (globalThis as unknown as { __solTestData: unknown }).__solTestData = d;
    localStorage.setItem('kz.pet', '{"species":"fox","name":"Z"}');
    localStorage.setItem('kz.settings', JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: sz }));
    localStorage.setItem('kz.sol.showTr', 'true');
  }, [data, size] as const);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + 'index.html#game/solitario/play/A1/seed-2');
  await page.waitForSelector('.sol-col .sol-card');
  await page.waitForTimeout(150);
  if (theme === 'night') await page.evaluate(() => { document.documentElement.dataset.theme = 'night'; });
  return { page, errors };
}

/** Opens categories and places words with double-taps, so slots get label tabs. */
async function playSome(page: Page) {
  for (let round = 0; round < 6; round++) {
    await page.evaluate(() => {
      const card = [...document.querySelectorAll<HTMLElement>('.sol-col [data-src], .sol-waste__top[data-src]')];
      for (const c of card) c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      document.querySelector<HTMLElement>('[data-stock]')?.click();
    });
    await page.waitForTimeout(30);
  }
}

/** Everything the mockup asks for, measured in the page. */
function check(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const r = (e: Element) => e.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) problems.push(`sideways scroll: ${document.documentElement.scrollWidth} > ${vw}`);

    // One card size; width <= 72px and = available / columns; height = width x 1.36.
    const cards = [...document.querySelectorAll<HTMLElement>('.sol-card')].filter((c) => !c.closest('.sol-burst'));
    const hs = new Set(cards.map((c) => c.offsetHeight)), ws = new Set(cards.map((c) => c.offsetWidth));
    if (hs.size > 1) problems.push(`card heights differ: ${[...hs]}`);
    if (ws.size > 1) problems.push(`card widths differ: ${[...ws]}`);
    const cols = [...document.querySelectorAll<HTMLElement>('.sol-col')];
    const w = cards[0].offsetWidth, hgt = cards[0].offsetHeight;
    // Tokens are rem-based, so at a larger text size 72px, 12px and 10px grow with the root font size.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const expected = Math.floor(Math.min(72 * rem, (vw - 24 * rem - 10 * rem * (cols.length - 1)) / cols.length));
    if (w !== expected) problems.push(`card width ${w}, expected ${expected}`);
    if (Math.abs(hgt - Math.round(w * 1.36)) > 0.5) problems.push(`card height ${hgt} is not width x 1.36`);

    // Bars.
    const bar = document.querySelector('.sol-bar')!;
    if (bar.children.length !== 3) problems.push(`top bar has ${bar.children.length} items`);
    if (!/^A1 · Nivel 1$/.test(bar.querySelector('h1')?.textContent ?? '')) problems.push(`title "${bar.querySelector('h1')?.textContent}"`);
    const btns = [...document.querySelectorAll<HTMLElement>('.sol-bottom__btn')];
    if (btns.map((b) => b.textContent!.trim()).join('|') !== 'Pista|Deshacer|Reiniciar') problems.push(`bottom bar: ${btns.map((b) => b.textContent).join('|')}`);
    for (const b of btns) {
      if (b.offsetHeight < 59.5 || b.offsetWidth < 59.5) problems.push(`bottom button ${b.textContent} ${b.offsetWidth}x${b.offsetHeight}`);
      const label = b.querySelector('span')!;
      if (!inside(r(label), r(b))) problems.push(`bottom label "${b.textContent}" sticks out`);
      if (r(b).right > vw || r(b).left < 0) problems.push(`bottom button ${b.textContent} off screen`);
    }
    const barTop = Math.min(...btns.map((b) => r(b).top));
    const boardBottom = Math.max(...[...document.querySelectorAll('.sol-col > *')].map((c) => r(c).bottom));
    if (boardBottom > barTop + 0.5) problems.push(`board bottom ${boardBottom} passes the bottom bar at ${barTop}`);
    if (document.documentElement.scrollHeight > innerHeight + 0.5) problems.push(`page scrolls: ${document.documentElement.scrollHeight} > ${innerHeight}`);

    // Columns: face-down strips 16px apart and never tappable; face-up cards fully visible.
    for (const col of cols) {
      const kids = [...col.children] as HTMLElement[];
      kids.forEach((k, i) => {
        const next = kids[i + 1];
        if (k.classList.contains('is-down')) {
          if (next && Math.abs(r(next).top - r(k).top - 16 * rem) > 0.5) problems.push(`face-down strip ${r(next).top - r(k).top}px, expected ${16 * rem}`);
          const at = document.elementFromPoint(r(k).left + r(k).width / 2, r(k).top + 8) as HTMLElement | null;
          if (at?.closest('[data-src]')) problems.push('a face-down card can be tapped');
        } else if (next && r(next).top < r(k).bottom - 0.5 && !k.classList.contains('is-squeezed')) problems.push('a face-up card is covered');
      });
    }

    // Text inside face-up cards.
    for (const card of cards) {
      const word = card.querySelector<HTMLElement>('.sol-card__word');
      if (!word) continue;
      const panel = card.querySelector('.sol-card__panel')!;
      const tr = card.querySelector<HTMLElement>('.sol-card__tr');
      const tag = card.querySelector<HTMLElement>('.sol-card__tag');
      const label = word.textContent;
      const parts = [word, tr, tag].filter((x): x is HTMLElement => !!x);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (overlap(r(parts[i]), r(parts[j]))) problems.push(`"${label}": ${parts[i].className} overlaps ${parts[j].className}`);
      for (const p of parts) {
        if (!inside(r(p), r(panel))) problems.push(`"${label}": ${p.className} sticks out of the card`);
        if (p.scrollWidth > p.clientWidth + 1) problems.push(`"${label}": ${p.className} clipped`);
        if (/…/.test(p.textContent ?? '')) problems.push(`"${label}": has …`);
      }
      const wpx = parseFloat(getComputedStyle(word).fontSize);
      if (wpx < 13 - 0.05) problems.push(`"${label}": text ${wpx}px < 13px`);
      const lines = Math.round(r(word).height / (wpx * 1.15));
      const isName = card.classList.contains('is-cat');
      if (lines > (isName ? 3 : 2)) problems.push(`"${label}": ${lines} lines`);
      if (getComputedStyle(word).hyphens === 'none') problems.push(`"${label}": hyphens off`);
      if (word.lang !== 'es') problems.push(`"${label}": no lang=es`);
      if (tr && Math.round(r(tr).height / (parseFloat(getComputedStyle(tr).fontSize) * 1.15)) > 3) problems.push(`"${label}": translation over 2 lines`);
    }

    // Drawn pile: the cards underneath stay inside the screen and show their word.
    for (const u of document.querySelectorAll<HTMLElement>('.sol-waste__under')) {
      if (r(u).right > vw + 0.5) problems.push('drawn pile off screen');
      const edge = u.querySelector<HTMLElement>('.sol-waste__edge')!;
      if (getComputedStyle(edge).writingMode !== 'vertical-rl') problems.push('under-card word is not vertical');
    }
    const head = document.querySelector('.sol-head')!;
    if (r(head).right > vw) problems.push('status row off screen');
    for (const e of head.children) if (r(e).right > r(head).right + 0.5) problems.push(`status row item ${e.className} sticks out`);

    // Slot tabs: between the status row and the slot, within the screen, not over each other.
    const tabs = [...document.querySelectorAll<HTMLElement>('.sol-slotcat__tab')];
    tabs.forEach((t, i) => {
      if (r(t).top < r(head).bottom - 0.5) problems.push(`tab "${t.textContent}" over the status row`);
      if (r(t).right > vw) problems.push(`tab "${t.textContent}" off screen`);
      if (t.scrollWidth > t.clientWidth + 1) problems.push(`tab "${t.textContent}" clipped`);
      for (const o of tabs.slice(i + 1)) if (overlap(r(t), r(o))) problems.push(`tabs overlap: ${t.textContent} / ${o.textContent}`);
    });
    return { problems, columns: cols.length, tabs: tabs.length, w };
  });
}

describe('Solitario board (mockup v4) on phones', () => {
  for (const width of [360, 375, 390, 430]) {
    for (const columns of [3, 5, 7]) {
      for (const theme of ['mesa', 'night'] as const) {
        it(`${width}px, ${columns} columns, ${theme}`, async () => {
          const { page, errors } = await open(width, level(columns), 'normal', theme);
          const a = await check(page);
          await playSome(page);
          const b = await check(page);
          await page.close();
          expect(a.problems).toEqual([]);
          expect(b.problems).toEqual([]);
          expect(errors).toEqual([]);
          expect(a.columns).toBeLessThanOrEqual(columns);
          if (columns === 3) expect(a.columns).toBe(3);
          if (columns === 5 && width >= 375) expect(a.columns).toBe(5);
          expect(a.w).toBeLessThanOrEqual(72); // normal text size
        }, 60_000);
      }
    }
  }
  for (const width of [360, 430]) {
    for (const theme of ['mesa', 'night'] as const) {
      it(`${width}px, largest text, ${theme}`, async () => {
        const normal = await open(width, level(5), 'normal', theme);
        const nCols = (await check(normal.page)).columns;
        await normal.page.close();
        const { page, errors } = await open(width, level(5), 'xlarge', theme);
        const a = await check(page);
        await playSome(page);
        const b = await check(page);
        await page.close();
        expect(a.problems).toEqual([]);
        expect(b.problems).toEqual([]);
        expect(errors).toEqual([]);
        expect(a.columns).toBeLessThan(nCols);
      }, 60_000);
    }
  }
  it('a short phone (360x640) still fits the board above the bottom bar', async () => {
    const { page, errors } = await open(360, { ...level(5), levels: { A1: { columns: 5, down: 4 } } }, 'normal', 'mesa', 640);
    const a = await check(page);
    await page.close();
    expect(a.problems).toEqual([]);
    expect(errors).toEqual([]);
  }, 60_000);
});

describe('column offsets and syllables', () => {
  const tk = { downPeek: 16, stackGap: 6 } as CardTokens;
  it('face-down strips are 16px; face-up cards full height + 6px when there is room', () => {
    expect(columnOffsets(2, [20, 20, 20], 88, tk, 1000)).toEqual([0, 16, 32, 32 + 94, 32 + 188]);
  });
  it('a tall column squeezes only face-up cards, each keeping its word, and fits the room', () => {
    const offs = columnOffsets(3, [30, 30, 30, 30, 30, 30], 88, tk, 300);
    expect(offs.slice(0, 3)).toEqual([0, 16, 32]);
    for (let i = 3; i < offs.length - 1; i++) expect(offs[i + 1] - offs[i]).toBeGreaterThanOrEqual(30);
    expect(offs[offs.length - 1] + 88).toBeLessThanOrEqual(300 + 0.5);
  });
  it('Spanish words wrap at syllables', () => {
    expect(syllabify('zanahoria')).toEqual(['za', 'na', 'ho', 'ria']);
    expect(softHyphenate('carnicería').split('\u00AD')).toEqual(['car', 'ni', 'ce', 'ría']);
    expect(softHyphenate('toalla').split('\u00AD')).toEqual(['toa', 'lla']);
    expect(softHyphenate('abuela').split('\u00AD')).toEqual(['abue', 'la']);
  });
});
