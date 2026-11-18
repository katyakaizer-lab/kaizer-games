/**
 * Solitario de categorías. Routes inside the game (after #game/solitario):
 *   (none)                       choose a level
 *   play/<level>[/seed-<n>]      a game (the seed makes a deal repeatable, for tests and sharing)
 * Dense one-screen board: a compact top bar, a status row (moves, discard and draw pile), one row of
 * category slots, then the board. Sizes from tokens and the level's data (sizing.ts).
 */
import { h, mount as put } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, FeedbackBanner, toast } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { playMelody, playNote } from '../../audio/synth';
import { recordCelebration } from '../../app/pet-state';
import { getSettings, prefersReducedMotion } from '../../app/settings';
import type { GameContext, GameHandle } from '../../app/router';
import {
  LEVELS, canPlace, catName, drawCard, hintFor, isWon, move, movesLeft, newGame, outOfMoves, restart, runAt, undo,
  type Category, type GameState, type Level, type LevelConfig, type SolitarioData, type Source, type Target,
} from './engine';
import { canvasMeasure, cardFont, denseLayout, peekFor, readTokens, stackOffsets, type CardFont, type DenseLayout } from './sizing';
import './solitario.css';

const files = import.meta.glob<SolitarioData>('../../data/solitario/*.json', { eager: true, import: 'default' });
// Tests may inject their own data (window.__solTestData) to check extreme word lengths and layouts.
const injected = (globalThis as { __solTestData?: SolitarioData }).__solTestData;
const DATA: SolitarioData = injected ?? {
  categories: Object.keys(files).sort().flatMap((k) => files[k].categories ?? []),
  levels: Object.assign({}, ...Object.keys(files).map((k) => files[k].levels ?? {})),
};
export const CATEGORIES: Category[] = DATA.categories;
const poolFor = (l: Level) => CATEGORIES.filter((c) => c.level === l);
const levelConfig = (l: Level): LevelConfig => ({ columns: 6, rows: 5, ...DATA.levels?.[l] });
const LEVELS_WITH_CARDS = LEVELS.filter((l) => poolFor(l).length >= Math.min(levelConfig(l).columns, 4));

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
/** Move limits a player can choose (null = no limit). Deals are checked to be winnable within the limit. */
export const LIMITS: (number | null)[] = [null, 80, 65, 50];
const getLimit = (): number | null => { const v = store.get<number | null>('sol.limit', null); return LIMITS.includes(v) ? v : null; };

/** Little stars that pop out around an element (a completed category). Skipped with reduced motion. */
function starBurst(at: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const r = at.getBoundingClientRect();
  const layer = h('div', { class: 'sol-burst', 'aria-hidden': 'true' });
  layer.style.left = `${r.left + r.width / 2 + window.scrollX}px`;
  layer.style.top = `${r.top + r.height / 2 + window.scrollY}px`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const d = 32 + Math.random() * 30;
    const star = h('span', { class: 'sol-burst__star' }, '★');
    star.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    star.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    star.style.setProperty('--s', String(0.7 + Math.random() * 0.8));
    star.style.animationDelay = `${Math.random() * 90}ms`;
    layer.append(star);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1100);
}

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'mesa';
  const content = h('div', { class: 'sol' });
  put(root, content);
  let cleanupView: (() => void) | null = null;

  let renderToken = 0;
  async function render(path: string[]): Promise<void> {
    const token = ++renderToken;
    const [head, lvl, seedSeg] = path;
    const level = LEVELS_WITH_CARDS.find((l) => l === lvl);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : undefined;
    if (head === 'play' && level) {
      // Card sizes are measured from the text, so the card font must be loaded first.
      const fam = getComputedStyle(html).getPropertyValue('--font-body').trim();
      try { await Promise.all([document.fonts?.load(`700 16px ${fam}`, 'áñ'), document.fonts?.load(`400 16px ${fam}`, 'áñ')]); } catch { /* measure with what is there */ }
      if (token !== renderToken) return;
    }
    cleanupView?.();
    cleanupView = null;
    content.classList.toggle('is-board', head === 'play' && !!level);
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
      h('fieldset', { class: 'sol-limit' },
        h('legend', null, t('sol.limitTitle')),
        h('div', { class: 'sol-limit__opts' }, LIMITS.map((v) => {
          const id = `sol-limit-${v ?? 'none'}`;
          const input = h('input', { type: 'radio', name: 'sol-limit', id, checked: getLimit() === v, class: 'sol-limit__radio' }) as HTMLInputElement;
          input.addEventListener('change', () => store.set('sol.limit', v));
          return h('label', { class: 'sol-limit__opt', for: id }, input, h('span', null, v === null ? t('sol.noLimit') : t('sol.limitN', { n: v })));
        }))),
      h('div', { class: 'sol-levels' }, LEVELS_WITH_CARDS.map((l) => {
        const r = rec[l];
        return h('button', { type: 'button', class: 'sol-level', onClick: () => ctx.go(['play', l]) },
          h('span', { class: 'sol-level__name' }, l),
          h('span', { class: 'sol-small', lang: 'es' }, poolFor(l).slice(0, 4).map((c) => c.name_es).join(', ') + '…'),
          r ? h('span', { class: 'sol-small sol-level__wins' }, icon('check'), t('sol.wins', { n: r.wins }), r.best !== undefined ? ` · ${t('sol.best', { n: r.best })}` : '') : null);
      })));
  }

  /* ---------------- A game ---------------- */
  function playView(level: Level, seed?: number): HTMLElement {
    const pool = poolFor(level);
    const cfg = levelConfig(level);
    let showTr = store.get<boolean>('sol.showTr', level === 'A1');
    const measure = canvasMeasure(getComputedStyle(html).getPropertyValue('--font-body') || 'sans-serif');
    const levelWords = pool.flatMap((c) => c.items.map((i) => i.es));
    const lay: DenseLayout = denseLayout({
      viewW: content.clientWidth || window.innerWidth, levelColumns: cfg.columns, levelRows: cfg.rows,
      textSize: getSettings().textSize, levelWords, tk: readTokens(), m: measure,
    });
    const dealOpts = () => ({ columns: lay.columns, categories: lay.categories, rows: lay.rows, limit: getLimit() });
    let s: GameState = newGame(pool, { ...dealOpts(), seed });
    let fonts = new Map<string, CardFont>();
    const refit = () => {
      fonts = new Map(Object.values(s.cards).map((c) => [c.id, cardFont({ es: c.item.es, tr: showTr && c.kind === 'word' ? trOf(c.item) : undefined, isCat: c.kind === 'cat' }, lay.cardW, lay.cardH, lay.tk, measure)]));
    };
    refit();
    let burstSlot: number | null = null;
    let sel: Source | null = null;
    let missesOnSel = 0;
    let hint: Target | null = null;

    const el = h('div', { class: 'sol-play' });
    // Screen readers hear every message; on screen, messages that matter appear as a short toast.
    const status = h('p', { class: 'k-sr sol-status', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string, show = false) => { status.textContent = m; if (show && m) toast(m); };
    const word = (id: string) => s.cards[id].item.es;
    const sameSrc = (a: Source | null, b: Source) => !!a && a.kind === b.kind && (a.kind === 'waste' || (b.kind === 'col' && a.col === b.col && a.index === b.index));
    const select = (src: Source | null) => { sel = src; missesOnSel = 0; hint = null; };
    const deal = () => { s = newGame(pool, dealOpts()); refit(); select(null); announce(t('sol.newDeal')); draw(); };

    function tryMove(src: Source, tg: Target) {
      if (outOfMoves(s)) { announce(t('sol.outTitle'), true); return; }
      const run = runAt(s, src);
      if (!run) return;
      const doneBefore = s.done.length;
      if (move(s, src, tg)) {
        select(null);
        const first = s.cards[run[0]];
        if (s.done.length > doneBefore) { playMelody(); burstSlot = tg.kind === 'slot' ? tg.index : null; announce(t('sol.complete', { cat: catName(s, s.done[s.done.length - 1]) }), true); }
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
        : t('sol.notHere', { word: w0, cat: catName(s, slot!.cat) }), true);
      draw();
      for (const id of run) {
        const c = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
        c?.classList.add('is-wrong');
        setTimeout(() => c?.classList.remove('is-wrong'), 1100);
      }
    }

    /** A card face: category cards have a tag row (book icon + count) above the name; word cards the word and (uncovered) translation. */
    function cardEl(id: string, src: Source | null, selected: boolean, o: { tag?: string; covered?: boolean } = {}) {
      const c = s.cards[id];
      const isCat = c.kind === 'cat';
      const f = fonts.get(id)!;
      return h(src ? 'button' : 'div', {
        type: src ? 'button' : undefined,
        class: `sol-card${isCat ? ' is-cat' : ''}${selected ? ' is-selected' : ''}${o.covered ? ' is-covered' : ''}`, 'data-id': id,
        'data-src': src ? JSON.stringify(src) : undefined, 'aria-pressed': src ? String(selected) : undefined,
        'aria-label': isCat ? `${t('sol.categoryCard')}: ${c.item.es} (${o.tag ?? s.size[c.cat]})` : undefined,
      },
        isCat ? h('span', { class: 'sol-card__tag', 'aria-hidden': 'true' }, icon('book'), h('span', null, o.tag ?? String(s.size[c.cat]))) : null,
        h('span', { class: 'sol-card__word', lang: 'es', style: { fontSize: `${f.word}px` } }, c.item.es),
        showTr && !isCat && !o.covered ? h('span', { class: 'sol-card__tr', lang: getLang() === 'ru' ? 'ru' : 'en', style: { fontSize: `${f.tr}px` } }, trOf(c.item)) : null);
    }

    function draw() {
      el.style.setProperty('--card-w', `${lay.cardW}px`);
      el.style.setProperty('--card-h', `${lay.cardH}px`);
      el.style.setProperty('--ncols', String(lay.columns));
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
      const selRun = sel ? runAt(s, sel) ?? [] : [];

      const slots = s.slots.map((slot, i) => {
        const tg = JSON.stringify({ kind: 'slot', index: i });
        const cls = `${hint?.kind === 'slot' && hint.index === i ? ' is-hint' : ''}${sel && canPlace(s, selRun, { kind: 'slot', index: i }) ? ' is-fit' : ''}`;
        if (!slot.cat) {
          return h('button', { type: 'button', class: `sol-slot is-open${cls}`, 'data-target': tg, 'data-focus-key': `slot-${i}`, 'aria-label': t('sol.emptySlot') },
            h('span', { 'aria-hidden': 'true' }, icon('book')));
        }
        // An open slot is its category card, with progress in the tag row (n/total).
        return h('button', {
          type: 'button', class: `sol-slotcat${cls}`, 'data-target': tg, 'data-focus-key': `slot-${i}`,
          'aria-label': `${catName(s, slot.cat)}: ${slot.words.length}/${s.size[slot.cat]}${slot.words.length ? `, ${slot.words.map(word).join(', ')}` : ''}`,
        }, cardEl(`${slot.cat}:cat`, null, false, { tag: `${slot.words.length}/${s.size[slot.cat]}` }));
      });

      const cols = s.cols.map((col, ci) => {
        const tg = JSON.stringify({ kind: 'col', col: ci });
        return h('div', {
          class: `sol-col${hint?.kind === 'col' && hint.col === ci ? ' is-hint' : ''}`, 'data-target': tg, 'data-col': String(ci), role: 'group',
          'aria-label': `${t('sol.column', { n: ci + 1 })}${col.length ? '' : `, ${t('sol.emptyColumn')}`}`,
        },
          col.length ? col.map((id, idx) => {
            const src: Source = { kind: 'col', col: ci, index: idx };
            const movable = !!runAt(s, src);
            const e = cardEl(id, movable ? src : null, sel?.kind === 'col' && sel.col === ci && selRun.includes(id), { covered: idx < col.length - 1 });
            if (movable) e.dataset.focusKey = `col-${ci}-${idx}`;
            return e;
          }) : h('button', { type: 'button', class: 'sol-slot', 'data-target': tg, 'data-focus-key': `col-${ci}-empty`, 'aria-label': `${t('sol.column', { n: ci + 1 })}, ${t('sol.emptyColumn')}` }));
      });

      const wasteTop = s.waste[s.waste.length - 1];
      const wastePrev = s.waste[s.waste.length - 2];
      const left = movesLeft(s);
      put(el,
        // 1. Top bar: one row of 44px targets.
        h('div', { class: 'sol-bar' },
          Button({ label: t('sol.levelsBack'), icon: 'back', iconOnly: true, variant: 'quiet', onClick: () => ctx.go([]) }),
          h('span', { class: 'sol-badge' }, level),
          h('span', { class: 'sol-bar__space' }),
          sel && missesOnSel >= 2 ? Button({ label: t('sol.hint'), icon: 'bulb', iconOnly: true, variant: 'secondary', onClick: () => { hint = sel ? hintFor(s, sel) : null; s.hintsUsed++; announce(hint ? t('sol.hintShown') : t('sol.hintNone'), true); draw(); } }) : null,
          Button({ label: t('sol.undo'), icon: 'undo', iconOnly: true, variant: 'quiet', disabled: !s.history.length, onClick: () => { if (undo(s)) { select(null); announce(t('sol.undone')); draw(); } } }),
          Button({ label: t('sol.newGame'), icon: 'refresh', iconOnly: true, variant: 'quiet', onClick: deal }),
          Button({ label: t('sol.translation'), icon: 'language', iconOnly: true, variant: showTr ? 'secondary' : 'quiet', pressed: showTr, onClick: () => { showTr = !showTr; store.set('sol.showTr', showTr); refit(); draw(); } })),
        h('h1', { tabindex: '-1', class: 'sol-title k-sr', lang: 'es' }, 'Solitario de categorías'),
        // 2. Status row: moves on the left, discard and draw pile on the right (card height).
        h('div', { class: `sol-head${2 * lay.cardW + 2 * lay.tk.gap + 4.5 * lay.tk.rootPx > lay.columns * lay.cardW + (lay.columns - 1) * lay.tk.gap ? ' is-narrow' : ''}` },
          h('div', { class: `sol-moves${left !== null && left <= 5 ? ' is-low' : ''}`, 'aria-label': left === null ? t('sol.movesLabel', { n: s.moves }) : t('sol.leftLabel', { n: left, total: s.limit! }) },
            h('span', { class: 'sol-moves__label' }, left === null ? t('sol.moves') : t('sol.left')),
            h('span', { class: 'sol-moves__n' }, String(left ?? s.moves), left !== null ? h('span', { class: 'sol-moves__of' }, ` / ${s.limit}`) : null)),
          h('span', { class: 'sol-bar__space' }),
          h('div', { class: 'sol-waste', 'aria-label': t('sol.waste') },
            wastePrev ? h('div', { class: 'sol-card sol-waste__under', 'aria-hidden': 'true' }) : null,
            wasteTop ? (() => { const e = cardEl(wasteTop, { kind: 'waste' }, sel?.kind === 'waste'); e.dataset.focusKey = 'waste'; return e; })() : h('span', { class: 'sol-slot is-quiet', 'aria-hidden': 'true' })),
          h('button', {
            type: 'button', class: `sol-stock${s.stock.length ? '' : ' is-empty'}`, 'data-stock': 'true', 'data-focus-key': 'stock',
            'aria-label': s.stock.length ? t('sol.stock', { n: s.stock.length }) : s.waste.length ? t('sol.recycle') : t('sol.deckEmpty'),
          }, s.stock.length ? h('span', { class: 'sol-back' }, h('span', { class: 'sol-stock__n' }, String(s.stock.length))) : h('span', { class: 'sol-stock__again' }, icon('refresh')))),
        // 3. Category slots: one row, one slot per column.
        h('section', { class: 'sol-slots', 'aria-label': t('sol.foundations'), style: { gridTemplateColumns: `repeat(${s.slots.length}, var(--card-w))` } }, slots),
        // 4. Board.
        h('section', { class: 'sol-cols', 'aria-label': t('sol.columns'), style: { gridTemplateColumns: `repeat(${s.cols.length}, var(--card-w))` } }, cols),
        outOfMoves(s) ? h('div', { class: 'sol-out', role: 'dialog', 'aria-label': t('sol.outTitle') },
          FeedbackBanner({ kind: 'retry', title: t('sol.outTitle'), hint: t('sol.outHint') }),
          h('div', { class: 'sol-actions' },
            Button({ label: t('sol.undo'), icon: 'undo', variant: 'secondary', onClick: () => { undo(s); select(null); draw(); } }),
            Button({ label: t('sol.keepGoing'), icon: 'play', variant: 'secondary', onClick: () => { s.limit = null; announce(t('sol.keptGoing')); draw(); } }),
            Button({ label: t('sol.retry'), icon: 'refresh', variant: 'outline', onClick: () => { restart(s); select(null); announce(t('sol.retried')); draw(); } }),
            Button({ label: t('sol.newGame'), icon: 'star', variant: 'outline', onClick: deal }))) : null,
        status);
      layoutStacks();
      if (focusKey) el.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
      if (burstSlot !== null) {
        const at = el.querySelectorAll<HTMLElement>('.sol-slots > *')[burstSlot];
        burstSlot = null;
        if (at) starBurst(at);
      }
    }

    /** Full cards with a gap; a column overlaps only when it would run past the bottom of the screen. */
    function layoutStacks() {
      const board = el.querySelector<HTMLElement>('.sol-cols');
      if (!board) return;
      const bottomRoom = lay.tk.boardPad;
      const availH = Math.max(lay.cardH, window.innerHeight - board.getBoundingClientRect().top - bottomRoom);
      for (const colEl of board.querySelectorAll<HTMLElement>('.sol-col')) {
        const col = s.cols[Number(colEl.dataset.col)];
        if (!col?.length) continue;
        const peeks = col.map((id) => peekFor(fonts.get(id)!, s.cards[id].kind === 'cat', lay.tk));
        const offs = stackOffsets(peeks, lay.cardH, lay.tk.gap, availH);
        const cards = [...colEl.children] as HTMLElement[];
        cards.forEach((c, i) => { c.style.marginTop = i === 0 ? '0' : `${offs[i] - offs[i - 1] - lay.cardH}px`; });
      }
    }

    function onClick(e: MouseEvent) {
      if (suppressClick) { suppressClick = false; return; }
      const tEl = e.target as HTMLElement;
      if (tEl.closest('[data-stock]')) {
        if (outOfMoves(s)) { announce(t('sol.outTitle'), true); return; }
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
        if (!sel) { announce(t('sol.pickCard'), true); return; }
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
      content.classList.remove('is-board');
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      put(el,
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías'),
        h('div', { class: `sol-finish${prefersReducedMotion() ? '' : ' is-glowing'}` },
          FeedbackBanner({ kind: 'correct', title: t('sol.finished'), hint: `${t('sol.movesLabel', { n: s.moves })}${rec.best === s.moves ? ` · ${t('sol.newBest')}` : ''}` })),
        h('div', { class: 'sol-summary' }, s.cats.map((c) => h('section', { class: 'sol-sum' },
          h('h2', null, h('span', { lang: 'es' }, c.name_es), ' ', h('span', { class: 'sol-soft sol-small', lang }, trOf(c))),
          h('ul', null, Object.values(s.cards).filter((x) => x.cat === c.id && x.kind === 'word').map((x) => h('li', null, h('span', { lang: 'es' }, x.item.es), ' ', h('span', { class: 'sol-soft', lang }, `· ${trOf(x.item)}`))))))),
        h('div', { class: 'sol-actions' },
          Button({ label: t('sol.newGame'), icon: 'refresh', onClick: () => { content.classList.add('is-board'); put(content, playView(level)); } }),
          Button({ label: t('sol.levelsBack'), icon: 'back', variant: 'outline', onClick: () => ctx.go([]) })));
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { if (drag) { for (const c of drag.els) { c.classList.remove('is-dragging'); c.style.transform = ''; } drag = null; } });
    const onResize = () => layoutStacks();
    window.addEventListener('resize', onResize);
    cleanupView = () => window.removeEventListener('resize', onResize);
    queueMicrotask(draw);
    return el;
  }

  void render(ctx.path);
  return { update: (p) => void render(p), destroy: () => { renderToken++; cleanupView?.(); html.dataset.theme = 'brote'; } };
}
