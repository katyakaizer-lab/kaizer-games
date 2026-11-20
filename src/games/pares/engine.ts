/**
 * ¿Pero o perro?: hear a word and choose between two. Pairs come from `minimalPairs` in the word bank; the set
 * (r / rr, n / ñ, vowels, stress, s / z) is worked out from the spelling. s / z is its own "España" set, because most
 * Spanish speakers pronounce them the same. Pure (tested).
 */
import { stripAccents } from '../../lang/es/stress.ts';
import type { WordEntry } from '../../words/types.ts';
import { rng, shuffle } from '../kit/answer.ts';

export type SetId = 'r' | 'n' | 'vocales' | 'acento' | 'sz';
export const SETS: { id: SetId | 'mezcla'; level: string; name: string }[] = [
  { id: 'r', level: 'A1', name: 'r / rr' },
  { id: 'n', level: 'A1', name: 'n / ñ' },
  { id: 'vocales', level: 'A2', name: 'Vocales' },
  { id: 'acento', level: 'B1', name: 'Dónde va el golpe' },
  { id: 'sz', level: 'B2', name: 's / z (España)' },
  { id: 'mezcla', level: 'C1', name: 'Todo mezclado' },
];

export interface Pair { a: string; b: string; set: SetId; entries: Partial<Record<string, WordEntry>> }

const VOWEL = /[aeiouáéíóú]/;
/** Which set a pair belongs to, from the spelling alone (null: not a pair we practise). */
export function classify(a: string, b: string): SetId | null {
  if (a === b) return null;
  if (stripAccents(a) === stripAccents(b)) return 'acento';
  if ((a.includes('rr') || b.includes('rr')) && a.replace(/rr/g, 'r') === b.replace(/rr/g, 'r')) return 'r';
  if ((a.includes('ñ') || b.includes('ñ')) && a.replace(/ñ/g, 'n') === b.replace(/ñ/g, 'n')) return 'n';
  const seseo = (w: string) => w.replace(/z/g, 's').replace(/c(?=[eiéí])/g, 's');
  if (seseo(a) === seseo(b)) return 'sz';
  if (a.length === b.length && [...a].every((c, i) => c === b[i] || (VOWEL.test(c) && VOWEL.test(b[i])))) return 'vocales';
  return null;
}

/** Every pair in the bank (each once). */
export function bankPairs(words: WordEntry[]): Pair[] {
  const byLemma = new Map(words.map((e) => [e.lemma, e]));
  const out: Pair[] = [];
  const seen = new Set<string>();
  for (const e of words) for (const p of e.minimalPairs ?? []) {
    const key = [e.lemma, p].sort().join('|');
    const set = classify(e.lemma, p);
    if (!set || seen.has(key)) continue;
    seen.add(key);
    out.push({ a: e.lemma, b: p, set, entries: { [e.lemma]: e, [p]: byLemma.get(p) } });
  }
  return out;
}

export interface Question { pair: Pair; heard: string; options: [string, string] }
export const ROUND = 10;
export function makeRound(pairs: Pair[], set: SetId | 'mezcla', seed: number, n = ROUND): Question[] {
  const r = rng(seed);
  const pool = pairs.filter((p) => (set === 'mezcla' ? true : p.set === set));
  if (!pool.length) return [];
  const out: Question[] = [];
  let order = shuffle(pool, r);
  for (let k = 0; out.length < n; k++) {
    if (k && k % order.length === 0) order = shuffle(pool, r);
    const pair = order[k % order.length];
    const heard = r() < 0.5 ? pair.a : pair.b;
    out.push({ pair, heard, options: shuffle([pair.a, pair.b], r) as [string, string] });
  }
  return out;
}
export const isRight = (q: Question, chosen: string): boolean => chosen === q.heard;

/** File name for a recording: audio/pairs/<id>.mp3. ASCII: ñ -> ny, an accented vowel -> the vowel + "_" (papá -> papa_). */
export function audioId(word: string): string {
  return word.toLocaleLowerCase('es').replace(/ñ/g, 'ny').normalize('NFD').replace(/([aeiou])́/g, '$1_').replace(/[̀-ͯ]/g, '').replace(/[^a-z_]/g, '-');
}
