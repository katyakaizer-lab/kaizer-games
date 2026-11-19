// @vitest-environment node
// Solitario de categorías in a real browser: replays a winning line, tap by tap, on a fixed deal.
// The solver (the same engine the game uses) computes the line; the test only clicks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { newGame, solve, type Category, type Source, type Target } from '../src/games/solitario/engine';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
const USE_DIST = process.env.SMOKE_DIST === '1';
const STATE = {
  'kz.pet': JSON.stringify({ species: 'dragon', name: 'Chispa' }),
  'kz.settings': JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' }),
};

let server: { close(): Promise<void>; httpServer: import('node:http').Server | null };
let browser: Browser;
let base = '';

beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  if (USE_DIST) {
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

const cats = (JSON.parse(readFileSync(`${ROOT}/src/data/solitario/categories.json`, 'utf8')).categories as Category[]);

/** Click the visible top strip of a card (cards overlap in columns). */
async function clickSource(page: Page, src: Source) {
  const loc = page.locator(`[data-src='${JSON.stringify(src)}']`);
  await loc.scrollIntoViewIfNeeded();
  const box = (await loc.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 6);
}
/** The layout the game chose for this screen (columns, categories, face-down cards per column), read from the table. */
async function layoutOf(page: Page) {
  return page.evaluate(() => ({
    columns: document.querySelectorAll('.sol-col').length,
    categories: document.querySelectorAll('.sol-slots > *').length,
    down: document.querySelector(".sol-col")!.querySelectorAll(".is-down").length,
  }));
}
async function clickTarget(page: Page, t: Target) {
  const loc = page.locator(`[data-target='${JSON.stringify(t)}']`).first();
  await loc.scrollIntoViewIfNeeded();
  const box = (await loc.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 6);
}

describe('Solitario de categorías start to finish in a real browser', () => {
  it('wins a fixed A1 deal at phone width; moves are counted; undo works', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, STATE);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + 'index.html#game/solitario/play/A1/seed-5');
    await page.waitForSelector('.sol-col .sol-card');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('mesa');

    // Same deal in the engine (phone layout: 5 columns, 5 categories) and its winning line.
    const steps = solve(newGame(cats.filter((c) => c.level === 'A1'), { seed: 5, ...(await layoutOf(page)) }))!;
    expect(steps).not.toBe(null);

    // Undo: turn a card over, undo, the counter goes back to 0.
    await page.click('[data-stock]');
    expect(await page.textContent('.sol-moves__n')).toBe('1');
    await page.click(".sol-bottom button:has-text(\"Deshacer\")");
    expect(await page.textContent('.sol-moves__n')).toBe('0');

    for (const st of steps) {
      if (st.kind === 'draw') await page.click('[data-stock]');
      else { await clickSource(page, st.src); await clickTarget(page, st.dst); }
    }
    await page.waitForSelector('.sol-summary');
    expect(await page.textContent('.sol-finish')).toContain(`${steps.length} movimientos`);
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('kz.sol.records') ?? '{}'));
    expect(rec.A1).toEqual({ wins: 1, best: steps.length });
    await page.close();
    expect(errors).toEqual([]);
  }, 180_000);

  it('a wrong move changes nothing and says why; a word can be dragged', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    await page.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, STATE);
    await page.goto(base + 'index.html#game/solitario/play/A1/seed-5');
    await page.waitForSelector('.sol-col .sol-card');
    // a word card onto an empty slot: needs a category card first
    const word = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('.sol-col')].map((c) => [...c.querySelectorAll('[data-src]')].pop() as HTMLElement | undefined).filter(Boolean) as HTMLElement[];
      return tops.find((t) => !t.dataset.id!.endsWith(':cat'))!.dataset.src!;
    });
    await clickSource(page, JSON.parse(word));
    await clickTarget(page, { kind: 'slot', index: 0 });
    expect(await page.textContent('.sol-status')).toContain('carta de categoría');
    expect(await page.textContent('.sol-moves__n')).toBe('0');
    await clickSource(page, JSON.parse(word)); // put it down
    // drag the first winning move instead of tapping it
    const steps = solve(newGame(cats.filter((c) => c.level === 'A1'), { seed: 5, ...(await layoutOf(page)) }))!;
    const first = steps.find((s) => s.kind === 'move')!;
    const idx = steps.indexOf(first);
    for (let i = 0; i < idx; i++) await page.click('[data-stock]');
    if (first.kind === 'move') {
      await page.locator(`[data-src='${JSON.stringify(first.src)}']`).scrollIntoViewIfNeeded();
      const a = (await page.locator(`[data-src='${JSON.stringify(first.src)}']`).boundingBox())!;
      const b = (await page.locator(`[data-target='${JSON.stringify(first.dst)}']`).first().boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + 6);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    expect(await page.textContent('.sol-moves__n')).toBe(String(idx + 1));
    await page.close();
  }, 60_000);

  it('stars pop when a category completes; with a limit, running out offers ways on', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const st = { ...STATE, 'kz.settings': JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: false, textSize: 'normal' }), 'kz.sol.limit': '50' };
    await page.addInitScript((x) => { for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, st);
    await page.goto(base + 'index.html#game/solitario/play/A1/seed-5');
    await page.waitForSelector('.sol-col .sol-card');
    expect(await page.textContent('.sol-moves')).toContain('Quedan');
    const steps = solve(newGame(cats.filter((c) => c.level === 'A1'), { seed: 5, limit: 50, ...(await layoutOf(page)) }))!;
    let burst = false;
    for (const step of steps) {
      if (step.kind === 'draw') await page.click('[data-stock]');
      else { await clickSource(page, step.src); await clickTarget(page, step.dst); }
      if (await page.locator('.sol-burst .sol-burst__star').count()) { burst = true; break; }
    }
    expect(burst).toBe(true);
    // the same deal again: use up all moves by turning the deck (which always has cards at the start)
    await page.click(".sol-bottom button:has-text(\"Reiniciar\")");
    await page.waitForSelector('.sol-col .sol-card');
    for (let i = 0; i < 60 && !(await page.locator('.sol-out').count()); i++) await page.click('[data-stock]');
    expect(await page.textContent('.sol-out')).toContain('No quedan movimientos');
    await page.click('.sol-out button:has-text("Repetir esta partida")');
    expect(await page.textContent('.sol-moves__n')).toContain('50');
    await page.close();
  }, 120_000);
});
