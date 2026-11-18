import { describe, expect, it } from 'vitest';
import { hyphenated, softHyphenate } from '../src/games/shared/syllabify';

describe('Spanish syllable splitter (soft hyphens for card words)', () => {
  const cases: [string, string][] = [
    ['naranja', 'na-ran-ja'], ['cuchara', 'cu-cha-ra'], ['zanahoria', 'za-na-ho-ria'], ['carnicería', 'car-ni-ce-ría'],
    ['floristería', 'flo-ris-te-ría'], ['Palomitas', 'Pa-lo-mi-tas'], ['guitarra', 'gui-ta-rra'], ['queso', 'que-so'],
    ['biblioteca', 'bi-blio-te-ca'], ['aeropuerto', 'ae-ro-puer-to'], ['construcción', 'cons-truc-ción'],
    ['instrumento', 'ins-tru-men-to'], ['perro', 'pe-rro'], ['llave', 'lla-ve'], ['champú', 'cham-pú'],
    ['pierna', 'pier-na'], ['campana', 'cam-pa-na'], ['abuela', 'abue-la'], ['cabeza', 'ca-be-za'],
  ];
  for (const [word, want] of cases) it(`${word} -> ${want}`, () => expect(hyphenated(word)).toBe(want));
  it('never leaves a single letter alone at either end', () => {
    for (const w of ['oveja', 'abrigo', 'uva', 'oso', 'aeropuerto', 'río', 'tío']) {
      const parts = softHyphenate(w).split('­');
      expect(parts[0].length > 1 || parts.length === 1, w).toBe(true);
      expect(parts[parts.length - 1].length > 1 || parts.length === 1, w).toBe(true);
    }
  });
  it('keeps spaces between words and splits each word', () => expect(hyphenated('Medios de transporte')).toBe('Me-dios de trans-por-te'));
});
