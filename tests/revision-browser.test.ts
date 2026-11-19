// @vitest-environment node
// The dev-only word review page (/revision/) in a real browser at 375px: one entry at a time with the engines'
// syllables, ✓ Correcto / ✎ Editar / ⚑ Dudoso, filters, decisions kept on the device, and the exported patch file.
// The production build must not contain the page.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'vite';
import { ROOT } from './helpers';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
let server: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let base = '';
beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const addr = server.httpServer!.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 5173}/`;
  browser = await chromium.launch({ executablePath: exe, headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); }, 90_000);

describe('word review page (dev only)', () => {
  it('shows one entry with syllables and stress; Correcto, Editar and Dudoso; export a patch', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}revision/index.html`);
    await page.waitForSelector('.rv-card');
    // Filter to fruit, A1: the first entry is a fruit with its syllables and stress.
    await page.selectOption('select[aria-label="Tema"]', 'frutas');
    await page.selectOption('select[aria-label="Nivel"]', 'A1');
    const word = await page.textContent('.rv-word');
    expect(word).toBeTruthy();
    expect(await page.locator('.rv-syl.is-stressed').count()).toBe(1);
    expect(await page.textContent('.rv-stress')).toMatch(/aguda|llana|esdrújula/);
    const total = Number((await page.textContent('.rv-nav .rv-count'))!.split('/')[1]);
    // ✓ Correcto: the entry leaves the "Sin revisar" list.
    await page.click('button:has-text("✓ Correcto")');
    expect(Number((await page.textContent('.rv-nav .rv-count'))!.split('/')[1])).toBe(total - 1);
    // ✎ Editar: change the English translation and save.
    const edited = await page.textContent('.rv-word');
    await page.click('button:has-text("✎ Editar")');
    await page.fill('input[name="en"]', 'edited in test');
    await page.click('button:has-text("Guardar")');
    // ⚑ Dudoso with a note.
    const doubtful = await page.textContent('.rv-word');
    await page.click('button:has-text("⚑ Dudoso")');
    await page.fill('textarea[name="note"]', '¿Es A1?');
    await page.click('button:has-text("Marcar como dudoso")');
    // Decisions are kept on the device (they survive a reload).
    await page.reload();
    await page.waitForSelector('.rv-card');
    expect(await page.textContent('.rv-filters .rv-count')).toContain('3 decididas');
    // Export: revision-YYYY-MM-DD.json with the three decisions.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.rv-btn--export')]);
    expect(dl.suggestedFilename()).toMatch(/^revision-\d{4}-\d{2}-\d{2}\.json$/);
    const patch = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(patch).toMatchObject({ app: 'kaizer-games', kind: 'word-review' });
    const byStatus = Object.fromEntries(patch.decisions.map((d: { status: string }) => [d.status, d]));
    expect(byStatus.edited.changes).toEqual({ translations: { en: 'edited in test', ru: expect.any(String) } });
    expect(byStatus.doubt.note).toBe('¿Es A1?');
    expect([word, edited, doubtful].every(Boolean)).toBe(true);
    // No sideways scroll on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.close();
    expect(errors).toEqual([]);
  }, 90_000);

  it('is not part of the production build', () => {
    const cfg = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(cfg).not.toMatch(/revision/);
    if (existsSync(join(ROOT, 'dist'))) expect(existsSync(join(ROOT, 'dist/revision'))).toBe(false);
  });
});
