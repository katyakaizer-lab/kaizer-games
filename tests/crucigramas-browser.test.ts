// @vitest-environment node
// Crucigramas in a real browser:
// - layout at 360x640, 375x667, 390x844 and 430x932 (and the largest text size), every level's biggest grids:
//   grid, clue bar and keyboard on one screen, no scrolling either way, cells and keys big enough;
// - solving a whole puzzle with the on-screen keyboard (the engine gives the answers; the test only taps),
//   an accent slip marked by Comprobar, Pista, a physical keyboard, progress kept after a reload.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { bare, cellsOf, generate, pickTopic, type CrucigramaData, type Level } from '../src/games/crucigramas/engine';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
const data = JSON.parse(readFileSync(`${ROOT}/src/data/crucigramas/topics.json`, 'utf8')) as CrucigramaData;
const puzzle = (level: Level, seed: number) => generate(pickTopic(data.topics.filter((t) => t.level === level), seed), data.levels[level], seed)!;

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

async function open(hash: string, width = 375, height = 812, size = 'normal'): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
  await page.addInitScript((sz) => {
    if (sessionStorage.getItem('cw-init')) return; // keep storage across reloads within a test
    sessionStorage.setItem('cw-init', '1');
    localStorage.setItem('kz.pet', '{"species":"cat","name":"Mini"}');
    localStorage.setItem('kz.settings', JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: sz }));
  }, size);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + 'index.html' + hash);
  await page.waitForSelector('.cw-grid .cw-cell');
  await page.waitForTimeout(100);
  return { page, errors };
}

/** One screen: nothing scrolls, nothing sticks out, cells and keys big enough to tap and read. */
function layout(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const r = (e: Element) => e.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    if (document.documentElement.scrollWidth > vw) problems.push(`sideways scroll ${document.documentElement.scrollWidth}`);
    if (document.documentElement.scrollHeight > vh + 1) problems.push(`page scrolls ${document.documentElement.scrollHeight} > ${vh}`);
    const board = r(document.querySelector('.cw-board')!);
    const grid = r(document.querySelector('.cw-grid')!);
    if (grid.left < board.left - 0.5 || grid.right > board.right + 0.5 || grid.top < board.top - 0.5 || grid.bottom > board.bottom + 0.5) problems.push('grid sticks out of its space');
    const cell = document.querySelector<HTMLElement>('.cw-cell')!;
    if (cell.offsetWidth < 24) problems.push(`cells only ${cell.offsetWidth}px`);
    const letter = parseFloat(getComputedStyle(cell.querySelector('.cw-letter')!).fontSize);
    if (letter < 12) problems.push(`letters only ${letter}px`);
    for (const k of document.querySelectorAll<HTMLElement>('.cw-key')) {
      const b = r(k);
      if (b.height < 39.5 || b.width < 26) problems.push(`key ${k.textContent || k.getAttribute('aria-label')} ${Math.round(b.width)}x${Math.round(b.height)}`);
      if (b.right > vw + 0.5 || b.bottom > vh + 0.5) problems.push(`key ${k.textContent} off screen`);
    }
    const keys = [...document.querySelectorAll('.cw-key')].map((k) => k.textContent).join('');
    for (const ch of 'ÑÁÉÍÓÚÜ') if (!keys.includes(ch)) problems.push(`no ${ch} key`);
    const clue = document.querySelector<HTMLElement>('.cw-cluebar__text')!;
    if (clue.scrollWidth > clue.clientWidth + 1 || clue.scrollHeight > clue.clientHeight + 1) problems.push('clue clipped');
    // The top bar title (level and topic) stays inside the bar.
    const bar = r(document.querySelector('.cw-bar')!), title = document.querySelector<HTMLElement>('.cw-bar__title')!;
    if (title.scrollHeight > title.clientHeight + 1 || r(title).top < bar.top - 0.5 || r(title).bottom > bar.bottom + 0.5) problems.push(`title does not fit the bar: ${title.textContent}`);
    // Pista and Comprobar reachable: either the labelled row or the icon buttons in the top bar.
    const acts = [...document.querySelectorAll<HTMLElement>('[data-act]')].filter((b) => b.offsetParent && r(b).height >= 43.5);
    if (new Set(acts.map((b) => b.dataset.act)).size !== 2) problems.push('Pista or Comprobar not visible at 44px');
    return problems;
  });
}

/** Biggest grid among the first seeds of a level (the hardest case for the layout). */
function biggestSeed(level: Level): number {
  let best = 1, area = 0;
  for (let s = 1; s <= 40; s++) { const p = puzzle(level, s); if (p.rows * p.cols > area || (p.rows * p.cols === area && p.rows > puzzle(level, best).rows)) { area = p.rows * p.cols; best = s; } }
  return best;
}

describe('Crucigramas layout on phones', () => {
  const sizes: [number, number][] = [[360, 640], [375, 667], [390, 844], [430, 932]];
  for (const level of ['A1', 'A2', 'B1', 'B2'] as Level[]) {
    it(`${level}: biggest grid fits one screen at every phone size`, async () => {
      const seed = biggestSeed(level);
      for (const [w, hgt] of sizes) {
        const { page, errors } = await open(`#game/crucigramas/play/${level}/seed-${seed}`, w, hgt);
        const problems = await layout(page);
        await page.close();
        expect(problems, `${w}x${hgt}`).toEqual([]);
        expect(errors).toEqual([]);
      }
    }, 90_000);
  }
  it('largest text size still fits (A2 biggest grid, 375x812 and 390x844)', async () => {
    const seed = biggestSeed('A2');
    for (const [w, hgt] of [[375, 812], [390, 844]]) {
      const { page } = await open(`#game/crucigramas/play/A2/seed-${seed}`, w, hgt, 'xlarge');
      const problems = await layout(page);
      await page.close();
      expect(problems, `${w}x${hgt}`).toEqual([]);
    }
  }, 60_000);
});

describe('Crucigramas start to finish', () => {
  it('solves a puzzle with the on-screen keyboard; accents count; progress survives a reload', async () => {
    const seed = 4;
    const p = puzzle('A1', seed);
    const { page, errors } = await open(`#game/crucigramas/play/A1/seed-${seed}`);
    const solved = async () => (await page.locator('.cw-summary').count()) > 0;
    const typeWord = async (wi: number, letters: string[]) => {
      if (await solved()) return;
      await page.click(`[data-cell="${cellsOf(p.words[wi])[0]}"]`);
      // The first tap may select the crossing word; make sure the right word is current (tap again switches).
      const label = await page.textContent('.cw-cluebar__label');
      if (!label!.startsWith(`${p.words[wi].num} ${p.words[wi].dir === 'across' ? 'Horizontal' : 'Vertical'}`)) await page.click(`[data-cell="${cellsOf(p.words[wi])[0]}"]`);
      for (const ch of letters) { if (await solved()) return; await page.click(`.cw-key[data-key="${ch}"]`); }
    };
    // A word with an accent, typed without it: not done, and Comprobar marks an accent slip.
    const wi = p.words.findIndex((w) => w.answer.some((ch) => bare(ch) !== ch && ch !== 'Ñ'));
    if (wi >= 0) {
      await typeWord(wi, p.words[wi].answer.map(bare));
      expect(await page.locator('.cw-cell.is-done').count()).toBe(0);
      await page.click('[data-act="check"] >> visible=true');
      expect(await page.locator('.cw-cell.is-accent').count()).toBeGreaterThan(0);
      await typeWord(wi, p.words[wi].answer);
    }
    // Pista fills one right letter.
    const other = p.words.findIndex((_, i) => i !== wi);
    await page.click(`[data-cell="${cellsOf(p.words[other])[0]}"]`);
    await page.click('[data-act="hint"] >> visible=true');
    // Reload: what was typed is still there.
    const filled = await page.locator('.cw-letter:not(:empty)').count();
    await page.reload();
    await page.waitForSelector('.cw-grid .cw-cell');
    expect(await page.locator('.cw-letter:not(:empty)').count()).toBe(filled);
    // The rest with the on-screen keyboard (and the last word with a physical keyboard).
    for (let i = 0; i < p.words.length - 1; i++) if (i !== wi) await typeWord(i, p.words[i].answer);
    const last = p.words[p.words.length - 1];
    // Unless crossings already finished it, the last word is typed on a physical keyboard.
    if (!(await solved())) {
    await page.click(`[data-cell="${cellsOf(last)[0]}"]`);
    const label = await page.textContent('.cw-cluebar__label');
    if (!label!.startsWith(`${last.num} ${last.dir === 'across' ? 'Horizontal' : 'Vertical'}`)) await page.click(`[data-cell="${cellsOf(last)[0]}"]`);
    await page.keyboard.type(last.answer.join('').toLowerCase());
    }
    await page.waitForSelector('.cw-summary', { timeout: 5000 });
    expect(await page.textContent('.cw-finish')).toContain('Crucigrama completo');
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('kz.cw.records') ?? '{}'));
    expect(rec.A1.done).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('kz.cw.game.A1'))).toBe('null');
    await page.close();
    expect(errors).toEqual([]);
  }, 120_000);

  it('tapping the clue switches across/down at a crossing; the clue list jumps to a word', async () => {
    const p = puzzle('A2', 6);
    const { page } = await open('#game/crucigramas/play/A2/seed-6', 900, 900);
    // A crossing cell: belongs to an across and a down word.
    const cross = cellsOf(p.words.find((w) => w.dir === 'across')!).find((k) => p.words.some((w) => w.dir === 'down' && cellsOf(w).includes(k)));
    if (cross) {
      await page.click(`[data-cell="${cross}"]`);
      const a = await page.textContent('.cw-cluebar__label');
      await page.click('.cw-cluebar__text');
      expect(await page.textContent('.cw-cluebar__label')).not.toBe(a);
    }
    // Wide screen: the list is beside the grid; tapping a clue selects its word.
    await page.click('.cw-clue >> nth=2');
    expect(await page.locator('.cw-clue.is-current').count()).toBe(1);
    expect(await page.textContent('.cw-cluebar__text')).toContain(p.words[2].clue.text);
    await page.close();
  }, 60_000);
});
