// @vitest-environment node
// Smoke test, layout part: every screen at phone widths in a real browser.
// Fails if the page scrolls sideways (documentElement.scrollWidth > viewport) or logs a console error.
// Uses the browser already installed on the machine (Edge or Chrome); set CHROME_PATH to choose one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

const SCREENS = [
  'index.html#picker', 'index.html#home', 'index.html#settings',
  'index.html#game/constelaciones', 'index.html#game/constelaciones/story', 'index.html#game/constelaciones/listen', 'index.html#game/constelaciones/memory',
  'index.html#game/constelaciones/play/map/c-b2-001', 'index.html#game/constelaciones/play/memory/c-a1-001', 'index.html#game/constelaciones/read/farolero',
  'index.html#game/solitario', 'index.html#game/solitario/play/A1', 'index.html#game/solitario/play/B2/experto',
  'style-test/index.html', 'style-test/index.html?theme=night',
];
const NOW = Date.now();
/** A learner who has picked a pet, lit a few constellations and has one review due. */
const STATE: Record<string, string> = {
  'kz.pet': JSON.stringify({ species: 'dragon', name: 'Chispa' }),
  'kz.settings': JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' }),
  'kz.cz.progress': JSON.stringify({ cleared: Object.fromEntries(['c-a1-001', ...Array.from({ length: 15 }, (_, i) => `c-story-farolero-${i + 1}`)]
    .map((id, i) => [id, { firstAt: NOW - 2e8, step: 0, due: i ? NOW + 8.64e7 : NOW - 1000, reviews: 0, hints: 0 }])) }),
};
const WIDTHS = [360, 375];

// SMOKE_DIST=1 tests the built site in dist/ (what users get); otherwise the dev server.
const USE_DIST = process.env.SMOKE_DIST === '1';
let server: { close(): Promise<void>; httpServer: import('node:http').Server | null };
let browser: Browser;
let base = '';

beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error(`No Chrome or Edge found for the layout smoke test. Set CHROME_PATH. Tried: ${CANDIDATES.join(', ')}`);
  if (USE_DIST) {
    if (!existsSync(`${ROOT}/dist/index.html`)) throw new Error('SMOKE_DIST=1 needs a build first: npm run build');
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

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('smoke: no sideways scrolling at phone width', () => {
  for (const screen of SCREENS) {
    for (const width of WIDTHS) {
      it(`${screen} at ${width}px`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        if (!screen.endsWith('#picker')) await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, STATE);
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        // A missing file is an error too (optional recordings under audio/ are allowed to be absent).
        // The local servers answer unknown paths with the app page (200), so an asset that comes back as HTML is missing too.
        page.on('response', (res) => {
          if (res.url().includes('/audio/')) return;
          const asset = ['image', 'font', 'script', 'stylesheet'].includes(res.request().resourceType());
          const html = (res.headers()['content-type'] ?? '').includes('text/html');
          if (res.status() >= 400 || (asset && html)) errors.push(`missing: ${res.status()} ${res.url()}`);
        });
        await page.goto(base + screen, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && !!document.querySelector('#app')?.children.length);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll('body *')]
            .filter((e) => e.getBoundingClientRect().right > vw + 0.5 && !e.closest('.st-device-scroll, .st-table-wrap, .k-toasts'))
            .slice(0, 5)
            .map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]} right=${Math.round(e.getBoundingClientRect().right)}`);
          return { scrollWidth: document.documentElement.scrollWidth, vw, wide };
        });
        await page.close();
        expect(r.scrollWidth, `scrollWidth ${r.scrollWidth} > viewport ${r.vw}; widest: ${r.wide.join('; ')}`).toBeLessThanOrEqual(r.vw);
        expect(errors).toEqual([]);
      }, 30_000);
    }
  }
});

describe('smoke: play one constellation start to finish in a real browser', () => {
  it('stars, a wrong tap, Pista, Ilumina la frase, lit', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, { ...STATE, 'kz.cz.progress': '{}' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + 'index.html#game/constelaciones/play/map/c-a1-002'); // ¿Dónde vives? (A1)
    await page.waitForSelector('.cz-star');
    // Swipes on empty sky must scroll the page; only a swipe that starts on a star draws a line.
    expect(await page.$eval('.cz-board', (e) => getComputedStyle(e).touchAction)).not.toBe('none');
    expect(await page.$eval('.cz-star', (e) => getComputedStyle(e).touchAction)).toBe('none');
    await page.click('.cz-star[data-index="1"]'); // wrong
    await page.click('.cz-star[data-index="1"]'); // wrong again
    expect(await page.textContent('.cz-status')).toContain('no va');
    await page.click('button:has-text("Pista")');
    expect(await page.getAttribute('.cz-star[data-index="0"]', 'class')).toContain('is-hint');
    await page.click('.cz-star[data-index="0"]');
    await page.click('.cz-star[data-index="1"]');
    await page.waitForSelector('.cz-light');
    await page.click('.cz-word >> nth=0'); // capital
    await page.click('.cz-tray__mark:has-text("?")');
    await page.click('.cz-gap.is-end');
    await page.click('button:has-text("Comprobar")');
    await page.waitForSelector('.cz-done');
    expect(await page.textContent('.cz-done__sentence')).toBe('¿Dónde vives?');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('kz.cz.progress') ?? '{}'));
    expect(Object.keys(progress.cleared)).toEqual(['c-a1-002']);
    await page.close();
    expect(errors).toEqual([]);
  }, 30_000);
});

describe('smoke: laptop window', () => {
  it('the longest sentence and its light stage fit a 1366x768 window', async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, { ...STATE, 'kz.cz.progress': '{}' });
    await page.goto(base + 'index.html#game/constelaciones/play/map/c-b2-001'); // 9 words, B2: every task
    await page.waitForSelector('.cz-star');
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const i of order) await page.click('.cz-star[data-index="' + i + '"]');
    await page.waitForSelector('.cz-light');
    await page.evaluate(() => window.scrollTo(0, 0));
    const r = await page.evaluate(() => ({
      board: document.querySelector('.cz-board')!.getBoundingClientRect().bottom,
      check: [...document.querySelectorAll('.cz-light button')].find((b) => b.textContent?.includes('Comprobar'))!.getBoundingClientRect().bottom,
      h: window.innerHeight,
    }));
    await page.close();
    expect(r.board).toBeLessThanOrEqual(r.h);
    expect(r.check).toBeLessThanOrEqual(r.h);
  }, 30_000);
});

describe('smoke: Solitario de categorías start to finish in a real browser', () => {
  it('plays a whole A1 game by tapping, dragging and turning the deck', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, STATE);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + 'index.html#game/solitario/play/A1');
    await page.waitForSelector('.sol-col .sol-card');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('mesa');
    // Finds a playable card (waste top or a column top) and a foundation for it (or a wrong one).
    // Returns stable selectors, since every move redraws the table.
    const find = (wrong: boolean) => page.evaluate((wrong) => {
      const tops = [document.querySelector('.sol-waste [data-src]'), ...[...document.querySelectorAll('.sol-col')].map((c) => [...c.querySelectorAll('[data-src]')].pop())].filter(Boolean) as HTMLElement[];
      for (const c of tops) {
        const cat = c.dataset.id!.split(':')[0];
        const pile = [...document.querySelectorAll<HTMLElement>('.sol-pile')].find((p) => (JSON.parse(p.dataset.target!).key === cat) !== wrong);
        if (pile) return { src: `[data-src][data-id="${c.dataset.id}"]`, dst: `.sol-pile[data-target='${pile.dataset.target}']` };
      }
      return null;
    }, wrong);
    // a wrong foundation first: nothing moves, the status says why
    const bad = (await find(true))!;
    await page.click(bad.src);
    await page.click(bad.dst);
    expect(await page.textContent('.sol-status')).toContain('no va');
    await page.click(bad.src); // put it down again
    let dragged = false;
    for (let guard = 0; guard < 300 && !(await page.locator('.sol-summary').count()); guard++) {
      const m = await find(false);
      if (m) {
        if (!dragged) {
          const c = (await page.locator(m.src).boundingBox())!, p = (await page.locator(m.dst).boundingBox())!;
          await page.mouse.move(c.x + c.width / 2, c.y + 10);
          await page.mouse.down();
          await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 8 });
          await page.mouse.up();
          dragged = true;
        } else {
          await page.click(m.src);
          await page.click(m.dst);
        }
      } else await page.click('[data-stock]');
    }
    await page.waitForSelector('.sol-summary');
    const wins = await page.evaluate(() => JSON.parse(localStorage.getItem('kz.sol.wins') ?? '{}'));
    expect(wins.A1.normal).toBe(1);
    await page.close();
    expect(errors).toEqual([]);
  }, 120_000);
});
