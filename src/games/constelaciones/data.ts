/** Constelaciones content (data, not UI). Reviewed flags are shown in dev mode only. */
import raw from '../../data/constelaciones/sample-sentences.json';
import { LEVELS, levelRank, type Constellation, type ConstellationData, type Level, type Story } from './sentence';

export const data = raw as unknown as ConstellationData;

/** All constellations in map order: by level, story parts kept together and in order. */
export const ALL: Constellation[] = [...data.constellations].sort((a, b) => {
  const lr = levelRank(a.level) - levelRank(b.level);
  if (lr) return lr;
  const sa = a.story ? 1 : 0, sb = b.story ? 1 : 0;
  if (sa !== sb) return sa - sb;
  if (a.story && b.story) return a.story.id === b.story.id ? a.story.part - b.story.part : a.story.id.localeCompare(b.story.id);
  return a.id.localeCompare(b.id);
});
export const STORIES: Story[] = data.stories ?? [];

const byId = new Map(ALL.map((c) => [c.id, c]));
export const getConstellation = (id: string): Constellation | undefined => byId.get(id);
export const numberOf = (id: string): number => ALL.findIndex((c) => c.id === id) + 1;
export const storyOf = (c: Constellation): Story | undefined => (c.story ? STORIES.find((s) => s.id === c.story!.id) : undefined);
export const storyParts = (s: Story): Constellation[] => s.constellations.map((id) => byId.get(id)!).filter(Boolean);
export const levelsPresent = (): Level[] => LEVELS.filter((l) => ALL.some((c) => c.level === l));

export function showDev(): boolean {
  try { return import.meta.env.DEV || new URLSearchParams(location.search).has('dev'); } catch { return false; }
}
