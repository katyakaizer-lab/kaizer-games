// Loads every screen and fails on any console error or uncaught error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, setupPage } from './helpers';

const PET = JSON.stringify({ species: 'fox', name: 'Zorro' });
const SETTINGS = JSON.stringify({ lang: 'en', sound: false, soundOffered: true, reduceMotion: true, textSize: 'normal' });
const now = Date.now();
const PROGRESS = JSON.stringify({ cleared: {
  'c-a1-001': { firstAt: now - 2e8, step: 0, due: now - 1000, reviews: 0, hints: 0 },
  ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`c-story-farolero-${i + 1}`, { firstAt: now, step: 0, due: now + 8.64e7, reviews: 0, hints: 0 }])),
} });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('smoke: every screen loads without console errors', () => {
  let errors: unknown[] = [];
  const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); };
  beforeEach(() => {
    errors = [];
    vi.resetModules();
    mockFetch();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a); });
    window.addEventListener('error', onError);
  });
  afterEach(() => { window.removeEventListener('error', onError); vi.restoreAllMocks(); location.hash = ''; });

  it('first launch goes to the pet picker', async () => {
    setupPage('brote', './');
    await import('../src/main');
    await wait(100);
    expect(location.hash).toBe('#picker');
    expect(document.querySelectorAll('.picker__pet').length).toBe(5);
    expect(errors).toEqual([]);
  });

  const screens: [string, string, string][] = [
    ['home', '#home', '.home__games'],
    ['settings', '#settings', '.set__group'],
    ['picker (change pet)', '#picker', '.picker__pet[aria-pressed="true"]'],
    ['constelaciones map', '#game/constelaciones', '.cz-map__star'],
    ['constelaciones play', '#game/constelaciones/play/map/c-b1-005', '.cz-star'],
    ['constelaciones stories', '#game/constelaciones/story', '.cz-story'],
    ['constelaciones memory', '#game/constelaciones/memory', '.cz-map__star.is-due'],
    ['constelaciones memory play', '#game/constelaciones/play/memory/c-a1-001', '.cz-board[data-labels="hidden"]'],
    ['constelaciones story reader', '#game/constelaciones/read/farolero', '.cz-reader__text p'],
    ['constelaciones listen', '#game/constelaciones/listen', '.cz-view'],
    ['solitario levels', '#game/solitario', '.sol-level'],
    ['solitario play', '#game/solitario/play/A1', '.sol-col .sol-card'],
    ['solitario B2', '#game/solitario/play/B2/seed-3', '.sol-slots .sol-slot'],
  ];
  for (const [name, hash, selector] of screens) {
    it(name, async () => {
      localStorage.setItem('kz.pet', PET);
      localStorage.setItem('kz.settings', SETTINGS);
      localStorage.setItem('kz.cz.progress', PROGRESS);
      setupPage('brote', './');
      location.hash = hash;
      await import('../src/main');
      for (let i = 0; i < 40 && !document.querySelector(selector); i++) await wait(50);
      expect(document.querySelector(selector), selector).not.toBeNull();
      expect(errors).toEqual([]);
    });
  }

  it('style-test page', async () => {
    setupPage('brote', '../');
    await import('../src/style-test/main');
    await wait(50);
    expect(document.getElementById('app')!.children.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('style-test switches to the night theme with no errors', async () => {
    setupPage('brote', '../');
    await import('../src/style-test/main');
    (document.querySelectorAll<HTMLButtonElement>('[role=tab]')[1]).click();
    await wait(50);
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(errors).toEqual([]);
  });
});
