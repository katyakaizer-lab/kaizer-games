/**
 * Constelación fantasma: a lit constellation comes back for review after 1, 3, 7, 21 and 60 days
 * (schedule.json). The words show for about three seconds, then fade; the learner taps the stars
 * from memory. A correct star shows its word again; "Ver otra vez" shows the labels again and is
 * recorded as a hint, never penalised. No streaks, no penalties, no notifications.
 */
import { h } from '../../../ui/h';
import { Button } from '../../../ui/components';
import { getLang, t } from '../../../i18n';
import { recordPractice } from '../../../app/pet-state';
import { ALL } from '../data';
import { clearedIds, entry, isDue, markReviewed } from '../progress';
import { createBoard, type Board } from '../board';
import { celebrate, finishPanel, playScreen } from '../play';
import { emptyNote, mapItems, type Mode, type ModeCtx } from './common';
import type { Constellation } from '../sentence';

export const LOOK_MS = 3000;

const dueList = () => ALL.filter((c) => isDue(c.id));
const formatDate = (ms: number) => new Date(ms).toLocaleDateString(getLang(), { day: 'numeric', month: 'long' });

export const memoryMode: Mode = {
  id: 'memory',
  label: 'cz.mode.memory',
  icon: 'sparkles',
  usesLevels: true,
  view(ctx) {
    const cleared = new Set(clearedIds());
    const list = ALL.filter((c) => cleared.has(c.id) && ctx.levels.has(c.level));
    if (!list.length) return h('div', { class: 'cz-view' }, h('p', null, t('cz.memory.intro')), emptyNote(t('cz.memory.none')));
    const due = list.filter((c) => isDue(c.id)).length;
    return h('div', { class: 'cz-view' },
      h('p', null, t('cz.memory.intro')),
      h('p', { class: 'cz-due-count' }, t('cz.memory.dueCount', { n: due })),
      ctx.map(mapItems(list, (c) => isDue(c.id))));
  },
  play(c, ctx) { return memoryPlay(c, ctx); },
};

function memoryPlay(c: Constellation, ctx: ModeCtx): HTMLElement {
  const screen = playScreen(c, { intro: t('cz.memory.look'), back: ctx.backToMap });
  let hints = 0;
  let board: Board | null = null;
  const lookTimer = setTimeout(() => { if (!board?.el.classList.contains('is-complete')) screen.announce(t('cz.memory.recall')); }, LOOK_MS);
  board = createBoard({
    c, labels: 'hidden', announce: screen.announce,
    onDone: (order) => {
      clearTimeout(lookTimer);
      again.hidden = true;
      celebrate(board!);
      const wasDue = isDue(c.id);
      const e = wasDue ? markReviewed(c.id, hints) : (recordPractice(), entry(c.id));
      const note = e?.due ? t('cz.memory.next', { date: formatDate(e.due) }) : t('cz.memory.finished');
      const next = dueList().find((x) => x.id !== c.id) ?? null;
      screen.body.append(finishPanel(c, {
        order,
        extra: h('p', { class: 'cz-done__note' }, note),
        buttons: [
          ...(next ? [Button({ label: t('cz.done.next'), icon: 'play', onClick: () => ctx.play(next) })] : []),
          Button({ label: t('cz.done.map'), icon: 'star', variant: next ? 'outline' : 'primary', onClick: ctx.backToMap }),
        ],
      }));
      screen.body.querySelector<HTMLElement>('.cz-done button')?.focus({ preventScroll: true });
    },
  });
  const again = Button({ label: t('cz.memory.again'), icon: 'eye', variant: 'secondary', onClick: () => { hints++; board!.reveal(LOOK_MS); } });
  again.lang = 'es';
  screen.body.append(board.el);
  screen.controls.append(again);
  board.reveal(LOOK_MS);
  return screen.el;
}
