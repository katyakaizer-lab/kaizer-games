/**
 * Word review page: /revision/ on the web preview (hidden: noindex, no link from the app) and on the dev server; left
 * out of the store build (npm run build:store).
 * One entry at a time, phone-friendly: the word, gender, plural, level, translations, clues and example, plus the
 * engines' syllables and stress. ✓ Correcto, ✎ Editar (inline fields), ⚑ Dudoso (with a note). Filters by topic, level
 * and status. Decisions are kept on this device and exported as revision-YYYY-MM-DD.json; tools/apply-review.ts applies
 * the file to src/data/words and sets reviewed:true.
 */
import { h, mount } from '../ui/h';
import { allWords, wordTopics } from '../words/bank';
import { analysis } from '../words/rules';
import { conjugate } from '../lang/es/conjugate';
import { CLUE_TYPES, GENDERS, WORD_LEVELS, type Clue, type ClueType, type WordEntry } from '../words/types';
import { diff, makePatch, patchName, type ReviewDecision } from './decisions';
import './revision.css';

const KEY = 'kz.revision.v1';
const FILTER_KEY = 'kz.revision.filter';
type Status = 'todo' | 'all' | 'ok' | 'edited' | 'doubt' | 'reviewed';
interface Filter { topic: string; level: string; status: Status; index: number }

const load = <T>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: decisions stay in memory */ } };

let decisions: Record<string, ReviewDecision> = load(KEY, {});
let filter: Filter = { topic: '', level: '', status: 'todo', index: 0, ...load<Partial<Filter>>(FILTER_KEY, {}) };
let mode: 'view' | 'edit' | 'doubt' = 'view';
const ENTRIES = allWords();
const TOPICS = wordTopics();
const topicName = (id: string) => TOPICS.find((t) => t.id === id)?.name_es ?? id;
const CLUE_LABEL: Record<ClueType, string> = { def: 'Definición', gap: 'Hueco', syn: 'Sinónimo', ant: 'Contrario', use: 'Uso o lugar' };
const GENDER_LABEL: Record<string, string> = { m: 'masculino (el)', f: 'femenino (la)', both: 'el / la', special: 'femenino con el (el agua)' };

/** The entry with the reviewer's edits on top (what will be applied). */
const current = (e: WordEntry): WordEntry => ({ ...e, ...(decisions[e.id]?.changes ?? {}) } as WordEntry);

function matches(e: WordEntry): boolean {
  if (filter.topic && !e.topics.includes(filter.topic)) return false;
  if (filter.level && e.level !== filter.level) return false;
  const d = decisions[e.id]?.status;
  switch (filter.status) {
    case 'todo': return !d && !e.reviewed;
    case 'ok': case 'edited': case 'doubt': return d === filter.status;
    case 'reviewed': return e.reviewed;
    default: return true;
  }
}

function decide(e: WordEntry, d: Omit<ReviewDecision, 'id' | 'at'>) {
  decisions = { ...decisions, [e.id]: { id: e.id, at: new Date().toISOString(), ...d } };
  save(KEY, decisions);
  mode = 'view';
  // In "to review" the decided entry leaves the list, so the same index shows the next one.
  if (filter.status !== 'todo') filter.index++;
  render();
}

/*
 * Export, three ways, so it works on every phone:
 * - Descargar: a .json download (iPhone Safari 13+ asks "¿Descargar…?" and saves it in Archivos > Descargas);
 * - Compartir: the system share sheet with the file (iPhone: AirDrop, Mail, WhatsApp, "Guardar en Archivos"), shown only
 *   where the browser can share files;
 * - Copiar: the JSON as text on the clipboard; if the clipboard is blocked, a box with the text selected to copy by hand.
 */
const patchText = () => `${JSON.stringify(makePatch(decisions), null, 1)}\n`;
let exportMsg = '';
function downloadPatch() {
  const blob = new Blob([patchText()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: patchName(new Date()) });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  exportMsg = `Descargado ${patchName(new Date())}. En iPhone está en Archivos > Descargas.`;
  render();
}
const patchFile = () => new File([patchText()], patchName(new Date()), { type: 'application/json' });
const canShareFile = (): boolean => { try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [patchFile()] }); } catch { return false; } };
async function sharePatch() {
  try { await navigator.share({ files: [patchFile()], title: patchName(new Date()) }); exportMsg = 'Compartido.'; }
  catch (err) { if ((err as Error).name !== 'AbortError') exportMsg = 'No se pudo compartir; usa Descargar o Copiar.'; }
  render();
}
let showText = false;
async function copyPatch() {
  try { await navigator.clipboard.writeText(patchText()); exportMsg = 'Copiado. Pégalo en un mensaje o en un archivo revision.json.'; showText = false; }
  catch { exportMsg = 'El navegador no deja copiar solo: selecciona el texto de abajo y cópialo.'; showText = true; }
  render();
}

const select = (label: string, value: string, options: [string, string][], onChange: (v: string) => void) => {
  const s = h('select', { class: 'rv-select', 'aria-label': label }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))) as HTMLSelectElement;
  s.addEventListener('change', () => onChange(s.value));
  return h('label', { class: 'rv-field' }, h('span', null, label), s);
};

function filters(count: number) {
  const set = (patch: Partial<Filter>) => { filter = { ...filter, ...patch, index: 0 }; save(FILTER_KEY, filter); mode = 'view'; render(); };
  const done = Object.keys(decisions).length;
  return h('section', { class: 'rv-filters' },
    select('Tema', filter.topic, [['', 'Todos'], ...TOPICS.map((t): [string, string] => [t.id, t.name_es])], (v) => set({ topic: v })),
    select('Nivel', filter.level, [['', 'Todos'], ...WORD_LEVELS.map((l): [string, string] => [l, l])], (v) => set({ level: v })),
    select('Estado', filter.status, [['todo', 'Sin revisar'], ['all', 'Todas'], ['ok', '✓ Correcto'], ['edited', '✎ Editado'], ['doubt', '⚑ Dudoso'], ['reviewed', 'Ya revisado (en el código)']], (v) => set({ status: v as Status })),
    h('p', { class: 'rv-count' }, `${count} en la lista · ${done} decididas en este dispositivo`),
    h('div', { class: 'rv-export' },
      h('p', { class: 'rv-export-title' }, `Exportar ${patchName(new Date())}`),
      h('div', { class: 'rv-actions' },
        h('button', { class: 'rv-btn', 'data-export': 'download', onClick: downloadPatch, disabled: !done }, 'Descargar'),
        canShareFile() ? h('button', { class: 'rv-btn', 'data-export': 'share', onClick: () => void sharePatch(), disabled: !done }, 'Compartir') : null,
        h('button', { class: 'rv-btn', 'data-export': 'copy', onClick: () => void copyPatch(), disabled: !done }, 'Copiar')),
      exportMsg ? h('p', { class: 'rv-muted', role: 'status' }, exportMsg) : null,
      showText ? (() => { const ta = h('textarea', { class: 'rv-input rv-note rv-export-text', readonly: true, rows: '6', 'aria-label': 'Texto para copiar' }, patchText()) as HTMLTextAreaElement; setTimeout(() => { ta.focus(); ta.select(); }, 0); return ta; })() : null));
}

function stressLine(e: WordEntry) {
  const a = analysis(e);
  return h('p', { class: 'rv-stress', lang: 'es' },
    ...a.syllables.flatMap((s, i) => [i ? h('span', { class: 'rv-sep' }, '·') : null, h('span', { class: i === a.stressed ? 'rv-syl is-stressed' : 'rv-syl' }, s)]),
    h('span', { class: 'rv-muted' }, ` ${a.type}${a.overridden ? ' (corregido a mano)' : ''}. ${a.reason}`));
}

function verbLine(e: WordEntry) {
  if (e.pos !== 'verb' || !e.verbModel) return null;
  try {
    const c = conjugate(e.lemma, e.verbModel);
    return h('p', { class: 'rv-muted', lang: 'es' }, `Modelo ${e.verbModel}: ${c.indicative.presente[0]}, ${c.indicative.preterito[0]}, ${c.indicative.futuro[0]}, ${c.subjunctive.presente[0]}, ${c.participle}, ${c.gerund}`);
  } catch (err) { return h('p', { class: 'rv-warn' }, `No se conjuga: ${(err as Error).message}`); }
}

function view(e: WordEntry) {
  const c = current(e);
  const d = decisions[e.id];
  const row = (k: string, v: unknown) => (v === undefined || v === '' ? null : h('div', { class: 'rv-row' }, h('dt', null, k), h('dd', { lang: 'es' }, String(v))));
  return h('article', { class: `rv-card ${d ? `is-${d.status}` : ''}` },
    h('header', { class: 'rv-head' },
      h('h2', { class: 'rv-word', lang: 'es' }, c.lemma),
      h('p', { class: 'rv-meta' }, `${c.level} · ${c.pos} · ${c.topics.map(topicName).join(', ')} · ${e.id}`),
      d ? h('p', { class: 'rv-status' }, { ok: '✓ Correcto', edited: '✎ Editado', doubt: `⚑ Dudoso${d.note ? `: ${d.note}` : ''}` }[d.status]) : null),
    stressLine(c),
    h('dl', { class: 'rv-list' },
      row('Género', c.gender ? GENDER_LABEL[c.gender] + (c.genderIrregular ? ' (excepción)' : '') : undefined),
      row('Femenino', c.feminine),
      row('Plural', c.plural ? c.plural + (c.pluralIrregular ? ' (irregular)' : '') : undefined),
      row('Inglés', c.translations.en),
      row('Ruso', c.translations.ru),
      row('Ejemplo', c.example),
      row('Variantes', c.regions?.map((r) => `${r.es} (${r.where})`).join(', ')),
      row('Falsos amigos', c.falseFriends ? Object.entries(c.falseFriends).map(([k, v]) => `${k}: ${v}`).join('; ') : undefined),
      row('Pares mínimos', c.minimalPairs?.join(', ')),
      row('Familia', c.family)),
    h('ol', { class: 'rv-clues' }, c.clues.map((cl) => h('li', null, h('span', { class: 'rv-clue-type' }, CLUE_LABEL[cl.type]), h('span', { lang: 'es' }, cl.text)))),
    verbLine(c),
    h('div', { class: 'rv-actions' },
      h('button', { class: 'rv-btn rv-btn--ok', onClick: () => decide(e, { status: 'ok' }) }, '✓ Correcto'),
      h('button', { class: 'rv-btn', onClick: () => { mode = 'edit'; render(); } }, '✎ Editar'),
      h('button', { class: 'rv-btn rv-btn--doubt', onClick: () => { mode = 'doubt'; render(); } }, '⚑ Dudoso')));
}

function editForm(e: WordEntry) {
  const c = current(e);
  const input = (label: string, value: string, name: string) => h('label', { class: 'rv-field' }, h('span', null, label), h('input', { class: 'rv-input', name, value, lang: 'es' }));
  const clueRows = h('div', { class: 'rv-clue-edit' }, [...c.clues, { type: 'def', text: '' } as Clue].slice(0, 3).map((cl, i) => h('div', { class: 'rv-clue-row' },
    h('select', { class: 'rv-select', name: `clueType${i}`, 'aria-label': `Tipo de pista ${i + 1}` }, CLUE_TYPES.map((t) => h('option', { value: t, selected: t === cl.type }, CLUE_LABEL[t]))),
    h('input', { class: 'rv-input', name: `clueText${i}`, value: cl.text, lang: 'es', 'aria-label': `Pista ${i + 1}`, placeholder: 'Vacío: sin esta pista' }))));
  const form = h('form', { class: 'rv-card rv-form' },
    h('h2', { class: 'rv-word', lang: 'es' }, `Editar: ${e.lemma}`),
    input('Palabra', c.lemma, 'lemma'),
    c.pos === 'noun' ? h('label', { class: 'rv-field' }, h('span', null, 'Género'), h('select', { class: 'rv-select', name: 'gender' }, GENDERS.map((g) => h('option', { value: g, selected: g === c.gender }, GENDER_LABEL[g])))) : null,
    c.pos === 'noun' || c.pos === 'adjective' ? input('Plural', c.plural ?? '', 'plural') : null,
    h('label', { class: 'rv-field' }, h('span', null, 'Nivel'), h('select', { class: 'rv-select', name: 'level' }, WORD_LEVELS.map((l) => h('option', { value: l, selected: l === c.level }, l)))),
    input('Inglés', c.translations.en, 'en'),
    input('Ruso', c.translations.ru, 'ru'),
    clueRows,
    input('Ejemplo', c.example, 'example'),
    c.pos === 'verb' ? input('Modelo del verbo', c.verbModel ?? '', 'verbModel') : null,
    h('div', { class: 'rv-actions' },
      h('button', { class: 'rv-btn rv-btn--ok', type: 'submit' }, 'Guardar'),
      h('button', { class: 'rv-btn', type: 'button', onClick: () => { mode = 'view'; render(); } }, 'Cancelar')));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const clues: Clue[] = [0, 1, 2].map((i) => ({ type: s(`clueType${i}`) as ClueType, text: s(`clueText${i}`) })).filter((cl) => cl.text);
    const edited: Partial<WordEntry> = { lemma: s('lemma'), level: s('level') as WordEntry['level'], translations: { en: s('en'), ru: s('ru') }, clues, example: s('example') };
    if (c.pos === 'noun') edited.gender = s('gender') as WordEntry['gender'];
    if (c.pos === 'noun' || c.pos === 'adjective') edited.plural = s('plural');
    if (c.pos === 'verb') edited.verbModel = s('verbModel');
    const changes = diff(e, edited);
    decide(e, Object.keys(changes).length ? { status: 'edited', changes } : { status: 'ok' });
  });
  return form;
}

function doubtForm(e: WordEntry) {
  const note = h('textarea', { class: 'rv-input rv-note', name: 'note', rows: '3', placeholder: '¿Qué no está bien?', lang: 'es' }, decisions[e.id]?.note ?? '') as HTMLTextAreaElement;
  const form = h('form', { class: 'rv-card rv-form' },
    h('h2', { class: 'rv-word', lang: 'es' }, `⚑ Dudoso: ${e.lemma}`), note,
    h('div', { class: 'rv-actions' },
      h('button', { class: 'rv-btn rv-btn--doubt', type: 'submit' }, 'Marcar como dudoso'),
      h('button', { class: 'rv-btn', type: 'button', onClick: () => { mode = 'view'; render(); } }, 'Cancelar')));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); decide(e, { status: 'doubt', note: note.value.trim() }); });
  return form;
}

function render() {
  const list = ENTRIES.filter(matches);
  filter.index = Math.max(0, Math.min(filter.index, list.length - 1));
  save(FILTER_KEY, filter);
  const e = list[filter.index];
  const nav = h('nav', { class: 'rv-nav' },
    h('button', { class: 'rv-btn', disabled: filter.index <= 0, onClick: () => { filter.index--; mode = 'view'; render(); } }, '← Anterior'),
    h('span', { class: 'rv-count' }, list.length ? `${filter.index + 1} / ${list.length}` : '0 / 0'),
    h('button', { class: 'rv-btn', disabled: filter.index >= list.length - 1, onClick: () => { filter.index++; mode = 'view'; render(); } }, 'Siguiente →'));
  mount(document.getElementById('app')!,
    h('h1', { class: 'rv-title' }, 'Revisión del banco de palabras'),
    h('p', { class: 'rv-muted' }, 'Página oculta para revisar. Las decisiones se guardan en este dispositivo: exporta a menudo (Safari puede borrar los datos de una página que no se abre en una semana).'),
    filters(list.length),
    e ? (mode === 'edit' ? editForm(e) : mode === 'doubt' ? doubtForm(e) : view(e)) : h('p', { class: 'rv-card' }, 'No hay palabras con estos filtros.'),
    nav);
}

render();
