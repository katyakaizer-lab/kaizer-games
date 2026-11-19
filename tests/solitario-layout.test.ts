// @vitest-environment node
// Smoke test, Solitario board (mockup v4 + word-fit and stacking fixes).
// At 360, 375, 390 and 430px wide, levels set to 3, 5, 6 and 7 columns (2 face-down cards each), normal and the
// largest text size, both themes, before and after some play and with a column of 3 stacked face-up cards:
// - no sideways scrolling; the board fits above the bottom bar;
// - card width = min(72px, available / columns), height = width x 1.36, one size for every card;
// - face-down cards show a 16px strip and are never tappable; a face-up card on another covers its lower part
//   (step card height x 0.6) and the covered word stays visible;
// - no word runs out of the inner panel, is clipped or has "…"; at most 2 lines, never under 11px;
// - top bar: back, title, translation; bottom bar: Pista, Deshacer, Reiniciar (60px, with labels);
// - filled slots: the label tab sits between the status row and the slot, not over anything.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { columnOffsets, fitSpanish } from '../src/games/solitario/sizing';

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
  cat('d5', 'Verduras', [['zanahoria', 'carrot'], ['cebolla', 'onion'], ['patata', 'potato'], ['naranja', 'orange'], ['cuchara', 'spoon']]),
  cat('d6', 'Deportes', [['tenis', 'tennis'], ['golf', 'golf'], ['esquí', 'skiing'], ['ciclismo', 'cycling']]),
  cat('d7', 'Cuerpo', [['cabeza', 'head'], ['pierna', 'leg'], ['brazo', 'arm'], ['mano', 'hand']]),
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
afterAll(async () => { await browser?.close(); await server?.close(); }, 90_000);

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
    const expected = Math.floor(Math.min(72 * rem, (vw - 16 * rem - 6 * rem * (cols.length - 1)) / cols.length));
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

    // Columns: face-down strips 16px apart and never tappable. A face-up card on another sits card height x 0.6
    // lower (or more if the covered word needs it, less only if the column would pass the bottom bar), and the
    // covered card's word is never under the next card.
    let stacked = 0;
    for (const col of cols) {
      const kids = [...col.children] as HTMLElement[];
      kids.forEach((k, i) => {
        const next = kids[i + 1];
        if (k.classList.contains('is-down')) {
          if (next && Math.abs(r(next).top - r(k).top - 16 * rem) > 0.5) problems.push(`face-down strip ${r(next).top - r(k).top}px, expected ${16 * rem}`);
          const at = document.elementFromPoint(r(k).left + r(k).width / 2, r(k).top + 8) as HTMLElement | null;
          if (at?.closest('[data-src]')) problems.push('a face-down card can be tapped');
        } else if (next) {
          stacked++;
          const step = r(next).top - r(k).top;
          const word = k.querySelector('.sol-card__word')!;
          if (r(word).bottom > r(next).top + 0.5) problems.push(`"${word.textContent}": word covered by the next card`);
          if (step >= k.offsetHeight - 0.5) problems.push(`face-up card not overlapped (step ${step})`);
          const roomy = boardBottom < barTop - 12;
          if (roomy && step < k.offsetHeight * 0.6 - 0.5) problems.push(`face-up step ${step} < 0.6 x card height with room to spare`);
        }
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
      // The inner panel's content box (inside its frame line).
      const pr = r(panel), pcs = getComputedStyle(panel);
      const inner = new DOMRect(pr.left + parseFloat(pcs.borderLeftWidth), pr.top + parseFloat(pcs.borderTopWidth), panel.clientWidth, panel.clientHeight);
      for (const p of parts) {
        if (!inside(r(p), inner)) problems.push(`"${label}": ${p.className} sticks out of the inner panel`);
        if (p.scrollWidth > p.clientWidth + 1) problems.push(`"${label}": ${p.className} clipped`);
        if (/…/.test(p.textContent ?? '')) problems.push(`"${label}": has …`);
      }
      // The word itself: its text never wider than its box (nothing hidden; cards have no overflow: hidden).
      const range = document.createRange();
      range.selectNodeContents(word);
      const tr0 = range.getBoundingClientRect();
      if (tr0.left < inner.left - 0.5 || tr0.right > inner.right + 0.5) problems.push(`"${label}": text runs out of the card (${Math.round(tr0.width)}px in ${Math.round(inner.width)}px)`);
      const wpx = parseFloat(getComputedStyle(word).fontSize);
      if (wpx < 11 - 0.05) problems.push(`"${label}": text ${wpx}px < 11px`);
      const lines = Math.round(r(word).height / (wpx * 1.15));
      if (lines > (card.classList.contains('is-cat') ? 3 : 2)) problems.push(`"${label}": ${lines} lines`); // category names may use 3
      if (lines > 1 && !word.textContent!.includes('­') && !word.textContent!.includes(' ')) problems.push(`"${label}": wraps without syllable marks`);
      if (lines === 1 && wpx < 13 - 0.05 && !word.textContent!.includes('­')) problems.push(`"${label}": one line under 13px`);
      const ws = getComputedStyle(word);
      if (ws.hyphens !== 'manual' || ws.whiteSpace !== 'normal') problems.push(`"${label}": hyphens ${ws.hyphens}, white-space ${ws.whiteSpace}`);
      if (ws.overflow !== 'visible') problems.push(`"${label}": overflow ${ws.overflow}`);
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
    return { problems, columns: cols.length, tabs: tabs.length, w, stacked };
  });
}

/**
 * Builds a column of `n` face-up cards (long words first, so the covered cards wrap), taking cards
 * from the deck and the drawn pile, through the test hook. The game rules do not matter here, only the layout.
 */
async function stackColumn(page: Page, n: number) {
  await page.evaluate((count) => {
    const g = (globalThis as unknown as { __solGame: { state: () => { cols: string[][]; stock: string[]; waste: string[]; cards: Record<string, { item: { es: string } }> }; redraw: () => void } }).__solGame;
    const s = g.state();
    const byLength = [...s.stock, ...s.waste].sort((a, b) => s.cards[b].item.es.length - s.cards[a].item.es.length);
    // The first column that has a card gets count - 1 more; an empty one gets count.
    let ci = s.cols.findIndex((c) => c.length);
    if (ci < 0) ci = 0;
    const take = byLength.slice(0, s.cols[ci].length ? count - 1 : count);
    s.stock = s.stock.filter((id) => !take.includes(id));
    s.waste = s.waste.filter((id) => !take.includes(id));
    s.cols[ci].push(...take);
    g.redraw();
  }, n);
  await page.waitForTimeout(50);
}

describe('Solitario board on phones', () => {
  for (const width of [360, 375, 390, 430]) {
    for (const columns of [3, 5, 6, 7]) {
      for (const theme of ['mesa', 'night'] as const) {
        it(`${width}px, ${columns} columns, ${theme}`, async () => {
          const { page, errors } = await open(width, level(columns), 'normal', theme);
          const a = await check(page);
          await playSome(page);
          const b = await check(page);
          await stackColumn(page, 3);
          const c = await check(page);
          await page.close();
          expect(a.problems).toEqual([]);
          expect(b.problems).toEqual([]);
          expect(c.problems).toEqual([]);
          expect(c.stacked).toBeGreaterThanOrEqual(2); // a column of 3 face-up cards: 2 covered
          expect(errors).toEqual([]);
          expect(a.columns).toBeLessThanOrEqual(columns);
          if (columns <= 5) expect(a.columns).toBe(columns);
          if (width >= 390) expect(a.columns).toBe(width < 400 ? Math.min(columns, 6) : columns);
          expect(a.w).toBeLessThanOrEqual(72); // normal text size
        }, 60_000);
      }
    }
  }
  it('a tall column of face-up cards closes up above the bottom bar, words still visible (360x640)', async () => {
    const { page, errors } = await open(360, level(5), 'normal', 'mesa', 640);
    await stackColumn(page, 7);
    const a = await check(page);
    await page.close();
    expect(a.problems).toEqual([]);
    expect(a.stacked).toBeGreaterThanOrEqual(6);
    expect(errors).toEqual([]);
  }, 60_000);
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
        await stackColumn(page, 3);
        const c = await check(page);
        await page.close();
        expect(a.problems).toEqual([]);
        expect(b.problems).toEqual([]);
        expect(c.problems).toEqual([]);
        expect(errors).toEqual([]);
        expect(a.columns).toBeLessThan(nCols);
      }, 60_000);
    }
  }
  it("a short phone (360x640) with 4 face-down cards per column fits above the bottom bar", async () => {
    const { page, errors } = await open(360, { ...level(5), levels: { A1: { columns: 5, down: 4 } } }, 'normal', 'mesa', 640);
    const a = await check(page);
    await page.close();
    expect(a.problems).toEqual([]);
    expect(errors).toEqual([]);
  }, 60_000);
});

describe('column offsets and word fit', () => {
  const tk = { downPeek: 16, upStep: 0.6 };
  it('face-down strips are 16px; a face-up card on another sits card height x 0.6 lower', () => {
    expect(columnOffsets(2, [20, 20, 20], 88, tk, 1000)).toEqual([0, 16, 32, 32 + 52.8, 32 + 105.6]);
  });
  it('a covered word that needs more room gets a bigger step for that card only', () => {
    expect(columnOffsets(0, [20, 60, 20], 88, tk, 1000)).toEqual([0, 52.8, 112.8]);
  });
  it('a tall column closes up to fit, never below what keeps each covered word visible', () => {
    const offs = columnOffsets(3, [30, 30, 30, 30, 30, 30], 88, tk, 300);
    expect(offs.slice(0, 3)).toEqual([0, 16, 32]);
    for (let i = 3; i < offs.length - 1; i++) expect(offs[i + 1] - offs[i]).toBeGreaterThanOrEqual(30);
    expect(offs[offs.length - 1] + 88).toBeLessThanOrEqual(300 + 0.5);
    const tight = columnOffsets(0, [40, 40, 40, 40], 88, tk, 100); // no room: words still win
    for (let i = 0; i < 3; i++) expect(tight[i + 1] - tight[i]).toBeGreaterThanOrEqual(40);
  });
  // Character widths roughly like the card font: 0.6 x size per letter.
  const m = (t: string, px: number) => t.length * px * 0.6;
  const ftk = { wordMax: 16, wordMin: 13, wordFloor: 11 };
  it('fit order: one line from 16 to 13px; else wrapped at a syllable from 16px, 2 lines; floor 11px', () => {
    expect(fitSpanish('pera', 40, ftk, m)).toMatchObject({ px: 16, lines: 1, wrap: false });
    const n = fitSpanish("naranja", 56, ftk, m); // 7 x 13 x 0.6 = 54.6: one line, between 13 and 14px
    expect(n).toMatchObject({ lines: 1, wrap: false });
    expect(n.px).toBeGreaterThanOrEqual(13);
    expect(n.px).toBeLessThan(14);
    const z = fitSpanish('zanahoria', 50, ftk, m); // too wide at 13px on one line
    expect(z.wrap).toBe(true);
    expect(z.lines).toBe(2);
    expect(z.px).toBeGreaterThanOrEqual(11);
    expect(fitSpanish('electrodoméstico', 20, ftk, m).misfit).toBe(true);
  });
});
