/**
 * Spanish numbers (Spain): number <-> words from 0 to 999 999 999, ordinals 1-20, prices, years and dates.
 * - Accents: dieciséis, veintidós, veintitrés, veintiséis, veintiún.
 * - Gender: "una", "veintiuna", "doscientas" before a feminine noun (doscientas personas, veintiuna casas); "mil" and
 *   "millón" do not change (doscientas mil personas, un millón de personas).
 * - Apocope before a noun: uno -> un (un euro, veintiún euros, treinta y un días); before "mil": veintiún mil.
 * - "un millón de euros" takes "de" when nothing follows millón ("un millón quinientos mil euros" does not).
 * Pure functions.
 */
export type NumGender = 'm' | 'f';
export interface NumOptions {
  /** gender of the noun it counts (default m) */
  gender?: NumGender;
  /** before a noun: "un" / "veintiún" instead of "uno" / "veintiuno" (default false: counting) */
  beforeNoun?: boolean;
}

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TWENTIES = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** "one" at the end of a group: uno / un / una (veintiuno, veintiún, veintiuna). */
function fixOne(words: string, g: NumGender, apocope: boolean): string {
  if (g === 'f') return words.replace(/veintiuno$/, 'veintiuna').replace(/(^| )uno$/, '$1una');
  if (apocope) return words.replace(/veintiuno$/, 'veintiún').replace(/(^| )uno$/, '$1un');
  return words;
}

/** 0-999 in words (masculine counting form, "uno"). */
function under1000(n: number, g: NumGender): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(g === 'f' && h > 1 ? HUNDREDS[h].replace(/os$/, 'as') : HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(UNITS[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else if (r < 30) parts.push(TWENTIES[r - 20]);
    else { const t = Math.floor(r / 10), u = r % 10; parts.push(u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t]); }
  }
  return parts.join(' ');
}

/** A whole number in words: 21 -> "veintiuno"; with { beforeNoun: true } "veintiún"; with { gender: 'f' } "veintiuna". */
export function numberToWords(n: number, o: NumOptions = {}): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new RangeError(`numberToWords: ${n} is not a whole number from 0 to 999 999 999`);
  const g = o.gender ?? 'm';
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1_000_000), thousands = Math.floor((n % 1_000_000) / 1000), rest = n % 1000;
  const out: string[] = [];
  if (millions) out.push(millions === 1 ? 'un millón' : `${fixOne(under1000(millions, 'm'), 'm', true)} millones`);
  if (thousands) out.push(thousands === 1 ? 'mil' : `${fixOne(under1000(thousands, g), 'm', true)} mil`);
  if (rest) out.push(fixOne(under1000(rest, g), g, !!o.beforeNoun));
  return out.join(' ');
}

/** "un millón de euros", "doscientas personas", "veintiún euros": a number with its noun (singular and plural given). */
export function countNoun(n: number, singular: string, plural: string, gender: NumGender = 'm'): string {
  const words = numberToWords(n, { gender, beforeNoun: true });
  const de = n >= 1_000_000 && n % 1_000_000 === 0 ? ' de' : '';
  return `${words}${de} ${n === 1 ? singular : plural}`;
}

/* ---------------- Words -> number ---------------- */
const fold = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const VALUE: Record<string, number> = {};
UNITS.forEach((w, i) => { VALUE[fold(w)] = i; });
TEENS.forEach((w, i) => { VALUE[fold(w)] = 10 + i; });
TWENTIES.forEach((w, i) => { VALUE[fold(w)] = 20 + i; });
TENS.forEach((w, i) => { if (w) VALUE[fold(w)] = i * 10; });
HUNDREDS.forEach((w, i) => { if (w) { VALUE[fold(w)] = i * 100; VALUE[fold(w.replace(/os$/, 'as'))] = i * 100; } });
Object.assign(VALUE, { un: 1, una: 1, veintiun: 21, veintiuna: 21, cien: 100, ciento: 100 });

/** "dos mil veintiséis" -> 2026; null if the words are not a number in range. */
export function wordsToNumber(text: string): number | null {
  const toks = fold(text).replace(/ de$/, '').split(' ').filter((t) => t && t !== 'y');
  if (!toks.length) return null;
  let total = 0, group = 0;
  for (const t of toks) {
    if (t === 'millon' || t === 'millones') { total += (group || 1) * 1_000_000; group = 0; continue; }
    if (t === 'mil') { total += (group || 1) * 1000; group = 0; continue; }
    const v = VALUE[t];
    if (v === undefined) return null;
    group += v;
  }
  const n = total + group;
  return n <= 999_999_999 ? n : null;
}

/* ---------------- Ordinals 1-20 ---------------- */
const ORD = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo',
  'undécimo', 'duodécimo', 'decimotercero', 'decimocuarto', 'decimoquinto', 'decimosexto', 'decimoséptimo', 'decimoctavo', 'decimonoveno', 'vigésimo'];
/** 1 -> "primero"; before a masculine noun "primer", "tercer" (el primer día, el decimotercer piso); feminine "primera". */
export function ordinal(n: number, o: NumOptions = {}): string {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError(`ordinal: ${n} is not from 1 to 20`);
  const w = ORD[n];
  if (o.gender === 'f') return w.replace(/o$/, 'a');
  if (o.beforeNoun && /(primero|tercero)$/.test(w)) return w.slice(0, -1);
  return w;
}

/* ---------------- Prices, years, dates ---------------- */
/** 3.5 -> "tres euros con cincuenta"; 1 -> "un euro"; 21 -> "veintiún euros"; 0.5 -> "cincuenta céntimos". */
export function price(amount: number, cur: { singular: string; plural: string; gender?: NumGender; cents?: [string, string] } = { singular: 'euro', plural: 'euros' }): string {
  const cents = Math.round(amount * 100);
  if (cents < 0) throw new RangeError('price: negative amount');
  const whole = Math.floor(cents / 100), c = cents % 100;
  const [cs, cp] = cur.cents ?? ['céntimo', 'céntimos'];
  if (!whole) return countNoun(c, cs, cp);
  const main = countNoun(whole, cur.singular, cur.plural, cur.gender ?? 'm');
  return c ? `${main} con ${numberToWords(c)}` : main;
}
/** 1995 -> "mil novecientos noventa y cinco"; 2021 -> "dos mil veintiuno". */
export const year = (y: number): string => numberToWords(y);
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** 2026-11-19 -> "jueves, diecinueve de noviembre de dos mil veintiséis" (day 1: "uno", as in Spain). */
export function date(d: { y: number; m: number; d: number }, o: { weekday?: boolean } = {}): string {
  const s = `${numberToWords(d.d)} de ${MONTHS[d.m - 1]} de ${year(d.y)}`;
  if (!o.weekday) return s;
  const wd = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${s}`;
}
