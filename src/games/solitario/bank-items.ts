/**
 * Solitario de categorías reads its words from the shared word bank: a category in src/data/solitario/categories.json
 * lists word ids ("words": ["rosa", "tulipan"]), and the Spanish word, translations and art come from the bank.
 * Pure code: used by the game, the build checks and tests.
 */
import type { WordEntry } from '../../words/types.ts';
import type { Category, Item, Level } from './engine.ts';

export interface RawCategory {
  id: string; level: Level; name_es: string; en: string; ru: string;
  /** word bank ids */
  words: string[];
  avoid?: string[]; reviewed: boolean;
}

/** Items for a category from the bank (unknown ids are skipped; the validator reports them). */
export function itemFor(e: WordEntry): Item {
  // Bank art ids (word.<id>) are placeholders not in the manifest yet; cards show words only, so art is left out.
  return { es: e.lemma, en: e.translations.en, ru: e.translations.ru };
}
export function resolveCategories(raw: RawCategory[], byId: (id: string) => WordEntry | undefined): Category[] {
  return raw.map(({ words, ...c }) => ({ ...c, items: words.map(byId).filter((e): e is WordEntry => !!e).map(itemFor) }));
}
/** Word ids that are not in the bank, as "category: id". */
export function missingWords(raw: RawCategory[], byId: (id: string) => WordEntry | undefined): string[] {
  return raw.flatMap((c) => c.words.filter((id) => !byId(id)).map((id) => `${c.id}: ${id}`));
}
