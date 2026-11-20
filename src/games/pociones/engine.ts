/**
 * Pociones de números: tasks and checking. Pure (tested). Numbers, gender and apocope come from src/lang/es/numbers.ts.
 * Every word answer is the number as it goes before its noun (veintiún globos, doscientas personas, el tercer piso),
 * so gender and apocope are checked; accents are near misses ("¡Casi!"), not errors.
 */
import { MONTHS, countNoun, numberToWords, ordinal, price, wordsToNumber, year } from '../../lang/es/numbers.ts';
import { checkAnswer, pick, randInt, rng, shuffle, type Checked } from '../kit/answer.ts';

export type ModeId = 'contar' | 'cien' | 'mil' | 'millones' | 'ordinales' | 'precios' | 'fechas' | 'mezcla';
export const MODES: { id: ModeId; level: string; listen: boolean }[] = [
  { id: 'contar', level: 'A1', listen: true },
  { id: 'cien', level: 'A2', listen: true },
  { id: 'mil', level: 'A2', listen: true },
  { id: 'precios', level: 'A2', listen: true },
  { id: 'millones', level: 'B1', listen: true },
  { id: 'ordinales', level: 'B1', listen: true },
  { id: 'fechas', level: 'B1', listen: true },
  { id: 'mezcla', level: 'B2–C1', listen: true },
];

export interface Noun { singular: string; plural: string; gender: 'm' | 'f'; shape?: string }
/** Things in the cauldron (each has a silhouette, decor.pociones.<shape>). */
export const SHAPES: Noun[] = [
  { singular: 'estrella', plural: 'estrellas', gender: 'f', shape: 'estrella' },
  { singular: 'gota', plural: 'gotas', gender: 'f', shape: 'gota' },
  { singular: 'vela', plural: 'velas', gender: 'f', shape: 'vela' },
  { singular: 'globo', plural: 'globos', gender: 'm', shape: 'globo' },
  { singular: 'corazón', plural: 'corazones', gender: 'm', shape: 'corazon' },
  { singular: 'huevo', plural: 'huevos', gender: 'm', shape: 'huevo' },
];
export const NOUNS: Noun[] = [
  { singular: 'persona', plural: 'personas', gender: 'f' }, { singular: 'libro', plural: 'libros', gender: 'm' },
  { singular: 'casa', plural: 'casas', gender: 'f' }, { singular: 'árbol', plural: 'árboles', gender: 'm' },
  { singular: 'botella', plural: 'botellas', gender: 'f' }, { singular: 'kilómetro', plural: 'kilómetros', gender: 'm' },
  { singular: 'página', plural: 'páginas', gender: 'f' }, { singular: 'euro', plural: 'euros', gender: 'm' },
];
const ORD_NOUNS: Noun[] = [
  { singular: 'piso', plural: 'pisos', gender: 'm' }, { singular: 'planta', plural: 'plantas', gender: 'f' },
  { singular: 'puesto', plural: 'puestos', gender: 'm' }, { singular: 'vez', plural: 'veces', gender: 'f' },
  { singular: 'día', plural: 'días', gender: 'm' }, { singular: 'fila', plural: 'filas', gender: 'f' },
];

export interface Task {
  mode: ModeId;
  /** what is shown: objects to count, or written digits */
  show: { kind: 'count'; n: number; tens: number; shape: string } | { kind: 'text'; text: string };
  /** words before / after the answer field ("el", "piso", "personas") */
  prefix?: string; suffix?: string;
  /** accepted written answers (first = shown when wrong) */
  accepted: string[];
  /** the number itself, when the answer is a number (for "same number, check the form" hints) */
  n?: number;
  /** what is typed in digits in the counting step and in listening (e.g. "21", "3,50", "1995") */
  digits: string;
  /** the full phrase the device voice reads */
  spoken: string;
}

/** Number words before a noun: "veintiún" (globos), "doscientas" (personas), "un millón de" (euros). */
export function numberBefore(n: number, noun: Noun): string {
  const full = countNoun(n, noun.singular, noun.plural, noun.gender);
  return full.slice(0, full.length - (n === 1 ? noun.singular : noun.plural).length).trim();
}
const nounFor = (n: number, noun: Noun) => (n === 1 ? noun.singular : noun.plural);
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function numberTask(mode: ModeId, n: number, noun: Noun, show: Task['show']): Task {
  const words = numberBefore(n, noun);
  return { mode, show, suffix: nounFor(n, noun), accepted: [words], n, digits: String(n), spoken: `${words} ${nounFor(n, noun)}` };
}

export function makeTask(mode: ModeId, r: () => number): Task {
  switch (mode) {
    case 'contar': { const noun = pick(SHAPES, r); const n = randInt(1, 20, r); return numberTask(mode, n, noun, { kind: 'count', n, tens: 0, shape: noun.shape! }); }
    case 'cien': { const noun = pick(SHAPES, r); const n = randInt(21, 99, r); return numberTask(mode, n, noun, { kind: 'count', n, tens: Math.floor(n / 10), shape: noun.shape! }); }
    case 'mil': { const noun = pick(NOUNS, r); const n = r() < 0.3 ? randInt(1, 9, r) * 100 + pick([0, 1, 21, 31], r) : randInt(101, 999, r); return numberTask(mode, n, noun, { kind: 'text', text: group(n) }); }
    case 'millones': {
      const noun = pick(NOUNS, r);
      const n = r() < 0.5 ? randInt(1, 999, r) * 1000 + (r() < 0.5 ? 0 : randInt(1, 999, r)) : randInt(1, 30, r) * 1_000_000 + (r() < 0.5 ? 0 : randInt(1, 999, r) * 1000);
      return numberTask(mode, n, noun, { kind: 'text', text: group(n) });
    }
    case 'ordinales': {
      const noun = pick(ORD_NOUNS, r); const n = r() < 0.4 ? pick([1, 3, 13], r) : randInt(1, 20, r);
      const w = ordinal(n, { gender: noun.gender, beforeNoun: true });
      const art = noun.gender === 'f' ? 'la' : 'el';
      return { mode, show: { kind: 'text', text: `${n}.${noun.gender === 'f' ? 'ª' : 'º'} ${noun.singular}` }, prefix: art, suffix: noun.singular, accepted: [w], digits: String(n), spoken: `${art} ${w} ${noun.singular}` };
    }
    case 'precios': {
      const whole = r() < 0.15 ? 0 : randInt(1, r() < 0.7 ? 30 : 999, r);
      const cents = whole === 0 ? pick([1, 5, 21, 50, 90], r) : pick([0, 0, 1, 5, 10, 20, 21, 25, 50, 75, 95, 99], r);
      const amount = whole + cents / 100;
      const main = price(amount);
      const accepted = [main];
      if (whole && cents) {
        accepted.push(`${countNoun(whole, 'euro', 'euros')} y ${countNoun(cents, 'céntimo', 'céntimos')}`);
        accepted.push(`${countNoun(whole, 'euro', 'euros')} con ${countNoun(cents, 'céntimo', 'céntimos')}`);
      }
      const text = `${whole},${String(cents).padStart(2, '0')} €`;
      return { mode, show: { kind: 'text', text }, accepted: [...new Set(accepted)], digits: `${whole},${String(cents).padStart(2, '0')}`, spoken: main };
    }
    case 'fechas': {
      if (r() < 0.5) { const y = randInt(1900, 2035, r); return { mode, show: { kind: 'text', text: String(y) }, prefix: 'en', accepted: [year(y)], n: y, digits: String(y), spoken: `en ${year(y)}` }; }
      const y = randInt(1950, 2035, r), m = randInt(1, 12, r), d = r() < 0.15 ? 1 : randInt(1, 28, r);
      const words = `${numberToWords(d)} de ${MONTHS[m - 1]} de ${year(y)}`;
      const accepted = [words]; if (d === 1) accepted.push(`primero de ${MONTHS[m - 1]} de ${year(y)}`);
      return { mode, show: { kind: 'text', text: `${d}/${m}/${y}` }, prefix: 'el', accepted, digits: `${d}/${m}/${y}`, spoken: `el ${words}` };
    }
    case 'mezcla': return makeTask(pick(['mil', 'millones', 'ordinales', 'precios', 'fechas'] as ModeId[], r), r);
  }
}

export const ROUND = 8;
export function makeRound(mode: ModeId, seed: number, n = ROUND): Task[] {
  const r = rng(seed);
  const out: Task[] = [];
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const task = makeTask(mode, r);
    if (!out.some((x) => x.spoken === task.spoken)) out.push(task);
  }
  return shuffle(out, r);
}

/** Checks the written answer; a wrong form of the right number gets a gender / apocope hint. */
export function checkWords(task: Task, typed: string): Checked & { hint?: string } {
  const c = checkAnswer(typed, task.accepted);
  if (c.verdict !== 'wrong' || task.n === undefined) return c;
  if (wordsToNumber(typed) === task.n) return { ...c, hint: 'Es el número correcto: revisa el género o la forma corta (un, veintiún, doscientas).' };
  return c;
}

/** Digits typed (counting step and listening): spaces, dots and a trailing ",00" are ignored; "3.5" equals "3,50". */
export function checkDigits(task: Task, typed: string): boolean {
  const norm = (s: string) => {
    const x = s.replace(/[\s€]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    if (x.includes('/')) return x.split('/').map((p) => String(Number(p))).join('/');
    const [w, c = ''] = x.replace('.', ',').split(',');
    return c ? `${Number(w)},${c.padEnd(2, '0').slice(0, 2)}` : String(Number(w));
  };
  const a = norm(typed), b = norm(task.digits);
  return a === b || (b.endsWith(',00') && a === b.slice(0, -3));
}
