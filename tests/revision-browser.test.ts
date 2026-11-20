// @vitest-environment node
// The word review page (/revision/) in a real browser at 375px: one entry at a time with the engines' syllables,
// ✓ Correcto / ✎ Editar / ⚑ Dudoso, filters, decisions kept on the device, and export (download, copy, and a
// select-to-copy box when the clipboard is blocked). It is on the web preview at a hidden address (noindex, no link
// from the app, not cached offline) and left out of the store build. Runs on the dev server, or on the built site
// with SMOKE_DIST=1 (tools/test-dist.mjs).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';
import { inputsFor } from '../vite.config';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
const DIST = process.env.SMOKE_DIST === '1';
let server: { close(): Promise<void>; httpServer: import('node:http').Server | null };
let browser: Browser;
let base = '';
beforeAll(async () => {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  if (DIST) {
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

async function openPage(permissions: string[] = []) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, acceptDownloads: true, hasTouch: true });
  if (permissions.length) await ctx.grantPermissions(permissions, { origin: base });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}revision/index.html`);
  await page.waitForSelector('.rv-card');
  return { ctx, page, errors };
}

describe('word review page', () => {
  it('shows one entry with syllables and stress; Correcto, Editar and Dudoso; downloads the patch file', async () => {
    const { ctx, page, errors } = await openPage();
    expect(await page.getAttribute('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
    // A topic and level that still have unreviewed words (A1 to B1 are all reviewed).
    await page.selectOption('select[aria-label="Tema"]', 'sociedad');
    await page.selectOption('select[aria-label="Nivel"]', 'C1');
    expect(await page.textContent('.rv-word')).toBeTruthy();
    expect(await page.locator('.rv-syl.is-stressed').count()).toBe(1);
    expect(await page.textContent('.rv-stress')).toMatch(/aguda|llana|esdrújula/);
    const total = Number((await page.textContent('.rv-nav .rv-count'))!.split('/')[1]);
    await page.click('button:has-text("✓ Correcto")');
    expect(Number((await page.textContent('.rv-nav .rv-count'))!.split('/')[1])).toBe(total - 1);
    await page.click('button:has-text("✎ Editar")');
    await page.fill('input[name="en"]', 'edited in test');
    await page.click('button:has-text("Guardar")');
    await page.click('button:has-text("⚑ Dudoso")');
    await page.fill('textarea[name="note"]', '¿Es A1?');
    await page.click('button:has-text("Marcar como dudoso")');
    await page.reload();
    await page.waitForSelector('.rv-card');
    expect(await page.textContent('.rv-filters .rv-count')).toContain('3 decididas');
    // Descargar: a .json file with the three decisions.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="download"]')]);
    expect(dl.suggestedFilename()).toMatch(/^revision-\d{4}-\d{2}-\d{2}\.json$/);
    const patch = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(patch).toMatchObject({ app: 'kaizer-games', kind: 'word-review' });
    const byStatus = Object.fromEntries(patch.decisions.map((d: { status: string }) => [d.status, d]));
    expect(byStatus.edited.changes).toEqual({ translations: { en: 'edited in test', ru: expect.any(String) } });
    expect(byStatus.doubt.note).toBe('¿Es A1?');
    expect(await page.textContent('[role="status"]')).toContain('Archivos > Descargas');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await ctx.close();
    expect(errors).toEqual([]);
  }, 90_000);

  it('Copiar puts the same JSON on the clipboard; if the clipboard is blocked, shows it selected to copy by hand', async () => {
    const ok = await openPage(['clipboard-read', 'clipboard-write']);
    await ok.page.click('button:has-text("✓ Correcto")');
    await ok.page.click('[data-export="copy"]');
    expect(await ok.page.textContent('[role="status"]')).toContain('Copiado');
    const text = await ok.page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(text)).toMatchObject({ kind: 'word-review', decisions: [expect.objectContaining({ status: 'ok' })] });
    await ok.ctx.close();
    const blocked = await openPage();
    await blocked.page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } }); });
    await blocked.page.click('button:has-text("✓ Correcto")');
    await blocked.page.click('[data-export="copy"]');
    await blocked.page.waitForSelector('.rv-export-text');
    const sel = await blocked.page.evaluate(() => { const t = document.querySelector<HTMLTextAreaElement>('.rv-export-text')!; return { json: JSON.parse(t.value).kind, selected: t.selectionEnd - t.selectionStart === t.value.length }; });
    expect(sel).toEqual({ json: 'word-review', selected: true });
    await blocked.ctx.close();
  }, 90_000);

  it('Compartir appears only where the browser can share files', async () => {
    const { ctx, page } = await openPage();
    const can = await page.evaluate(() => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] }));
    expect(await page.locator('[data-export="share"]').count()).toBe(can ? 1 : 0);
    await ctx.close();
  }, 60_000);

  it('is on the web preview at a hidden address, not cached offline, and left out of the store build', () => {
    expect(Object.keys(inputsFor('production'))).toContain('revision');
    expect(Object.keys(inputsFor('store'))).not.toContain('revision');
    // No link from the app.
    const src = (d: string): string[] => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? src(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
    for (const f of src('src').filter((f) => !f.replace(/\\/g, '/').includes('src/revision/'))) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/revision\/|revision\/index\.html/);
    if (DIST) {
      expect(readFileSync(join(ROOT, 'dist/revision/index.html'), 'utf8')).toContain('noindex');
      expect(readFileSync(join(ROOT, 'dist/sw.js'), 'utf8')).not.toMatch(/revision\/index\.html|assets\/revision-/); // ("revision" alone is Workbox's hash field)
    }
  });
});
