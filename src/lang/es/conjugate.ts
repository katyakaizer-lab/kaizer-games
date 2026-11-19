/**
 * Spanish verb conjugation (Spain, tú/vosotros; voseo is a later flag): every simple and compound tense of the
 * indicative and subjunctive, the conditional, the affirmative and negative imperative, gerund and participle.
 *
 * A verb has a model id (word bank field verbModel). Tokens joined with "+":
 *   regular                       hablar, comer, vivir
 *   e-ie, o-ue, e-i, u-ue         stem changes in stressed syllables (pensar, contar, pedir, jugar); -ir verbs also
 *                                 change e>i / o>u in the preterite 3rd persons, subjunctive nosotros/vosotros and
 *                                 gerund (sintió, durmamos, pidiendo)
 *   zc                            conocer -> conozco
 *   iar, uar                      enviar -> envío, continuar -> continúo
 *   c-qu, g-gu, z-c, gu-gü, g-j, gu-g, c-z, i-y    spelling changes; applied automatically from the ending of the
 *                                 infinitive (busqué, llegué, empecé, averigüé, cojo, sigo, venzo, leyó, construyo),
 *                                 listed in the id for learners and checked by the validator
 *   <irregular verb>              ser, estar, ir, haber, tener, hacer, decir, poder, poner, querer, saber, venir, dar,
 *                                 ver, salir, traer, oír, caber, valer, andar, caer, conducir (-ducir), reír, oler...
 *                                 Prefixed verbs use their base: mantener -> "tener", componer -> "poner".
 * A reflexive infinitive (lavarse) adds pronouns: me lavo, me he lavado, lávate, no te laves, lavándose.
 * Accents of attached pronouns come from the stress engine (lávate, lavémonos, estate, envíate).
 * Pure functions; the 100 most common verbs are tested against hand-checked tables (tests/conjugate.test.ts).
 */
import { spellWithStress, stress, stripAccents } from './stress.ts';
import { syllabify } from './syllabify.ts';

export type Persons = [string, string, string, string, string, string];
export interface ImpForms { tu: string; usted: string; nosotros: string; vosotros: string; ustedes: string }
export interface Conjugation {
  infinitive: string; reflexive: boolean; model: string;
  gerund: string; participle: string;
  indicative: {
    presente: Persons; imperfecto: Persons; preterito: Persons; futuro: Persons; condicional: Persons;
    perfecto: Persons; pluscuamperfecto: Persons; preteritoAnterior: Persons; futuroPerfecto: Persons; condicionalPerfecto: Persons;
  };
  subjunctive: {
    presente: Persons; imperfecto: Persons; imperfectoSe: Persons; futuro: Persons;
    perfecto: Persons; pluscuamperfecto: Persons; pluscuamperfectoSe: Persons; futuroPerfecto: Persons;
  };
  imperative: { affirmative: ImpForms; negative: ImpForms };
}
export const PERSONS = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ustedes'] as const;
const PRON = ['me', 'te', 'se', 'nos', 'os', 'se'];

type Cls = 'ar' | 'er' | 'ir';
type StemChange = 'e-ie' | 'o-ue' | 'e-i' | 'u-ue';
interface Irregular {
  pres?: Persons; presYo?: string; presStem?: StemChange;
  subj?: Persons; subjStem?: string;
  impf?: Persons;
  pret?: Persons; strong?: string; strongJ?: boolean; strong3s?: string;
  fut?: string; impTu?: string; impVos?: string; impNos?: string;
  ger?: string; part?: string;
  /** a -cir/-cer verb with zc in the present (conducir) */
  zc?: boolean;
}
const P = (s: string) => s.split(' ') as Persons;

/** Irregular verbs (the base of each family). */
export const IRREGULAR: Record<string, Irregular> = {
  ser: { pres: P('soy eres es somos sois son'), subj: P('sea seas sea seamos seáis sean'), impf: P('era eras era éramos erais eran'), pret: P('fui fuiste fue fuimos fuisteis fueron'), impTu: 'sé', ger: 'siendo', part: 'sido' },
  estar: { pres: P('estoy estás está estamos estáis están'), subj: P('esté estés esté estemos estéis estén'), strong: 'estuv', impTu: 'está' },
  ir: { pres: P('voy vas va vamos vais van'), subj: P('vaya vayas vaya vayamos vayáis vayan'), impf: P('iba ibas iba íbamos ibais iban'), pret: P('fui fuiste fue fuimos fuisteis fueron'), impTu: 've', impVos: 'id', impNos: 'vamos', ger: 'yendo', part: 'ido' },
  haber: { pres: P('he has ha hemos habéis han'), subj: P('haya hayas haya hayamos hayáis hayan'), strong: 'hub', fut: 'habr', impTu: 'he' },
  tener: { presYo: 'tengo', presStem: 'e-ie', strong: 'tuv', fut: 'tendr', impTu: 'ten' },
  hacer: { presYo: 'hago', strong: 'hic', strong3s: 'hizo', fut: 'har', impTu: 'haz', part: 'hecho' },
  decir: { presYo: 'digo', presStem: 'e-i', strong: 'dij', strongJ: true, fut: 'dir', impTu: 'di', part: 'dicho' },
  poder: { presStem: 'o-ue', strong: 'pud', fut: 'podr', ger: 'pudiendo' },
  poner: { presYo: 'pongo', strong: 'pus', fut: 'pondr', impTu: 'pon', part: 'puesto' },
  querer: { presStem: 'e-ie', strong: 'quis', fut: 'querr' },
  saber: { presYo: 'sé', subjStem: 'sep', strong: 'sup', fut: 'sabr' },
  venir: { presYo: 'vengo', presStem: 'e-ie', strong: 'vin', fut: 'vendr', impTu: 'ven' },
  dar: { pres: P('doy das da damos dais dan'), subj: P('dé des dé demos deis den'), pret: P('di diste dio dimos disteis dieron') },
  ver: { pres: P('veo ves ve vemos veis ven'), subjStem: 've', impf: P('veía veías veía veíamos veíais veían'), pret: P('vi viste vio vimos visteis vieron'), part: 'visto' },
  salir: { presYo: 'salgo', fut: 'saldr', impTu: 'sal' },
  traer: { presYo: 'traigo', strong: 'traj', strongJ: true },
  caer: { presYo: 'caigo' },
  'oír': { pres: P('oigo oyes oye oímos oís oyen'), subjStem: 'oig', fut: 'oir' },
  caber: { presYo: 'quepo', subjStem: 'quep', strong: 'cup', fut: 'cabr' },
  valer: { presYo: 'valgo', fut: 'valdr' },
  andar: { strong: 'anduv' },
  conducir: { zc: true, strong: 'conduj', strongJ: true },
  'reír': { pres: P('río ríes ríe reímos reís ríen'), subj: P('ría rías ría riamos riáis rían'), pret: P('reí reíste rio reímos reísteis rieron'), fut: 'reir', impTu: 'ríe', ger: 'riendo', part: 'reído' },
  oler: { pres: P('huelo hueles huele olemos oléis huelen'), subj: P('huela huelas huela olamos oláis huelan'), impTu: 'huele' },
};
/** Families: a prefixed verb conjugates like its base (mantener like tener). -ducir verbs follow conducir. */
const FAMILY_BASES = ['tener', 'venir', 'poner', 'hacer', 'traer', 'caer', 'salir', 'reír', 'oír', 'decir'];
/** Prefixed verbs that do not follow their base (bendecir, prever...). */
const NOT_FAMILY = new Set(['bendecir', 'maldecir', 'prever', 'proveer', 'deber', 'beber', 'creer', 'leer', 'atener']);

/** Irregular participles by ending (descubrir -> descubierto, devolver -> devuelto). */
const PARTICIPLE_ENDINGS: [string, string][] = [
  ['abrir', 'abierto'], ['cubrir', 'cubierto'], ['scribir', 'scrito'], ['volver', 'vuelto'], ['solver', 'suelto'],
  ['romper', 'roto'], ['morir', 'muerto'], ['freír', 'frito'], ['imprimir', 'impreso'], ['hacer', 'hecho'], ['poner', 'puesto'],
];

const lowerEs = (s: string) => s.toLocaleLowerCase('es');

/** Splits the model id into tokens. */
export const modelTokens = (model: string) => model.split('+').map((t) => t.trim()).filter(Boolean);

/** Which irregular table a verb uses (itself, its family base, or -ducir), if any. */
export function irregularBase(inf: string, model = ''): { base: string; prefix: string } | null {
  for (const t of modelTokens(model)) if (IRREGULAR[t]) return { base: t, prefix: inf.endsWith(t) ? inf.slice(0, -t.length) : '' };
  if (IRREGULAR[inf]) return { base: inf, prefix: '' };
  if (/ducir$/.test(inf)) return { base: 'conducir', prefix: '' };
  if (NOT_FAMILY.has(inf)) return null;
  for (const b of FAMILY_BASES) if (inf.endsWith(b) && inf.length > b.length) return { base: b, prefix: inf.slice(0, -b.length) };
  return null;
}

/** A model id guessed from the infinitive (used when a verb has none, and by the validator as a hint). */
export function guessModel(inf: string): string {
  const v = lowerEs(inf).replace(/se$/, '');
  const irr = irregularBase(v);
  if (irr) return irr.base;
  const t: string[] = [];
  if (/[aeiouáéíóú]c(er|ir)$/.test(v) && !/^(cocer|mecer|hacer|decir)$/.test(v)) t.push('zc');
  if (/car$/.test(v)) t.push('c-qu');
  if (/guar$/.test(v)) t.push('gu-gü'); else if (/gar$/.test(v)) t.push('g-gu');
  if (/zar$/.test(v)) t.push('z-c');
  if (/g(er|ir)$/.test(v)) t.push('g-j');
  if (/guir$/.test(v)) t.push('gu-g');
  if (/[^aeiou]c(er|ir)$/.test(v)) t.push('c-z');
  if (/uir$/.test(v) && !/(gu|qu)ir$/.test(v)) t.push('i-y');
  if (/[aeo](er|ír|ir)$/.test(v)) t.push('i-y');
  return t.length ? t.join('+') : 'regular';
}

/** The spelling changes a verb needs, from its infinitive (for the validator: declared ids must match). */
export function spellingChanges(inf: string): string[] {
  return modelTokens(guessModel(inf)).filter((t) => ['c-qu', 'g-gu', 'z-c', 'gu-gü', 'g-j', 'gu-g', 'c-z', 'i-y'].includes(t));
}

/* ---------------- Building blocks ---------------- */
const END: Record<Cls, Record<string, string[]>> = {
  ar: {
    pres: ['o', 'as', 'a', 'amos', 'áis', 'an'], impf: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
    pret: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], subj: ['e', 'es', 'e', 'emos', 'éis', 'en'],
  },
  er: {
    pres: ['o', 'es', 'e', 'emos', 'éis', 'en'], impf: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], subj: ['a', 'as', 'a', 'amos', 'áis', 'an'],
  },
  ir: {
    pres: ['o', 'es', 'e', 'imos', 'ís', 'en'], impf: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], subj: ['a', 'as', 'a', 'amos', 'áis', 'an'],
  },
};
const FUT = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
const COND = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
const STRONG = ['e', 'iste', 'o', 'imos', 'isteis', 'ieron'];
const STRESSED_STEM = [0, 1, 2, 5];

/** Applies a stem change to the last matching vowel of the stem. */
function changeStem(stem: string, ch: StemChange | 'e-i2' | 'o-u2'): string {
  const [from, to] = ch === 'e-ie' ? ['e', 'ie'] : ch === 'o-ue' ? ['o', 'ue'] : ch === 'u-ue' ? ['u', 'ue'] : ch === 'o-u2' ? ['o', 'u'] : ['e', 'i'];
  // In "gu"/"qu" the u is silent: the vowel to change is before it (seguir -> sigu).
  let i = stem.lastIndexOf(from);
  if (from === 'u') i = stem.lastIndexOf('u');
  if (i < 0) return stem;
  const changed = stem.slice(0, i) + to + stem.slice(i + 1);
  return i === 0 && to === 'ue' ? `h${changed}` : changed;
}

interface Verb { inf: string; stem: string; cls: Cls; tokens: string[]; irr: Irregular | null; prefix: string; base: string }

/** Joins stem and ending with the automatic spelling changes (busqué, cojo, sigo, venzo, conozco, leyó...). */
function join(v: Verb, stem: string, ending: string, opts: { zc?: boolean } = {}): string {
  const e0 = stripAccents(ending[0] ?? '');
  const inf = v.inf;
  let s = stem;
  if (e0 === 'e') {
    if (/car$/.test(inf) && s.endsWith('c')) s = `${s.slice(0, -1)}qu`;
    else if (/guar$/.test(inf) && s.endsWith('gu')) s = `${s.slice(0, -2)}gü`;
    else if (/gar$/.test(inf) && s.endsWith('g')) s = `${s}u`;
    else if (/zar$/.test(inf) && s.endsWith('z')) s = `${s.slice(0, -1)}c`;
  }
  if (e0 === 'a' || e0 === 'o') {
    if (/c(er|ir)$/.test(inf) && s.endsWith('c')) s = opts.zc ? `${s.slice(0, -1)}zc` : `${s.slice(0, -1)}z`;
    else if (/guir$/.test(inf) && s.endsWith('gu')) s = s.slice(0, -1);
    else if (/g(er|ir)$/.test(inf) && s.endsWith('g')) s = `${s.slice(0, -1)}j`;
    else if (/quir$/.test(inf) && s.endsWith('qu')) s = `${s.slice(0, -2)}c`;
  }
  // -uir (construir): y before a, e, o.
  const uir = /[^gq]uir$/.test(inf) || /^uir$/.test(inf);
  if (uir && s.endsWith('u') && 'aeoáéó'.includes(ending[0] ?? '')) s = `${s}y`;
  // Vowel stems (leer, caer, oír, construir): unstressed i between vowels -> y; stressed i after a, e, o -> í.
  if (/[aeou]$/.test(s) && !/[gq]u$/.test(s) && ending[0] === 'i') {
    if (/^i[aeoáéó]/.test(ending)) return `${s}y${ending.slice(1)}`;
    if (/[aeo]$/.test(s)) return `${s}í${ending.slice(1)}`;
  }
  return s + ending;
}

/** Accent of the stem vowel for -iar/-uar verbs with stressed í/ú (envío, continúo). */
const accentWeak = (stem: string): string => stem.replace(/([iu])([^aeiou]*)$/, (m, w, rest) => (w === 'i' ? 'í' : 'ú') + rest);

function parse(infinitive: string, model?: string): Verb {
  const inf = lowerEs(infinitive.trim());
  const cls = (stripAccents(inf).slice(-2) as Cls);
  if (!['ar', 'er', 'ir'].includes(cls)) throw new Error(`conjugate: "${infinitive}" is not an infinitive`);
  const m = model ?? guessModel(inf);
  const tokens = modelTokens(m);
  const ib = irregularBase(inf, m);
  let irr = ib ? IRREGULAR[ib.base] : null;
  // -ducir verbs: conduzco, conduje; the strong stem is the verb's own (traducir -> traduj).
  if (ib?.base === 'conducir') irr = { ...irr, strong: `${inf.slice(0, -3)}j` };
  return { inf, stem: inf.slice(0, -2), cls, tokens, irr, prefix: ib?.base === 'conducir' ? '' : ib?.prefix ?? '', base: ib?.base ?? '' };
}

/** Prefixed forms of a family (mantener: mantengo, mantén): adds the prefix and fixes the accent. */
function withPrefix(v: Verb, form: string): string {
  if (!v.prefix || !form) return form;
  const whole = v.prefix + form;
  // A one-syllable base form becomes an aguda: ten -> mantén, ve -> prevé, pon -> compón.
  if (syllabify(form).length === 1 && syllabify(whole).length > 1) return spellWithStress(whole, syllabify(whole).length - 1);
  return whole;
}
/** For an irregular family verb, forms are computed for the base verb and then prefixed. */
function baseVerb(v: Verb): Verb {
  if (!v.prefix) return v;
  return { ...v, inf: v.base, stem: v.base.slice(0, -2), prefix: '' };
}
const stemChangeOf = (v: Verb): StemChange | null => (v.irr?.presStem ?? (v.tokens.find((t) => ['e-ie', 'o-ue', 'e-i', 'u-ue'].includes(t)) as StemChange | undefined) ?? null);
const secondary = (v: Verb): 'e-i2' | 'o-u2' | null => {
  if (v.cls !== 'ir') return null;
  const ch = stemChangeOf(v);
  return ch === 'e-ie' || ch === 'e-i' ? 'e-i2' : ch === 'o-ue' ? 'o-u2' : null;
};
const isZc = (v: Verb) => v.tokens.includes('zc') || !!v.irr?.zc;

function presente(v: Verb): Persons {
  if (v.irr?.pres) return v.irr.pres;
  const ch = stemChangeOf(v);
  const acc = v.tokens.includes('iar') || v.tokens.includes('uar');
  const out = END[v.cls].pres.map((e, i) => {
    let st = v.stem;
    if (STRESSED_STEM.includes(i)) { if (ch) st = changeStem(st, ch); if (acc) st = accentWeak(st); }
    return join(v, st, e, { zc: isZc(v) });
  }) as Persons;
  if (v.irr?.presYo) out[0] = v.irr.presYo;
  return out;
}
function subjPresente(v: Verb): Persons {
  if (v.irr?.subj) return v.irr.subj;
  const ends = END[v.cls === 'ar' ? 'ar' : 'er'].subj;
  const fixed = v.irr?.subjStem ?? (v.irr?.presYo ? v.irr.presYo.replace(/o$/, '') : null);
  if (fixed) return ends.map((e) => fixed + e) as Persons;
  const ch = stemChangeOf(v), sec = secondary(v);
  const acc = v.tokens.includes('iar') || v.tokens.includes('uar');
  return ends.map((e, i) => {
    let st = v.stem;
    if (STRESSED_STEM.includes(i)) { if (ch) st = changeStem(st, ch); if (acc) st = accentWeak(st); }
    else if (sec) st = changeStem(st, sec);
    return join(v, st, e, { zc: isZc(v) });
  }) as Persons;
}
function imperfecto(v: Verb): Persons {
  if (v.irr?.impf) return v.irr.impf;
  return END[v.cls].impf.map((e) => join(v, v.stem, e)) as Persons;
}
function preterito(v: Verb): Persons {
  if (v.irr?.pret) return v.irr.pret;
  if (v.irr?.strong) {
    const out = STRONG.map((e) => v.irr!.strong + e) as Persons;
    if (v.irr.strongJ) out[5] = `${v.irr.strong}eron`;
    if (v.irr.strong3s) out[2] = v.irr.strong3s;
    return out;
  }
  const sec = secondary(v);
  return END[v.cls].pret.map((e, i) => join(v, sec && (i === 2 || i === 5) ? changeStem(v.stem, sec) : v.stem, e)) as Persons;
}
const futStem = (v: Verb) => v.irr?.fut ?? stripAccents(v.inf);
const futuro = (v: Verb) => FUT.map((e) => futStem(v) + e) as Persons;
const condicional = (v: Verb) => COND.map((e) => futStem(v) + e) as Persons;
/** Imperfect and future subjunctive come from the preterite ellos form (tuvieron -> tuviera, tuviéramos). */
function fromPreterite(v: Verb, ends: string[]): Persons {
  const base = preterito(v)[5].replace(/ron$/, '');
  return ends.map((e, i) => (i === 3 ? spellWithStress(base + e, syllabify(base).length - 1) : base + e)) as Persons;
}
function gerund(v: Verb): string {
  if (v.irr?.ger) return v.irr.ger;
  if (v.cls === 'ar') return `${v.stem}ando`;
  const sec = secondary(v);
  return join(v, sec ? changeStem(v.stem, sec) : v.stem, 'iendo');
}
function participle(v: Verb, full: string): string {
  if (v.irr?.part) return v.irr.part;
  for (const [end, part] of PARTICIPLE_ENDINGS) if (full.endsWith(end)) return full.slice(0, -end.length) + part;
  if (v.cls === 'ar') return `${v.stem}ado`;
  return join(v, v.stem, 'ido');
}

/** Attaches enclitic pronouns with the right accent (lava+te -> lávate, envía+te -> envíate, está+te -> estate). */
export function attach(form: string, pron: string): string {
  const info = stress(form);
  const hiatusAccent = info.hasAccent && info.hiatus.some((h) => /[íú]/.test(h));
  if (hiatusAccent) return form + pron;
  return spellWithStress(stripAccents(form) + pron, info.stressed);
}

/* ---------------- Public API ---------------- */
/** Full conjugation of an infinitive (reflexive with -se). Throws if it is not an infinitive. */
export function conjugate(infinitive: string, model?: string): Conjugation {
  const raw = lowerEs(infinitive.trim());
  const reflexive = /(ar|er|ir|ír)se$/.test(raw);
  const inf = reflexive ? raw.slice(0, -2) : raw;
  const v0 = parse(inf, model);
  const v = v0.prefix ? baseVerb(v0) : v0;
  const pre = (f: string) => withPrefix(v0, f);
  const map6 = (xs: Persons): Persons => xs.map(pre) as Persons;
  const refl = (xs: Persons): Persons => (reflexive ? (xs.map((x, i) => `${PRON[i]} ${x}`) as Persons) : xs);

  const pres = map6(presente(v)), subj = map6(subjPresente(v));
  const impf = map6(imperfecto(v)), pret = map6(preterito(v));
  const fut = map6(futuro(v)), cond = map6(condicional(v));
  const vPrefixedPret: Verb = { ...v };
  const sImpf = map6(fromPreterite(vPrefixedPret, ['ra', 'ras', 'ra', 'ramos', 'rais', 'ran']));
  const sImpfSe = map6(fromPreterite(vPrefixedPret, ['se', 'ses', 'se', 'semos', 'seis', 'sen']));
  const sFut = map6(fromPreterite(vPrefixedPret, ['re', 'res', 're', 'remos', 'reis', 'ren']));
  const ger = pre(gerund(v));
  const endPart = PARTICIPLE_ENDINGS.find(([end]) => inf.endsWith(end));
  const part = endPart ? inf.slice(0, -endPart[0].length) + endPart[1] : v.irr?.part ? pre(v.irr.part) : participle(v0.prefix ? { ...v0, irr: null } : v0, inf);

  // Compound tenses: haber + participle.
  const H = (t: keyof Conjugation['indicative'] | keyof Conjugation['subjunctive'], mood: 'ind' | 'sub') => {
    const hv = parse('haber');
    const forms = mood === 'ind'
      ? { perfecto: presente(hv), pluscuamperfecto: imperfecto(hv), preteritoAnterior: preterito(hv), futuroPerfecto: futuro(hv), condicionalPerfecto: condicional(hv) }[t as string]
      : { perfecto: subjPresente(hv), pluscuamperfecto: fromPreterite(hv, ['ra', 'ras', 'ra', 'ramos', 'rais', 'ran']), pluscuamperfectoSe: fromPreterite(hv, ['se', 'ses', 'se', 'semos', 'seis', 'sen']), futuroPerfecto: fromPreterite(hv, ['re', 'res', 're', 'remos', 'reis', 'ren']) }[t as string];
    return refl((forms as Persons).map((h) => `${h} ${part}`) as Persons);
  };

  // Imperative.
  const tu = pre(v.irr?.impTu ?? presente(v)[2]);
  const vos = pre(v.irr?.impVos ?? `${stripAccents(v.inf).slice(0, -1)}d`.replace(/^o(id)$/, 'oíd').replace(/eid$/, 'eíd'));
  const vosAcc = v0.inf.endsWith('ír') ? vos.replace(/id$/, 'íd') : vos;
  const nos = v.irr?.impNos ? pre(v.irr.impNos) : subj[3];
  const aff: ImpForms = reflexive
    ? {
      tu: attach(tu, 'te'), usted: attach(subj[2], 'se'),
      nosotros: attach(nos.replace(/s$/, ''), 'nos'),
      vosotros: v0.inf === 'ir' ? 'idos' : /id$/.test(vosAcc) || /íd$/.test(vosAcc) ? `${vosAcc.slice(0, -2)}íos` : `${vosAcc.slice(0, -1)}os`,
      ustedes: attach(subj[5], 'se'),
    }
    : { tu, usted: subj[2], nosotros: nos, vosotros: vosAcc, ustedes: subj[5] };
  const neg = (i: number) => (reflexive ? `no ${PRON[i]} ${subj[i]}` : `no ${subj[i]}`);
  const negative: ImpForms = { tu: neg(1), usted: neg(2), nosotros: neg(3), vosotros: neg(4), ustedes: neg(5) };

  return {
    infinitive: raw, reflexive, model: model ?? guessModel(inf),
    gerund: reflexive ? attach(ger, 'se') : ger,
    participle: part,
    indicative: {
      presente: refl(pres), imperfecto: refl(impf), preterito: refl(pret), futuro: refl(fut), condicional: refl(cond),
      perfecto: H('perfecto', 'ind'), pluscuamperfecto: H('pluscuamperfecto', 'ind'), preteritoAnterior: H('preteritoAnterior', 'ind'),
      futuroPerfecto: H('futuroPerfecto', 'ind'), condicionalPerfecto: H('condicionalPerfecto', 'ind'),
    },
    subjunctive: {
      presente: refl(subj), imperfecto: refl(sImpf), imperfectoSe: refl(sImpfSe), futuro: refl(sFut),
      perfecto: H('perfecto', 'sub'), pluscuamperfecto: H('pluscuamperfecto', 'sub'), pluscuamperfectoSe: H('pluscuamperfectoSe', 'sub'), futuroPerfecto: H('futuroPerfecto', 'sub'),
    },
    imperative: { affirmative: aff, negative },
  };
}

/** Problems with a verb's model id (unknown tokens, spelling changes that do not match the infinitive). */
export function modelProblems(infinitive: string, model: string): string[] {
  const inf = lowerEs(infinitive).replace(/se$/, '');
  const out: string[] = [];
  const known = new Set(['regular', 'e-ie', 'o-ue', 'e-i', 'u-ue', 'zc', 'iar', 'uar', 'c-qu', 'g-gu', 'z-c', 'gu-gü', 'g-j', 'gu-g', 'c-z', 'i-y', ...Object.keys(IRREGULAR)]);
  const toks = modelTokens(model);
  for (const t of toks) if (!known.has(t)) out.push(`unknown model token "${t}"`);
  if (irregularBase(inf, model)) return out;
  const need = spellingChanges(inf);
  for (const s of need) if (!toks.includes(s)) out.push(`model should list the spelling change ${s}`);
  for (const t of toks) if (['c-qu', 'g-gu', 'z-c', 'gu-gü', 'g-j', 'gu-g', 'c-z', 'i-y'].includes(t) && !need.includes(t)) out.push(`spelling change ${t} does not apply to ${inf}`);
  return out;
}
