/**
 * Spanish word stress (RAE 2010 rules), from spelling alone:
 * - a written accent marks the stressed syllable; without one, a word ending in a vowel, -n or -s (but not a
 *   consonant + s, as in "robots") is stressed on the second-to-last syllable (llana), any other on the last (aguda);
 * - aguda, llana, esdrújula (third from the end) or sobresdrújula (further back);
 * - diphthongs (a weak vowel i/u next to another vowel, both unaccented: cie-lo, rui-do) and hiatus (two strong
 *   vowels, le-ón; or an accented weak vowel, pa-ís, tí-o, bú-ho: h does not separate vowels);
 * - whether the written accent is required, and why (in Spanish, for learners);
 * - one-syllable words take no accent except the diacritic pairs (tú / tu, él / el...).
 * Pure functions. Used by the word bank (syllables and stress are computed, not stored), the conjugator (accents
 * when pronouns are attached: lávate) and games.
 */
import { syllabify } from './syllabify.ts';

export type StressType = 'aguda' | 'llana' | 'esdrújula' | 'sobresdrújula';
export interface StressInfo {
  word: string;
  syllables: string[];
  /** index of the stressed syllable, from the start (0) */
  stressed: number;
  type: StressType;
  monosyllable: boolean;
  hasAccent: boolean;
  /** Does the spelling need the written accent it has (or would need, if it has none)? */
  needsAccent: boolean;
  /** Why (Spanish, for learners). */
  reason: string;
  diphthongs: string[];
  hiatus: string[];
}

const ACCENTED = 'áéíóú';
const STRONG = 'aeoáéó';
const WEAK = 'iuü';
const VOWELS = 'aeiouáéíóúü';
const plain = (c: string) => c.normalize('NFD').replace(/[̀-́]/g, '');
const lower = (w: string) => w.toLocaleLowerCase('es');

/** The vowel letters of a word with their positions, h skipped (it does not separate vowels: bú-ho, pro-hí-be). */
function vowelRuns(w: string): { text: string; start: number }[] {
  const s = lower(w);
  const runs: { text: string; start: number }[] = [];
  let cur = '', start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // "qu"/"gu" + e/i: the u is silent and not a vowel.
    const silentU = c === 'u' && (s[i - 1] === 'q' || s[i - 1] === 'g') && 'eéií'.includes(s[i + 1] ?? '');
    if (VOWELS.includes(c) && !silentU) { if (!cur) start = i; cur += c; continue; }
    if (c === 'h' && cur && VOWELS.includes(s[i + 1] ?? '')) continue; // vowel h vowel
    if (cur) runs.push({ text: cur, start });
    cur = '';
  }
  if (cur) runs.push({ text: cur, start });
  return runs;
}

/** Diphthongs and hiatus in the word. */
export function vowelContacts(word: string): { diphthongs: string[]; hiatus: string[] } {
  const diphthongs: string[] = [], hiatus: string[] = [];
  for (const { text } of vowelRuns(word)) {
    for (let i = 0; i + 1 < text.length; i++) {
      const a = text[i], b = text[i + 1];
      const pair = a + b;
      const strongA = STRONG.includes(a), strongB = STRONG.includes(b);
      const accWeak = 'íú'.includes(a) || 'íú'.includes(b);
      if ((strongA && strongB) || accWeak) hiatus.push(pair);
      else diphthongs.push(pair);
    }
  }
  return { diphthongs, hiatus };
}

const typeOf = (fromEnd: number): StressType => (fromEnd === 0 ? 'aguda' : fromEnd === 1 ? 'llana' : fromEnd === 2 ? 'esdrújula' : 'sobresdrújula');
/** Does a word ending like this take the llana default (vowel, -n, -s not after another consonant)? */
function endsLikeLlana(w: string): boolean {
  const s = lower(w);
  const last = s[s.length - 1], before = s[s.length - 2] ?? '';
  if (VOWELS.includes(last)) return true;
  if (last === 'n') return true;
  if (last === 's') return !before || VOWELS.includes(before);
  return false;
}

/** Diacritic accents: one-syllable (and a few other) words told apart by the accent. */
export const DIACRITIC: Record<string, { with: string; without: string }> = {
  'tú': { with: 'pronombre personal: tú eres', without: 'posesivo: tu casa' },
  'él': { with: 'pronombre personal: él canta', without: 'artículo: el perro' },
  'mí': { with: 'pronombre: para mí', without: 'posesivo o nota musical: mi casa' },
  'sí': { with: 'afirmación o pronombre: sí, quiero', without: 'condición o nota musical: si llueve' },
  'té': { with: 'bebida: un té', without: 'pronombre: te quiero' },
  'sé': { with: 'verbo saber o ser: no lo sé', without: 'pronombre: se lava' },
  'dé': { with: 'verbo dar: que me dé', without: 'preposición: de Madrid' },
  'más': { with: 'cantidad: más agua', without: 'pero (formal): quiso, mas no pudo' },
  'qué': { with: 'pregunta o exclamación: ¿qué quieres?', without: 'conjunción o relativo: dice que viene' },
  'cómo': { with: 'pregunta o exclamación: ¿cómo estás?', without: 'comparación o modo: como tú' },
  'cuándo': { with: 'pregunta: ¿cuándo vienes?', without: 'relativo: cuando llueve' },
  'dónde': { with: 'pregunta: ¿dónde vives?', without: 'relativo: donde vivo' },
  'quién': { with: 'pregunta: ¿quién es?', without: 'relativo: quien lo sabe' },
  'cuál': { with: 'pregunta: ¿cuál quieres?', without: 'relativo: el cual' },
  'cuánto': { with: 'pregunta o exclamación: ¿cuánto cuesta?', without: 'relativo: cuanto más, mejor' },
};
/** The diacritic pair a word belongs to, if any: tu -> tú, el -> él... */
export function diacriticPair(word: string): { accented: string; plain: string; with: string; without: string } | null {
  const w = lower(word);
  for (const [acc, d] of Object.entries(DIACRITIC)) {
    const p = plain(acc);
    if (w === acc || w === p) return { accented: acc, plain: p, ...d };
  }
  return null;
}

/** Stress analysis of one word. */
export function stress(word: string): StressInfo {
  const w = word.trim();
  const syllables = syllabify(w);
  const n = syllables.length;
  const accIdx = syllables.findIndex((s) => [...lower(s)].some((c) => ACCENTED.includes(c)));
  const hasAccent = accIdx >= 0;
  const stressed = hasAccent ? accIdx : n === 1 ? 0 : endsLikeLlana(w) ? n - 2 : n - 1;
  const fromEnd = n - 1 - stressed;
  const type = typeOf(fromEnd);
  const { diphthongs, hiatus } = vowelContacts(w);
  const accHiatus = hiatus.some((h) => 'íú'.includes(h[0]) || 'íú'.includes(h[1]));
  let needsAccent: boolean, reason: string;
  const ending = lower(w).slice(-1);
  const endDesc = VOWELS.includes(ending) ? 'vocal' : ending === 'n' ? 'n' : ending === 's' ? 's' : 'consonante';
  if (n === 1) {
    const d = diacriticPair(w);
    needsAccent = !!d && hasAccent;
    reason = d ? (hasAccent ? `Tilde diacrítica: ${d.accented} (${d.with}) frente a ${d.plain} (${d.without}).` : `Sin tilde: ${d.plain} (${d.without}); con tilde sería ${d.accented} (${d.with}).`)
      : 'Las palabras de una sílaba no llevan tilde.';
  } else if (accHiatus) {
    needsAccent = true;
    reason = 'Lleva tilde para romper el diptongo: la i o la u tónica junto a otra vocal forma hiato.';
  } else if (type === 'esdrújula' || type === 'sobresdrújula') {
    needsAccent = true;
    reason = `Es ${type}: siempre lleva tilde.`;
  } else if (type === 'aguda') {
    needsAccent = endsLikeLlana(w);
    reason = needsAccent ? `Es aguda y termina en ${endDesc}: lleva tilde.` : `Es aguda y termina en ${endDesc === 's' ? 'consonante + s' : endDesc}: no lleva tilde.`;
  } else {
    needsAccent = !endsLikeLlana(w);
    reason = needsAccent ? `Es llana y no termina en vocal, n ni s: lleva tilde.` : `Es llana y termina en ${endDesc}: no lleva tilde.`;
  }
  return { word: w, syllables, stressed, type, monosyllable: n === 1, hasAccent, needsAccent, reason, diphthongs, hiatus };
}

/** Is the written accent of this word right (present exactly when the rules ask for it)? Diacritic words: always ok. */
export const accentOk = (word: string): boolean => { const s = stress(word); return s.monosyllable ? (!s.hasAccent || !!diacriticPair(word)) : s.hasAccent === s.needsAccent; };

/** The vowel that carries the stress inside a syllable (the strong one of a diphthong; the second of two weak: rui-do -> i). */
function nucleusIndex(syl: string): number {
  const s = lower(syl);
  const idx = [...s].map((c, i) => (VOWELS.includes(c) && !(c === 'u' && i > 0 && 'qg'.includes(s[i - 1]) && 'eiéí'.includes(s[i + 1] ?? '')) ? i : -1)).filter((i) => i >= 0);
  const acc = idx.find((i) => ACCENTED.includes(s[i]));
  if (acc !== undefined) return acc;
  const strong = idx.find((i) => STRONG.includes(s[i]));
  if (strong !== undefined) return strong;
  return idx[idx.length - 1] ?? -1;
}
const ACC_OF: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };
/** The word with any written accent removed (ñ and ü kept). */
export const stripAccents = (w: string): string => w.normalize('NFD').replace(/́/g, '').normalize('NFC');

/**
 * Spells a word stressed on a given syllable (index from the start), adding or removing the written accent as the
 * rules need: used when pronouns are attached (lava + te -> lávate, lavando + se -> lavándose).
 */
export function spellWithStress(word: string, stressedIndex: number): string {
  const base = stripAccents(word);
  const syl = syllabify(base);
  if (syl.length === 1) return base;
  const fromEnd = syl.length - 1 - stressedIndex;
  const llanaDefault = endsLikeLlana(base);
  const natural = fromEnd === (llanaDefault ? 1 : 0);
  // A weak vowel stressed next to a strong one (hiatus) also needs the accent; handled by the caller's syllables.
  if (natural) return base;
  const k = nucleusIndex(syl[stressedIndex]);
  if (k < 0) return base;
  syl[stressedIndex] = syl[stressedIndex].slice(0, k) + (ACC_OF[syl[stressedIndex][k]] ?? syl[stressedIndex][k]) + syl[stressedIndex].slice(k + 1);
  return syl.join('');
}
