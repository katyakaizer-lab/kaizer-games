/**
 * What every mode shares. A new mode (traducida, agujero negro, propia, del día, duelo, Brote mira el cielo)
 * is one more file here that implements `Mode` and reuses the board, light stage and finish panel.
 */
import { h } from '../../../ui/h';
import { Button } from '../../../ui/components';
import type { IconName } from '../../../ui/icons';
import { t, type Key } from '../../../i18n';
import { ALL, storyOf, storyParts } from '../data';
import { isCleared, isDue, markCleared } from '../progress';
import type { Constellation, Level } from '../sentence';
import type { MapItem } from '../map';
import { createBoard, type Board } from '../board';
import { createLight } from '../light';
import { celebrate, finishPanel, hintButton, playScreen, type PlayScreen } from '../play';
import { prefersReducedMotion } from '../../../app/settings';

export interface ModeCtx {
  levels: Set<Level>;
  /** open a constellation in this mode */
  play(c: Constellation): void;
  backToMap(): void;
  readStory(storyId: string): void;
  /** the map for these items, wired to `play` */
  map(items: MapItem[]): HTMLElement;
}

export interface Mode {
  id: 'map' | 'story' | 'listen' | 'memory';
  label: Key;
  icon: IconName;
  /** the tab's content (intro, map) */
  view(ctx: ModeCtx): HTMLElement | Promise<HTMLElement>;
  /** the play screen for one constellation */
  play(c: Constellation, ctx: ModeCtx): HTMLElement | Promise<HTMLElement>;
  /** whether the level chips apply to this mode */
  usesLevels: boolean;
}

/** A story part is locked until the part before it is lit. */
export function lockedBy(c: Constellation): number | null {
  const s = storyOf(c);
  if (!s || !c.story || c.story.part === 1) return null;
  const prev = storyParts(s)[c.story.part - 2];
  return prev && !isCleared(prev.id) ? c.story.part - 1 : null;
}

export function mapItems(list: Constellation[], suggestWhen: (c: Constellation) => boolean = (c) => !isCleared(c.id) && lockedBy(c) === null): MapItem[] {
  const items: MapItem[] = list.map((c) => {
    const lock = lockedBy(c);
    return {
      c,
      state: isCleared(c.id) ? 'cleared' : lock !== null ? 'locked' : 'open',
      due: isDue(c.id),
      suggested: false,
      lockedNote: lock !== null ? t('cz.locked', { n: lock }) : undefined,
    };
  });
  const first = items.find((i) => i.state !== 'locked' && suggestWhen(i.c));
  if (first) first.suggested = true;
  return items;
}

export const byLevels = (levels: Set<Level>, list: Constellation[] = ALL) => list.filter((c) => levels.has(c.level));

/** The next constellation to suggest after `c` (same rules as the map), or null. */
export function nextAfter(c: Constellation, levels: Set<Level>): Constellation | null {
  const list = byLevels(levels);
  return list.find((x) => x.id !== c.id && !isCleared(x.id) && lockedBy(x) === null) ?? null;
}

export const emptyNote = (text: string) => h('p', { class: 'cz-empty' }, text);

/**
 * The standard build: tap the stars in order, then (unless skipped) "Ilumina la frase", then the lit finish.
 * Used by the map, story and listen modes.
 */
export function buildFlow(c: Constellation, ctx: ModeCtx, o: {
  intro: string;
  title?: string;
  skipLight?: boolean;
  before?: HTMLElement;
  finishButtons(order: number[]): HTMLElement[];
  onLit?(order: number[]): void;
}): PlayScreen {
  const screen = playScreen(c, { intro: o.intro, title: o.title, back: ctx.backToMap });
  let board: Board | null = null;
  const hint = hintButton(() => board);
  const smooth: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const finish = (order: number[], replaceEl?: HTMLElement) => {
    replaceEl?.remove();
    celebrate(board!);
    markCleared(c.id);
    o.onLit?.(order);
    const panel = finishPanel(c, { order, buttons: o.finishButtons(order) });
    screen.body.append(panel);
    panel.scrollIntoView?.({ block: 'nearest', behavior: smooth });
    panel.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };
  board = createBoard({
    c, labels: 'show', announce: screen.announce, onWrongStreak: hint.update,
    onDone: (order) => {
      hint.el.hidden = true;
      screen.announce(t('cz.orderDone'));
      if (o.skipLight) { finish(order); return; }
      const light = createLight(c, order, () => finish(order, light));
      screen.body.append(light);
      light.scrollIntoView?.({ block: 'nearest', behavior: smooth });
      light.querySelector<HTMLElement>('h2')?.setAttribute('tabindex', '-1');
      light.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    },
  });
  if (o.before) screen.stage.append(o.before);
  screen.stage.append(board.el);
  screen.controls.append(hint.el);
  return screen;
}

/** Map + next buttons for a finish panel. */
export function standardButtons(c: Constellation, ctx: ModeCtx, next: Constellation | null): HTMLElement[] {
  return [
    ...(next ? [Button({ label: t('cz.done.next'), icon: 'play', onClick: () => ctx.play(next) })] : []),
    Button({ label: t('cz.done.map'), icon: 'star', variant: next ? 'outline' : 'primary', onClick: ctx.backToMap }),
  ];
}
