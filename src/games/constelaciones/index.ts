/**
 * Constelaciones. Routes inside the game (after #game/constelaciones):
 *   (none) | story | listen | memory      the mode's map
 *   play/<mode>/<constellation id>        playing one constellation
 *   read/<story id>                       a finished story
 * Two zoom levels only (galaxy, then constellation), with a short transition.
 */
import { h, mount as put } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, Chip, Modal, TabBar } from '../../ui/components';
import { t } from '../../i18n';
import { store } from '../../data/storage';
import { getSettings, prefersReducedMotion, saveSettings } from '../../app/settings';
import type { GameContext, GameHandle } from '../../app/router';
import { getConstellation, levelsPresent } from './data';
import { LEVELS, type Level } from './sentence';
import { createMap, type MapItem } from './map';
import { focusTitle } from './play';
import type { Mode, ModeCtx } from './modes/common';
import { mapMode } from './modes/map-mode';
import { storyMode, storyReader } from './modes/story-mode';
import { listenMode } from './modes/listen-mode';
import { memoryMode } from './modes/memory-mode';
import './constelaciones.css';

export const MODES: Mode[] = [mapMode, storyMode, listenMode, memoryMode];
const modeById = (id?: string) => MODES.find((m) => m.id === id) ?? mapMode;
const ZOOM_MS = 280;

/** Entrance zoom that can never leave the screen faded out: if the phone pauses it, it is cancelled (back to normal) shortly after. */
function zoomIn(el: HTMLElement, from: string): void {
  if (typeof el.animate !== 'function') return;
  const anim = el.animate([{ transform: from, opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: ZOOM_MS, easing: 'ease-out' });
  setTimeout(() => anim.cancel(), ZOOM_MS + 120);
}

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'night';
  root.classList.add('cz-root');

  const saved = store.get<Level[] | null>('cz.levels', null);
  const levels = new Set<Level>(saved?.length ? saved : levelsPresent());
  let lastPick: { id: string; x: number; y: number } | null = null;
  let renderToken = 0;

  const content = h('div', { class: 'cz-content' });
  const shell = h('div', { class: 'cz' }, content);
  put(root, shell);

  const modeCtx = (mode: Mode): ModeCtx => ({
    levels,
    play: (c) => ctx.go(['play', mode.id, c.id]),
    backToMap: () => ctx.go(mode.id === 'map' ? [] : [mode.id]),
    readStory: (id) => ctx.go(['read', id]),
    map: (items: MapItem[]) => createMap(items, {
      onPick: (it, from) => {
        const mapEl = from.closest<HTMLElement>('.cz-map')!;
        const x = parseFloat(from.style.left), y = parseFloat(from.style.top);
        lastPick = { id: it.c.id, x, y };
        let went = false;
        const go = () => { if (!went) { went = true; ctx.go(['play', mode.id, it.c.id]); } };
        if (prefersReducedMotion() || typeof mapEl.animate !== 'function') { go(); return; }
        mapEl.style.transformOrigin = `${x}% ${y}%`;
        mapEl.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: ZOOM_MS, easing: 'ease-in', fill: 'forwards' }).finished.then(go, go);
        setTimeout(go, ZOOM_MS + 60); // animations can pause in a background tab; never let that block the game
      },
    }),
  });

  function header(mode: Mode): HTMLElement {
    return h('header', { class: 'cz-header' },
      h('div', { class: 'cz-header__top' },
        Button({ label: t('common.back'), icon: 'home', iconOnly: true, variant: 'quiet', onClick: ctx.exit }),
        h('h1', { tabindex: '-1', class: 'cz-title', lang: 'es' }, 'Constelaciones')),
      TabBar({
        label: t('cz.modes'), active: mode.id,
        tabs: MODES.map((m) => ({ id: m.id, label: t(m.label), icon: m.icon })),
        onChange: (id) => ctx.go(id === 'map' ? [] : [id]),
      }),
      mode.usesLevels ? h('div', { class: 'cz-levels', role: 'group', 'aria-label': t('cz.levels') },
        LEVELS.map((l) => Chip({ label: l, pressed: levels.has(l), onToggle: (on) => {
          if (on) levels.add(l); else levels.delete(l);
          store.set('cz.levels', [...levels]);
          void render(ctx.path, true);
        } }))) : null);
  }

  async function render(path: string[], keepScroll = false): Promise<void> {
    const token = ++renderToken;
    ctx.path = path;
    const [head, a, b] = path;
    const reduce = prefersReducedMotion();
    if (head === 'play') {
      const mode = modeById(a);
      const c = getConstellation(b);
      if (!c) { ctx.go([]); return; }
      const screen = await mode.play(c, modeCtx(mode));
      if (token !== renderToken) return;
      put(content, screen);
      window.scrollTo(0, 0);
      if (!reduce) zoomIn(screen, 'scale(.94)');
      focusTitle(content);
      return;
    }
    if (head === 'read') {
      const mode = storyMode;
      put(content, storyReader(a, modeCtx(mode)));
      window.scrollTo(0, 0);
      focusTitle(content);
      return;
    }
    const mode = modeById(head);
    const scrollY = window.scrollY;
    const loading = h('p', { class: 'cz-empty' }, mode.id === 'listen' ? t('cz.listen.checking') : '');
    put(content, header(mode), loading);
    const view = await mode.view(modeCtx(mode));
    if (token !== renderToken) return;
    loading.replaceWith(view);
    if (keepScroll) { window.scrollTo(0, scrollY); return; }
    const mapEl = lastPick ? content.querySelector<HTMLElement>(`.cz-map__star[data-id="${lastPick.id}"]`) : null;
    if (mapEl && lastPick) {
      mapEl.scrollIntoView?.({ block: 'center' });
      const map = mapEl.closest<HTMLElement>('.cz-map')!;
      map.style.transformOrigin = `${lastPick.x}% ${lastPick.y}%`;
      if (!reduce) zoomIn(map, 'scale(2.6)');
      mapEl.focus({ preventScroll: true });
      lastPick = null;
    } else {
      window.scrollTo(0, 0);
      focusTitle(content);
    }
  }

  // Sound is off by default and offered once.
  if (!getSettings().soundOffered) {
    const choose = (on: boolean) => { saveSettings({ sound: on, soundOffered: true }); m.close(); };
    const m = Modal({
      title: t('sound.offerTitle'),
      children: [h('p', null, icon('volume'), ' ', t('sound.offerText'))],
      actions: [Button({ label: t('sound.offerNo'), variant: 'outline', onClick: () => choose(false) }), Button({ label: t('sound.offerYes'), icon: 'volume', onClick: () => choose(true) })],
      onClose: () => { if (!getSettings().soundOffered) saveSettings({ soundOffered: true }); },
    });
    m.open();
  }

  void render(ctx.path);
  return {
    update: (path) => void render(path),
    destroy: () => { renderToken++; html.dataset.theme = 'brote'; root.classList.remove('cz-root'); window.speechSynthesis?.cancel(); },
  };
}
