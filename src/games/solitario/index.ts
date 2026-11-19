/**
 * Solitario de categorías. Routes inside the game (after #game/solitario):
 *   (none)                       choose a level
 *   play/<level>[/seed-<n>]      a game (the seed makes a deal repeatable, for tests and sharing)
 * Layout follows the card-layout mockup v4: top bar (back, level title, translation), status row
 * (moves, drawn pile, deck), one row of category slots, the columns (face-down strips under face-up
 * cards), and a bottom bar with Pista, Deshacer and Reiniciar. Sizes from tokens (sizing.ts).
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
  LEVELS, canPlace, catName, drawCard, hintFor, isFaceDown, isWon, move, movesLeft, newGame, nextStep, outOfMoves, restart, runAt, undo,
  type Category, type GameState, type Level, type LevelConfig, type SolitarioData, type Source, type Target,
} from './engine';
import { MAX_NAME_LINES, MAX_WORD_LINES, boardLayout, canvasMeasure, cardFont, cardSize, columnOffsets, readTokens, visibleTop, type BoardLayout, type CardFont } from './sizing';
import { softHyphenate } from '../../lang/es/syllabify.ts';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import './solitario.css';
import { wordById } from '../../words/bank';
import { resolveCategories, type RawCategory } from './bank-items';

const files = import.meta.glob<SolitarioData & { categories?: RawCategory[] }>('../../data/solitario/*.json', { eager: true, import: 'default' });
// Tests may inject their own data (window.__solTestData) to check extreme word lengths and layouts.
const injected = (globalThis as { __solTestData?: SolitarioData }).__solTestData;
const DATA: SolitarioData = injected ?? {
  // Categories list word bank ids; words and translations come from the bank.
  categories: resolveCategories(Object.keys(files).sort().flatMap((k) => (files[k].categories ?? []) as unknown as RawCategory[]), wordById),
  levels: Object.assign({}, ...Object.keys(files).map((k) => files[k].levels ?? {})),
};
export const CATEGORIES: Category[] = DATA.categories;
const poolFor = (l: Level) => CATEGORIES.filter((c) => c.level === l);
const levelConfig = (l: Level): LevelConfig => ({ columns: 5, down: 2, ...DATA.levels?.[l] });
const LEVELS_WITH_CARDS = LEVELS.filter((l) => poolFor(l).length >= Math.min(levelConfig(l).columns, 3));

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
      try { await Promise.all([document.fonts?.load(`700 16px ${fam}`, 'áñ'), document.fonts?.load(`400 16px ${fam}`, 'áñ')]); await document.fonts?.ready; } catch { /* measure with what is there */ }
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
    const lay: BoardLayout = boardLayout({
      viewW: content.clientWidth || window.innerWidth, levelColumns: cfg.columns, levelDown: cfg.down,
      textSize: getSettings().textSize, levelWords: pool.flatMap((c) => c.items.map((i) => i.es)), levelNames: pool.map((c) => c.name_es), tk: readTokens(), m: measure,
    });
    const dealOpts = () => ({ columns: lay.columns, categories: Math.min(lay.categories, pool.length), down: lay.down, limit: getLimit() });
    let s: GameState = newGame(pool, { ...dealOpts(), seed });
    let fonts = new Map<string, CardFont>();
    const refit = () => {
      fonts = new Map(Object.values(s.cards).map((c) => [c.id, cardFont({ es: c.item.es, tr: showTr && c.kind === 'word' ? trOf(c.item) : undefined, isCat: c.kind === 'cat' }, lay.cardW, lay.tk, measure)]));
    };
    refit();
    let burstSlot: number | null = null;
    let sel: Source | null = null;
    let hint: { src?: Source; dst?: Target } | null = null;
    let faceDownBefore = new Set<string>();
    const starredCats = new Set<string>(); // a category gives its star once per deal, even after undo
    let dropFrom = new Map<string, DOMRect>(); // where moved cards were, for the drop animation
    let viewW = content.clientWidth || window.innerWidth;

    const el = h('div', { class: 'sol-play' });
    // Screen readers hear every message; on screen, messages that matter appear as a short toast.
    const status = h('p', { class: 'k-sr sol-status', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string, show = false) => { status.textContent = m; if (show && m) toast(m); };
    const word = (id: string) => s.cards[id].item.es;
    const sameSrc = (a: Source | null, b: Source) => !!a && a.kind === b.kind && (a.kind === 'waste' || (b.kind === 'col' && a.col === b.col && a.index === b.index));
    const select = (src: Source | null) => { sel = src; hint = null; };
    const deal = () => { s = newGame(pool, dealOpts()); refit(); select(null); announce(t('sol.newDeal')); draw(); };
    const faceDownIds = () => new Set(s.cols.flatMap((col, ci) => col.filter((_, i) => isFaceDown(s, ci, i))));

    function tryMove(src: Source, tg: Target) {
      if (outOfMoves(s)) { announce(t('sol.outTitle'), true); return; }
      const run = runAt(s, src);
      if (!run) return;
      const doneBefore = s.done.length;
      faceDownBefore = faceDownIds();
      dropFrom = new Map(run.map((id) => [id, el.querySelector(`[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()]).filter((x): x is [string, DOMRect] => !!x[1]));
      if (move(s, src, tg)) {
        select(null);
        const first = s.cards[run[0]];
        if (s.done.length > doneBefore) { const doneCat = s.done[s.done.length - 1]; if (!starredCats.has(doneCat)) { starredCats.add(doneCat); earn('solitario', STARS.solitario.category, `category ${doneCat}`, el.querySelector('.sol-moves')); } playMelody(); burstSlot = tg.kind === 'slot' ? tg.index : null; announce(t('sol.complete', { cat: catName(s, s.done[s.done.length - 1]) }), true); }
        else {
          playNote(s.moves % 10);
          announce(tg.kind === 'slot' ? (first.kind === 'cat' ? t('sol.opened', { cat: first.item.es }) : t('sol.toSlot', { word: first.item.es, cat: catName(s, first.cat) }))
            : t('sol.toColumn', { word: first.item.es, n: tg.col + 1 }));
        }
        if (isWon(s)) { finish(); return; }
        draw();
        return;
      }
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

    /** A face-up card: outer edge, inner framed panel; category cards have a row with the book icon and count. */
    function cardEl(id: string, src: Source | null, selected: boolean, o: { count?: string; squeezed?: boolean; hinted?: boolean } = {}) {
      const c = s.cards[id];
      const isCat = c.kind === 'cat';
      const f = fonts.get(id)!;
      const isNew = faceDownBefore.has(id) && !prefersReducedMotion();
      return h(src ? 'button' : 'div', {
        type: src ? 'button' : undefined,
        class: `sol-card${isCat ? ' is-cat' : ''}${selected ? ' is-selected' : ''}${o.squeezed ? ' is-squeezed' : ''}${o.hinted ? ' is-hint' : ''}${isNew ? ' is-flipping' : ''}`, 'data-id': id,
        'data-src': src ? JSON.stringify(src) : undefined, 'aria-pressed': src ? String(selected) : undefined,
        'aria-label': isCat ? `${t('sol.categoryCard')}: ${c.item.es} (${o.count ?? s.size[c.cat]})` : `${c.item.es}${showTr ? `, ${trOf(c.item)}` : ''}`,
      },
        h('span', { class: 'sol-card__panel' },
          isCat ? h('span', { class: 'sol-card__tag', 'aria-hidden': 'true' }, icon('book'), h('span', null, o.count ?? String(s.size[c.cat]))) : null,
          h('span', { class: 'sol-card__word', lang: 'es', style: { fontSize: `${f.word}px` }, 'aria-hidden': 'true' }, f.wrap ? softHyphenate(c.item.es) : c.item.es),
          showTr && !isCat ? h('span', { class: 'sol-card__tr', lang: getLang() === 'ru' ? 'ru' : 'en', style: { fontSize: `${f.tr}px` }, 'aria-hidden': 'true' }, trOf(c.item)) : null));
    }
    /** Label tab above a filled slot: the category name on one line (11px down to 9px), else wrapped at a syllable. */
    const tabFont = (name: string) => {
      const inner = lay.cardW - 10;
      for (let px = lay.tk.tag; px >= 9; px -= 0.25) if (measure(name, px, 800) <= inner) return { px, wrap: false };
      return { px: 9, wrap: true };
    };
    const back = (extra = '') => h('div', { class: `sol-card is-down${extra}`, 'aria-hidden': 'true' });

    function draw() {
      el.style.setProperty('--card-w', `${lay.cardW}px`);
      el.style.setProperty('--card-h', `${lay.cardH}px`);
      el.style.setProperty('--ncols', String(lay.columns));
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
      const selRun = sel ? runAt(s, sel) ?? [] : [];
      const isHintSrc = (src: Source) => !!hint?.src && sameSrc(hint.src, src);

      // Category slots: empty (darker felt + book), category placed (book, 0/N, name), or filled (tab above, count, last word).
      const slots = s.slots.map((slot, i) => {
        const tg = JSON.stringify({ kind: 'slot', index: i });
        const cls = `${hint?.dst?.kind === 'slot' && hint.dst.index === i ? ' is-hint' : ''}${sel && canPlace(s, selRun, { kind: 'slot', index: i }) ? ' is-fit' : ''}`;
        if (!slot.cat) {
          return h('button', { type: 'button', class: `sol-slot is-open${cls}`, 'data-target': tg, 'data-focus-key': `slot-${i}`, 'aria-label': t('sol.emptySlot') },
            h('span', { 'aria-hidden': 'true' }, icon('book')));
        }
        const count = `${slot.words.length}/${s.size[slot.cat]}`;
        const label = `${catName(s, slot.cat)}: ${count}${slot.words.length ? `, ${slot.words.map(word).join(', ')}` : ''}`;
        if (!slot.words.length) {
          return h('button', { type: 'button', class: `sol-slotcat${cls}`, 'data-target': tg, 'data-focus-key': `slot-${i}`, 'aria-label': label },
            cardEl(`${slot.cat}:cat`, null, false, { count }));
        }
        const last = slot.words[slot.words.length - 1];
        const lf = fonts.get(last)!;
        return h('button', { type: 'button', class: `sol-slotcat is-filled${cls}`, 'data-target': tg, 'data-focus-key': `slot-${i}`, 'aria-label': label },
          (() => { const name = catName(s, slot.cat); const f = tabFont(name); return h('span', { class: 'sol-slotcat__tab', lang: 'es', style: { fontSize: `${f.px}px` }, 'aria-hidden': 'true' }, f.wrap ? softHyphenate(name) : name); })(),
          h('span', { class: 'sol-card is-slot' },
            h('span', { class: 'sol-card__panel' },
              h('span', { class: 'sol-card__tag is-count', 'aria-hidden': 'true' }, h('span', null, count)),
              h('span', { class: 'sol-card__word', lang: 'es', style: { fontSize: `${lf.word}px` }, 'aria-hidden': 'true' }, lf.wrap ? softHyphenate(word(last)) : word(last)))));
      });

      const cols = s.cols.map((col, ci) => {
        const tg = JSON.stringify({ kind: 'col', col: ci });
        const down = s.down[ci] ?? 0;
        return h('div', {
          class: `sol-col${hint?.dst?.kind === 'col' && hint.dst.col === ci ? ' is-hint' : ''}`, 'data-target': tg, 'data-col': String(ci), role: 'group',
          'aria-label': `${t('sol.column', { n: ci + 1 })}${col.length ? (down ? `, ${t('sol.faceDown', { n: down })}` : '') : `, ${t('sol.emptyColumn')}`}`,
        },
          col.length ? col.map((id, idx) => {
            if (idx < down) return back();
            const src: Source = { kind: 'col', col: ci, index: idx };
            const movable = !!runAt(s, src);
            const e = cardEl(id, movable ? src : null, sel?.kind === 'col' && sel.col === ci && selRun.includes(id), { hinted: isHintSrc(src) });
            if (movable) e.dataset.focusKey = `col-${ci}-${idx}`;
            return e;
          }) : h('button', { type: 'button', class: 'sol-slot is-col', 'data-target': tg, 'data-focus-key': `col-${ci}-empty`, 'aria-label': `${t('sol.column', { n: ci + 1 })}, ${t('sol.emptyColumn')}` }));
      });

      // Drawn pile: the top card face up; up to two cards underneath show their word along the edge.
      const wasteTop = s.waste[s.waste.length - 1];
      const under = s.waste.slice(-3, -1).reverse(); // [just below top, below that]
      const left = movesLeft(s);
      put(el,
        // Top bar: back, level title, translation toggle.
        h('div', { class: 'sol-bar' },
          Button({ label: t('sol.levelsBack'), icon: 'back', iconOnly: true, variant: 'quiet', onClick: () => ctx.go([]) }),
          h('h1', { tabindex: '-1', class: 'sol-title sol-bar__title', lang: getLang() }, t('sol.levelTitle', { level, n: LEVELS.indexOf(level) + 1 })),
          Button({ label: t('sol.translation'), icon: 'language', iconOnly: true, variant: 'quiet', pressed: showTr, onClick: () => { showTr = !showTr; store.set('sol.showTr', showTr); refit(); draw(); } })),
        // Status row: moves, drawn pile, deck.
        h('div', { class: 'sol-head' },
          h('div', { class: `sol-moves${left !== null && left <= 5 ? ' is-low' : ''}`, 'aria-label': left === null ? t('sol.movesLabel', { n: s.moves }) : t('sol.leftLabel', { n: left, total: s.limit! }) },
            h('span', { class: 'sol-moves__label' }, left === null ? t('sol.moves') : t('sol.left')),
            h('span', { class: 'sol-moves__n' }, String(left ?? s.moves))),
          h('span', { class: 'sol-bar__space' }),
          h('div', { class: 'sol-waste', 'data-under': String(under.length), 'aria-label': `${t('sol.waste')}${under.length ? `. ${t('sol.under', { words: under.map(word).join(', ') })}` : ''}` },
            ...under.slice().reverse().map((id, k) => h('div', { class: `sol-card sol-waste__under is-u${under.length - k}`, 'aria-hidden': 'true' },
              h('span', { class: 'sol-card__panel' }, h('span', { class: 'sol-waste__edge', lang: 'es' }, word(id))))),
            wasteTop ? (() => { const e = cardEl(wasteTop, { kind: 'waste' }, sel?.kind === 'waste', { hinted: isHintSrc({ kind: 'waste' }) }); e.classList.add('sol-waste__top'); e.dataset.focusKey = 'waste'; return e; })()
              : h('span', { class: 'sol-slot is-quiet sol-waste__top', 'aria-hidden': 'true' })),
          h('button', {
            type: 'button', class: `sol-stock${s.stock.length ? '' : ' is-empty'}${hint && !hint.src && !hint.dst ? ' is-hint' : ''}`, 'data-stock': 'true', 'data-focus-key': 'stock',
            'aria-label': s.stock.length ? t('sol.stock', { n: s.stock.length }) : s.waste.length ? t('sol.recycle') : t('sol.deckEmpty'),
          }, s.stock.length ? h('span', { class: 'sol-card is-down' }, h('span', { class: 'sol-stock__n' }, String(s.stock.length))) : h('span', { class: 'sol-stock__again' }, icon('refresh')))),
        h('section', { class: 'sol-slots', 'aria-label': t('sol.foundations') }, slots),
        h('section', { class: 'sol-cols', 'aria-label': t('sol.columns') }, cols),
        // Bottom bar: Pista, Deshacer, Reiniciar.
        h('nav', { class: 'sol-bottom', 'aria-label': t('sol.columns') },
          h('button', { type: 'button', class: 'sol-bottom__btn', onClick: () => { giveHint(); } }, icon('bulb'), h('span', null, t('sol.hint'))),
          h('button', { type: 'button', class: 'sol-bottom__btn', disabled: !s.history.length, onClick: () => { if (undo(s)) { select(null); announce(t('sol.undone')); draw(); } } }, icon('undo'), h('span', null, t('sol.undo'))),
          h('button', { type: 'button', class: 'sol-bottom__btn', onClick: () => { restart(s); select(null); announce(t('sol.retried')); draw(); } }, icon('refresh'), h('span', null, t('sol.restart')))),
        outOfMoves(s) ? h('div', { class: 'sol-out', role: 'dialog', 'aria-label': t('sol.outTitle') },
          FeedbackBanner({ kind: 'retry', title: t('sol.outTitle'), hint: t('sol.outHint') }),
          h('div', { class: 'sol-actions' },
            Button({ label: t('sol.undo'), icon: 'undo', variant: 'secondary', onClick: () => { undo(s); select(null); draw(); } }),
            Button({ label: t('sol.keepGoing'), icon: 'play', variant: 'secondary', onClick: () => { s.limit = null; announce(t('sol.keptGoing')); draw(); } }),
            Button({ label: t('sol.retry'), icon: 'refresh', variant: 'outline', onClick: () => { restart(s); select(null); announce(t('sol.retried')); draw(); } }),
            Button({ label: t('sol.newGame'), icon: 'star', variant: 'outline', onClick: deal }))) : null,
        status);
      faceDownBefore = new Set();
      layoutStacks();
      animateDrop();
      if (focusKey) el.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
      if (burstSlot !== null) {
        const at = el.querySelectorAll<HTMLElement>('.sol-slots > *')[burstSlot];
        burstSlot = null;
        if (at) starBurst(at);
      }
    }

    /** Pista: with a card chosen, where it goes; otherwise a good next move (or the deck). */
    function giveHint() {
      s.hintsUsed++;
      if (sel) { const d = hintFor(s, sel); hint = { src: sel, dst: d ?? undefined }; announce(d ? t('sol.hintShown') : t('sol.hintNone'), true); draw(); return; }
      const step = nextStep(s);
      hint = step?.kind === 'move' ? { src: step.src, dst: step.dst } : {};
      announce(t('sol.hintNext'), true);
      draw();
    }

    /** Face-down strips, then face-up cards fully visible; squeeze face-up cards only if a column would pass the bottom bar. */
    /** Status row: narrower under-card strips (down to 14px), then a smaller move label, so it never passes the screen edge. */
    function fitHead() {
      const head = el.querySelector<HTMLElement>('.sol-head');
      const waste = el.querySelector<HTMLElement>('.sol-waste');
      if (!head || !waste) return;
      head.classList.remove('is-tight');
      waste.style.removeProperty('--under-w');
      const over = () => head.scrollWidth - head.clientWidth;
      // A strip must show its vertical word: card edge, frame, padding and one line of tag-size text.
      const minW = Math.ceil(lay.tk.edge + lay.tk.frame + lay.tk.pad + lay.tk.tag * 1.1 + 2);
      const shrink = () => {
        const n = Number(waste.dataset.under) || 0;
        if (over() > 0 && n) waste.style.setProperty('--under-w', `${Math.max(minW, lay.tk.rootPx * 1.5 - over() / n)}px`);
      };
      shrink();
      if (over() > 0) head.classList.add('is-tight');
      if (over() > 0 && waste.dataset.under === '2') { waste.dataset.under = '1'; waste.querySelector('.is-u2')?.remove(); shrink(); }
    }

    /** Moved cards glide from where they were to their final (overlapping) place. None with reduced motion. */
    function animateDrop() {
      const from = dropFrom;
      dropFrom = new Map();
      if (prefersReducedMotion()) return;
      for (const [id, r0] of from) {
        const e = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
        if (!e) continue;
        const r1 = e.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
      }
    }

    /**
     * Checks every word on screen against its card's inner panel, as the browser actually draws it (the canvas
     * estimate can differ, e.g. a different font on iOS). A word that is too wide or over 2 lines is wrapped at its
     * syllables and made smaller, down to --card-word-floor. Run after every render.
     */
    function verifyFit() {
      for (const w of el.querySelectorAll<HTMLElement>('.sol-card__word')) {
        const card = w.closest<HTMLElement>('[data-id]');
        const id = card?.dataset.id;
        const panel = w.parentElement!;
        const f = id ? fonts.get(id) : undefined;
        const maxW = panel.clientWidth - 2 * lay.tk.pad;
        let px = parseFloat(w.style.fontSize) || lay.tk.wordMax;
        const maxLines = card?.classList.contains('is-cat') ? MAX_NAME_LINES : MAX_WORD_LINES;
        const tooBig = () => w.scrollWidth > maxW + 0.5 || w.getBoundingClientRect().height > maxLines * px * lay.tk.line + 1 || panel.scrollHeight > panel.clientHeight + 1;
        if (!tooBig()) continue;
        const es = (id ? s.cards[id]?.item.es : undefined) ?? w.textContent!.replace(/­/g, '');
        w.textContent = softHyphenate(es);
        while (tooBig() && px > lay.tk.wordFloor) { px = Math.max(lay.tk.wordFloor, px - 0.5); w.style.fontSize = `${px}px`; }
        const lines = Math.max(1, Math.round(w.getBoundingClientRect().height / (px * lay.tk.line)));
        if (f && id) fonts.set(id, { ...f, word: px, wrap: true, wordLines: lines, misfit: tooBig() });
      }
    }

    function layoutStacks() {
      fitHead();
      verifyFit();
      const board = el.querySelector<HTMLElement>('.sol-cols');
      const bar = el.querySelector<HTMLElement>('.sol-bottom__btn');
      if (!board) return;
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      const availH = Math.max(lay.cardH, barTop - board.getBoundingClientRect().top - 4);
      for (const colEl of board.querySelectorAll<HTMLElement>('.sol-col')) {
        const ci = Number(colEl.dataset.col);
        const col = s.cols[ci];
        if (!col?.length) continue;
        const down = s.down[ci] ?? 0;
        const ups = col.slice(down).map((id) => visibleTop(fonts.get(id)!, s.cards[id].kind === 'cat', lay.tk));
        const offs = columnOffsets(down, ups, lay.cardH, lay.tk, availH);
        const cards = [...colEl.children] as HTMLElement[];
        cards.forEach((c, i) => {
          c.style.marginTop = i === 0 ? '0' : `${offs[i] - offs[i - 1] - lay.cardH}px`;
          const next = offs[i + 1];
          c.classList.toggle('is-squeezed', i >= down && next !== undefined && next - offs[i] < lay.cardH);
        });
      }
    }

    function onClick(e: MouseEvent) {
      if (suppressClick) { suppressClick = false; return; }
      const tEl = e.target as HTMLElement;
      if (tEl.closest('.sol-bottom, .sol-bar, .sol-out')) return;
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
      earn('solitario', STARS.solitario.win, 'win');
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
    // On resize the card width may change (same columns): new sizes, words fitted again, then redrawn.
    const onResize = () => {
      const w = content.clientWidth || window.innerWidth;
      if (Math.abs(w - viewW) < 1) { layoutStacks(); return; }
      viewW = w;
      lay.tk = readTokens();
      Object.assign(lay, cardSize(w, s.cols.length, lay.tk));
      refit();
      draw();
    };
    // Tests (with injected data only) can arrange a table, e.g. a column of stacked face-up cards.
    if (injected) (globalThis as { __solGame?: unknown }).__solGame = { state: () => s, redraw: () => { refit(); draw(); } };
    window.addEventListener('resize', onResize);
    cleanupView = () => window.removeEventListener('resize', onResize);
    queueMicrotask(draw);
    return el;
  }

  void render(ctx.path);
  return { update: (p) => void render(p), destroy: () => { renderToken++; cleanupView?.(); html.dataset.theme = 'brote'; } };
}
