/**
 * Style-test page: palette with live contrast, type scale and font test, every component state,
 * pets with moods and an item, a mock game in phone and tablet width, and a live token panel.
 * Dev tool page: the token panel's font list is the one place outside tokens.css that names fonts.
 */
import { boot } from '../app/boot';
import { registerSW } from '../app/pwa';
import { h, mount } from '../ui/h';
import { icon } from '../ui/icons';
import {
  Button, Card, Chip, FeedbackBanner, Frame, Modal, Panel, ProgressBar, ScoreBadge, TabBar, Tile, Timer, toast, type TileEl,
} from '../ui/components';
import { allArt, artEl } from '../ui/art';
import { PetFigure, PET_IDS, petArtId, petName, type Mood } from '../pets/pets';
import { contrast, MIN } from '../ui/contrast';
import { ACCENT_LINE, CYRILLIC_LINE, fontTest } from '../ui/fonttest';
import pairsFile from '../../tools/contrast-pairs.json';
import './style-test.css';

await boot();
registerSW();

const root = document.documentElement;
const themeParam = new URLSearchParams(location.search).get('theme');
if (themeParam === 'night' || themeParam === 'brote') root.dataset.theme = themeParam;
const css = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
const app = document.getElementById('app')!;

/* ---------- Header and theme switch ---------- */
const header = h('header', { class: 'st-header' },
  h('div', null,
    h('h1', null, 'Style test'),
    h('p', { class: 'st-soft' }, 'Kaizer Games design system, stage 1. Every colour and font below comes from tokens.css.')),
  TabBar({
    label: 'Theme', active: root.dataset.theme ?? 'brote',
    tabs: [{ id: 'brote', label: 'Day (brote)', icon: 'sun' }, { id: 'night', label: 'Night', icon: 'moon' }],
    onChange: (id) => { root.dataset.theme = id; refreshLive(); },
  }));

/* ---------- Palette with live contrast ---------- */
const SWATCHES = ['--bg', '--surface', '--text', '--text-soft', '--border', '--primary', '--secondary', '--accent', '--highlight',
  '--correct-bg', '--correct-line', '--retry-bg', '--retry-line', '--star', '--star-line'];
const swatchGrid = h('div', { class: 'st-swatches' });
const contrastBody = h('tbody');
function renderPalette() {
  mount(swatchGrid, SWATCHES.map((t) => h('div', { class: 'st-swatch' },
    h('span', { class: 'st-swatch__chip', style: { background: `var(${t})` } }),
    h('code', null, t), h('span', { class: 'st-soft' }, css(t)))));
  mount(contrastBody, (pairsFile.pairs as [string, string, keyof typeof MIN, string][]).map(([fg, bg, kind, use]) => {
    let ratio = 0;
    try { ratio = contrast(css(fg), css(bg)); } catch { /* unparsable */ }
    const ok = ratio >= MIN[kind];
    return h('tr', null,
      h('td', null, h('span', { class: 'st-sample', style: { color: `var(${fg})`, background: `var(${bg})` } }, 'Aa ñ ¿?')),
      h('td', null, h('code', null, fg), ' on ', h('code', null, bg), h('br'), h('span', { class: 'st-soft' }, use)),
      h('td', { class: 'st-num' }, `${ratio.toFixed(2)}:1`),
      h('td', null, h('span', { class: `st-pass st-pass--${ok ? 'ok' : 'low'}` }, icon(ok ? 'check' : 'refresh'), ok ? `pass (≥${MIN[kind]})` : `too low (needs ${MIN[kind]})`)));
  }));
}

/* ---------- Type ---------- */
const fontResults = h('ul', { class: 'st-list' });
async function renderFontTest() {
  const res = await fontTest();
  mount(fontResults, res.map((r) => h('li', null,
    h('span', { class: `st-pass st-pass--${r.ok ? 'ok' : 'low'}` }, icon(r.ok ? 'check' : 'refresh'), r.ok ? 'no fallback' : 'FALLBACK'),
    ` ${r.family} ${r.weight} (${r.token}): `, h('span', { lang: r.text === CYRILLIC_LINE ? 'ru' : 'es' }, r.text))));
  root.dataset.fontTest = res.every((r) => r.ok) ? 'pass' : 'fail';
}
const typeSection = Panel({ title: 'Type', children: [
  h('div', { class: 'st-type' },
    h('h1', null, 'Heading 1: La casa de Brote'),
    h('h2', null, 'Heading 2: ¿Dónde está el gato?'),
    h('h3', null, 'Heading 3: ¡Qué bien!'),
    h('p', { lang: 'es' }, 'Body: El gato duerme en la silla. Mañana vamos al jardín con la señora Núñez, ¿vienes?'),
    h('p', null, h('strong', null, 'Body bold: '), h('span', { lang: 'es' }, 'Los niños leen un cuento pequeño.')),
    h('p', { class: 'st-soft' }, 'Secondary text: hints, captions and labels.'),
    h('p', { class: 'st-accent-head k-head', lang: 'es' }, ACCENT_LINE),
    h('p', { class: 'st-accent-body', lang: 'es' }, ACCENT_LINE, ' · ', h('strong', null, ACCENT_LINE)),
    h('p', { lang: 'ru' }, 'Русский интерфейс: Привет! Ёжик читает книгу.')),
  h('h3', null, 'Font test (document.fonts)'),
  fontResults,
  h('p', { class: 'st-soft' }, 'Caveat Brush has no Cyrillic letters, so headings in the Russian interface fall back to the next font in --font-head. Body text (Nunito) includes Cyrillic.'),
] });

/* ---------- Components ---------- */
const timer = Timer({ seconds: 30, label: 'Demo timer' });
const demoModal = () => {
  const m = Modal({
    title: 'Modal',
    children: [h('p', null, 'Focus stays inside. Escape or the close button closes it.')],
    actions: [Button({ label: 'Cancel', variant: 'outline', onClick: () => m.close() }), Button({ label: 'OK', onClick: () => m.close() })],
  });
  m.open();
};
const tileStates: [string, Parameters<typeof Tile>[0]][] = [
  ['idle', { label: 'la mesa', art: 'object.mesa', lang: 'es' }],
  ['selected', { label: 'el libro', art: 'object.libro', state: 'selected', lang: 'es' }],
  ['correct', { label: 'la silla', art: 'object.silla', state: 'correct', lang: 'es' }],
  ['retry', { label: 'la taza', art: 'object.taza', state: 'retry', lang: 'es' }],
  ['disabled', { label: 'la ventana', art: 'object.ventana', disabled: true, lang: 'es' }],
  ['text only', { label: 'hola', lang: 'es' }],
];
const componentsSection = Panel({ title: 'Components', children: [
  h('h3', null, 'Button'),
  h('div', { class: 'st-row' },
    Button({ label: 'Primary', icon: 'play' }), Button({ label: 'Secondary', variant: 'secondary' }), Button({ label: 'Outline', variant: 'outline' }),
    Button({ label: 'Quiet', variant: 'quiet', icon: 'info' }), Button({ label: 'Settings', icon: 'settings', iconOnly: true, variant: 'secondary' }),
    Button({ label: 'Sound off', icon: 'volumeOff', iconOnly: true, variant: 'outline' }), Button({ label: 'Pressed', variant: 'secondary', pressed: true }),
    Button({ label: 'Disabled', disabled: true }), Button({ label: 'Large', size: 'lg', icon: 'star' })),
  h('h3', null, 'Tile'),
  h('div', { class: 'st-tiles' }, tileStates.map(([name, o]) => h('div', { class: 'st-labelled' }, Tile(o), h('span', { class: 'st-soft' }, name)))),
  h('h3', null, 'Chip'),
  h('div', { class: 'st-row' }, Chip({ label: 'A1' }), Chip({ label: 'A2', pressed: true }), Chip({ label: 'B1' }), Chip({ label: 'Cuentos', pressed: true, lang: 'es' })),
  h('h3', null, 'ProgressBar'),
  h('div', { class: 'st-stack' }, ProgressBar({ value: 0, max: 10, label: 'Not started' }), ProgressBar({ value: 3, max: 10, label: 'Constelaciones' }), ProgressBar({ value: 10, max: 10, label: 'Done' })),
  h('h3', null, 'FeedbackBanner'),
  h('div', { class: 'st-stack' },
    FeedbackBanner({ kind: 'correct', hint: 'El gato duerme en la silla.' }),
    FeedbackBanner({ kind: 'retry', hint: 'A question in Spanish opens with ¿ and closes with ?' })),
  h('h3', null, 'Modal, Toast, Timer, ScoreBadge'),
  h('div', { class: 'st-row' },
    Button({ label: 'Open modal', variant: 'outline', onClick: demoModal }),
    Button({ label: 'Show toast', variant: 'outline', onClick: () => toast('Guardado en este dispositivo', { icon: 'check' }) }),
    timer,
    Button({ label: 'Start timer', icon: 'play', iconOnly: true, variant: 'secondary', onClick: () => timer.start() }),
    Button({ label: 'Pause timer', icon: 'pause', iconOnly: true, variant: 'secondary', onClick: () => timer.pause() }),
    Button({ label: 'Reset timer', icon: 'undo', iconOnly: true, variant: 'secondary', onClick: () => timer.reset() }),
    ScoreBadge({ value: 12, label: 'estrellas' })),
  h('h3', null, 'TabBar'),
  TabBar({ label: 'Demo tabs', active: 'a', tabs: [{ id: 'a', label: 'Mapa', icon: 'star' }, { id: 'b', label: 'Cuentos', icon: 'book' }, { id: 'c', label: 'Oído', icon: 'ear' }], onChange: () => {} }),
  h('h3', null, 'Frame and Card'),
  h('div', { class: 'st-grid2' },
    Frame({ children: [h('strong', null, 'Frame, CSS'), h('p', null, 'Pure CSS from tokens (version 1).')] }),
    Frame({ art: 'ui.frame.card', children: [h('strong', null, 'Frame, art "ui.frame.card"'), h('p', null, 'Nine-slice image from the manifest.')] }),
    Card({ title: 'Card with art slot', art: 'scene.house.room1', children: [h('p', { class: 'st-soft' }, 'scene.house.room1 has no file yet, so a placeholder is drawn.')] })),
] });

/* ---------- Pets ---------- */
const moods: Mood[] = ['calma', 'alegria', 'siesta'];
const petsSection = Panel({ title: 'Pets', children: [
  h('p', null, 'Brote (style-test mascot) in the three moods, and with an item (pet-item.boina) placed by the shared rig.'),
  h('div', { class: 'st-pets' },
    moods.map((m) => h('figure', { class: 'st-pet' }, PetFigure({ pet: 'brote', mood: m }), h('figcaption', null, m))),
    h('figure', { class: 'st-pet' }, PetFigure({ pet: 'brote', mood: 'alegria', items: ['pet-item.boina'] }), h('figcaption', null, 'alegria + boina'))),
  h('p', null, 'The five pets to choose from, each with the same item. The item is placed by each pet\'s anchor and scaled by its head width.'),
  h('div', { class: 'st-pets' }, PET_IDS.map((p) => h('figure', { class: 'st-pet' }, PetFigure({ pet: p, items: ['pet-item.boina'] }), h('figcaption', { lang: 'es' }, petName(p))))),
  h('p', { class: 'st-soft' }, `Mood fallback: "comiendo" is not drawn yet, so pet.cat.comiendo resolves to ${petArtId('cat', 'comiendo')}.`),
] });

/* ---------- Mock game ---------- */
const WORDS = [['object.silla', 'la silla'], ['object.mesa', 'la mesa'], ['object.libro', 'el libro'], ['object.taza', 'la taza'], ['object.lampara', 'la lámpara'], ['object.ventana', 'la ventana']];
function mockGame(): HTMLElement {
  const ROUNDS = 3;
  let round = 0;
  const wrap = h('div', { class: 'st-game' });
  const play = () => {
    const target = WORDS[(round * 2 + 1) % WORDS.length];
    const progress = ProgressBar({ value: round, max: ROUNDS, label: 'Ronda' });
    const feedback = h('div', { class: 'st-game__feedback', 'aria-live': 'polite' });
    const tiles: TileEl[] = WORDS.map(([art, word]) => {
      const tile = Tile({ label: word, art, lang: 'es', onClick: () => {
        if (word === target[1]) {
          tile.setState('correct');
          tiles.forEach((x) => { if (x !== tile) x.disabled = true; });
          mount(feedback, FeedbackBanner({ kind: 'correct', hint: target[1] }),
            Button({ label: round + 1 < ROUNDS ? 'Siguiente' : 'Otra vez', icon: 'play', onClick: () => { round = round + 1 >= ROUNDS ? 0 : round + 1; play(); } }));
        } else {
          tile.setState('retry');
          mount(feedback, FeedbackBanner({ kind: 'retry', hint: `Busca: ${target[1]}` }));
        }
      } });
      return tile;
    });
    mount(wrap,
      h('div', { class: 'st-game__top' }, progress, ScoreBadge({ value: round, label: 'estrellas' })),
      h('h2', { class: 'st-game__prompt', lang: 'es' }, 'Toca: ', h('span', null, target[1])),
      h('div', { class: 'st-game__tiles' }, tiles),
      feedback);
  };
  play();
  return wrap;
}
const gameSection = Panel({ title: 'Mock game screen', children: [
  h('p', null, 'A tile-tap vocabulary round with placeholder object art, in phone width (360px) and tablet width (768px). Tap the word asked for.'),
  h('div', { class: 'st-devices' },
    h('div', { class: 'st-device st-device--phone' }, h('div', { class: 'st-device__label st-soft' }, 'Phone 360px'), h('div', { class: 'st-device__screen' }, mockGame())),
    h('div', { class: 'st-device-scroll' }, h('div', { class: 'st-device st-device--tablet' }, h('div', { class: 'st-device__label st-soft' }, 'Tablet 768px'), h('div', { class: 'st-device__screen' }, mockGame())))),
] });

/* ---------- Art report ---------- */
function artReport(): HTMLElement {
  const entries = allArt();
  const placeholders = entries.filter((e) => e.status === 'placeholder');
  const noFile = entries.filter((e) => !e.files?.['1x']);
  return Panel({ title: 'Art ids', children: [
    h('p', null, `${entries.length} ids in the manifest. ${placeholders.length} have status "placeholder". ${noFile.length} have no file and draw a generated shape.`),
    h('div', { class: 'st-art' }, entries.map((e) => h('figure', { class: 'st-art__item' },
      h('div', { class: 'st-art__img' }, artEl(e.id, { decorative: true })),
      h('figcaption', null, h('code', null, e.id), h('br'), h('span', { class: 'st-soft' }, `${e.status}${e.aiGenerated ? ', AI' : ''}${e.files?.['1x'] ? '' : ', no file'}`))))),
  ] });
}

/* ---------- Live token panel ---------- */
function toHex(v: string): string {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return '#000000';
}
const FONT_CHOICES = ['"Caveat Brush", cursive', '"Nunito", sans-serif', 'Georgia, serif', 'system-ui, sans-serif', '"Comic Sans MS", cursive'];
function tokenPanel(): HTMLElement {
  const colour = (token: string, label: string) => {
    const input = h('input', { type: 'color', value: toHex(css(token)), id: `tok${token}` }) as HTMLInputElement;
    input.addEventListener('input', () => { root.style.setProperty(token, input.value); refreshLive(); });
    return h('label', { class: 'st-field', for: `tok${token}` }, h('span', null, label, ' ', h('code', null, token)), input);
  };
  const font = (token: string, label: string) => {
    const sel = h('select', { id: `tok${token}` }, FONT_CHOICES.map((f) => h('option', { value: f }, f))) as HTMLSelectElement;
    sel.value = FONT_CHOICES.find((f) => f.startsWith(`"${css(token).split(',')[0].replace(/"/g, '')}"`)) ?? FONT_CHOICES[0];
    sel.addEventListener('change', () => { root.style.setProperty(token, sel.value); refreshLive(); });
    return h('label', { class: 'st-field', for: `tok${token}` }, h('span', null, label, ' ', h('code', null, token)), sel);
  };
  return h('aside', { class: 'st-tokens', 'aria-label': 'Live tokens' },
    h('details', null,
      h('summary', null, icon('palette'), ' Live tokens'),
      h('div', { class: 'st-tokens__body' },
        h('p', { class: 'st-soft' }, 'Changes apply to the whole page with no code change. Day theme only for paper and forest.'),
        colour('--paper', 'Paper'), colour('--forest', 'Forest'), colour('--mint', 'Mint'),
        font('--font-head', 'Heading font'), font('--font-body', 'Body font'),
        Button({ label: 'Reset tokens', variant: 'outline', icon: 'undo', onClick: () => { root.removeAttribute('style'); location.reload(); } }))));
}

function refreshLive() { renderPalette(); void renderFontTest(); }

mount(app,
  header,
  tokenPanel(),
  Panel({ title: 'Palette and contrast', children: [
    swatchGrid,
    h('div', { class: 'st-table-wrap' }, h('table', { class: 'st-table' },
      h('caption', { class: 'st-soft' }, 'Computed live from the current tokens. Body text needs 4.5:1; icons, lines and large text need 3:1.'),
      h('thead', null, h('tr', null, h('th', null, 'Sample'), h('th', null, 'Pair'), h('th', null, 'Ratio'), h('th', null, 'Result'))),
      contrastBody)),
  ] }),
  typeSection,
  componentsSection,
  petsSection,
  gameSection,
  artReport(),
);
refreshLive();
root.dataset.ready = 'true';
