/**
 * Solitario de categorías. Routes inside the game (after #game/solitario):
 *   (none)                       choose a level
 *   play/<level>[/seed-<n>]      a game (the seed makes a deal repeatable, for tests and sharing)
 * Layout: move counter and the deck on top, category slots, then the columns. Plain word cards;
 * category cards open a slot. Tap or drag. Undo any time. Every deal can be won.
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
  LEVELS, canPlace, catName, drawCard, hintFor, isWon, move, newGame, runAt, undo,
  type Category, type GameState, type Level, type SolitarioData, type Source, type Target,
} from './engine';
import './solitario.css';

const files = import.meta.glob<SolitarioData>('../../data/solitario/*.json', { eager: true, import: 'default' });
export const CATEGORIES: Category[] = Object.keys(files).sort().flatMap((k) => files[k].categories ?? []);
const poolFor = (l: Level) => CATEGORIES.filter((c) => c.level === l);
const LEVELS_WITH_CARDS = LEVELS.filter((l) => poolFor(l).length >= 6);

interface Record_ { wins: number; best?: number }
type Records = Partial<Record<Level, Record_>>;
const getRecords = (): Records => store.get<Records>('sol.records', {});
function addWin(l: Level, moves: number): Record_ {
  const r = getRecords();
  const cur = r[l] ?? { wins: 0 };
  r[l] = { wins: cur.wins + 1, best: cur.best === undefined ? moves : Math.min(cur.best, moves) };
  store.set('sol.records', r);
  return r[l]!;
}
const trOf = (x: { en: string; ru: string }) => (getLang() === 'ru' ? x.ru : x.en);
/** Phones: 5 columns and 5 categories; wider screens: 7 and 6. */
const layoutFor = (w: number) => (w < 560 ? { columns: 5, categories: 5 } : { columns: 7, categories: 6 });

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'mesa';
  const content = h('div', { class: 'sol' });
  put(root, content);

  function render(path: string[]): void {
    const [head, lvl, seedSeg] = path;
    const level = LEVELS_WITH_CARDS.find((l) => l === lvl);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : undefined;
    put(content, head === 'play' && level ? playView(level, seed) : levelsView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  /* ---------------- Choose a level ---------------- */
  function levelsView(): HTMLElement {
    const rec = getRecords();
    return h('div', { class: 'sol-list' },
      h('header', { class: 'sol-header' },
        Button({ label: t('common.back'), icon: 'home', iconOnly: true, variant: 'quiet', onClick: ctx.exit }),
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías')),
      h('p', { class: 'sol-soft' }, t('sol.intro')),
      h('p', { class: 'sol-soft sol-small' }, t('sol.rules')),
      h('div', { class: 'sol-levels' }, LEVELS_WITH_CARDS.map((l) => {
        const r = rec[l];
        return h('button', { type: 'button', class: 'sol-level', onClick: () => ctx.go(['play', l]) },
          h('span', { class: 'sol-level__name' }, l),
          h('span', { class: 'sol-small', lang: 'es' }, poolFor(l).slice(0, 4).map((c) => c.name_es.replace(/^(El|La|Los|Las) /, '')).join(', ') + '…'),
          r ? h('span', { class: 'sol-small sol-level__wins' }, icon('check'), t('sol.wins', { n: r.wins }), r.best !== undefined ? ` · ${t('sol.best', { n: r.best })}` : '') : null);
      })));
  }

  /* ---------------- A game ---------------- */
  function playView(level: Level, seed?: number): HTMLElement {
    const pool = poolFor(level);
    const lay = layoutFor(content.clientWidth || window.innerWidth);
    let s: GameState = newGame(pool, { ...lay, seed });
    let sel: Source | null = null;
    let missesOnSel = 0;
    let hint: Target | null = null;
    let showTr = store.get<boolean>('sol.showTr', level === 'A1');

    const el = h('div', { class: 'sol-play' });
    const status = h('p', { class: 'sol-status', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string) => { status.textContent = m; };
    const word = (id: string) => s.cards[id].item.es;
    const sameSrc = (a: Source | null, b: Source) => !!a && a.kind === b.kind && (a.kind === 'waste' || (b.kind === 'col' && a.col === b.col && a.index === b.index));
    const select = (src: Source | null) => { sel = src; missesOnSel = 0; hint = null; };

    function tryMove(src: Source, tg: Target) {
      const run = runAt(s, src);
      if (!run) return;
      const doneBefore = s.done.length;
      if (move(s, src, tg)) {
        select(null);
        const first = s.cards[run[0]];
        if (s.done.length > doneBefore) { playMelody(); announce(t('sol.complete', { cat: catName(s, s.done[s.done.length - 1]) })); }
        else {
          playNote(s.moves % 10);
          announce(tg.kind === 'slot' ? (first.kind === 'cat' ? t('sol.opened', { cat: first.item.es }) : t('sol.toSlot', { word: first.item.es, cat: catName(s, first.cat) }))
            : t('sol.toColumn', { word: first.item.es, n: tg.col + 1 }));
        }
        if (isWon(s)) { finish(); return; }
        draw();
        return;
      }
      missesOnSel++;
      const w0 = word(run[0]);
      const slot = tg.kind === 'slot' ? s.slots[tg.index] : null;
      announce(tg.kind === 'col' ? t('sol.notOnColumn', { word: w0 })
        : slot!.cat === null ? t('sol.needsCategory')
        : run.some((id) => s.cards[id].kind === 'cat') ? t('sol.slotTaken')
        : t('sol.notHere', { word: w0, cat: catName(s, slot!.cat) }));
      draw();
      for (const id of run) {
        const c = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
        c?.classList.add('is-wrong');
        setTimeout(() => c?.classList.remove('is-wrong'), 1100);
      }
    }

    function cardEl(id: string, src: Source | null, selected: boolean, extra = '') {
      const c = s.cards[id];
      const isCat = c.kind === 'cat';
      return h(src ? 'button' : 'div', {
        type: src ? 'button' : undefined,
        class: `sol-card${isCat ? ' is-cat' : ''}${selected ? ' is-selected' : ''}${extra}`, 'data-id': id,
        'data-src': src ? JSON.stringify(src) : undefined, 'aria-pressed': src ? String(selected) : undefined,
        'aria-label': isCat ? `${t('sol.categoryCard')}: ${c.item.es} (${s.size[c.cat]})` : undefined,
      },
        isCat ? h('span', { class: 'sol-card__tag', 'aria-hidden': 'true' }, icon('book'), String(s.size[c.cat])) : null,
        h('span', { class: 'sol-card__word', lang: 'es' }, c.item.es),
        showTr ? h('span', { class: 'sol-card__tr', lang: getLang() === 'ru' ? 'ru' : 'en' }, trOf(c.item)) : null);
    }

    function draw() {
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
      const selRun = sel ? runAt(s, sel) ?? [] : [];
      const slots = s.slots.map((slot, i) => {
        const tg = JSON.stringify({ kind: 'slot', index: i });
        const hinted = hint?.kind === 'slot' && hint.index === i;
        const fits = !!sel && canPlace(s, selRun, { kind: 'slot', index: i });
        if (!slot.cat) {
          return h('button', {
            type: 'button', class: `sol-slot is-open${hinted ? ' is-hint' : ''}${fits ? ' is-fit' : ''}`, 'data-target': tg, 'data-focus-key': `slot-${i}`,
            'aria-label': t('sol.emptySlot'),
          }, h('span', { class: 'sol-slot__plus', 'aria-hidden': 'true' }, icon('book')));
        }
        const last = slot.words[slot.words.length - 1];
        return h('button', {
          type: 'button', class: `sol-slotcat${hinted ? ' is-hint' : ''}${fits ? ' is-fit' : ''}`, 'data-target': tg, 'data-focus-key': `slot-${i}`,
          'aria-label': `${catName(s, slot.cat)}: ${slot.words.length}/${s.size[slot.cat]}${slot.words.length ? `, ${slot.words.map(word).join(', ')}` : ''}`,
        },
          h('span', { class: 'sol-slotcat__tab', lang: 'es' }, h('span', { class: 'sol-slotcat__name' }, catName(s, slot.cat)), h('span', null, `${slot.words.length}/${s.size[slot.cat]}`)),
          last ? cardEl(last, null, false, ' in-slot') : cardEl(`${slot.cat}:cat`, null, false, ' in-slot'));
      });
      const cols = s.cols.map((col, ci) => {
        const tg = JSON.stringify({ kind: 'col', col: ci });
        return h('div', {
          class: `sol-col${hint?.kind === 'col' && hint.col === ci ? ' is-hint' : ''}`, 'data-target': tg, role: 'group',
          'aria-label': `${t('sol.column', { n: ci + 1 })}${col.length ? '' : `, ${t('sol.emptyColumn')}`}`,
        },
          col.length ? col.map((id, idx) => {
            const src: Source = { kind: 'col', col: ci, index: idx };
            const movable = !!runAt(s, src);
            const e = cardEl(id, movable ? src : null, sel?.kind === 'col' && sel.col === ci && selRun.includes(id));
            if (movable) e.dataset.focusKey = `col-${ci}-${idx}`;
            return e;
          }) : h('button', { type: 'button', class: 'sol-slot', 'data-target': tg, 'data-focus-key': `col-${ci}-empty`, 'aria-label': `${t('sol.column', { n: ci + 1 })}, ${t('sol.emptyColumn')}` }));
      });
      const wasteTop = s.waste[s.waste.length - 1];
      const wastePrev = s.waste[s.waste.length - 2];
      put(el,
        h('div', { class: 'sol-bar' },
          Button({ label: t('sol.levelsBack'), icon: 'back', variant: 'quiet', onClick: () => ctx.go([]) }),
          h('span', { class: 'sol-badge' }, level),
          h('span', { class: 'sol-bar__space' }),
          Chip({ label: t('sol.translation'), pressed: showTr, onToggle: (on) => { showTr = on; store.set('sol.showTr', on); draw(); } }),
          Button({ label: t('sol.undo'), icon: 'undo', iconOnly: true, variant: 'quiet', disabled: !s.history.length, onClick: () => { if (undo(s)) { select(null); announce(t('sol.undone')); draw(); } } }),
          Button({ label: t('sol.newGame'), icon: 'refresh', iconOnly: true, variant: 'quiet', onClick: () => { s = newGame(pool, lay); select(null); announce(t('sol.newDeal')); draw(); } })),
        h('h1', { tabindex: '-1', class: 'sol-title k-sr', lang: 'es' }, 'Solitario de categorías'),
        h('div', { class: 'sol-head' },
          h('div', { class: 'sol-moves', role: 'status', 'aria-label': t('sol.movesLabel', { n: s.moves }) },
            h('span', { class: 'sol-moves__label' }, t('sol.moves')), h('span', { class: 'sol-moves__n' }, String(s.moves))),
          h('span', { class: 'sol-bar__space' }),
          h('div', { class: 'sol-waste', 'aria-label': t('sol.waste') },
            wastePrev ? h('div', { class: 'sol-card sol-waste__under', 'aria-hidden': 'true' }) : null,
            wasteTop ? (() => { const e = cardEl(wasteTop, { kind: 'waste' }, sel?.kind === 'waste'); e.dataset.focusKey = 'waste'; return e; })() : h('span', { class: 'sol-slot is-quiet', 'aria-hidden': 'true' })),
          h('button', {
            type: 'button', class: `sol-stock${s.stock.length ? '' : ' is-empty'}`, 'data-stock': 'true', 'data-focus-key': 'stock',
            'aria-label': s.stock.length ? t('sol.stock', { n: s.stock.length }) : s.waste.length ? t('sol.recycle') : t('sol.deckEmpty'),
          }, s.stock.length ? h('span', { class: 'sol-back' }, h('span', { class: 'sol-stock__n' }, String(s.stock.length))) : h('span', { class: 'sol-stock__again' }, icon('refresh')))),
        h('section', { class: 'sol-slots', 'aria-label': t('sol.foundations'), style: { gridTemplateColumns: `repeat(${s.slots.length}, minmax(0, 1fr))` } }, slots),
        h('section', { class: 'sol-cols', 'aria-label': t('sol.columns'), style: { gridTemplateColumns: `repeat(${s.cols.length}, minmax(0, 1fr))` } }, cols),
        h('div', { class: 'sol-foot' },
          sel && missesOnSel >= 2 ? Button({ label: t('sol.hint'), icon: 'bulb', variant: 'secondary', onClick: () => { hint = sel ? hintFor(s, sel) : null; s.hintsUsed++; announce(hint ? t('sol.hintShown') : t('sol.hintNone')); draw(); } }) : null,
          status));
      if (focusKey) el.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
    }

    function onClick(e: MouseEvent) {
      if (suppressClick) { suppressClick = false; return; }
      const tEl = e.target as HTMLElement;
      if (tEl.closest('[data-stock]')) {
        const r = drawCard(s);
        select(null);
        announce(r === 'drawn' ? t('sol.drew', { word: word(s.waste[s.waste.length - 1]) }) : r === 'recycled' ? t('sol.recycled') : '');
        draw();
        return;
      }
      const cardBtn = tEl.closest<HTMLElement>('[data-src]');
      if (cardBtn) {
        const src = JSON.parse(cardBtn.dataset.src!) as Source;
        if (sameSrc(sel, src)) { select(null); draw(); return; }
        if (sel && src.kind === 'col') { tryMove(sel, { kind: 'col', col: src.col }); return; }
        select(src);
        const run = runAt(s, src)!;
        announce(run.length > 1 ? t('sol.selectedRun', { word: word(run[0]), n: run.length }) : t('sol.selected', { word: word(run[0]) }));
        draw();
        return;
      }
      const tgEl = tEl.closest<HTMLElement>('[data-target]');
      if (tgEl) {
        if (!sel) { announce(t('sol.pickCard')); return; }
        tryMove(sel, JSON.parse(tgEl.dataset.target!) as Target);
      }
    }
    // Double-tap a card: send it to its slot (or open one with a category card).
    function onDbl(e: MouseEvent) {
      const cardBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!cardBtn) return;
      const src = JSON.parse(cardBtn.dataset.src!) as Source;
      const tg = hintFor(s, src);
      if (tg?.kind === 'slot') tryMove(src, tg);
    }

    let drag: { src: Source; x: number; y: number; els: HTMLElement[]; moved: boolean } | null = null;
    let suppressClick = false;
    function onDown(e: PointerEvent) {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!c) return;
      const src = JSON.parse(c.dataset.src!) as Source;
      const els = (runAt(s, src) ?? []).map((id) => el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"][data-src]`) ?? el.querySelector<HTMLElement>(`.sol-col [data-id="${CSS.escape(id)}"]`)!).filter(Boolean);
      drag = { src, x: e.clientX, y: e.clientY, els, moved: false };
    }
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      for (const c of drag.els) { c.classList.add('is-dragging'); c.style.transform = `translate(${dx}px, ${dy}px)`; }
    }
    function onUp(e: PointerEvent) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      suppressClick = true;
      for (const c of d.els) { c.classList.remove('is-dragging'); c.style.transform = ''; }
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tgEl = under?.closest<HTMLElement>('[data-target]');
      if (tgEl?.dataset.target) tryMove(d.src, JSON.parse(tgEl.dataset.target) as Target); else draw();
    }

    function finish() {
      const rec = addWin(level, s.moves);
      recordCelebration();
      playMelody();
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      put(el,
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías'),
        h('div', { class: `sol-finish${prefersReducedMotion() ? '' : ' is-glowing'}` },
          FeedbackBanner({ kind: 'correct', title: t('sol.finished'), hint: `${t('sol.movesLabel', { n: s.moves })}${rec.best === s.moves ? ` · ${t('sol.newBest')}` : ''}` })),
        h('div', { class: 'sol-summary' }, s.cats.map((c) => h('section', { class: 'sol-sum' },
          h('h2', null, h('span', { lang: 'es' }, c.name_es), ' ', h('span', { class: 'sol-soft sol-small', lang }, trOf(c))),
          h('ul', null, Object.values(s.cards).filter((x) => x.cat === c.id && x.kind === 'word').map((x) => h('li', null, h('span', { lang: 'es' }, x.item.es), ' ', h('span', { class: 'sol-soft', lang }, `· ${trOf(x.item)}`))))))),
        h('div', { class: 'sol-actions' },
          Button({ label: t('sol.newGame'), icon: 'refresh', onClick: () => put(content, playView(level)) }),
          Button({ label: t('sol.levelsBack'), icon: 'back', variant: 'outline', onClick: () => ctx.go([]) })));
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { if (drag) { for (const c of drag.els) { c.classList.remove('is-dragging'); c.style.transform = ''; } drag = null; } });
    draw();
    return el;
  }

  render(ctx.path);
  return { update: render, destroy: () => { html.dataset.theme = 'brote'; } };
}
