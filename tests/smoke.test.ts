// Loads every screen and fails on any console error or uncaught error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, setupPage } from './helpers';

const screens: [string, () => Promise<unknown>, string][] = [
  ['shell', () => import('../src/main'), './'],
  ['style-test', () => import('../src/style-test/main'), '../'],
];

describe('smoke: every screen loads without console errors', () => {
  let errors: unknown[] = [];
  const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); };
  beforeEach(() => {
    errors = [];
    vi.resetModules();
    mockFetch();
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a); });
    window.addEventListener('error', onError);
  });
  afterEach(() => { window.removeEventListener('error', onError); vi.restoreAllMocks(); });

  for (const [name, load, root] of screens) {
    it(name, async () => {
      setupPage('brote', root);
      await load();
      await new Promise((r) => setTimeout(r, 50));
      expect(document.getElementById('app')!.children.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }

  it('style-test switches to the night theme with no errors', async () => {
    setupPage('brote', '../');
    await import('../src/style-test/main');
    (document.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(errors).toEqual([]);
  });
});
