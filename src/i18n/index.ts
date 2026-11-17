/** UI strings by key. English is complete; other languages fall back to English per key. */
import en from './en.json';
import es from './es.json';
import ru from './ru.json';

export type Lang = 'en' | 'es' | 'ru';
export type Key = keyof typeof en;
const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, es, ru };
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }, { id: 'ru', label: 'Русский' },
];

let lang: Lang = 'en';
export const getLang = (): Lang => lang;
export function setLang(l: Lang): void {
  lang = DICTS[l] ? l : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Keys missing per language, for the build report. */
export function missingKeys(): Record<Lang, string[]> {
  const keys = Object.keys(en) as Key[];
  return { en: [], es: keys.filter((k) => !(k in es)), ru: keys.filter((k) => !(k in ru)) };
}
