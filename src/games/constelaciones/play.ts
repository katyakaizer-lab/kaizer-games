/** Shared pieces of a play screen: header, status line, hint button, finish panel, celebration. */
import { h, mount } from '../../ui/h';
import { Button, FeedbackBanner } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { playMelody } from '../../audio/synth';
import { recordCelebration } from '../../app/pet-state';
import { prefersReducedMotion } from '../../app/settings';
import { numberOf, showDev } from './data';
import { targetSentence, type Constellation } from './sentence';
import type { Board } from './board';

export interface PlayScreen {
  el: HTMLElement;
  body: HTMLElement;
  status: HTMLElement;
  controls: HTMLElement;
  announce(msg: string): void;
}

export function playScreen(c: Constellation, o: { title?: string; intro: string; back(): void }): PlayScreen {
  const status = h('p', { class: 'cz-status', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'cz-controls' });
  const body = h('div', { class: 'cz-play__body' });
  const el = h('div', { class: 'cz-play' },
    h('div', { class: 'cz-play__bar' },
      Button({ label: t('cz.done.map'), icon: 'back', variant: 'quiet', onClick: o.back }),
      h('span', { class: 'cz-play__level' }, c.level),
      showDev() && !c.reviewed ? h('span', { class: 'cz-dev' }, t('cz.unreviewed')) : null),
    h('h1', { tabindex: '-1', class: 'cz-play__title' }, o.title ?? t('cz.constellation', { n: numberOf(c.id) })),
    h('p', { class: 'cz-play__intro' }, o.intro),
    body, controls, status);
  return { el, body, status, controls, announce: (msg) => { status.textContent = msg; } };
}

/** "Pista" appears after two wrong taps in a row. */
export function hintButton(board: () => Board | null, onUse?: () => void): { el: HTMLElement; update(streak: number): void } {
  const b = Button({ label: t('cz.hintButton'), icon: 'bulb', variant: 'secondary', onClick: () => { if (board()?.showHint()) onUse?.(); } });
  b.hidden = true;
  b.lang = 'es';
  return { el: b, update: (streak) => { if (streak >= 2) b.hidden = false; else if (streak === 0) b.hidden = true; } };
}

export const translationOf = (c: Constellation): string => (getLang() === 'ru' ? c.ru : c.en);

/** Calm celebration: a soft glow on the board and one short melody (sound and motion settings respected). */
export function celebrate(board: Board): void {
  board.light();
  if (!prefersReducedMotion()) board.el.classList.add('is-glowing');
  playMelody();
  recordCelebration();
}

export function finishPanel(c: Constellation, o: { order?: number[]; extra?: HTMLElement | null; buttons: HTMLElement[] }): HTMLElement {
  const lang = getLang() === 'ru' ? 'ru' : 'en';
  return h('section', { class: 'cz-done', 'aria-labelledby': 'cz-done-title' },
    FeedbackBanner({ kind: 'correct', title: t('cz.done.title') }),
    h('p', { class: 'cz-done__sentence', id: 'cz-done-title', lang: 'es' }, targetSentence(c, o.order ?? c.orders[0])),
    h('p', { class: 'cz-done__translation' }, h('span', { class: 'cz-done__label' }, t('cz.done.translation'), ': '), h('span', { lang }, translationOf(c))),
    o.extra ?? null,
    h('div', { class: 'cz-done__buttons' }, o.buttons));
}

export function focusTitle(root: HTMLElement): void {
  root.querySelector<HTMLElement>('.cz-play__title, .cz-title')?.focus({ preventScroll: true });
}

export function replace(el: HTMLElement, ...children: HTMLElement[]): void { mount(el, children); }
