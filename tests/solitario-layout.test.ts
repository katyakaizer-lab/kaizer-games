// @vitest-environment node
// Smoke test, Solitario card layout: at 360, 375, 390 and 768px, at normal and largest text size, in the
// card-table theme and the night theme, with the longest real words plus extreme cases:
// - no text box overlaps another text box or the icon; no text is clipped; nothing ends in "…";
// - Spanish words stay on one line at >= 16px (scaled with the text setting); translations >= 14px, <= 2 lines;
// - a covered card's whole word is visible in its strip;
// - all cards in a game share one width and one height; the page never scrolls sideways;
// - slot headers: the category name and the count never touch, and the name is never cut.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];

const item = (es: string, en: string) => ({ es, en, ru: en });
const cat = (id: string, name: string, items: [string, string][]) => ({ id, level: 'A1', name_es: name, en: name, ru: name, items: items.map(([a, b]) => item(a, b)), reviewed: false });
/** Longest words in the real data plus extreme cases. */
const TEST_CATEGORIES = [
  cat('t1', 'Medios de transporte', [['electrodoméstico', 'refrigerator'], ['fotocopiadora', 'photocopier'], ['destornillador', 'screwdriver'], ['llave inglesa', 'spanner'], ['retrovisor', 'rear-view mirror']]),
  cat('t2', 'Desastres naturales', [['saltamontes', 'grasshopper'], ['abuela', 'grandmother'], ['pantalones', 'trousers'], ['calcetines', 'socks'], ['estantería', 'chest of drawers']]),
  cat('t3', 'Animales salvajes', [['floristería', "florist's"], ['baloncesto', 'basketball'], ['margarita', 'daisy'], ['carnicería', "butcher's"], ['azafata', 'flight attendant']]),
  cat('t4', 'Partes del coche', [['parabrisas', 'windscreen'], ['sombrilla', 'beach umbrella'], ['policía', 'police officer'], ['frutería', "greengrocer's"], ['ambulancia', 'ambulance']]),
  cat('t5', 'Herramientas', [['golondrina', 'swallow'], ['inundación', 'flood'], ['termómetro', 'thermometer'], ['bicicleta', 'bicycle'], ['mariquita', 'ladybird']]),
  cat('t6', 'En el hospital', [['girasol', 'sunflower'], ['moto', 'motorbike'], ['prima', 'cousin (female)'], ['cuaderno', 'exercise book'], ['despertador', 'alarm clock']]),
];

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

/** Opens two category slots by playing category cards from the table or the deck. */
async function openTwoSlots(page: Page) {
  for (let guard = 0; guard < 80; guard++) {
    if ((await page.locator('.sol-slotcat').count()) >= 2) return;
    const src = await page.evaluate(() => {
      const tops = [document.querySelector('.sol-waste [data-src]'), ...[...document.querySelectorAll('.sol-col')].map((c) => [...c.querySelectorAll('[data-src]')].pop())].filter(Boolean) as HTMLElement[];
      const c = tops.find((x) => x.dataset.id!.endsWith(':cat'));
      return c ? c.dataset.src! : null;
    });
    if (!src) { await page.click('[data-stock]'); continue; }
    const box = (await page.locator(`[data-src='${src}']`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 5);
    const slot = (await page.locator('.sol-slot.is-open').first().boundingBox())!;
    await page.mouse.click(slot.x + slot.width / 2, slot.y + slot.height / 2);
  }
}

/** All layout checks, run in the page. Returns a list of problems (empty = fine). */
function checkLayout(page: Page, scale: number) {
  return page.evaluate((scale) => {
    const problems: string[] = [];
    const r = (e: Element) => e.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
    const cards = [...document.querySelectorAll<HTMLElement>('.sol-card')].filter((c) => !c.classList.contains('sol-waste__under'));
    const hs = new Set(cards.map((c) => Math.round(c.offsetHeight)));
    const ws = new Set(cards.map((c) => Math.round(c.offsetWidth)));
    if (hs.size > 1) problems.push(`card heights differ: ${[...hs].join(', ')}`);
    if (ws.size > 1) problems.push(`card widths differ: ${[...ws].join(', ')}`);
    for (const card of cards) {
      const cr = r(card);
      const cs = getComputedStyle(card);
      const innerBox = new DOMRect(cr.left + parseFloat(cs.borderLeftWidth), cr.top + parseFloat(cs.borderTopWidth), cr.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth), cr.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth));
      const word = card.querySelector<HTMLElement>('.sol-card__word');
      const tr = card.querySelector<HTMLElement>('.sol-card__tr');
      const tag = card.querySelector<HTMLElement>('.sol-card__tag');
      if (!word) continue;
      const label = word.textContent;
      const parts = [word, tr, tag].filter((x): x is HTMLElement => !!x && getComputedStyle(x).visibility !== 'hidden');
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (overlap(r(parts[i]), r(parts[j]))) problems.push(`"${label}": ${parts[i].className} overlaps ${parts[j].className}`);
      // the next card in a column covers this one: its word (and tag) must stay in the visible strip
      const next = card.nextElementSibling as HTMLElement | null;
      const visibleBottom = next?.classList.contains('sol-card') ? r(next).top : cr.bottom;
      for (const p of parts) {
        if (p === tr && next?.classList.contains('sol-card')) continue;
        if (!inside(r(p), innerBox)) problems.push(`"${label}": ${p.className} sticks out of the card`);
        if (p.scrollWidth > p.clientWidth + 1) problems.push(`"${label}": ${p.className} is clipped (${p.scrollWidth} > ${p.clientWidth})`);
        if (/…$/.test(p.textContent ?? '') || getComputedStyle(p).textOverflow === 'ellipsis') problems.push(`"${label}": ${p.className} ends in …`);
      }
      if (r(word).bottom > visibleBottom + 0.5) problems.push(`"${label}": word hidden under the next card`);
      const wpx = parseFloat(getComputedStyle(word).fontSize);
      // absolute minimums from the spec: 16px word, 14px translation (at every text size)
      if (wpx < 16 - 0.1) problems.push(`"${label}": word ${wpx}px < 16px`);
      if (!card.classList.contains('is-cat') && r(word).height > wpx * 1.6) problems.push(`"${label}": Spanish word wraps`);
      if (tr && getComputedStyle(tr).visibility !== 'hidden') {
        const tpx = parseFloat(getComputedStyle(tr).fontSize);
        if (tpx < 14 - 0.1) problems.push(`"${label}": translation ${tpx}px < 14px`);
        const lines = Math.round(r(tr).height / (tpx * 1.25));
        if (lines > 2) problems.push(`"${label}": translation has ${lines} lines`);
      }
    }
    for (const tab of document.querySelectorAll<HTMLElement>('.sol-slotcat__tab')) {
      const name = tab.querySelector<HTMLElement>('.sol-slotcat__name')!;
      const count = tab.querySelector<HTMLElement>('.sol-slotcat__count')!;
      const a = r(name), b = r(count);
      const touch = a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom && b.top < a.bottom;
      if (touch) problems.push(`header "${name.textContent}": name and count touch`);
      if (!inside(a, r(tab)) || !inside(b, r(tab))) problems.push(`header "${name.textContent}": text sticks out`);
      if (name.scrollWidth > name.clientWidth + 1) problems.push(`header "${name.textContent}": name is clipped`);
    }
    return problems;
  }, scale);
}

const WIDTHS = [360, 375, 390, 768];
const CASES: { size: 'normal' | 'xlarge'; theme: 'mesa' | 'night' }[] = [
  { size: 'normal', theme: 'mesa' }, { size: 'xlarge', theme: 'mesa' }, { size: 'normal', theme: 'night' }, { size: 'xlarge', theme: 'night' },
];

describe('Solitario card layout with the longest words', () => {
  for (const width of WIDTHS) {
    for (const c of CASES) {
      it(`${width}px, ${c.size} text, ${c.theme} theme`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
        await page.addInitScript(([cats, size]) => {
          (globalThis as unknown as { __solTestCategories: unknown }).__solTestCategories = cats;
          localStorage.setItem('kz.pet', '{"species":"fox","name":"Z"}');
          localStorage.setItem('kz.settings', JSON.stringify({ lang: 'en', sound: false, soundOffered: true, reduceMotion: true, textSize: size }));
          localStorage.setItem('kz.sol.showTr', 'true');
        }, [TEST_CATEGORIES, c.size] as const);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + 'index.html#game/solitario/play/A1/seed-2');
        await page.waitForSelector('.sol-col .sol-card');
        await openTwoSlots(page);
        if (c.theme === 'night') await page.evaluate(() => { document.documentElement.dataset.theme = 'night'; });
        await page.waitForTimeout(100);
        const problems = await checkLayout(page, c.size === 'xlarge' ? 1.25 : 1);
        await page.close();
        expect(problems).toEqual([]);
        expect(errors).toEqual([]);
      }, 60_000);
    }
  }
});
