// @vitest-environment node
// Smoke test, layout part: every screen at phone widths in a real browser.
// Fails if the page scrolls sideways (documentElement.scrollWidth > viewport) or logs a console error.
// Uses the browser already installed on the machine (Edge or Chrome); set CHROME_PATH to choose one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
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
  'style-test/index.html', 'style-test/index.html?theme=night',
];
const NOW = Date.now();
/** A learner who has picked a pet, lit a few constellations and has one review due. */
const STATE: Record<string, string> = {
  'kz.pet': JSON.stringify({ species: 'dragon', name: 'Chispa' }),
  'kz.settings': JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' }),
  'kz.cz.progress': JSON.stringify({ cleared: Object.fromEntries(['c-a1-001', 'c-story-farolero-1', 'c-story-farolero-2', 'c-story-farolero-3', 'c-story-farolero-4']
    .map((id, i) => [id, { firstAt: NOW - 2e8, step: 0, due: i ? NOW + 8.64e7 : NOW - 1000, reviews: 0, hints: 0 }])) }),
};
const WIDTHS = [360, 375];

let server: ViteDevServer;
let browser: Browser;
let base = '';

beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error(`No Chrome or Edge found for the layout smoke test. Set CHROME_PATH. Tried: ${CANDIDATES.join(', ')}`);
  server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
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
