import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, parseColor } from '../src/ui/contrast';
// @ts-expect-error plain JS build tool
import { checkContrast } from '../tools/check-contrast.mjs';
// @ts-expect-error plain JS build tool
import { parseTokens, resolve } from '../tools/lib.mjs';
import { publicFile } from './helpers';

type R = { ok: boolean; theme: string };

describe('contrast', () => {
  it('parses colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#2B2D42')).toEqual([43, 45, 66]);
    expect(parseColor('rgb(1 2 3 / .5)')).toEqual([1, 2, 3]);
  });
  it('matches WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#2B2D42', '#FFF4E0')).toBeCloseTo(12.38, 1);
  });
  it('all component pairs pass in every theme', () => {
    const res: R[] = checkContrast();
    expect(res.filter((r) => !r.ok)).toEqual([]);
    expect(new Set(res.map((r) => r.theme))).toEqual(new Set(['brote', 'night']));
  });
  it('night theme uses the given values', () => {
    const t = parseTokens(readFileSync(publicFile('tokens.css'), 'utf8')).themes.night;
    expect(resolve(t, '--bg')).toBe('#1E2440');
    expect(resolve(t, '--star')).toBe('#FFE9A8');
    expect(resolve(t, '--line')).toBe('#8FD3C1');
  });
  it('fails a pair that is too low', () => {
    const css = readFileSync(publicFile('tokens.css'), 'utf8').replace('--forest: #2A7360;', '--forest: #9FD0C0;');
    expect((checkContrast(css) as R[]).some((r) => !r.ok)).toBe(true);
  });
});
