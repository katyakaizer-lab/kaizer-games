/**
 * Solitario de categorías. Routes inside the game (after #game/solitario):
 *   (none)                         the list of sets
 *   play/<set id>[/experto]        playing a set
 * Our own word cards and rules (no playing-card look): tap a card, then its category, or drag it.
 */
import { h, mount as put } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, Chip, FeedbackBanner } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { playMelody, playNote } from '../../audio/synth';
import { recordCelebration } from '../../app/pet-state';
import { prefersReducedMotion } from '../../app/settings';
import type { GameContext, GameHandle } from '../../app/router';
import {
  LEVELS, cycle, isSorted, nameOptions, newGame, pileTotal, place, rightPile, wrongNames,
  type CardSet, type GameState, type Level, type Mode, type SolitarioData,
} from './engine';
import './solitario.css';

const files = import.meta.glob<SolitarioData>('../../data/solitario/*.json', { eager: true, import: 'default' });
export const SETS: CardSet[] = Object.keys(files).sort().flatMap((k) => files[k].sets ?? [])
  .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

interface Progress { done: Record<string, Partial<Record<Mode, number>>> }
const getProgress = (): Progress => ({ done: store.get<Progress>('sol.progress', { done: {} }).done ?? {} });
function markDone(setId: string, mode: Mode): void {
  const p = getProgress();
  p.done[setId] = { ...p.done[setId], [mode]: Date.now() };
  store.set('sol.progress', p);
}
const trOf = (x: { en: string; ru: string }) => (getLang() === 'ru' ? x.ru : x.en);

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = h('div', { class: 'sol' });
  put(root, content);
  const saved = store.get<Level[] | null>('sol.levels', null);
  const levels = new Set<Level>(saved?.length ? saved : LEVELS.filter((l) => SETS.some((s) => s.level === l)));
  let expert = store.get<boolean>('sol.expert', false);

  function render(path: string[]): void {
    const [head, setId, modeSeg] = path;
    const set = SETS.find((s) => s.id === setId);
    if (head === 'play' && set) { put(content, playView(set, modeSeg === 'experto' ? 'experto' : 'normal')); window.scrollTo(0, 0); }
    else { put(content, listView()); window.scrollTo(0, 0); }
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  /* ---------------- List of sets ---------------- */
  function listView(): HTMLElement {
    const progress = getProgress();
    const lang = getLang();
    const visible = SETS.filter((s) => levels.has(s.level));
    const rerender = () => put(content, listView());
    return h('div', { class: 'sol-list' },
      h('header', { class: 'sol-header' },
        Button({ label: t('common.back'), icon: 'home', iconOnly: true, variant: 'quiet', onClick: ctx.exit }),
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías')),
      h('p', { class: 'sol-soft' }, t('sol.intro')),
      h('div', { class: 'sol-filters' },
        h('div', { class: 'sol-chips', role: 'group', 'aria-label': t('sol.levels') },
          LEVELS.map((l) => Chip({ label: l, pressed: levels.has(l), onToggle: (on) => { if (on) levels.add(l); else levels.delete(l); store.set('sol.levels', [...levels]); rerender(); } }))),
        h('div', { class: 'sol-expert' },
          Chip({ label: t('sol.expert'), pressed: expert, lang: 'es', onToggle: (on) => { expert = on; store.set('sol.expert', on); rerender(); } }),
          h('span', { class: 'sol-soft sol-small' }, t('sol.expertHelp')))),
      visible.length ? h('div', { class: 'sol-sets' }, visible.map((s) => {
        const done = progress.done[s.id];
        return h('a', { class: 'sol-set', href: `#game/solitario/play/${s.id}${expert ? '/experto' : ''}` },
          h('span', { class: 'sol-set__top' },
            h('strong', { class: 'sol-set__title', lang: 'es' }, s.title_es),
            h('span', { class: 'sol-badge' }, s.level)),
          h('span', { class: 'sol-soft sol-small' }, s.about?.[lang as 'en'] ?? s.about?.en ?? ''),
          h('span', { class: 'sol-set__cats', lang: 'es' }, expert ? s.categories.map(() => '?').join(' · ') : s.categories.map((c) => c.name_es).join(' · ')),
          done ? h('span', { class: 'sol-set__done' },
            done.normal ? h('span', null, icon('check'), t('sol.done')) : null,
            done.experto ? h('span', { lang: 'es' }, icon('star'), 'experto') : null) : null);
      })) : h('p', { class: 'sol-soft' }, t('sol.none')));
  }

  /* ---------------- Playing a set ---------------- */
  function playView(set: CardSet, mode: Mode): HTMLElement {
    const s: GameState = newGame(set, mode);
    let selected: string | null = null;
    let showTr = store.get<boolean>('sol.showTr', set.level === 'A1');
    const missesOn: Record<string, number> = {};
    let hintPile: string | null = null;

    const el = h('div', { class: 'sol-play' });
    const status = h('p', { class: 'sol-status', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string) => { status.textContent = m; };
    const catOf = (key: string) => set.categories.find((c) => c.id === s.pileCat[key]);
    const pileLabel = (key: string, i: number) => (mode === 'normal' ? catOf(key)!.name_es : t('sol.group', { n: i + 1 }));
    const word = (id: string) => s.cards[id].item.es;

    function tryPlace(cardId: string, key: string) {
      const i = Object.keys(s.piles).indexOf(key);
      if (place(s, cardId, key)) {
        selected = null; hintPile = null;
        playNote(s.piles[key].length - 1);
        announce(mode === 'normal' ? t('sol.placed', { word: word(cardId), cat: pileLabel(key, i) }) : t('sol.placedGroup', { word: word(cardId), n: i + 1 }));
        if (isSorted(s)) { mode === 'experto' ? naming() : finish(); return; }
        draw('table');
      } else {
        missesOn[cardId] = (missesOn[cardId] ?? 0) + 1;
        announce(mode === 'normal' ? t('sol.notHere', { word: word(cardId), cat: pileLabel(key, i) }) : t('sol.notHereGroup', { word: word(cardId) }));
        draw('keep');
        const c = el.querySelector<HTMLElement>(`.sol-card[data-id="${cardId}"]`);
        c?.classList.add('is-wrong');
        setTimeout(() => c?.classList.remove('is-wrong'), 1200);
      }
    }

    // Drag: pointer events on a card; a drop on a pile places it. Taps still work (and the keyboard uses clicks).
    let drag: { id: string; x: number; y: number; el: HTMLElement; moved: boolean } | null = null;
    let suppressClick = false;
    const pileAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('.sol-pile')?.dataset.key ?? null;
    function onDown(e: PointerEvent) {
      const c = (e.target as HTMLElement).closest<HTMLElement>('.sol-card');
      if (!c) return;
      drag = { id: c.dataset.id!, x: e.clientX, y: e.clientY, el: c, moved: false };
    }
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      drag.el.classList.add('is-dragging');
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = pileAt(e.clientX, e.clientY);
      el.querySelectorAll('.sol-pile').forEach((p) => p.classList.toggle('is-over', (p as HTMLElement).dataset.key === k));
    }
    function onUp(e: PointerEvent) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      suppressClick = true;
      d.el.classList.remove('is-dragging');
      d.el.style.transform = '';
      el.querySelectorAll('.sol-pile').forEach((p) => p.classList.remove('is-over'));
      const k = pileAt(e.clientX, e.clientY);
      if (k) tryPlace(d.id, k);
    }

    function draw(focus: 'table' | 'keep' = 'keep') {
      const focusedKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
      const keys = Object.keys(s.piles);
      const piles = keys.map((key, i) => {
        const cards = s.piles[key];
        const total = pileTotal(set, s, key);
        const complete = total > 0 && cards.length === total;
        const named = mode === 'normal';
        return h('button', {
          type: 'button', class: `sol-pile${selected ? ' is-target' : ''}${complete ? ' is-complete' : ''}${hintPile === key ? ' is-hint' : ''}${cards.length ? '' : ' is-empty'}`,
          'data-key': key, 'data-focus-key': `pile-${key}`,
          'aria-label': `${pileLabel(key, i)}, ${cards.length ? t('sol.cardsInCat', { n: cards.length, total: total || '?' }) : t('sol.emptyGroup')}${cards.length ? `: ${cards.map(word).join(', ')}` : ''}`,
          onClick: () => { if (!selected) { announce(t('sol.pickCard')); return; } tryPlace(selected, key); },
        },
          h('span', { class: 'sol-pile__name', lang: named ? 'es' : undefined }, pileLabel(key, i)),
          h('span', { class: 'sol-pile__top', lang: 'es' }, cards.length ? word(cards[cards.length - 1]) : named ? '' : t('sol.emptyGroup')),
          h('span', { class: 'sol-pile__count' }, complete ? icon('check') : null, cards.length ? t('sol.cardsInCat', { n: cards.length, total: total || '?' }) : ''));
      });
      const table = s.open.map((id, slot) => (id
        ? h('button', {
          type: 'button', class: `sol-card${selected === id ? ' is-selected' : ''}`, 'data-id': id, 'data-focus-key': `slot-${slot}`,
          'aria-pressed': String(selected === id),
          onClick: () => {
            if (suppressClick) { suppressClick = false; return; }
            selected = selected === id ? null : id; hintPile = null;
            if (selected) announce(t('sol.selected', { word: word(id) }));
            draw('keep');
          },
        }, h('span', { class: 'sol-card__word', lang: 'es' }, word(id)), showTr ? h('span', { class: 'sol-card__tr', lang: getLang() === 'ru' ? 'ru' : 'en' }, trOf(s.cards[id].item)) : null)
        : h('div', { class: 'sol-slot', 'aria-hidden': 'true' })));
      const showHint = !!selected && (missesOn[selected] ?? 0) >= 2;
      put(el,
        h('div', { class: 'sol-bar' },
          Button({ label: t('sol.list'), icon: 'back', variant: 'quiet', onClick: () => ctx.go([]) }),
          h('span', { class: 'sol-badge' }, set.level),
          mode === 'experto' ? h('span', { class: 'sol-badge', lang: 'es' }, 'experto') : null),
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, set.title_es),
        h('section', { class: 'sol-piles', 'aria-label': t('sol.categories') }, piles),
        h('section', { class: 'sol-table', 'aria-label': t('sol.table') },
          h('div', { class: 'sol-cards' }, table),
          h('div', { class: 'sol-tools' },
            Button({ label: `${t('sol.more')} (${s.deck.length})`, icon: 'refresh', variant: 'secondary', disabled: !s.deck.length, onClick: () => { cycle(s); selected = null; announce(s.deck.length ? t('sol.deck', { n: s.deck.length }) : t('sol.deckEmpty')); draw('table'); } }),
            Chip({ label: t('sol.translation'), pressed: showTr, onToggle: (on) => { showTr = on; store.set('sol.showTr', on); draw('keep'); } }),
            showHint ? Button({ label: t('sol.hint'), icon: 'bulb', variant: 'outline', onClick: () => { hintPile = rightPile(s, selected!); s.hintsUsed++; announce(t('sol.hintShown')); draw('keep'); } }) : null)),
        status);
      const target = focus === 'table' ? el.querySelector<HTMLElement>('.sol-card') : focusedKey ? el.querySelector<HTMLElement>(`[data-focus-key="${focusedKey}"]`) : null;
      target?.focus({ preventScroll: true });
    }

    function naming() {
      const keys = Object.keys(s.piles);
      const opts = nameOptions(set);
      const names: Record<string, string> = {};
      const fb = h('div', { 'aria-live': 'polite' });
      const groups = keys.map((key, i) => {
        const id = `sol-name-${key}`;
        const sel = h('select', { id, class: 'sol-select', lang: 'es' }, h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o }, o))) as HTMLSelectElement;
        sel.addEventListener('change', () => { names[key] = sel.value; fb.replaceChildren(); sel.closest('.sol-name')?.classList.remove('is-wrong'); });
        return h('div', { class: 'sol-name', 'data-key': key },
          h('label', { for: id, class: 'sol-name__label' }, t('sol.group', { n: i + 1 })),
          h('p', { class: 'sol-name__words', lang: 'es' }, s.piles[key].map(word).join(' · ')),
          sel);
      });
      put(el,
        h('h1', { tabindex: '-1', class: 'sol-title' }, t('sol.nameTitle')),
        h('p', { class: 'sol-soft' }, t('sol.nameHelp')),
        h('div', { class: 'sol-names' }, groups),
        Button({ label: t('sol.nameCheck'), icon: 'check', size: 'lg', onClick: () => {
          const wrong = wrongNames(set, s, names);
          el.querySelectorAll<HTMLElement>('.sol-name').forEach((g) => g.classList.toggle('is-wrong', wrong.includes(g.dataset.key!)));
          if (!wrong.length) finish(); else put(fb, FeedbackBanner({ kind: 'retry', hint: t('sol.nameWrong') }));
        } }),
        fb);
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    function finish() {
      markDone(set.id, mode);
      recordCelebration();
      playMelody();
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      put(el,
        h('div', { class: 'sol-bar' }, Button({ label: t('sol.list'), icon: 'back', variant: 'quiet', onClick: () => ctx.go([]) })),
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, set.title_es),
        h('div', { class: `sol-finish${prefersReducedMotion() ? '' : ' is-glowing'}` }, FeedbackBanner({ kind: 'correct', title: t('sol.finished') })),
        h('div', { class: 'sol-summary' }, set.categories.map((c) => h('section', { class: 'sol-sum' },
          h('h2', null, h('span', { lang: 'es' }, c.name_es), ' ', h('span', { class: 'sol-soft sol-small', lang }, trOf(c))),
          h('ul', null, c.items.map((it) => h('li', null, h('span', { lang: 'es' }, it.es), ' ', h('span', { class: 'sol-soft', lang }, `· ${trOf(it)}`))))))),
        h('div', { class: 'sol-actions' },
          Button({ label: t('sol.again'), icon: 'refresh', onClick: () => put(content, playView(set, mode)) }),
          Button({ label: t('sol.list'), icon: 'back', variant: 'outline', onClick: () => ctx.go([]) })));
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { if (drag) { drag.el.classList.remove('is-dragging'); drag.el.style.transform = ''; drag = null; } });
    draw();
    return el;
  }

  render(ctx.path);
  return { update: render, destroy: () => {} };
}
