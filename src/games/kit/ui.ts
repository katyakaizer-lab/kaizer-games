/**
 * Screen pieces shared by the generated-content games (Pociones de números, Golpe de voz, Libros de hechizos,
 * Cartas de verbos, ¿Pero o perro?): header, mode list, decoration band, answer field, feedback, finish panel.
 * Tokens only (kit.css). No timer anywhere.
 */
import { h } from '../../ui/h';
import { icon, type IconName } from '../../ui/icons';
import { Button } from '../../ui/components';
import { art, hasArt, placeholder } from '../../ui/art';
import { t } from '../../i18n';
import { vibrate } from '../../app/haptics';
import { getSettings } from '../../app/settings';
import { playMelody, playNote } from '../../audio/synth';
import { recordCelebration, recordPractice } from '../../app/pet-state';
import { earn } from '../../rewards/show';
import type { Checked } from './answer';
import './kit.css';

export interface ModeDef { id: string; level: string; name: string; note: string }

/** Day theme, page container. */
export function gameRoot(root: HTMLElement, cls: string): HTMLElement {
  document.documentElement.dataset.theme = 'brote';
  const el = h('div', { class: `kit ${cls}` });
  root.replaceChildren(el);
  return el;
}

export function header(title: string, onBack: () => void, backLabel = t('common.back'), extra?: HTMLElement | null): HTMLElement {
  return h('header', { class: 'kit-header' },
    Button({ label: backLabel, icon: 'home', iconOnly: true, variant: 'quiet', onClick: onBack }),
    h('h1', { tabindex: '-1', class: 'kit-title', lang: 'es' }, title),
    h('span', { class: 'kit-header__space' }),
    extra ?? null);
}

/** A list of modes, each with its level, as big buttons. */
export function modeList(modes: ModeDef[], onPick: (id: string) => void, done: Record<string, number> = {}): HTMLElement {
  return h('div', { class: 'kit-modes' }, modes.map((m) =>
    h('button', { type: 'button', class: 'kit-mode', 'data-mode': m.id, onClick: () => onPick(m.id) },
      h('span', { class: 'kit-mode__level' }, m.level),
      h('span', { class: 'kit-mode__name', lang: 'es' }, m.name),
      h('span', { class: 'kit-mode__note' }, m.note),
      done[m.id] ? h('span', { class: 'kit-mode__done' }, icon('check'), t('kit.rounds', { n: done[m.id] })) : null)));
}

const DECOR_COLOURS = ['--accent', '--primary', '--secondary', '--highlight'];
const absUrl = (src: string) => new URL(src, document.baseURI).href;
/** A band of small one-colour objects (art ids decor.<game>.<item>), coloured by the theme. Decorative. */
export function decorBand(game: string, items: string[]): HTMLElement {
  return h('div', { class: 'kit-decor', 'aria-hidden': 'true' }, items.map((name, i) => {
    const id = `decor.${game}.${name}`;
    if (!hasArt(id)) { const p = placeholder(id, '', 'object'); p.classList.add('kit-decor__obj', 'is-placeholder'); return p; }
    const e = h('span', { class: 'kit-decor__obj', 'data-decor': id });
    e.style.setProperty('--src', `url("${absUrl(art(id).src!)}")`);
    e.style.setProperty('--c', `var(${DECOR_COLOURS[i % DECOR_COLOURS.length]})`);
    return e;
  }));
}

/** A one-colour silhouette from the decoration art (used as counters and card marks). */
export function silhouette(id: string, cls = ''): HTMLElement {
  const e = h('span', { class: `kit-shape ${cls}`, 'aria-hidden': 'true' });
  if (hasArt(id)) e.style.setProperty('--src', `url("${absUrl(art(id).src!)}")`);
  else e.classList.add('is-plain');
  return e;
}

export interface AnswerField { el: HTMLElement; input: HTMLInputElement; focus(): void; clear(): void; setDisabled(d: boolean): void }
/** A Spanish text field with a "Comprobar" button; Enter submits. */
export function answerField(o: { label: string; placeholder?: string; inputMode?: 'text' | 'numeric' | 'decimal'; onSubmit: (value: string) => void; suffix?: string; prefix?: string }): AnswerField {
  const input = h('input', {
    class: 'kit-input', type: 'text', lang: 'es', 'aria-label': o.label, placeholder: o.placeholder ?? '',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: o.inputMode ?? 'text', enterkeyhint: 'done',
  }) as HTMLInputElement;
  const submit = () => { if (input.value.trim()) o.onSubmit(input.value); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const btn = Button({ label: t('kit.check'), icon: 'check', onClick: submit });
  const el = h('div', { class: 'kit-answer' },
    h('div', { class: 'kit-answer__row' },
      o.prefix ? h('span', { class: 'kit-answer__fix', lang: 'es' }, o.prefix) : null,
      input,
      o.suffix ? h('span', { class: 'kit-answer__fix', lang: 'es' }, o.suffix) : null),
    btn);
  return {
    el, input,
    focus: () => input.focus({ preventScroll: true }),
    clear: () => { input.value = ''; },
    setDisabled: (d) => { input.disabled = d; btn.disabled = d; },
  };
}

/** The status line under a question (role=status, so screen readers hear it). */
export function statusLine(): { el: HTMLElement; show(kind: 'ok' | 'near' | 'wrong' | 'info', title: string, detail?: string | Node | null): void; clear(): void } {
  const el = h('div', { class: 'kit-status', role: 'status', 'aria-live': 'polite' });
  const ICON: Record<string, IconName> = { ok: 'check', near: 'bulb', wrong: 'refresh', info: 'info' };
  return {
    el,
    show(kind, title, detail) {
      el.className = `kit-status is-${kind}`;
      el.replaceChildren(icon(ICON[kind]), h('div', null, h('strong', null, title), detail ? h('div', { class: 'kit-status__detail', lang: 'es' }, detail) : null));
    },
    clear() { el.className = 'kit-status'; el.replaceChildren(); },
  };
}

/** Sound and vibration for a right answer (both follow the settings). */
export function cheer(step = 3): void {
  vibrate(40);
  if (getSettings().sound) playNote(step);
  recordPractice();
}

/** Shows feedback for a checked answer; returns true when the item is finished (ok or wrong). */
export function showChecked(s: ReturnType<typeof statusLine>, c: Checked, extraWrong?: string): boolean {
  if (c.verdict === 'ok') { s.show('ok', t('feedback.correct'), c.expected); cheer(); return true; }
  if (c.verdict === 'near') { s.show('near', c.note ?? '¡Casi!', t('kit.fixIt')); return false; }
  s.show('wrong', t('kit.answerIs'), extraWrong ? h('span', null, h('strong', null, c.expected), h('br'), extraWrong) : c.expected);
  return true;
}

/** End of a round: stars earned in the round (items are awarded as they are answered; the finishing bonus here). */
export function finishPanel(o: { game: string; stars: number; bonus: number; right: number; total: number; again: () => void; modes: () => void; reason: string }): HTMLElement {
  const panel = h('section', { class: 'kit-finish', 'aria-labelledby': 'kit-finish-title' },
    h('h2', { id: 'kit-finish-title', tabindex: '-1' }, t('kit.roundDone')),
    h('p', null, t('kit.score', { right: o.right, total: o.total })),
    h('p', { class: 'kit-finish__stars' }, h('span', { 'aria-hidden': 'true' }, '★ '), t('kit.starsEarned', { n: o.stars })),
    h('div', { class: 'kit-finish__actions' },
      Button({ label: t('kit.again'), icon: 'refresh', onClick: o.again }),
      Button({ label: t('kit.modes'), icon: 'list', variant: 'secondary', onClick: o.modes })));
  setTimeout(() => {
    if (o.bonus > 0) earn(o.game, o.bonus, o.reason, panel);
    recordCelebration();
    if (getSettings().sound) playMelody();
    panel.querySelector<HTMLElement>('h2')?.focus({ preventScroll: false });
  }, 0);
  return panel;
}

/** Round progress: "3 / 10". */
export function progress(i: number, n: number): HTMLElement {
  return h('p', { class: 'kit-progress', 'aria-label': t('kit.progressLabel', { i, n }) }, `${i} / ${n}`);
}
