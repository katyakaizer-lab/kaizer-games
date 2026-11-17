import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

export const ROOT = join(__dirname, '..');
export const publicFile = (p: string) => join(ROOT, 'public', p);

/** fetch() that serves files from public/, like the static host would. */
export function mockFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input).replace(/^https?:\/\/[^/]+\//, '').replace(/^(\.\.\/|\.\/)+/, '');
    const p = publicFile(url);
    if (!existsSync(p)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(p), { status: 200, headers: { 'content-type': url.endsWith('.json') ? 'application/json' : 'text/plain' } });
  }));
}

export function setupPage(theme = 'brote', appRoot = './'): void {
  document.documentElement.dataset.theme = theme;
  document.head.innerHTML = '<meta name="app-root" content="' + appRoot + '">';
  document.body.innerHTML = '<main id="app"></main>';
}
