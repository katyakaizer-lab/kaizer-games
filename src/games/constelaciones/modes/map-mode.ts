/** Core play: the galaxy map; tap a cluster, connect the stars, then light up the sentence. */
import { h } from '../../../ui/h';
import { t } from '../../../i18n';
import { buildFlow, byLevels, emptyNote, mapItems, nextAfter, standardButtons, type Mode } from './common';

export const mapMode: Mode = {
  id: 'map',
  label: 'cz.mode.map',
  icon: 'star',
  usesLevels: true,
  view(ctx) {
    const list = byLevels(ctx.levels);
    return h('div', { class: 'cz-view' }, list.length ? ctx.map(mapItems(list)) : emptyNote(t('cz.noneForFilter')));
  },
  play(c, ctx) {
    return buildFlow(c, ctx, {
      intro: `${t('cz.tapInOrder')} ${t('cz.dragHint')}`,
      finishButtons: () => standardButtons(c, ctx, nextAfter(c, ctx.levels)),
    }).el;
  },
};
