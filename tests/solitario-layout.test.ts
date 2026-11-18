// @vitest-environment node
// Smoke test, Solitario dense board.
// 1. One screen: at 360, 375, 390 and 430px wide and 700px high, a level with 6 columns x 6 cards,
//    6 category slots and the draw pile fits without page scrolling (both themes).
// 2. Text: with the longest real words plus electrodoméstico, refrigerator and "Medios de transporte",
//    no text overlaps or is clipped, the Spanish word is one line and >= 13px, translations >= 12px and
//    <= 2 lines, covered cards keep their word visible, one card size per game, no sideways scrolling;
//    also at the largest text size, where the column count must drop.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];

const item = (es: string, en: string) => ({ es, en, ru: en });
const cat = (id: string, name: string, items: [string, string][]) => ({ id, level: 'A1', name_es: name, en: name, ru: name, items: items.map(([a, b]) => item(a, b)), reviewed: false });

/** A full A1-style level: 6 columns x 6 cards, 6 categories of short real words. */
const DENSE = {
  levels: { A1: { columns: 6, rows: 6 } },
  categories: [
    cat('d1', 'Flores', [['rosa', 'rose'], ['lirio', 'lily'], ['clavel', 'carnation'], ['dalia', 'dahlia'], ['girasol', 'sunflower'], ['tulipán', 'tulip']]),
    cat('d2', 'Cocina', [['olla', 'pot'], ['sartén', 'frying pan'], ['horno', 'oven'], ['nevera', 'fridge'], ['plato', 'plate'], ['taza', 'cup']]),
    cat('d3', 'Granja', [['vaca', 'cow'], ['cerdo', 'pig'], ['oveja', 'sheep'], ['pato', 'duck'], ['gallina', 'hen'], ['burro', 'donkey']]),
    cat('d4', 'Ropa', [['falda', 'skirt'], ['abrigo', 'coat'], ['gorra', 'cap'], ['botas', 'boots'], ['camisa', 'shirt'], ['vestido', 'dress']]),
    cat('d5', 'Frutas', [['pera', 'pear'], ['uva', 'grape'], ['fresa', 'strawberry'], ['melón', 'melon'], ['kiwi', 'kiwi'], ['limón', 'lemon']]),
    cat('d6', 'Cuerpo', [['mano', 'hand'], ['pie', 'foot'], ['brazo', 'arm'], ['boca', 'mouth'], ['pierna', 'leg'], ['cabeza', 'head']]),
    cat('d7', 'Familia', [['madre', 'mother'], ['padre', 'father'], ['hijo', 'son'], ['tío', 'uncle'], ['prima', 'cousin'], ['abuela', 'grandmother']]),
  ],
};
/** Longest real words plus extreme cases. */
const EXTREME = {
  levels: { A1: { columns: 6, rows: 5 } },
  categories: [
    cat('t1', 'Medios de transporte', [['electrodoméstico', 'refrigerator'], ['llave inglesa', 'spanner'], ['saltamontes', 'grasshopper'], ['retrovisor', 'rear-view mirror'], ['carnicería', "butcher's"]]),
    cat('t2', 'Desastres naturales', [['floristería', "florist's"], ['abuela', 'grandmother'], ['zanahoria', 'carrot'], ['profesora', 'teacher'], ['estantería', 'chest of drawers']]),
    cat('t3', 'Animales salvajes', [['panadería', 'bakery'], ['trompeta', 'trumpet'], ['tormenta', 'storm'], ['azafata', 'flight attendant'], ['termómetro', 'thermometer']]),
    cat('t4', 'Partes del coche', [['parabrisas', 'windscreen'], ['sombrilla', 'beach umbrella'], ['policía', 'police officer'], ['frutería', "greengrocer's"], ['ambulancia', 'ambulance']]),
    cat('t5', 'Herramientas', [['golondrina', 'swallow'], ['inundación', 'flood'], ['escritorio', 'desk'], ['bicicleta', 'bicycle'], ['mariquita', 'ladybird']]),
    cat('t6', 'En el hospital', [['girasol', 'sunflower'], ['moto', 'motorbike'], ['prima', 'cousin (female)'], ['libro', 'exercise book'], ['despertador', 'alarm clock']]),
  ],
};

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

async function open(width: number, data: unknown, size: string, theme: 'mesa' | 'night', tr = true): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height: 700 }, deviceScaleFactor: 1 });
  await page.addInitScript(([d, sz, trv]) => {
    (globalThis as unknown as { __solTestData: unknown }).__solTestData = d;
    localStorage.setItem('kz.pet', '{"species":"fox","name":"Z"}');
    localStorage.setItem('kz.settings', JSON.stringify({ lang: 'en', sound: false, soundOffered: true, reduceMotion: true, textSize: sz }));
    localStorage.setItem('kz.sol.showTr', String(trv));
  }, [data, size, tr] as const);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + 'index.html#game/solitario/play/A1/seed-2');
  await page.waitForSelector('.sol-col .sol-card');
  await page.waitForTimeout(150);
  if (theme === 'night') await page.evaluate(() => { document.documentElement.dataset.theme = 'night'; });
  return { page, errors };
}

/** Text overlap, clipping, sizes, covered words, one card size, no sideways scroll. */
function checkText(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const r = (e: Element) => e.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) problems.push(`sideways scroll: ${document.documentElement.scrollWidth} > ${vw}`);
    const cards = [...document.querySelectorAll<HTMLElement>('.sol-card')].filter((c) => !c.classList.contains('sol-waste__under'));
    const hs = new Set(cards.map((c) => c.offsetHeight)), ws = new Set(cards.map((c) => c.offsetWidth));
    if (hs.size > 1) problems.push(`card heights differ: ${[...hs]}`);
    if (ws.size > 1) problems.push(`card widths differ: ${[...ws]}`);
    for (const card of cards) {
      const cs = getComputedStyle(card);
      const cr = r(card);
      const box = new DOMRect(cr.left + parseFloat(cs.borderLeftWidth), cr.top + parseFloat(cs.borderTopWidth), cr.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth), cr.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth));
      const word = card.querySelector<HTMLElement>('.sol-card__word');
      if (!word) continue;
      const tr = card.querySelector<HTMLElement>('.sol-card__tr');
      const tag = card.querySelector<HTMLElement>('.sol-card__tag');
      const label = word.textContent;
      const parts = [word, tr, tag].filter((x): x is HTMLElement => !!x);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (overlap(r(parts[i]), r(parts[j]))) problems.push(`"${label}": ${parts[i].className} overlaps ${parts[j].className}`);
      for (const p of parts) {
        if (!inside(r(p), box)) problems.push(`"${label}": ${p.className} sticks out of the card`);
        if (p.scrollWidth > p.clientWidth + 1) problems.push(`"${label}": ${p.className} clipped`);
        if (/…$/.test(p.textContent ?? '')) problems.push(`"${label}": ends in …`);
      }
      const next = card.nextElementSibling as HTMLElement | null;
      if (next?.classList.contains('sol-card') && r(word).bottom > r(next).top + 0.5) problems.push(`"${label}": word hidden under the next card`);
      const wpx = parseFloat(getComputedStyle(word).fontSize);
      const minPx = card.classList.contains('is-cat') ? 10 : 13; // category names have their own minimum token (--card-name-min)
      if (wpx < minPx - 0.05) problems.push(`"${label}": text ${wpx}px < ${minPx}px`);
      if (!card.classList.contains('is-cat') && r(word).height > wpx * 1.6) problems.push(`"${label}": Spanish word wraps`);
      if (tr) {
        const tpx = parseFloat(getComputedStyle(tr).fontSize);
        if (tpx < 12 - 0.05) problems.push(`"${label}": translation ${tpx}px < 12px`);
        if (Math.round(r(tr).height / (tpx * 1.2)) > 2) problems.push(`"${label}": translation over 2 lines`);
      }
    }
    return problems;
  });
}

describe('Solitario dense board: one screen', () => {
  for (const width of [360, 375, 390, 430]) {
    for (const theme of ['mesa', 'night'] as const) {
      it(`${width}x700, 6 columns x 6 cards, ${theme}`, async () => {
        const { page, errors } = await open(width, DENSE, 'normal', theme);
        const r = await page.evaluate(() => ({
          cols: document.querySelectorAll('.sol-col').length,
          rows: Math.max(...[...document.querySelectorAll('.sol-col')].map((c) => c.querySelectorAll('.sol-card').length)),
          slots: document.querySelectorAll('.sol-slots > *').length,
          slotRows: new Set([...document.querySelectorAll('.sol-slots > *')].map((e) => Math.round(e.getBoundingClientRect().top))).size,
          pile: !!document.querySelector('[data-stock]'),
          sh: document.documentElement.scrollHeight, vh: innerHeight,
          bottom: Math.max(...[...document.querySelectorAll('.sol-col .sol-card')].map((c) => c.getBoundingClientRect().bottom)),
          barH: document.querySelector('.sol-bar')!.getBoundingClientRect().height,
          cardW: document.querySelector('.sol-col .sol-card')!.getBoundingClientRect().width,
        }));
        const problems = await checkText(page);
        await page.close();
        expect(r.cols).toBe(6);
        expect(r.rows).toBe(6);
        expect(r.slots).toBe(6);
        expect(r.slotRows).toBe(1);
        expect(r.pile).toBe(true);
        expect(r.barH).toBeLessThanOrEqual(48);
        expect(r.sh, 'page scrolls').toBeLessThanOrEqual(r.vh);
        expect(r.bottom).toBeLessThanOrEqual(r.vh);
        expect(problems).toEqual([]);
        expect(errors).toEqual([]);
      }, 60_000);
    }
  }
});

describe('Solitario dense board: longest words, no clipping', () => {
  for (const width of [360, 375, 390, 430]) {
    for (const theme of ['mesa', 'night'] as const) {
      for (const size of ['normal', 'xlarge'] as const) {
        it(`${width}px, ${size} text, ${theme}`, async () => {
          const { page, errors } = await open(width, EXTREME, size, theme);
          const cols = await page.evaluate(() => document.querySelectorAll('.sol-col').length);
          const problems = await checkText(page);
          await page.close();
          expect(problems).toEqual([]);
          expect(errors).toEqual([]);
          expect(cols).toBeLessThan(6); // these words never fit 6 columns on a phone
        }, 60_000);
      }
    }
  }
  it('the largest text size drops the column count', async () => {
    const a = await open(390, DENSE, 'normal', 'mesa');
    const normal = await a.page.evaluate(() => document.querySelectorAll('.sol-col').length);
    await a.page.close();
    const b = await open(390, DENSE, 'large', 'mesa');
    const large = await b.page.evaluate(() => document.querySelectorAll('.sol-col').length);
    expect(await checkText(b.page)).toEqual([]);
    await b.page.close();
    const c = await open(390, DENSE, 'xlarge', 'mesa');
    const xlarge = await c.page.evaluate(() => document.querySelectorAll('.sol-col').length);
    expect(await checkText(c.page)).toEqual([]);
    await c.page.close();
    expect(normal).toBe(6);
    expect(large).toBeLessThan(normal);
    expect(xlarge).toBeLessThan(large);
  }, 60_000);
});
