import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain JS build tool
import { checkFonts } from '../tools/check-fonts.mjs';
// @ts-expect-error plain JS build tool
import { checkArt } from '../tools/check-art.mjs';
// @ts-expect-error plain JS build tool
import { checkHardcoded } from '../tools/check-hardcoded.mjs';
import { missingKeys, setLang, t } from '../src/i18n';
import en from '../src/i18n/en.json';
import { publicFile } from './helpers';

type R = { ok: boolean };

describe('build checks', () => {
  it('fonts cover Spanish', () => {
    expect((checkFonts() as R[]).filter((r) => !r.ok)).toEqual([]);
  });
  it('font check fails when a face does not cover accents', () => {
    const css = readFileSync(publicFile('tokens.css'), 'utf8').replace(/unicode-range: U\+0000-00FF,/g, 'unicode-range: U+0000-007F,');
    expect((checkFonts(css) as R[]).some((r) => !r.ok)).toBe(true);
  });
  it('art manifest is valid', () => {
    expect(checkArt().errors).toEqual([]);
  });
  it('no colours or font names outside tokens.css', () => {
    expect(checkHardcoded().problems).toEqual([]);
  });
});

describe('i18n', () => {
  it('English is complete and other languages fall back per key', () => {
    expect(missingKeys().en).toEqual([]);
    setLang('ru');
    expect(t('common.close')).toBe('Закрыть');
    expect(t('settings.progressNote')).toBe(en['settings.progressNote']);
    setLang('en');
  });
});
