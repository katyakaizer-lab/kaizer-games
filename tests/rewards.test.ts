import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _setBackend, exportProgress, importProgress, store } from '../src/data/storage';
import { awardStars, canSpend, getStars, getWallet, onWallet, spend } from '../src/rewards/wallet';
import { STARS } from '../src/rewards/config';
import { nearMiss, nearMissText, bare } from '../src/lang/es/accents';
import { vibrate } from '../src/app/haptics';

beforeEach(() => { _setBackend(null); });

describe('stars wallet', () => {
  it('awards stars per game; amounts below 1 are ignored (stars are never taken away)', () => {
    awardStars('crucigramas', 3, 'finish');
    awardStars('solitario', 1, 'category');
    awardStars('crucigramas', 0, 'nothing');
    awardStars('crucigramas', -5, 'never');
    const w = getWallet();
    expect(w.balance).toBe(4);
    expect(w.earned).toBe(4);
    expect(w.byGame).toEqual({ crucigramas: 3, solitario: 1 });
    expect(w.recent[0]).toMatchObject({ game: 'solitario', amount: 1 });
  });
  it('survives saving to a file and loading it back, and is part of a reset', () => {
    awardStars('crucigramas', 7, 'words');
    const file = JSON.stringify(exportProgress());
    store.clear();
    expect(getStars()).toBe(0);
    expect(importProgress(file)).toEqual({ ok: true });
    expect(getStars()).toBe(7);
    store.clear(); // "reset progress" in Settings
    expect(getStars()).toBe(0);
  });
  it('is ready for the pet shop: spending needs enough stars and keeps what was earned', () => {
    awardStars('crucigramas', 5, 'x');
    expect(canSpend(6)).toBe(false);
    expect(spend(6, 'hat')).toBe(false);
    expect(spend(4, 'hat')).toBe(true);
    const w = getWallet();
    expect(w.balance).toBe(1);
    expect(w.earned).toBe(5);
    expect(w.owned).toEqual(['hat']);
  });
  it('tells listeners about awards', () => {
    const fn = vi.fn();
    const off = onWallet(fn);
    awardStars('constelaciones', 2, 'lit');
    off();
    awardStars('constelaciones', 2, 'lit');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('crossword values: 1 per word, +3 to finish, bonus for less help, none subtracted for hints', () => {
    expect(STARS.crucigramas.word).toBe(1);
    expect(STARS.crucigramas.finish).toBe(3);
    expect(STARS.crucigramas.helpBonus).toEqual({ none: 3, little: 1, normal: 0 });
  });
});

describe('accent and ñ check (shared)', () => {
  it('Ó/O, É/E, Í/I, Ú/U, Ü/U and Ñ/N are near misses; other letters are not', () => {
    expect(nearMiss('O', 'Ó')).toBe('accent');
    expect(nearMiss('E', 'É')).toBe('accent');
    expect(nearMiss('i', 'Í')).toBe('accent');
    expect(nearMiss('U', 'Ü')).toBe('accent');
    expect(nearMiss('N', 'Ñ')).toBe('enye');
    expect(nearMiss('Ó', 'O')).toBe('accent'); // an extra accent
    expect(nearMiss('O', 'O')).toBe(null);
    expect(nearMiss('A', 'Ó')).toBe(null);
    expect(bare('Ñ')).toBe('N');
  });
  it('messages', () => {
    expect(nearMissText('accent', 'Ó')).toBe('¡Casi! Falta la tilde: Ó');
    expect(nearMissText('enye', 'Ñ')).toBe('¡Casi! Es Ñ');
  });
});

describe('haptics', () => {
  it('vibrates where supported, respects the setting and reduced motion, never throws', () => {
    const vib = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true });
    expect(vibrate(60)).toBe(true);
    expect(vib).toHaveBeenCalledWith(60);
    store.set('settings', { vibration: false });
    expect(vibrate(60)).toBe(false);
    store.set('settings', { vibration: true, reduceMotion: true });
    expect(vibrate(60)).toBe(false);
    store.set('settings', { vibration: true });
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); // iOS Safari
    expect(() => vibrate(60)).not.toThrow();
    expect(vibrate(60)).toBe(false);
  });
});
