// Spanish language engines (src/lang/es): stress, numbers, conjugation (100 verbs from hand-checked tables).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';
import { accentOk, diacriticPair, spellWithStress, stress, vowelContacts } from '../src/lang/es/stress';
import { countNoun, date, numberToWords, ordinal, price, wordsToNumber, year } from '../src/lang/es/numbers';
import { attach, conjugate, guessModel, modelProblems } from '../src/lang/es/conjugate';
import { syllabify } from '../src/lang/es/syllabify';

describe('stress', () => {
  const t = (w: string) => { const s = stress(w); return `${s.syllables.join('-')} ${s.type} ${s.needsAccent ? 'tilde' : '-'}`; };
  it('classifies words and says whether they need a written accent', () => {
    expect(t('canción')).toBe('can-ción aguda tilde');
    expect(t('pared')).toBe('pa-red aguda -');
    expect(t('casa')).toBe('ca-sa llana -');
    expect(t('árbol')).toBe('ár-bol llana tilde');
    expect(t('examen')).toBe('e-xa-men llana -');
    expect(t('exámenes')).toBe('e-xá-me-nes esdrújula tilde');
    expect(t('música')).toBe('mú-si-ca esdrújula tilde');
    expect(t('dígamelo')).toBe('dí-ga-me-lo sobresdrújula tilde');
    expect(t('robots')).toBe('ro-bots aguda -');
    expect(t('bíceps')).toBe('bí-ceps llana tilde');
    expect(t('reloj')).toBe('re-loj aguda -');
  });
  it('diphthongs and hiatus (an accented i/u breaks the diphthong; h does not separate vowels)', () => {
    expect(vowelContacts('ciudad')).toEqual({ diphthongs: ['iu'], hiatus: [] });
    expect(vowelContacts('país').hiatus).toEqual(['aí']);
    expect(vowelContacts('tío').hiatus).toEqual(['ío']);
    expect(vowelContacts('búho').hiatus).toEqual(['úo']);
    expect(vowelContacts('poeta').hiatus).toEqual(['oe']);
    expect(vowelContacts('guerra')).toEqual({ diphthongs: [], hiatus: [] }); // silent u
    expect(stress('país').reason).toMatch(/hiato/);
    expect(stress('tío').type).toBe('llana');
  });
  it('one-syllable words: no accent, except the diacritic pairs', () => {
    for (const [a, b] of [['tú', 'tu'], ['él', 'el'], ['sí', 'si'], ['más', 'mas'], ['mí', 'mi'], ['té', 'te'], ['sé', 'se'], ['dé', 'de']]) {
      expect(diacriticPair(a)?.plain).toBe(b);
      expect(diacriticPair(b)?.accented).toBe(a);
      expect(stress(a).needsAccent).toBe(true);
      expect(stress(b).needsAccent).toBe(false);
    }
    expect(diacriticPair('qué')?.with).toMatch(/pregunta/);
    expect(diacriticPair('como')?.accented).toBe('cómo');
    expect(stress('pie').needsAccent).toBe(false);
    expect(stress('guion').monosyllable).toBe(true);
    expect(accentOk('fue')).toBe(true);
  });
  it('accents written where the stress moves (pronouns attached)', () => {
    expect(spellWithStress('lavate', 0)).toBe('lávate');
    expect(spellWithStress('lavandose', 1)).toBe('lavándose');
    expect(attach('dime'.slice(0, 2), 'me')).toBe('dime');
    expect(attach('envía', 'te')).toBe('envíate');
    expect(attach('está', 'te')).toBe('estate');
    expect(attach('dé', 'me')).toBe('deme');
  });
  it('the syllable splitter is shared (src/lang/es/syllabify.ts)', () => {
    expect(syllabify('zanahoria')).toEqual(['za', 'na', 'ho', 'ria']);
    expect(syllabify('Pingüino')).toEqual(['Pin', 'güi', 'no']);
  });
});

describe('numbers', () => {
  it('number to words with the right accents', () => {
    const cases: [number, string][] = [[0, 'cero'], [1, 'uno'], [15, 'quince'], [16, 'dieciséis'], [21, 'veintiuno'], [22, 'veintidós'], [23, 'veintitrés'], [26, 'veintiséis'],
      [31, 'treinta y uno'], [100, 'cien'], [101, 'ciento uno'], [115, 'ciento quince'], [200, 'doscientos'], [500, 'quinientos'], [777, 'setecientos setenta y siete'],
      [1000, 'mil'], [1001, 'mil uno'], [2026, 'dos mil veintiséis'], [21000, 'veintiún mil'], [100000, 'cien mil'], [1_000_000, 'un millón'], [2_500_000, 'dos millones quinientos mil'],
      [999_999_999, 'novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve']];
    for (const [n, w] of cases) { expect(numberToWords(n)).toBe(w); expect(wordsToNumber(w)).toBe(n); }
  });
  it('gender and apocope before a noun', () => {
    expect(countNoun(21, 'euro', 'euros')).toBe('veintiún euros');
    expect(countNoun(1, 'euro', 'euros')).toBe('un euro');
    expect(countNoun(31, 'día', 'días')).toBe('treinta y un días');
    expect(countNoun(200, 'persona', 'personas', 'f')).toBe('doscientas personas');
    expect(countNoun(21, 'casa', 'casas', 'f')).toBe('veintiuna casas');
    expect(countNoun(200000, 'persona', 'personas', 'f')).toBe('doscientas mil personas');
    expect(countNoun(1_000_000, 'euro', 'euros')).toBe('un millón de euros');
    expect(countNoun(3_000_000, 'persona', 'personas', 'f')).toBe('tres millones de personas');
    expect(countNoun(1_500_000, 'euro', 'euros')).toBe('un millón quinientos mil euros');
    expect(wordsToNumber('veintiún')).toBe(21);
    expect(wordsToNumber('doscientas mil')).toBe(200000);
    expect(wordsToNumber('un millón de')).toBe(1_000_000);
    expect(wordsToNumber('gato')).toBe(null);
  });
  it('ordinals 1-20 (primer, tercer)', () => {
    expect(ordinal(1)).toBe('primero');
    expect(ordinal(1, { beforeNoun: true })).toBe('primer');
    expect(ordinal(3, { beforeNoun: true })).toBe('tercer');
    expect(ordinal(1, { gender: 'f' })).toBe('primera');
    expect(ordinal(7)).toBe('séptimo');
    expect(ordinal(13, { beforeNoun: true })).toBe('decimotercer');
    expect(ordinal(20)).toBe('vigésimo');
  });
  it('prices, years and dates', () => {
    expect(price(3.5)).toBe('tres euros con cincuenta');
    expect(price(1)).toBe('un euro');
    expect(price(21.05)).toBe('veintiún euros con cinco');
    expect(price(0.5)).toBe('cincuenta céntimos');
    expect(year(1995)).toBe('mil novecientos noventa y cinco');
    expect(year(2021)).toBe('dos mil veintiuno');
    expect(date({ y: 2026, m: 11, d: 19 }, { weekday: true })).toBe('jueves, diecinueve de noviembre de dos mil veintiséis');
    expect(date({ y: 2000, m: 1, d: 1 })).toBe('uno de enero de dos mil');
  });
});

describe('conjugation: 100 verbs against hand-checked tables', () => {
  const lines = readFileSync(join(ROOT, 'tests/fixtures/verbs-100.txt'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  it('has at least 100 verbs', () => expect(lines.length).toBeGreaterThanOrEqual(100));
  for (const line of lines) {
    const [head, pres, pret, impf, fut, cond, subj, sImpf, imp, neg, ger, part] = line.split('|').map((s) => s.trim());
    const [inf, model] = head.split(' ');
    it(inf, () => {
      const c = conjugate(inf, model);
      const got = [
        c.indicative.presente.join(' '), c.indicative.preterito.join(' '), `${c.indicative.imperfecto[0]} ${c.indicative.imperfecto[3]}`,
        c.indicative.futuro[0], c.indicative.condicional[0], c.subjunctive.presente.join(' '), `${c.subjunctive.imperfecto[0]} ${c.subjunctive.imperfecto[3]}`,
        `${c.imperative.affirmative.tu} ${c.imperative.affirmative.vosotros} ${c.imperative.affirmative.usted}`, c.imperative.negative.tu, c.gerund, c.participle,
      ];
      expect(got).toEqual([pres, pret, impf, fut, cond, subj, sImpf, imp, neg, ger, part]);
      expect(modelProblems(inf, model)).toEqual([]);
    });
  }
});

describe('conjugation: compound tenses, reflexives, models', () => {
  it('compound tenses use haber + participle', () => {
    const c = conjugate('escribir');
    expect(c.indicative.perfecto[0]).toBe('he escrito');
    expect(c.indicative.pluscuamperfecto[3]).toBe('habíamos escrito');
    expect(c.indicative.preteritoAnterior[2]).toBe('hubo escrito');
    expect(c.indicative.futuroPerfecto[1]).toBe('habrás escrito');
    expect(c.indicative.condicionalPerfecto[5]).toBe('habrían escrito');
    expect(c.subjunctive.perfecto[0]).toBe('haya escrito');
    expect(c.subjunctive.pluscuamperfecto[3]).toBe('hubiéramos escrito');
    expect(c.subjunctive.pluscuamperfectoSe[3]).toBe('hubiésemos escrito');
    expect(c.subjunctive.futuro[0]).toBe('escribiere');
    expect(c.subjunctive.imperfectoSe[0]).toBe('escribiese');
    expect(c.indicative.futuro.join(' ')).toBe('escribiré escribirás escribirá escribiremos escribiréis escribirán');
    expect(c.indicative.condicional.join(' ')).toBe('escribiría escribirías escribiría escribiríamos escribiríais escribirían');
  });
  it('reflexive verbs: pronouns, attached pronouns with accents', () => {
    const c = conjugate('lavarse');
    expect(c.indicative.presente[0]).toBe('me lavo');
    expect(c.indicative.perfecto[4]).toBe('os habéis lavado');
    expect(c.gerund).toBe('lavándose');
    expect(c.imperative.affirmative).toEqual({ tu: 'lávate', usted: 'lávese', nosotros: 'lavémonos', vosotros: 'lavaos', ustedes: 'lávense' });
    expect(c.imperative.negative).toEqual({ tu: 'no te laves', usted: 'no se lave', nosotros: 'no nos lavemos', vosotros: 'no os lavéis', ustedes: 'no se laven' });
    expect(conjugate('vestirse').imperative.affirmative.vosotros).toBe('vestíos');
    expect(conjugate('irse').imperative.affirmative).toMatchObject({ tu: 'vete', nosotros: 'vámonos', vosotros: 'idos' });
    expect(conjugate('ponerse').imperative.affirmative.tu).toBe('ponte');
    expect(conjugate('sentarse', 'e-ie').imperative.affirmative.tu).toBe('siéntate');
    expect(conjugate('dormirse', 'o-ue').gerund).toBe('durmiéndose');
    expect(conjugate('reírse').imperative.affirmative.vosotros).toBe('reíos');
  });
  it('family verbs follow their base (mantener, componer, deshacer, sonreír)', () => {
    expect(conjugate('deshacer').participle).toBe('deshecho');
    expect(conjugate('deshacer').indicative.preterito[2]).toBe('deshizo');
    expect(conjugate('sonreír').indicative.preterito[2]).toBe('sonrió');
    expect(conjugate('obtener').imperative.affirmative.tu).toBe('obtén');
    expect(conjugate('freír').participle).toBe('frito');
    expect(conjugate('volver', 'o-ue').indicative.presente[0]).toBe('vuelvo'); // not a "ver" verb
  });
  it('guesses models and checks declared ones', () => {
    expect(guessModel('buscar')).toBe('c-qu');
    expect(guessModel('conocer')).toBe('zc');
    expect(guessModel('mantener')).toBe('tener');
    expect(guessModel('construir')).toBe('i-y');
    expect(modelProblems('buscar', 'regular')).toEqual(['model should list the spelling change c-qu']);
    expect(modelProblems('hablar', 'c-qu')).toEqual(['spelling change c-qu does not apply to hablar']);
    expect(modelProblems('hablar', 'nope')).toEqual(['unknown model token "nope"']);
    expect(() => conjugate('mesa')).toThrow();
  });
});
