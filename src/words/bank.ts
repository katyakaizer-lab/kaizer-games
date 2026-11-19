/**
 * The word bank in the app: every src/data/words/<topic>.json, bundled with the code that imports this module (the
 * games that read words, and the dev review page). Node tools read the files with tools/words-lib.ts instead.
 */
import type { TopicDef, TopicFile, WordEntry } from './types';

const files = import.meta.glob<TopicFile | { topics: TopicDef[] }>('../data/words/*.json', { eager: true, import: 'default' });
const TOPICS: TopicDef[] = (Object.entries(files).find(([k]) => k.endsWith('/_topics.json'))?.[1] as { topics: TopicDef[] } | undefined)?.topics ?? [];
const ENTRIES: WordEntry[] = Object.entries(files).filter(([k]) => !k.endsWith('/_topics.json')).sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([, f]) => (f as TopicFile).entries);
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

export const allWords = (): WordEntry[] => ENTRIES;
export const wordTopics = (): TopicDef[] => TOPICS;
export const wordById = (id: string): WordEntry | undefined => BY_ID.get(id);
export const wordsInTopic = (topic: string): WordEntry[] => ENTRIES.filter((e) => e.topics.includes(topic));
