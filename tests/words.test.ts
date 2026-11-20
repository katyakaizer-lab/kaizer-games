// The shared word bank (src/data/words): content rules, engine predictions, the review patch.
import { describe, expect, it } from 'vitest';
import { loadWordFiles } from '../tools/words-lib';
import { clueGivesAway, predictGender, predictPlural, reviewCounts, validateWords } from '../src/words/rules';
import { applyPatch, diff, makePatch, patchName, type ReviewPatch } from '../src/revision/decisions';
import type { WordEntry } from '../src/words/types';

const { entries, topics, files } = loadWordFiles();

describe('word bank content', () => {
  it('passes the validator', () => {
    const r = validateWords(entries, topics);
    expect(r.errors).toEqual([]);
  });
  it('batch 1 size and levels', () => {
    const by = (l: string) => entries.filter((e) => e.level === l).length;
    expect(entries.length).toBeGreaterThanOrEqual(1900);
    expect(by('A1')).toBeGreaterThanOrEqual(450);
    expect(by('A2')).toBeGreaterThanOrEqual(550);
    expect(by('B1')).toBeGreaterThanOrEqual(750);
  });
  it('every agreed topic exists and has words; each entry sits in the file of its first topic', () => {
    const agreed = ['festividades', 'frutas', 'verduras', 'postres', 'desayuno', 'tapas', 'bebidas', 'ropa', 'accesorios', 'casa', 'muebles', 'cocina', 'animales', 'mascotas',
      'profesiones', 'transporte', 'ciudad', 'tiendas', 'naturaleza', 'tiempo', 'cuerpo', 'salud', 'deportes', 'musica', 'escuela', 'tecnologia', 'viajes', 'emociones', 'caracter',
      'familia', 'colores', 'aficiones', 'numeros', 'calendario', 'dinero', 'ambiente', 'trabajo', 'verbos', 'adjetivos'];
    const ids = topics.map((t) => t.id);
    for (const t of agreed) { expect(ids, t).toContain(t); expect(entries.filter((e) => e.topics.includes(t)).length, t).toBeGreaterThanOrEqual(15); }
    for (const f of files) for (const e of f.data.entries) expect(`${e.topics[0]}.json`).toBe(f.name);
  });
  it('names are stored without articles; gender is a separate field; reviewed is true or false', () => {
    for (const e of entries) {
      expect(e.lemma, e.id).not.toMatch(/^(el|la|los|las|un|una) /i);
      if (e.pos === 'noun') expect(['m', 'f', 'both', 'special'], e.id).toContain(e.gender);
      expect(typeof e.reviewed).toBe('boolean');
    }
    expect(entries.find((e) => e.id === 'agua')).toMatchObject({ gender: 'special' });
  });
  it('syllables, stress and accent type are not stored (the engines compute them)', () => {
    for (const e of entries) for (const k of ['syllables', 'stress', 'accent', 'stressType']) expect(e, `${e.id}.${k}`).not.toHaveProperty(k);
  });
  it('every verb has a model; regional variants and false friends where they matter', () => {
    for (const e of entries.filter((x) => x.pos === 'verb')) expect(e.verbModel, e.id).toBeTruthy();
    expect(entries.find((e) => e.id === 'coche')?.regions?.map((r) => r.es)).toContain('carro');
    expect(entries.find((e) => e.id === 'zumo')?.regions?.map((r) => r.es)).toContain('jugo');
    expect(entries.find((e) => e.id === 'ordenador')?.regions?.map((r) => r.es)).toContain('computadora');
    expect(entries.find((e) => e.id === 'embarazo')?.falseFriends?.en).toMatch(/embarrassed/);
  });
});

describe('predictions', () => {
  it('plural', () => {
    const cases: [string, string][] = [['casa', 'casas'], ['sofá', 'sofás'], ['café', 'cafés'], ['canción', 'canciones'], ['examen', 'exámenes'], ['joven', 'jóvenes'],
      ['lápiz', 'lápices'], ['pez', 'peces'], ['lunes', 'lunes'], ['crisis', 'crisis'], ['autobús', 'autobuses'], ['rey', 'reyes'], ['país', 'países'], ['maíz', 'maíces'],
      ['esquí', 'esquíes'], ['menú', 'menús'], ['taxi', 'taxis'], ['reloj', 'relojes'], ['árbol', 'árboles']];
    for (const [s, p] of cases) expect(predictPlural(s), s).toBe(p);
    expect(predictPlural('fin de semana')).toBe(null);
  });
  it('gender from the ending (none for -e, consonants, -ma, -á)', () => {
    expect(predictGender('canción')).toBe('f');
    expect(predictGender('ciudad')).toBe('f');
    expect(predictGender('vejez')).toBe('f');
    expect(predictGender('pez')).toBe(null);
    expect(predictGender('casa')).toBe('f');
    expect(predictGender('perro')).toBe('m');
    expect(predictGender('problema')).toBe(null);
    expect(predictGender('sofá')).toBe(null);
    expect(predictGender('leche')).toBe(null);
  });
  it('exceptions in the bank are marked, not hidden (la mano, el día, el mapa, la moto)', () => {
    for (const id of ['mano', 'dia', 'mapa', 'moto', 'foto', 'radio', 'planeta', 'clima']) expect(entries.find((e) => e.id === id)?.genderIrregular, id).toBe(true);
    expect(entries.find((e) => e.id === 'jersey')).toMatchObject({ plural: 'jerséis', pluralIrregular: true });
    expect(entries.find((e) => e.id === 'caracter')).toMatchObject({ plural: 'caracteres', pluralIrregular: true });
  });
  it('a clue never contains its answer (same rule as the crosswords)', () => {
    expect(clueGivesAway('estar', 'Verbo para decir dónde está algo')).toBe(true);
    expect(clueGivesAway('gallo', 'Macho de la gallina')).toBe(true);
    expect(clueGivesAway('uña', 'Me corto una')).toBe(false);
    expect(clueGivesAway('pan', 'Panadería del barrio')).toBe(false);
  });
});

describe('validator catches', () => {
  const broken = (f: (es: WordEntry[]) => void) => { const es = structuredClone(entries); f(es); return validateWords(es, topics).errors.join('\n'); };
  it('a repeated id, an unknown topic, a missing translation', () => {
    expect(broken((es) => { es[1].id = es[0].id; })).toMatch(/id repeats/);
    expect(broken((es) => { es[0].topics = ['nope']; })).toMatch(/unknown topic nope/);
    expect(broken((es) => { es[0].translations.ru = ''; })).toMatch(/translations/);
  });
  it('a clue with the answer, one clue only, two clues of the same type', () => {
    const casa = (es: WordEntry[]) => es.find((e) => e.id === 'casa')!;
    expect(broken((es) => { casa(es).clues[0].text = 'Una casa grande'; })).toMatch(/contains the answer/);
    expect(broken((es) => { casa(es).clues.length = 1; })).toMatch(/2 or 3 clues/);
    expect(broken((es) => { casa(es).clues[1].type = casa(es).clues[0].type; })).toMatch(/different types/);
  });
  it('a plural or gender that contradicts the rules without being marked; a verb that does not conjugate', () => {
    expect(broken((es) => { es.find((e) => e.id === 'casa')!.plural = 'cases'; })).toMatch(/rules predict casas/);
    expect(broken((es) => { delete es.find((e) => e.id === 'mano')!.genderIrregular; })).toMatch(/ending suggests m/);
    expect(broken((es) => { es.find((e) => e.id === 'hablar')!.verbModel = 'nope'; })).toMatch(/unknown model token/);
    expect(broken((es) => { es.find((e) => e.id === 'buscar')!.verbModel = 'regular'; })).toMatch(/c-qu/);
  });
});

describe('review patch', () => {
  it('Correcto and Editar mark reviewed (with the edits); Dudoso keeps it unreviewed with the note', () => {
    const es = structuredClone(entries); for (const e of es) e.reviewed = false;
    const casa = es.find((e) => e.id === 'casa')!;
    const changes = diff(casa, { ...casa, translations: { en: 'house', ru: 'дом, жилище' } });
    expect(changes).toEqual({ translations: { en: 'house', ru: 'дом, жилище' } });
    const patch: ReviewPatch = makePatch({
      perro: { id: 'perro', status: 'ok', at: 'x' },
      casa: { id: 'casa', status: 'edited', changes, at: 'x' },
      gato: { id: 'gato', status: 'doubt', note: '¿Gata también?', at: 'x' },
      nope: { id: 'nope', status: 'ok', at: 'x' },
    }, new Date('2026-11-20T10:00:00Z'));
    expect(patchName(new Date('2026-11-20T10:00:00Z'))).toBe('revision-2026-11-20.json');
    const r = applyPatch(es, patch);
    expect(r).toEqual({ applied: 2, doubtful: 1, missing: ['nope'], badFields: [] });
    expect(es.find((e) => e.id === 'perro')!.reviewed).toBe(true);
    expect(es.find((e) => e.id === 'casa')).toMatchObject({ reviewed: true, translations: { ru: 'дом, жилище' } });
    expect(es.find((e) => e.id === 'gato')).toMatchObject({ reviewed: false, reviewNote: '¿Gata también?' });
    expect(validateWords(es, topics).errors).toEqual([]);
    expect(reviewCounts(es).byLevel.A1[0]).toBe(3 - 1);
  });
  it('rejects a file that is not a word review patch and fields that cannot be edited', () => {
    expect(() => applyPatch(structuredClone(entries), { app: 'x' } as unknown as ReviewPatch)).toThrow();
    const r = applyPatch(structuredClone(entries), { app: 'kaizer-games', kind: 'word-review', date: '', decisions: [{ id: 'casa', status: 'edited', changes: { id: 'x' } as never, at: '' }] });
    expect(r.badFields).toEqual(['casa.id']);
  });
});
