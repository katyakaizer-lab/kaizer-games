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

const SCREENS = ['index.html', 'style-test/index.html', 'style-test/index.html?theme=night'];
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
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + screen, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!document.querySelector('#app')?.children.length);
        if (screen.startsWith('style-test')) await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
        await page.waitForTimeout(300);
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
