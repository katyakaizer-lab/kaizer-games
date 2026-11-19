/**
 * The shared word bank (src/data/words/<topic>.json). One entry per lemma and part of speech; a word in several topics
 * lives in the file of its first topic. Syllables, stress and accent type are not stored: src/lang/es computes them
 * (an entry may override them only where the engines are wrong; the build report lists every override).
 * Names are shown without articles; gender is stored apart and shown only by games that practise gender or articles.
 */
export const POS = ['noun', 'verb', 'adjective', 'adverb', 'expression'] as const;
export type Pos = (typeof POS)[number];
/** m, f, both (el/la estudiante; a feminine form may be given), special: feminine nouns with "el" in the singular (el agua, las aguas). */
export const GENDERS = ['m', 'f', 'both', 'special'] as const;
export type Gender = (typeof GENDERS)[number];
export const WORD_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type WordLevel = (typeof WORD_LEVELS)[number];
export const CLUE_TYPES = ['def', 'gap', 'syn', 'ant', 'use'] as const;
/** def definition, gap a sentence with ___, syn synonym, ant opposite, use what it is for or where it is. */
export type ClueType = (typeof CLUE_TYPES)[number];

export interface Clue { type: ClueType; text: string }
export interface RegionVariant { es: string; where: string }

export interface WordEntry {
  id: string;
  lemma: string;
  pos: Pos;
  gender?: Gender;
  /** feminine form of a "both" noun or of an adjective that does not just change -o to -a (profesora, trabajadora) */
  feminine?: string;
  plural?: string;
  /** the plural is not what the rules predict (régimen -> regímenes, or invariable when the rules say otherwise) */
  pluralIrregular?: boolean;
  /** the gender is not what the ending predicts (la mano, el día, el problema) */
  genderIrregular?: boolean;
  level: WordLevel;
  topics: string[];
  translations: { en: string; ru: string };
  /** art id; placeholder art until drawn (word.<id>) */
  art: string;
  clues: Clue[];
  example: string;
  regions?: RegionVariant[];
  /** root shared by a word family (pan: panadero, panadería) */
  family?: string;
  minimalPairs?: string[];
  falseFriends?: { en?: string; ru?: string };
  /** conjugation model for verbs (src/lang/es/conjugate.ts) */
  verbModel?: string;
  /** engine overrides, only where the engines are wrong (listed in the build report) */
  override?: { syllables?: string[]; stressed?: number };
  reviewed: boolean;
  /** the reviewer's note when an entry was marked doubtful (tools/apply-review.ts) */
  reviewNote?: string;
  source: string;
}

export interface TopicDef { id: string; name_es: string; en: string; ru: string }
export interface TopicFile { topic: string; entries: WordEntry[] }
