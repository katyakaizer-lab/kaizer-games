/**
 * Hash router: #home, #picker (first pet), #pet (edit the pet), #settings, #game/<id>[/<more>].
 * Games are lazy-loaded from src/games/<id>/index.ts, so adding a game never touches this file.
 */
import registryFile from '../data/games.registry.json';

export interface GameContext {
  /** path segments after #game/<id>/ */
  path: string[];
  /** change the path inside this game (updates the hash) */
  go(path: string[]): void;
  /** back to the home screen */
  exit(): void;
}
export interface GameHandle {
  /** the hash path inside the game changed (the game stays mounted) */
  update(path: string[]): void;
  destroy(): void;
}
export interface GameModule { mount(el: HTMLElement, ctx: GameContext): GameHandle }

export interface GameEntry {
  id: string;
  status: 'playable' | 'pronto';
  name: string;
  icon: string;
  art?: string;
  levels?: string;
  about: Record<string, string>;
}
export const registry = (registryFile as { games: GameEntry[] }).games;

const loaders = import.meta.glob<GameModule>('../games/*/index.ts');
export function gameLoader(id: string): (() => Promise<GameModule>) | null {
  return (loaders[`../games/${id}/index.ts`] as (() => Promise<GameModule>) | undefined) ?? null;
}

export interface Route { name: 'home' | 'picker' | 'pet' | 'settings' | 'game'; game?: string; path: string[] }

export function parseRoute(hash = location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [head, id, ...rest] = parts;
  if (head === 'picker') return { name: 'picker', path: [] };
  if (head === 'pet') return { name: 'pet', path: [] };
  if (head === 'settings') return { name: 'settings', path: [] };
  if (head === 'game' && id) return { name: 'game', game: id, path: rest };
  return { name: 'home', path: [] };
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
