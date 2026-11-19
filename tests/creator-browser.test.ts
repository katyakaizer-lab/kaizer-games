// @vitest-environment node
// The pet creator in a real browser at 375px: Especie -> Raza -> Colores -> Nombre with a live preview, tap targets
// of at least 44px, keyboard choice, "Sorpréndeme", an optional name (default: the breed name), saving, and editing
// later without touching stars. Also the style-test "Mascotas" gallery: every breed drawn, each with the boina.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, preview } from 'vite';
import { ROOT } from './helpers';

const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
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

async function newPage(init: Record<string, string> = {}): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, hasTouch: true });
  await page.addInitScript((st) => {
    if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1');
    localStorage.setItem('kz.settings', JSON.stringify({ lang: 'es', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' }));
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, init);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, errors };
}
/** Layout checks on the current step. */
const stepProblems = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw) out.push('sideways scroll');
  for (const el of document.querySelectorAll<HTMLElement>('.creator__choice, .creator__nav .k-btn, .creator .k-btn')) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.width < 43.5 || r.height < 43.5)) out.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${el.textContent?.trim() || el.getAttribute('for')}`);
  }
  if (!document.querySelector('.creator__preview svg[data-art-kind="pet"]')) out.push('no live preview');
  const fig = document.querySelector('.creator__preview figure');
  if (!fig?.getAttribute('aria-label')) out.push('preview has no description');
  return out;
});
const next = (page: Page) => page.click('.creator__nav button:has-text("Siguiente")');

describe('pet creator', () => {
  it('first launch: species, breed, colours, name; then home shows the pet', async () => {
    const { page, errors } = await newPage();
    await page.goto(base + 'index.html');
    await page.waitForSelector('.creator__preview svg');
    expect(await page.textContent('.creator__step-label')).toContain('Paso 1 de 4');
    expect(await stepProblems(page)).toEqual([]);
    // Keyboard: Tab into the species group and choose with the arrow keys.
    await page.focus('#cr-species-dog');
    await page.keyboard.press('ArrowRight');
    expect(await page.isChecked('#cr-species-cat')).toBe(true);
    await page.click('label[for="cr-species-dog"]');
    await next(page);
    expect(await page.textContent('.creator__step-label')).toContain('Raza');
    await page.click('label[for="cr-breed-salchicha"]');
    expect(await page.getAttribute('.creator__preview figure', 'data-breed')).toBe('salchicha');
    expect(await stepProblems(page)).toEqual([]);
    await next(page);
    // Colours: a swatch changes the preview's variable; a pattern changes the description.
    await page.click('label[for="cr-fur1-7A4E2E"]');
    expect(await page.evaluate(() => document.querySelector<HTMLElement>('.creator__preview figure')!.style.getPropertyValue('--fur-1'))).toBe('#7A4E2E');
    // The pattern's colour is offered once a pattern is chosen; the description follows every swatch.
    expect(await page.$('fieldset[data-slot="fur3"]')).toBe(null);
    await page.click('label[for="cr-pattern-chest"]');
    await page.click('label[for="cr-fur3-FAF6EF"]');
    expect(await page.textContent('.creator__preview-desc')).toBe('Perro salchicha, marrón con pecho blanco');
    await page.click('label[for="cr-fur3-3A2A22"]');
    expect(await page.textContent('.creator__preview-desc')).toBe('Perro salchicha, marrón con pecho negro');
    expect(await page.textContent('.creator')).toContain('Fantasía');
    expect(await stepProblems(page)).toEqual([]);
    // Scrolled to the bottom, the last row of swatches is above the Atrás / Siguiente bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gapPx = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.creator__colors .creator__swatches, .creator__colors .creator__chips')];
      const last = rows[rows.length - 1].getBoundingClientRect();
      return document.querySelector('.creator__nav')!.getBoundingClientRect().top - last.bottom;
    });
    expect(gapPx).toBeGreaterThanOrEqual(8);
    await next(page);
    // Name: optional; the default is the breed name.
    expect(await page.getAttribute('#cr-name', 'placeholder')).toBe('Salchicha');
    // Gender: wording only (Perra salchicha, rojiza); the drawing stays the same.
    const before = await page.innerHTML('.creator__preview .k-pet__body');
    await page.click('label[for="cr-gender-f"]');
    expect(await page.textContent('.creator__preview-desc')).toBe('Perra salchicha, marrón con pecho negro');
    expect((await page.innerHTML('.creator__preview .k-pet__body')).replace(/d+__/g, '')).toBe(before.replace(/d+__/g, ''));
    await page.click('.creator__nav button:has-text("Empezar")');
    await page.waitForSelector('.home__pet svg');
    const saved = await page.evaluate(() => ({ pets: JSON.parse(localStorage.getItem('kz.pets')!), active: JSON.parse(localStorage.getItem('kz.activePetId')!) }));
    expect(saved.pets).toHaveLength(1);
    expect(saved.pets[0]).toMatchObject({ species: 'dog', breed: 'salchicha', name: 'Salchicha', pattern: 'chest', gender: 'f' });
    expect(saved.active).toBe(saved.pets[0].id);
    await page.close();
    expect(errors).toEqual([]);
  }, 90_000);

  it('Sorpréndeme gives a valid look; editing later keeps stars and the pet id', async () => {
    const { page, errors } = await newPage({ 'kz.pet': JSON.stringify({ species: 'cat', name: 'Michi' }), 'kz.rewards.wallet': JSON.stringify({ balance: 9, earned: 9, byGame: {}, owned: [], recent: [] }) });
    await page.goto(base + 'index.html#pet');
    await page.waitForSelector('.creator__preview svg');
    expect(await page.textContent('h1')).toContain('Edita tu mascota');
    expect(await page.textContent('.creator__preview-name')).toBe('Michi');
    await next(page);
    // Breed cards keep the capital; the species card for Cuervo is just "Cuervo".
    expect(await page.textContent('label[for="cr-breed-negro"] .creator__card-name')).toBe('Negro');
    expect(await page.getAttribute('#cr-breed-negro', 'aria-label')).toBe('Gato negro');
    // Gato Negro: main colour locked (not offered), eyes still free; Siamés: body shade and points only.
    await page.click('label[for="cr-breed-negro"]');
    await next(page);
    expect(await page.$('fieldset[data-slot="fur1"]')).toBe(null);
    expect(await page.$('fieldset[data-slot="eyes"]')).not.toBe(null);
    expect(await page.textContent('.creator__preview-desc')).toBe('Gato negro');
    await page.click('.creator__nav button:has-text("Atrás")');
    await page.click('label[for="cr-breed-siames"]');
    await next(page);
    expect(await page.$$eval('.creator__colors fieldset[data-slot]', (f) => f.map((x) => x.getAttribute('data-slot')))).toEqual(['fur1', 'fur2']);
    expect(await page.textContent('fieldset[data-slot="fur2"] legend')).toBe('Color de las puntas');
    for (let i = 0; i < 6; i++) {
      await page.click('.creator button:has-text("Sorpréndeme")');
      const ok = await page.evaluate(() => !!document.querySelector('.creator__preview svg[data-art-kind="pet"] [data-slot="head"]'));
      expect(ok).toBe(true);
    }
    await next(page);
    await page.fill('#cr-name', 'Luna');
    await page.click('.creator__nav button:has-text("Guardar")');
    await page.waitForURL(/#settings/);
    const st = await page.evaluate(() => ({ pets: JSON.parse(localStorage.getItem('kz.pets')!), wallet: JSON.parse(localStorage.getItem('kz.rewards.wallet')!) }));
    expect(st.pets).toHaveLength(1);
    expect(st.pets[0]).toMatchObject({ id: 'pet-1', species: 'cat', name: 'Luna' });
    expect(st.wallet.balance).toBe(9);
    await page.close();
    expect(errors).toEqual([]);
  }, 90_000);
});

describe('Mascotas gallery (style-test page)', () => {
  for (const theme of ['brote', 'night']) {
    it(`every breed in two colour sets with the boina (${theme})`, async () => {
      const { page, errors } = await newPage();
      await page.goto(`${base}style-test/index.html?theme=${theme}`);
      await page.waitForSelector('.st-mascotas .st-pet svg[data-art-kind="pet"]');
      // Parts load asynchronously: wait until every figure is drawn (not a fixed time).
      await page.waitForFunction(() => [...document.querySelectorAll(".st-mascotas .st-pet")].every((f) => f.querySelector("svg [data-slot=\"body\"]")), null, { timeout: 20_000 });
      // Wait until every beret image has loaded (they load with the pet, not lazily).
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.st-mascotas img.k-pet__item')].every((i) => i.complete), null, { timeout: 15_000 });
      const r = await page.evaluate(() => {
        const figs = [...document.querySelectorAll('.st-mascotas .st-pet')];
        const items = figs.map((f) => f.querySelector<HTMLElement>('.k-pet__item'));
        const shown = items.filter((el) => {
          if (!el) return false;
          const b = el.getBoundingClientRect();
          const loaded = el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : true;
          const st = getComputedStyle(el);
          return loaded && b.width > 10 && b.height > 10 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.5;
        }).length;
        return { figs: figs.length, drawn: figs.filter((f) => f.querySelector('svg [data-slot="body"]')).length, itemLayers: items.filter(Boolean).length, shown };
      });
      await page.close();
      expect(r).toEqual({ figs: 50, drawn: 50, itemLayers: 50, shown: 50 });
      expect(errors).toEqual([]);
    }, 60_000);
  }
});
