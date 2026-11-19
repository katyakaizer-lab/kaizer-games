// Loads the word bank from disk (Node tools and tests; the app uses src/words/bank.ts).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TopicDef, TopicFile, WordEntry } from '../src/words/types.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WORDS_DIR = join(ROOT, 'src/data/words');

export function loadWordFiles(dir = WORDS_DIR): { topics: TopicDef[]; files: { name: string; data: TopicFile }[]; entries: WordEntry[] } {
  const topics = (JSON.parse(readFileSync(join(dir, '_topics.json'), 'utf8')) as { topics: TopicDef[] }).topics;
  const files = readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()
    .map((name) => ({ name, data: JSON.parse(readFileSync(join(dir, name), 'utf8')) as TopicFile }));
  return { topics, files, entries: files.flatMap((f) => f.data.entries) };
}

/** Writes a topic file in the bank's format: one entry per line, so a diff shows one changed word per line. */
export function writeTopicFile(name: string, data: TopicFile, dir = WORDS_DIR): void {
  const lines = data.entries.map((e) => `  ${JSON.stringify(e)}`).join(',\n');
  writeFileSync(join(dir, name), `{\n "topic": "${data.topic}",\n "entries": [\n${lines}\n ]\n}\n`);
}
