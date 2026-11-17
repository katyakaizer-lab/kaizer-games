import { afterEach, describe, expect, it } from 'vitest';
import { _setBackend, exportProgress, importProgress, store, usingMemoryFallback } from '../src/data/storage';

describe('storage', () => {
  afterEach(() => _setBackend(undefined));

  it('round-trips values in localStorage', () => {
    _setBackend(undefined);
    store.set('pet', { id: 'cat', name: 'Michi' });
    expect(store.get('pet', null)).toEqual({ id: 'cat', name: 'Michi' });
  });
  it('falls back to memory when localStorage is unavailable', () => {
    _setBackend(null);
    expect(usingMemoryFallback()).toBe(true);
    store.set('x', 1);
    expect(store.get('x', 0)).toBe(1);
  });
  it('survives a storage that throws on every call', () => {
    const boom = () => { throw new Error('blocked'); };
    const throwing = { getItem: boom, setItem: boom, removeItem: boom, key: () => null, length: 0, clear() {} } as unknown as Storage;
    _setBackend(throwing);
    store.set('y', 'ok');
    expect(store.get('y', '')).toBe('ok');
  });
  it('exports and imports a progress file', () => {
    _setBackend(null);
    store.set('settings', { lang: 'es' });
    store.set('cleared', ['c-a1-001']);
    const file = JSON.stringify(exportProgress(new Date('2026-11-17T10:00:00Z')));
    store.clear();
    expect(store.get('cleared', null)).toBe(null);
    expect(importProgress(file)).toEqual({ ok: true });
    expect(store.get('cleared', null)).toEqual(['c-a1-001']);
  });
  it('rejects files that are not ours', () => {
    expect(importProgress('nope')).toEqual({ ok: false, error: 'not-json' });
    expect(importProgress('{"app":"other"}')).toEqual({ ok: false, error: 'wrong-file' });
  });
});
