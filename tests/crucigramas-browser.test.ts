// @vitest-environment node
// Crucigramas in a real browser:
// - every crossword topic at 360, 375 and 390px: the grid container never overlaps the clue list, the page never
//   scrolls sideways, every cell is at least 32px, decorations never touch the grid or the clue text;
// - the help choice before a crossword (remembered), hint limits per word, "Sin ayuda" hides the hint button;
// - the "¡Casi!" window for a missing accent, with the right letter to tap in;
// - tapping a clue selects its word and shows it in the grid; a full solve with stars on the completion screen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { loadCrucigramas } from './helpers-crucigramas';
import { bare, cellsOf, type Placed, type Puzzle } from '../src/games/crucigramas/engine';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
const data = loadCrucigramas();

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
afterAll(async () => { await browser?.close(); await server?.close(); }, 30_000);

async function newPage(width = 375, height = 812): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cw-init')) return;
    sessionStorage.setItem('cw-init', '1');
    localStorage.setItem('kz.pet', '{"species":"cat","name":"Mini"}');
    localStorage.setItem('kz.settings', JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' }));
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, errors };
}
async function play(page: Page, level: string, topic: string, seed: number, help = 'normal') {
  await page.goto(`${base}index.html#game/crucigramas/play/${level}/${topic}/seed-${seed}/${help}`);
  await page.waitForSelector('.cw-grid .cw-cell');
  await page.waitForTimeout(80);
}
const puzzleOf = (page: Page, level: string) => page.evaluate((l) => JSON.parse(localStorage.getItem(`kz.cw.game.${l}`)!).puzzle as Puzzle, level);

/** Layout rules, measured in the page. */
function layout(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const r = (e: Element) => e.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) problems.push(`sideways scroll ${document.documentElement.scrollWidth} > ${vw}`);
    const wrap = document.querySelector('.cw-gridwrap')!, clues = document.querySelector('.cw-clues')!;
    const g = r(wrap), c = r(clues);
    if (hit(g, c)) problems.push('grid container overlaps the clue list');
    if (c.top < g.bottom - 0.5) problems.push('clue list starts above the end of the grid container');
    if (g.right > vw + 0.5 || g.left < -0.5) problems.push('grid container wider than the screen');
    const cells = [...document.querySelectorAll<HTMLElement>('.cw-cell')];
    const small = cells.filter((x) => x.offsetWidth < 31.5 || x.offsetHeight < 31.5);
    if (small.length) problems.push(`${small.length} cells under 32px (${small[0].offsetWidth}px)`);
    // Cells stay inside the grid container's own box (it may scroll, but nothing is drawn outside it).
    const box = r(document.querySelector('.cw-gridbox')!);
    const grid = r(document.querySelector('.cw-grid')!);
    if (grid.width <= box.width + 0.5 && (grid.left < box.left - 0.5 || grid.right > box.right + 0.5)) problems.push('grid narrower than its box but not inside it');
    // Decorations: never on the grid or on clue text.
    const decor = [...document.querySelectorAll<HTMLElement>('[data-decor], .cw-decor__obj, .cw-border')];
    const texts = [...document.querySelectorAll('.cw-clue, .cw-cluebar, .cw-bar__title')].map(r);
    for (const d of decor) {
      const dr = r(d);
      if (dr.width === 0) continue;
      if (hit(dr, g)) problems.push(`decoration ${d.dataset.decor ?? d.className} touches the grid`);
      if (texts.some((t) => hit(dr, t))) problems.push(`decoration ${d.dataset.decor ?? d.className} touches clue text`);
      if (d.closest('button, a') || getComputedStyle(d).pointerEvents === 'auto' && d.closest('[aria-hidden="true"]') === null) problems.push('decoration is tappable or not aria-hidden');
    }
    const narrow = window.innerWidth < 400;
    const objs = document.querySelectorAll('.cw-decor .cw-decor__obj').length;
    if (narrow && objs > 2) problems.push(`${objs} decoration objects under 400px`);
    // Nothing in the page is hidden under the fixed keyboard dock at the end of the scroll.
    const dock = r(document.querySelector('.cw-dock')!);
    const pagePad = parseFloat(getComputedStyle(document.querySelector('.cw-play')!).paddingBottom);
    if (pagePad < dock.height - 0.5) problems.push('page bottom padding smaller than the keyboard dock');
    return problems;
  });
}

describe('every crossword at phone widths', () => {
  for (const width of [360, 375, 390]) {
    it(`all ${data.topics.length} topics at ${width}px: no overlap, no sideways scroll, cells >= 32px, decorations clear`, async () => {
      const { page, errors } = await newPage(width, 800);
      const all: string[] = [];
      for (const t of data.topics) {
        await play(page, t.level, t.id, 7);
        for (const pr of await layout(page)) all.push(`${t.level}/${t.id}: ${pr}`);
      }
      await page.close();
      expect(all).toEqual([]);
      expect(errors).toEqual([]);
    }, 240_000);
  }
});

describe('decorations load', () => {
  it('every decoration image used as a mask actually loads (also on the built site)', async () => {
    const { page } = await newPage(430, 800);
    await play(page, 'B2', 'festividades', 1);
    const res = await page.evaluate(async () => {
      const urls = [...document.querySelectorAll<HTMLElement>('[data-decor]')].map((e) => getComputedStyle(e).webkitMaskImage.match(/url\("?([^")]+)"?\)/)?.[1]).filter(Boolean) as string[];
      const st = await Promise.all(urls.map((u) => fetch(u).then((r) => `${r.status} ${r.headers.get('content-type')}`)));
      return { n: urls.length, bad: st.filter((s) => !s.startsWith('200') || !s.includes('svg')) };
    });
    await page.close();
    expect(res.n).toBeGreaterThanOrEqual(5);
    expect(res.bad).toEqual([]);
  }, 60_000);
});

describe('help, hints and the accent window', () => {
  it('the help choice comes before each crossword and is remembered; Poca ayuda gives 1 letter per word', async () => {
    const { page, errors } = await newPage();
    await page.goto(`${base}index.html#game/crucigramas/new/A1`);
    await page.waitForSelector('.cw-setup');
    await page.click('label[for="cw-help-little"]');
    await page.click('label[for="cw-topic-frutas"]');
    await page.click('.cw-setup button:has-text("Empezar")');
    await page.waitForSelector('.cw-grid .cw-cell');
    expect(await page.textContent('.cw-bar__title')).toContain('Poca ayuda');
    expect(await page.textContent('.cw-bar__topic')).toBe('Frutas');
    const hint = page.locator('.cw-dock [data-act="hint"]');
    expect(await hint.textContent()).toContain('Pista (1)');
    await hint.click();
    expect(await page.locator('.cw-letter:not(:empty)').count()).toBe(1);
    expect(await hint.textContent()).toContain('Sin pistas para esta palabra');
    expect(await hint.isDisabled()).toBe(true);
    // Next time the choice starts on Poca ayuda.
    await page.goto(`${base}index.html#game/crucigramas/new/A1`);
    await page.waitForSelector('.cw-setup');
    expect(await page.isChecked('#cw-help-little')).toBe(true);
    await page.close();
    expect(errors).toEqual([]);
  }, 60_000);

  it('Sin ayuda hides the hint button', async () => {
    const { page } = await newPage();
    await play(page, 'A2', 'tiempo', 3, 'none');
    expect(await page.locator('[data-act="hint"]').count()).toBe(0);
    expect(await page.textContent('.cw-bar__title')).toContain('Sin ayuda');
    await page.close();
  }, 60_000);

  it('Ayuda normal: at most a third of a word (2 letters in a 6+ letter word)', async () => {
    const { page } = await newPage();
    await play(page, 'A1', 'ropa', 4, 'normal');
    const p = await puzzleOf(page, 'A1');
    const w = p.words.find((x) => x.answer.length >= 6)!;
    await selectWord(page, w);
    const hint = page.locator('.cw-dock [data-act="hint"]');
    await hint.click();
    await hint.click();
    expect(await hint.isDisabled()).toBe(true);
    const filled = await page.evaluate((cells) => cells.filter((k) => document.querySelector(`[data-cell="${k}"] .cw-letter`)!.textContent).length, cellsOf(w));
    expect(filled).toBe(2);
    await page.close();
  }, 60_000);

  it('a missing accent opens "¡Casi!" with the right letter to tap in; it is not a mistake', async () => {
    const { page, errors } = await newPage();
    let found: { topic: string; seed: number } | null = null;
    for (const [topic, seed] of [['colores', 1], ['colores', 2], ['ropa', 1], ['ropa', 2], ['animales', 1], ['animales', 2]] as const) {
      await play(page, 'A1', topic, seed);
      const p = await puzzleOf(page, 'A1');
      const w = p.words.find((x) => x.answer.some((c) => bare(c) !== c && c !== 'Ñ'));
      if (!w) continue;
      found = { topic, seed };
      await selectWord(page, w);
      const i = w.answer.findIndex((c) => bare(c) !== c);
      for (let j = 0; j <= i; j++) await page.click(`.cw-key[data-key="${bare(w.answer[j])}"]`);
      const box = page.locator('.cw-near');
      await box.waitFor();
      expect(await box.textContent()).toContain(`¡Casi! Falta la tilde: ${w.answer[i]}`);
      const rect = await box.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(375);
      // Comprobar does not count it as a wrong letter.
      await page.locator('.cw-near__fix').click();
      expect(await page.locator(`[data-cell="${cellsOf(w)[i]}"] .cw-letter`).textContent()).toBe(w.answer[i]);
      expect(await page.locator('.cw-near').count()).toBe(0);
      break;
    }
    expect(found).not.toBe(null);
    await page.close();
    expect(errors).toEqual([]);
  }, 90_000);
});

/** Selects a word by tapping its first cell (twice if the crossing word was chosen). */
async function selectWord(page: Page, w: Placed) {
  const k = cellsOf(w)[0];
  await page.click(`[data-cell="${k}"]`);
  const want = `${w.num} ${w.dir === 'across' ? 'Horizontal' : 'Vertical'}`;
  if (!(await page.textContent('.cw-cluebar__label'))!.startsWith(want)) await page.click(`[data-cell="${k}"]`);
}

describe('clues and finishing', () => {
  it('tapping a clue selects its word and shows it inside the grid container', async () => {
    const { page } = await newPage(360, 640);
    await play(page, 'B2', 'tecnologia', 2);
    const p = await puzzleOf(page, 'B2');
    const last = p.words[p.words.length - 1];
    await page.locator(`.cw-clue[data-word="${p.words.length - 1}"]`).scrollIntoViewIfNeeded();
    await page.click(`.cw-clue[data-word="${p.words.length - 1}"]`);
    await page.waitForTimeout(400);
    expect(await page.textContent('.cw-cluebar__text')).toContain(last.clue.text);
    const visible = await page.evaluate((cells) => {
      const box = document.querySelector('.cw-gridbox')!.getBoundingClientRect();
      const dockTop = document.querySelector('.cw-dock')!.getBoundingClientRect().top;
      return cells.map((k) => { const c = document.querySelector(`[data-cell="${k}"]`)!.getBoundingClientRect(); return c.left >= box.left - 1 && c.right <= box.right + 1 && c.top >= Math.max(0, box.top) - 1 && c.bottom <= Math.min(box.bottom, dockTop) + 1; });
    }, [cellsOf(last)[0]]);
    expect(visible).toEqual([true]);
    await page.close();
  }, 60_000);

  it('a full solve: stars for each word and for finishing; the completion screen shows help and stars, nothing overlaps', async () => {
    const { page, errors } = await newPage();
    await play(page, 'A1', 'animales', 9, 'little');
    const p = await puzzleOf(page, 'A1');
    for (const w of p.words) {
      if (await page.locator('.cw-summary, .cw-finish').count()) break;
      await selectWord(page, w);
      for (const ch of w.answer) { if (await page.locator('.cw-finish').count()) break; await page.click(`.cw-key[data-key="${ch}"]`); }
    }
    await page.waitForSelector('.cw-finish');
    const text = await page.textContent('.cw-finish');
    expect(text).toContain('Crucigrama completo');
    expect(text).toContain('Poca ayuda · 0 pistas'); // (1 hint reads "1 pista")
    // 1 per word + 3 for finishing + 1 for Poca ayuda.
    const expected = p.words.length + 3 + 1;
    expect(text).toContain(`+${expected} estrellas`);
    const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem('kz.rewards.wallet')!));
    expect(wallet.balance).toBe(expected);
    expect(wallet.byGame.crucigramas).toBe(expected);
    const overlap = await page.evaluate(() => {
      const g = document.querySelector('.cw-gridwrap')!.getBoundingClientRect(), c = document.querySelector('.cw-clues')!.getBoundingClientRect();
      return c.top < g.bottom - 0.5 || document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overlap).toBe(false);
    // The star total shows on the home screen next to the pet.
    await page.goto(`${base}index.html#home`);
    await page.waitForSelector('.k-star-total');
    expect(await page.getAttribute('.k-star-total', 'data-stars')).toBe(String(expected));
    await page.close();
    expect(errors).toEqual([]);
  }, 120_000);
});
