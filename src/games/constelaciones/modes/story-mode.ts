/**
 * Cuento de estrellas: story groups. Clear a story's constellations in order; when all are lit,
 * show the picture scene.story.<id> and the whole story, read in order.
 */
import { h } from '../../../ui/h';
import { Button, ProgressBar } from '../../../ui/components';
import { artEl } from '../../../ui/art';
import { t } from '../../../i18n';
import { STORIES, storyOf, storyParts } from '../data';
import { isCleared } from '../progress';
import type { Story } from '../sentence';
import { buildFlow, emptyNote, mapItems, standardButtons, type Mode, type ModeCtx } from './common';

const storyDone = (s: Story) => storyParts(s).every((c) => isCleared(c.id));

export const storyMode: Mode = {
  id: 'story',
  label: 'cz.mode.story',
  icon: 'book',
  usesLevels: false,
  view(ctx) {
    if (!STORIES.length) return emptyNote(t('cz.noneForFilter'));
    return h('div', { class: 'cz-view' },
      h('p', null, t('cz.story.intro')),
      STORIES.map((s) => {
        const parts = storyParts(s);
        const done = parts.filter((c) => isCleared(c.id)).length;
        return h('section', { class: 'cz-story', 'aria-labelledby': `story-${s.id}` },
          h('div', { class: 'cz-story__head' },
            h('h2', { id: `story-${s.id}`, lang: 'es' }, s.title_es),
            h('span', { class: 'cz-play__level' }, s.level)),
          ProgressBar({ value: done, max: parts.length, label: t('cz.story.progress', { done, total: parts.length }) }),
          storyDone(s) ? Button({ label: t('cz.story.read'), icon: 'book', variant: 'secondary', onClick: () => ctx.readStory(s.id) }) : null,
          ctx.map(mapItems(parts)));
      }));
  },
  play(c, ctx) {
    const s = storyOf(c);
    return buildFlow(c, ctx, {
      intro: `${t('cz.tapInOrder')} ${t('cz.dragHint')}`,
      title: s ? `${s.title_es} · ${c.story!.part}/${s.constellations.length}` : undefined,
      finishButtons: () => {
        if (s && storyDone(s)) return [Button({ label: t('cz.story.read'), icon: 'book', onClick: () => ctx.readStory(s.id) }), Button({ label: t('cz.done.map'), icon: 'star', variant: 'outline', onClick: ctx.backToMap })];
        const next = s ? storyParts(s).find((x) => !isCleared(x.id)) ?? null : null;
        return standardButtons(c, ctx, next);
      },
    }).el;
  },
};

/** The finished story: its picture (a generated placeholder until art exists) and the whole text. */
export function storyReader(storyId: string, ctx: ModeCtx): HTMLElement {
  const s = STORIES.find((x) => x.id === storyId);
  if (!s) return emptyNote(t('cz.noneForFilter'));
  const parts = storyParts(s);
  const done = storyDone(s);
  return h('article', { class: 'cz-reader' },
    h('div', { class: 'cz-play__bar' }, Button({ label: t('cz.done.map'), icon: 'back', variant: 'quiet', onClick: ctx.backToMap })),
    h('h1', { tabindex: '-1', class: 'cz-play__title', lang: 'es' }, s.title_es),
    h('div', { class: 'cz-reader__art' }, artEl(s.image || `scene.story.${s.id}`, { alt: s.title_es })),
    h('h2', null, t('cz.story.title')),
    done
      ? h('div', { class: 'cz-reader__text', lang: 'es' }, parts.map((c) => h('p', null, c.text)))
      : emptyNote(t('cz.story.progress', { done: parts.filter((c) => isCleared(c.id)).length, total: parts.length })));
}
