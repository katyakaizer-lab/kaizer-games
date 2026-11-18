/**
 * Constelación al oído: hear the sentence, tap the stars in the order heard. The written sentence
 * appears only when it is done. Our recording audio/<id>.mp3 when present, otherwise a Spanish
 * device voice; with neither, the mode is hidden behind a short message. Replay is always there.
 */
import { h } from '../../../ui/h';
import { Button } from '../../../ui/components';
import { t } from '../../../i18n';
import { speakerFor, spanishVoice } from '../../../audio/speech';
import { byLevels, buildFlow, emptyNote, mapItems, nextAfter, standardButtons, type Mode } from './common';

export const listenMode: Mode = {
  id: 'listen',
  label: 'cz.mode.listen',
  icon: 'ear',
  usesLevels: true,
  async view(ctx) {
    const list = byLevels(ctx.levels);
    const voice = await spanishVoice();
    if (!voice) {
      // No device voice: only constellations with our own recordings can be played.
      const withFiles = (await Promise.all(list.map(async (c) => ((await speakerFor(c.id, c.text, c.audio)).source === 'file' ? c : null)))).filter(Boolean) as typeof list;
      if (!withFiles.length) return h('div', { class: 'cz-view' }, emptyNote(t('cz.listen.unavailable')));
      return h('div', { class: 'cz-view' }, h('p', null, t('cz.listen.intro')), ctx.map(mapItems(withFiles)));
    }
    return h('div', { class: 'cz-view' }, h('p', null, t('cz.listen.intro')), list.length ? ctx.map(mapItems(list)) : emptyNote(t('cz.noneForFilter')));
  },
  async play(c, ctx) {
    const speaker = await speakerFor(c.id, c.text, c.audio);
    const controls = h('div', { class: 'cz-listen' },
      Button({ label: t('cz.listen.play'), icon: 'volume', size: 'lg', onClick: () => void speaker.play(false) }),
      Button({ label: t('cz.listen.slow'), icon: 'slow', variant: 'secondary', onClick: () => void speaker.play(true) }));
    const screen = buildFlow(c, ctx, {
      intro: t('cz.listen.intro'),
      skipLight: true,
      before: controls,
      finishButtons: () => standardButtons(c, ctx, nextAfter(c, ctx.levels)),
    });
    if (!speaker.available) screen.stage.prepend(emptyNote(t('cz.listen.unavailable')));
    else setTimeout(() => void speaker.play(false), 300);
    return screen.el;
  },
};
