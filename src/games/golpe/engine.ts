/**
 * Golpe de voz: words from the word bank shown without their accent mark; the learner taps the stressed syllable,
 * then says whether it needs a written accent. The stress engine (src/lang/es/stress.ts) decides the answer and
 * gives the rule. Diacritic mode: short sentences with words like tu / tú. Pure (tested).
 */
import { stress, stripAccents, diacriticPair, accentOk, type StressInfo } from '../../lang/es/stress.ts';
import { syllabify } from '../../lang/es/syllabify.ts';
import type { WordEntry } from '../../words/types.ts';
import { levelRank, rng, shuffle } from '../kit/answer.ts';
import sentencesFile from '../../data/golpe/sentences.json';

export type ModeId = 'tipos' | 'hiatos' | 'diacriticas' | 'mezcla';
export const MODES: { id: ModeId; level: string; maxLevel: string }[] = [
  { id: 'tipos', level: 'A2', maxLevel: 'A2' },
  { id: 'hiatos', level: 'B1', maxLevel: 'B1' },
  { id: 'diacriticas', level: 'B1–B2', maxLevel: 'B2' },
  { id: 'mezcla', level: 'C1', maxLevel: 'C1' },
];

export interface WordTask {
  kind: 'word';
  word: string;
  /** syllables of the real word, shown without accent marks (pa-is for país) */
  shown: string[];
  info: StressInfo;
  translation: { en: string; ru: string };
}
export interface SentenceTask {
  kind: 'sentence';
  /** tokens: plain text, or a word that may take a diacritic accent (shown without it) */
  parts: ({ text: string } | { plain: string; answer: string; rule: string })[];
  sentence: string;
}
export type Task = WordTask | SentenceTask;

/** Is the word usable: one word in small letters, 2+ syllables, spelled as the rules say (no engine doubts)? */
export function usable(e: WordEntry): boolean {
  if (e.pos === 'expression' || !/^[a-záéíóúüñ]+$/.test(e.lemma) || e.override) return false;
  return syllabify(e.lemma).length >= 2 && accentOk(e.lemma);
}

export function wordTask(e: WordEntry): WordTask {
  const info = stress(e.lemma);
  return { kind: 'word', word: e.lemma, shown: info.syllables.map(stripAccents), info, translation: e.translations };
}

/** Picks 10 words for a mode, balanced so every kind of answer turns up. */
export function makeWordRound(mode: Exclude<ModeId, 'diacriticas'>, words: WordEntry[], seed: number, n = 10): WordTask[] {
  const r = rng(seed);
  const max = levelRank(MODES.find((m) => m.id === mode)!.maxLevel);
  const pool = shuffle(words.filter((e) => levelRank(e.level) <= max && (mode !== 'mezcla' || levelRank(e.level) >= 2) && usable(e)), r).map(wordTask);
  const buckets: ((t: WordTask) => boolean)[] = mode === 'hiatos'
    ? [(t) => t.info.hiatus.length > 0 && t.info.hasAccent, (t) => t.info.hiatus.length > 0 && !t.info.hasAccent, (t) => t.info.diphthongs.length > 0 && t.info.hasAccent, (t) => t.info.diphthongs.length > 0 && !t.info.hasAccent]
    : [(t) => t.info.type === 'aguda' && t.info.hasAccent, (t) => t.info.type === 'aguda' && !t.info.hasAccent, (t) => t.info.type === 'llana' && t.info.hasAccent, (t) => t.info.type === 'llana' && !t.info.hasAccent, (t) => t.info.type === 'esdrújula'];
  const out: WordTask[] = [];
  for (let k = 0; out.length < n && k < n * 4; k++) {
    const test = buckets[k % buckets.length];
    const w = pool.find((t) => test(t) && !out.includes(t));
    if (w) out.push(w);
  }
  for (const w of pool) { if (out.length >= n) break; if (!out.includes(w)) out.push(w); }
  return shuffle(out, r);
}

/** Sentences for the diacritic mode: every word that belongs to a diacritic pair becomes a choice. */
export function sentenceTask(sentence: string): SentenceTask {
  const parts: SentenceTask['parts'] = [];
  for (const tok of sentence.split(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/)) {
    if (!tok) continue;
    const d = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(tok) ? diacriticPair(tok) : null;
    if (!d) { parts.push({ text: tok }); continue; }
    const accented = tok.toLocaleLowerCase('es') === d.accented;
    parts.push({ plain: stripAccents(tok), answer: tok, rule: accented ? `${d.accented}: ${d.with}` : `${d.plain}: ${d.without}` });
  }
  return { kind: 'sentence', parts, sentence };
}
export const SENTENCES: string[] = (sentencesFile as { sentences: string[] }).sentences;
export function makeSentenceRound(seed: number, n = 8): SentenceTask[] {
  return shuffle(SENTENCES, rng(seed)).slice(0, n).map(sentenceTask);
}

/** Scoring: a word counts when both the syllable and the accent answer are right first time. */
export const wordRight = (t: WordTask, tapped: number, saysAccent: boolean): boolean => tapped === t.info.stressed && saysAccent === t.info.hasAccent;
/** A sentence counts when every choice is right: `choices[i]` is true when the learner gave word i an accent. */
export function sentenceRight(t: SentenceTask, choices: boolean[]): boolean {
  const ws = t.parts.filter((p): p is Extract<SentenceTask['parts'][number], { plain: string }> => 'plain' in p);
  return ws.every((p, i) => (p.answer !== p.plain) === !!choices[i]);
}
/** The accented form of a diacritic word, keeping a capital (tu -> tú, Que -> Qué). */
export function accentedForm(plain: string): string {
  const d = diacriticPair(plain);
  if (!d) return plain;
  return plain[0] === plain[0].toLocaleUpperCase('es') ? d.accented[0].toLocaleUpperCase('es') + d.accented.slice(1) : d.accented;
}
