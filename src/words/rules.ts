/**
 * Word bank rules: what the engines predict (plural, gender, syllables, stress) and the validator.
 * Pure code (no DOM, no Vite): used by tools/validate-words.ts, the build report, tests and the review screen.
 */
import { stress, spellWithStress, type StressInfo } from '../lang/es/stress.ts';
import { syllabify } from '../lang/es/syllabify.ts';
import { conjugate, modelProblems } from '../lang/es/conjugate.ts';
import { CLUE_TYPES, GENDERS, POS, WORD_LEVELS, type TopicDef, type WordEntry } from './types.ts';

const VOWELS = 'aeiouáéíóú';
const fold = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'ñ');
/** Folds accents but keeps ñ (uña is not una). */
export const foldKeepEnye = (s: string) => s.toLocaleLowerCase('es').replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');

/** The regular plural of a noun or adjective (one word), or null when it has none to predict (expressions). */
export function predictPlural(word: string): string | null {
  const w = word.trim();
  if (!w || /\s/.test(w)) return null;
  const s = stress(w);
  const last = w.slice(-1).toLocaleLowerCase('es');
  const stressedLast = s.stressed === s.syllables.length - 1;
  // Unstressed vowel, or stressed á é ó: + s (casas, sofás, cafés, dominós).
  if ('aeo'.includes(last) || ('áéó'.includes(last))) return `${w}s`;
  if ('iu'.includes(last) && !stressedLast) return `${w}s`; // taxi -> taxis, tribu -> tribus
  if (last === 'í') return `${w}es`; // esquí -> esquíes (esquís also correct)
  if (last === 'ú') return `${w}s`; // menú -> menús
  // -s / -x in a word not stressed on the last syllable: invariable (lunes, crisis, tórax).
  if ((last === 's' || last === 'x') && !stressedLast && s.syllables.length > 1) return w;
  // -y after a vowel: + es (rey -> reyes), except recent loans (jersey -> jerséis: marked irregular).
  if (last === 'y') return `${w}es`;
  // Consonant: + es, z -> c, and the stress stays on the same syllable (canción -> canciones, examen -> exámenes).
  const base = last === 'z' ? `${w.slice(0, -1)}c` : w;
  // An accent that marks a hiatus stays (país -> países, maíz -> maíces, baúl -> baúles).
  if (s.hiatus.some((h) => /[íú]/.test(h))) return `${base}es`;
  return spellWithStress(`${base}es`, s.stressed);
}

/** The gender the ending suggests, or null when the ending says nothing (-e, most consonants). */
export function predictGender(word: string): 'm' | 'f' | null {
  if (/á$/.test(word.trim())) return null; // sofá, papá (m) and mamá (f): no prediction
  const w = fold(word.trim());
  if (/\s/.test(w)) return null;
  if (/(cion|sion|dad|tad|tud|umbre|triz)$/.test(w) || (/ez$/.test(w) && w.length > 4)) return 'f'; // -ez: vejez, rapidez (not pez)
  if (/(ma)$/.test(w) && w.length > 4) return null; // problema, tema (m) and cama, forma (f): no prediction
  if (/a$/.test(w)) return 'f';
  if (/o$/.test(w)) return 'm';
  if (/(or|aje|an)$/.test(w)) return 'm';
  return null;
}

/** Syllables and stress for a word bank entry (engines, or the entry's override). */
export function analysis(e: Pick<WordEntry, 'lemma' | 'override'>): StressInfo & { overridden: boolean } {
  const s = stress(e.lemma.split(' ')[0]);
  const overridden = !!e.override;
  return { ...s, syllables: e.override?.syllables ?? s.syllables, stressed: e.override?.stressed ?? s.stressed, overridden };
}

/** Does a clue give the answer away (the word, or a form of it, appears in the clue)? */
export function clueGivesAway(answer: string, clue: string): boolean {
  const a = foldKeepEnye(answer);
  const words = foldKeepEnye(clue).split(/[^a-zñü]+/).filter(Boolean);
  if (a.includes(' ')) return foldKeepEnye(clue).includes(a);
  // The word itself, or (for words of 5+ letters) any word starting with its first 4-5 letters: the same rule as the
  // crosswords (está gives away estar, gallina gives away gallo).
  const stem = a.slice(0, Math.max(4, Math.min(5, a.length - 1)));
  return words.some((w) => w === a || (a.length > 4 && w.startsWith(stem)));
}

/** Longest clue (the crossword clue bar on a 360px phone holds 2 lines). */
export const MAX_CLUE = 70;

export interface WordValidation { errors: string[]; warnings: string[]; overrides: string[] }
/** Checks the whole bank. */
export function validateWords(entries: WordEntry[], topics: TopicDef[]): WordValidation {
  const errors: string[] = [], warnings: string[] = [], overrides: string[] = [];
  const topicIds = new Set(topics.map((t) => t.id));
  const ids = new Set<string>();
  const lemmaPos = new Map<string, string>();
  for (const e of entries) {
    const w = `${e.id}`;
    if (!/^[a-z0-9ñ-]+$/.test(e.id ?? '')) errors.push(`${w}: id must be small letters, digits, ñ or -`);
    if (ids.has(e.id)) errors.push(`${w}: id repeats`);
    ids.add(e.id);
    const lp = `${e.lemma}|${e.pos}`;
    if (lemmaPos.has(lp)) errors.push(`${w}: same lemma and part of speech as ${lemmaPos.get(lp)}`);
    lemmaPos.set(lp, e.id);
    if (!e.lemma?.trim() || e.lemma !== e.lemma.normalize('NFC')) errors.push(`${w}: lemma must be NFC text`);
    if (/^(el|la|los|las|un|una)\s/i.test(e.lemma)) errors.push(`${w}: lemma without an article`);
    if (!POS.includes(e.pos)) errors.push(`${w}: unknown pos ${e.pos}`);
    if (!WORD_LEVELS.includes(e.level)) errors.push(`${w}: unknown level ${e.level}`);
    if (!e.topics?.length) errors.push(`${w}: needs at least one topic`);
    for (const t of e.topics ?? []) if (!topicIds.has(t)) errors.push(`${w}: unknown topic ${t}`);
    if (!e.translations?.en?.trim() || !e.translations?.ru?.trim()) errors.push(`${w}: needs translations en and ru`);
    if (!e.example?.trim()) errors.push(`${w}: needs an example sentence`);
    if (typeof e.reviewed !== 'boolean') errors.push(`${w}: reviewed must be true or false`);
    if (!e.source) errors.push(`${w}: needs a source`);
    if (!e.art) errors.push(`${w}: needs an art id`);
    // Clues: 2 or 3, of different types, never giving the answer away; a gap clue has exactly one ___.
    const clues = e.clues ?? [];
    if (clues.length < 2 || clues.length > 3) errors.push(`${w}: needs 2 or 3 clues (has ${clues.length})`);
    if (new Set(clues.map((c) => c.type)).size !== clues.length) errors.push(`${w}: clues must be of different types`);
    for (const c of clues) {
      if (!CLUE_TYPES.includes(c.type)) errors.push(`${w}: unknown clue type ${c.type}`);
      if (c.text !== c.text.normalize('NFC')) errors.push(`${w}: clue not NFC`);
      if (c.text.length > MAX_CLUE) errors.push(`${w}: clue longer than ${MAX_CLUE} characters (it must fit the crossword clue bar)`);
      if (c.type === 'gap' && (c.text.match(/___/g) ?? []).length !== 1) errors.push(`${w}: gap clue needs exactly one ___`);
      if (c.type !== 'gap' && c.text.includes('___')) errors.push(`${w}: only gap clues have ___`);
      if (clueGivesAway(e.lemma, c.text)) errors.push(`${w}: clue "${c.text}" contains the answer`);
    }
    // Nouns: gender and plural against the predictions.
    if (e.pos === 'noun') {
      if (!e.gender || !GENDERS.includes(e.gender)) errors.push(`${w}: a noun needs gender (m, f, both, special)`);
      const pg = predictGender(e.lemma);
      const g = e.gender === 'special' ? 'f' : e.gender;
      if (pg && g && g !== 'both' && g !== pg && !e.genderIrregular) errors.push(`${w}: gender ${e.gender} but the ending suggests ${pg}; mark genderIrregular if right`);
      if (e.genderIrregular && (pg === g || !pg)) warnings.push(`${w}: genderIrregular but the ending does not contradict it`);
    } else if (e.gender && e.pos !== 'adjective') errors.push(`${w}: only nouns have a gender`);
    if (e.pos === 'noun' || e.pos === 'adjective') {
      const pp = predictPlural(e.lemma);
      if (pp && !e.plural) errors.push(`${w}: needs a plural`);
      if (e.plural && pp && e.plural !== pp && !e.pluralIrregular) errors.push(`${w}: plural ${e.plural} but the rules predict ${pp}; mark pluralIrregular if right`);
      if (e.pluralIrregular && e.plural === pp) warnings.push(`${w}: pluralIrregular but the plural is the predicted one`);
    }
    // Verbs: a model that conjugates without errors.
    if (e.pos === 'verb') {
      if (!e.verbModel) errors.push(`${w}: a verb needs verbModel`);
      else {
        for (const p of modelProblems(e.lemma, e.verbModel)) errors.push(`${w}: ${p}`);
        try {
          const c = conjugate(e.lemma, e.verbModel);
          const all = [c.gerund, c.participle, ...Object.values(c.indicative).flat(), ...Object.values(c.subjunctive).flat()];
          if (all.some((f) => !f || /undefined|\s{2}/.test(f))) errors.push(`${w}: conjugation has empty forms`);
        } catch (err) { errors.push(`${w}: does not conjugate (${(err as Error).message})`); }
      }
    } else if (e.verbModel) errors.push(`${w}: only verbs have verbModel`);
    if (e.override) {
      const auto = syllabify(e.lemma);
      overrides.push(`${e.id}: ${auto.join('-')} -> ${(e.override.syllables ?? auto).join('-')}${e.override.stressed !== undefined ? ` (stress ${e.override.stressed})` : ''}`);
    }
    for (const r of e.regions ?? []) if (!r.es || !r.where) errors.push(`${w}: region variants need es and where`);
  }
  return { errors, warnings, overrides };
}

/** Counts of reviewed / not reviewed entries by level and by topic (for the build report). */
export function reviewCounts(entries: WordEntry[]): { byLevel: Record<string, [number, number]>; byTopic: Record<string, [number, number]> } {
  const byLevel: Record<string, [number, number]> = {}, byTopic: Record<string, [number, number]> = {};
  for (const e of entries) {
    const add = (m: Record<string, [number, number]>, k: string) => { m[k] ??= [0, 0]; m[k][e.reviewed ? 0 : 1]++; };
    add(byLevel, e.level);
    for (const t of e.topics) add(byTopic, t);
  }
  return { byLevel, byTopic };
}
export const VOWEL_SET = VOWELS;
