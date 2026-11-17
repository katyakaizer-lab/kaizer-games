/** User settings, applied to <html> as attributes so tokens and components react without code changes. */
import { store } from '../data/storage';
import { setLang, type Lang } from '../i18n';

export interface Settings { lang: Lang; sound: boolean; soundOffered: boolean; reduceMotion: boolean; textSize: 'normal' | 'large' | 'xlarge' }
export const DEFAULT_SETTINGS: Settings = { lang: 'en', sound: false, soundOffered: false, reduceMotion: false, textSize: 'normal' };
const SCALE = { normal: '100%', large: '112.5%', xlarge: '125%' } as const;

export function getSettings(): Settings { return { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) }; }
export function saveSettings(patch: Partial<Settings>): Settings {
  const s = { ...getSettings(), ...patch };
  store.set('settings', s);
  applySettings(s);
  return s;
}
export function applySettings(s: Settings = getSettings()): void {
  setLang(s.lang);
  const root = document.documentElement;
  if (s.reduceMotion) root.dataset.motion = 'reduce'; else delete root.dataset.motion;
  root.style.fontSize = SCALE[s.textSize];
}
export function prefersReducedMotion(): boolean {
  try { return getSettings().reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return getSettings().reduceMotion; }
}
