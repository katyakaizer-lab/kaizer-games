/**
 * Crucigramas topics from the shared word bank (src/data/words). A bank topic is offered at a level when it has at
 * least MIN_WORDS usable words of that level and the level below (A1: A1 only), so a crossword never uses words above
 * its level. Usable: one word in small letters (no expressions, no names), short enough for the level's grid, with
 * 2-3 clues. Decorations come from src/data/crucigramas/decor.json (each bank topic uses one drawn set).
 * Pure code: used by the game, the build validator and tests.
 */
import type { TopicDef, WordEntry } from '../../words/types.ts';
import type { Entry, Level, LevelConfig, Topic } from './engine.ts';

export const MIN_WORDS = 20;
const BELOW: Record<string, string[]> = { A1: [], A2: ['A1'], B1: ['A2'], B2: ['B1'] };
export interface DecorConfig { sets: Record<string, { style: string; items: string[] }>; topicSet: Record<string, string> }

/** Topic id in the game: the bank topic and the level ("frutas-a1"). */
export const topicIdFor = (bankTopic: string, level: string) => `${bankTopic}-${level.toLowerCase()}`;

/** Is this entry usable as a crossword answer at a level? */
export function usableWord(e: WordEntry, cfg: LevelConfig): boolean {
  if (e.pos === 'expression' || !/^[a-záéíóúüñ]+$/.test(e.lemma)) return false;
  if (e.lemma.length < 3 || e.lemma.length > Math.min(cfg.maxCols, cfg.maxRows)) return false;
  return (e.clues?.length ?? 0) >= 2;
}

export function crosswordTopics(entries: WordEntry[], topics: TopicDef[], levels: Partial<Record<Level, LevelConfig>>, decor: DecorConfig): Topic[] {
  const out: Topic[] = [];
  for (const [level, cfg] of Object.entries(levels) as [Level, LevelConfig][]) {
    const allowed = [level, ...BELOW[level]];
    for (const t of topics) {
      const words = entries
        .filter((e) => e.topics.includes(t.id) && allowed.includes(e.level) && usableWord(e, cfg))
        .sort((a, b) => (a.level === level ? 0 : 1) - (b.level === level ? 0 : 1) || a.lemma.localeCompare(b.lemma, 'es'));
      // One entry per spelling (a noun and an adjective can share a lemma).
      const seen = new Set<string>();
      const list: (WordEntry)[] = words.filter((e) => (seen.has(e.lemma) ? false : (seen.add(e.lemma), true)));
      if (list.length < MIN_WORDS) continue;
      const set = decor.topicSet[t.id] ?? t.id;
      out.push({
        id: topicIdFor(t.id, level), level, name_es: t.name_es, en: t.en, ru: t.ru,
        reviewed: list.every((e) => e.reviewed),
        decor: decor.sets[set] ? { ...decor.sets[set], set } : undefined,
        words: list.map((e): Entry => ({ es: e.lemma, clues: Object.fromEntries(e.clues.map((c) => [c.type, c.text])) })),
      } as Topic);
    }
  }
  return out;
}
