/**
 * Component library. Games build screens only from these; they never style raw elements.
 * All looks come from tokens (public/tokens.css) via src/ui/ui.css.
 */
import { h, nextId, type Child } from './h';
import { icon, type IconName } from './icons';
import { art, artEl, artEntry } from './art';
import { t } from '../i18n';

/* ---------------- Button ---------------- */
export interface ButtonOpts {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'quiet';
  icon?: IconName;
  /** Show only the icon; `label` becomes the accessible name and tooltip. */
  iconOnly?: boolean;
  size?: 'md' | 'lg';
  disabled?: boolean;
  pressed?: boolean;
  onClick?: (e: MouseEvent) => void;
}
export function Button(o: ButtonOpts): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    class: `k-btn k-btn--${o.variant ?? 'primary'}${o.iconOnly ? ' k-btn--icon' : ''}${o.size === 'lg' ? ' k-btn--lg' : ''}`,
    disabled: o.disabled,
    'aria-label': o.iconOnly ? o.label : undefined,
    title: o.iconOnly ? o.label : undefined,
    'aria-pressed': o.pressed === undefined ? undefined : String(o.pressed),
    onClick: o.onClick,
  }, o.icon ? icon(o.icon) : null, o.iconOnly ? null : h('span', { class: 'k-btn__label' }, o.label));
  return b;
}

/* ---------------- Card / Panel ---------------- */
export function Card(o: { title?: string; children?: Child[]; art?: string; class?: string }): HTMLElement {
  return h('article', { class: `k-card ${o.class ?? ''}` },
    o.art ? h('div', { class: 'k-card__art' }, artEl(o.art, { decorative: true })) : null,
    o.title ? h('h3', { class: 'k-card__title' }, o.title) : null,
    ...(o.children ?? []));
}

export function Panel(o: { title: string; children?: Child[]; level?: 2 | 3 }): HTMLElement {
  const id = nextId('panel');
  const heading = o.level === 3 ? h('h3', { id }, o.title) : h('h2', { id }, o.title);
  return h('section', { class: 'k-panel', 'aria-labelledby': id }, heading, ...(o.children ?? []));
}

/* ---------------- Frame ---------------- */
/**
 * The one component that draws decoration. Version 1 is pure CSS.
 * Pass `art` (a nine-slice image id with `nineSlice` in the manifest) to paint it instead,
 * with no change to any game. Painted frames list the themes they suit (`themes` in the manifest);
 * in any other theme, or if the file is missing, the CSS frame is used.
 */
export function Frame(o: { children?: Child[]; art?: string; class?: string; tag?: 'div' | 'section' }): HTMLElement {
  const el = h(o.tag ?? 'div', { class: `k-frame ${o.class ?? ''}` }, ...(o.children ?? []));
  if (o.art) { el.dataset.frameArt = o.art; applyFrameArt(el); }
  return el;
}

function applyFrameArt(el: HTMLElement): void {
  const id = el.dataset.frameArt!;
  const ref = art(id);
  const entry = artEntry(id);
  const theme = document.documentElement.dataset.theme ?? '';
  const suits = !entry?.themes || entry.themes.includes(theme);
  const ns = entry?.nineSlice ?? { slice: 24, width: 24 };
  const on = !!ref.src && suits;
  el.classList.toggle('k-frame--art', on);
  el.style.borderImage = on ? `url("${ref.src}") ${ns.slice} fill / ${ns.width}px round` : '';
  if (on) el.style.setProperty('--frame-w', `${ns.width}px`); else el.style.removeProperty('--frame-w');
  if (!ref.src) el.dataset.frameMissing = 'true'; else delete el.dataset.frameMissing;
}

/** Re-evaluate painted frames after a theme change. */
export function refreshFrames(): void {
  document.querySelectorAll<HTMLElement>('[data-frame-art]').forEach(applyFrameArt);
}

/* ---------------- Tile ---------------- */
export type TileState = 'idle' | 'selected' | 'correct' | 'retry';
export interface TileOpts { label: string; art?: string; state?: TileState; disabled?: boolean; onClick?: () => void; lang?: string }
export interface TileEl extends HTMLButtonElement { setState(s: TileState): void }
export function Tile(o: TileOpts): TileEl {
  const status = h('span', { class: 'k-tile__status' });
  const b = h('button', { type: 'button', class: 'k-tile', disabled: o.disabled, onClick: o.onClick },
    o.art ? h('span', { class: 'k-tile__art' }, artEl(o.art, { decorative: true })) : null,
    h('span', { class: 'k-tile__label', lang: o.lang }, o.label),
    status) as unknown as TileEl;
  b.setState = (s) => {
    b.dataset.state = s;
    b.setAttribute('aria-pressed', String(s === 'selected'));
    status.replaceChildren();
    if (s === 'correct') status.append(icon('check'), h('span', { class: 'k-sr' }, t('feedback.correct')));
    if (s === 'retry') status.append(icon('refresh'), h('span', { class: 'k-sr' }, t('feedback.retry')));
  };
  b.setState(o.state ?? 'idle');
  return b;
}

/* ---------------- Chip ---------------- */
export function Chip(o: { label: string; pressed?: boolean; onToggle?: (pressed: boolean) => void; lang?: string }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'k-chip', 'aria-pressed': String(!!o.pressed) },
    h('span', { class: 'k-chip__check' }, icon('check')), h('span', { lang: o.lang }, o.label));
  b.addEventListener('click', () => {
    const p = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(p));
    o.onToggle?.(p);
  });
  return b;
}

/* ---------------- ProgressBar ---------------- */
export function ProgressBar(o: { value: number; max: number; label: string }): HTMLElement {
  const pct = o.max > 0 ? Math.round((o.value / o.max) * 100) : 0;
  return h('div', { class: 'k-progress' },
    h('div', { class: 'k-progress__head' }, h('span', null, o.label), h('span', { class: 'k-progress__count' }, `${o.value} / ${o.max}`)),
    h('div', { class: 'k-progress__track', role: 'progressbar', 'aria-label': o.label, 'aria-valuemin': 0, 'aria-valuemax': o.max, 'aria-valuenow': o.value },
      h('div', { class: 'k-progress__fill', style: { width: `${pct}%` } })));
}

/* ---------------- FeedbackBanner ---------------- */
export function FeedbackBanner(o: { kind: 'correct' | 'retry'; title?: string; hint?: string }): HTMLElement {
  return h('div', { class: `k-feedback k-feedback--${o.kind}`, role: 'status' },
    icon(o.kind === 'correct' ? 'check' : 'refresh'),
    h('div', null,
      h('strong', { class: 'k-feedback__title' }, o.title ?? t(o.kind === 'correct' ? 'feedback.correct' : 'feedback.retry')),
      o.hint ? h('p', { class: 'k-feedback__hint' }, o.hint) : null));
}

/* ---------------- Modal ---------------- */
export interface ModalHandle { el: HTMLDialogElement; open(): void; close(): void }
export function Modal(o: { title: string; children?: Child[]; actions?: Child[]; onClose?: () => void }): ModalHandle {
  const id = nextId('modal');
  const dlg = h('dialog', { class: 'k-modal', 'aria-labelledby': id },
    h('div', { class: 'k-modal__head' },
      h('h2', { id }, o.title),
      Button({ label: t('common.close'), icon: 'x', iconOnly: true, variant: 'quiet', onClick: () => handle.close() })),
    h('div', { class: 'k-modal__body' }, ...(o.children ?? [])),
    o.actions ? h('div', { class: 'k-modal__actions' }, ...o.actions) : null);
  dlg.addEventListener('close', () => { dlg.remove(); o.onClose?.(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) handle.close(); });
  const handle: ModalHandle = {
    el: dlg,
    open() {
      document.body.append(dlg);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    },
    close() { if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); } },
  };
  return handle;
}

/* ---------------- Toast ---------------- */
let toastRegion: HTMLElement | null = null;
export function toast(message: string, o: { icon?: IconName; ms?: number } = {}): void {
  if (!toastRegion || !toastRegion.isConnected) {
    toastRegion = h('div', { class: 'k-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const el = h('div', { class: 'k-toast' }, o.icon ? icon(o.icon) : null, h('span', null, message));
  toastRegion.append(el);
  setTimeout(() => { el.classList.add('k-toast--out'); setTimeout(() => el.remove(), 300); }, o.ms ?? 3200);
}

/* ---------------- Timer ---------------- */
/** Calm countdown ring. No flashing, no alarm colour. Games decide whether to use one at all. */
export interface TimerEl extends HTMLElement { start(): void; pause(): void; reset(): void }
export function Timer(o: { seconds: number; label?: string; onDone?: () => void }): TimerEl {
  const R = 20, C = 2 * Math.PI * R;
  let left = o.seconds, handle: ReturnType<typeof setInterval> | null = null;
  const text = h('span', { class: 'k-timer__text' });
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 48 48');
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = `<circle class="k-timer__track" cx="24" cy="24" r="${R}"/><circle class="k-timer__fill" cx="24" cy="24" r="${R}" stroke-dasharray="${C}" transform="rotate(-90 24 24)"/>`;
  const fill = ring.querySelector('.k-timer__fill') as SVGCircleElement;
  const el = h('div', { class: 'k-timer', role: 'timer', 'aria-label': o.label ?? t('timer.label') }, ring, text) as unknown as TimerEl;
  const render = () => {
    const m = Math.floor(left / 60), s = left % 60;
    text.textContent = `${m}:${String(s).padStart(2, '0')}`;
    fill.style.strokeDashoffset = String(C * (1 - left / o.seconds));
  };
  el.start = () => { if (handle) return; handle = setInterval(() => { left = Math.max(0, left - 1); render(); if (left === 0) { el.pause(); o.onDone?.(); } }, 1000); };
  el.pause = () => { if (handle) clearInterval(handle); handle = null; };
  el.reset = () => { el.pause(); left = o.seconds; render(); };
  render();
  return el;
}

/* ---------------- ScoreBadge ---------------- */
export function ScoreBadge(o: { value: number | string; label: string; icon?: IconName }): HTMLElement {
  return h('span', { class: 'k-score' }, icon(o.icon ?? 'star'), h('span', { class: 'k-score__value' }, String(o.value)), h('span', { class: 'k-score__label' }, o.label));
}

/* ---------------- TabBar ---------------- */
export function TabBar(o: { tabs: { id: string; label: string; icon?: IconName }[]; active: string; label: string; onChange: (id: string) => void }): HTMLElement {
  const bar = h('div', { class: 'k-tabbar', role: 'tablist', 'aria-label': o.label });
  const buttons = o.tabs.map((tab) => h('button', {
    type: 'button', role: 'tab', class: 'k-tab', id: `tab-${tab.id}`,
    'aria-selected': String(tab.id === o.active), tabindex: tab.id === o.active ? '0' : '-1',
    onClick: () => select(tab.id, false),
  }, tab.icon ? icon(tab.icon) : null, h('span', null, tab.label)));
  function select(id: string, focus: boolean) {
    buttons.forEach((b, i) => {
      const on = o.tabs[i].id === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    o.onChange(id);
  }
  bar.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    select(o.tabs[(i + n + o.tabs.length) % o.tabs.length].id, true);
  });
  bar.append(...buttons);
  return bar;
}
