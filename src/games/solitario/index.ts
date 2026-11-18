/**
 * Solitario de categorías. Routes inside the game (after #game/solitario):
 *   (none)                       choose a level
 *   play/<level>[/experto]       a game: four categories of that level, mixed
 * Classic solitaire layout on a card-table theme ("mesa"): foundations on top, columns below,
 * the deck and its turned-over card on the right. Plain word cards. Tap or drag.
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
  LEVELS, catOf, drawCard, hintFor, isWon, move, nameOptions, newGame, pileFor, pileSize, runAt, wrongNames,
  type Category, type GameState, type Level, type Mode, type SolitarioData, type Source, type Target,
} from './engine';
import './solitario.css';

const files = import.meta.glob<SolitarioData>('../../data/solitario/*.json', { eager: true, import: 'default' });
export const CATEGORIES: Category[] = Object.keys(files).sort().flatMap((k) => files[k].categories ?? []);
const poolFor = (l: Level) => CATEGORIES.filter((c) => c.level === l);
const LEVELS_WITH_CARDS = LEVELS.filter((l) => poolFor(l).length >= 4);

type Wins = Partial<Record<Level, Partial<Record<Mode, number>>>>;
const getWins = (): Wins => store.get<Wins>('sol.wins', {});
function addWin(l: Level, m: Mode): void {
  const w = getWins();
  w[l] = { ...w[l], [m]: (w[l]?.[m] ?? 0) + 1 };
  store.set('sol.wins', w);
}
const trOf = (x: { en: string; ru: string }) => (getLang() === 'ru' ? x.ru : x.en);
const columnsFor = (w: number) => (w < 560 ? 3 : w < 900 ? 4 : 5);

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'mesa';
  const content = h('div', { class: 'sol' });
  put(root, content);
  let expert = store.get<boolean>('sol.expert', false);

  function render(path: string[]): void {
    const [head, lvl, modeSeg] = path;
    const level = LEVELS_WITH_CARDS.find((l) => l === lvl);
    put(content, head === 'play' && level ? playView(level, modeSeg === 'experto' ? 'experto' : 'normal') : levelsView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  /* ---------------- Choose a level ---------------- */
  function levelsView(): HTMLElement {
    const wins = getWins();
    return h('div', { class: 'sol-list' },
      h('header', { class: 'sol-header' },
        Button({ label: t('common.back'), icon: 'home', iconOnly: true, variant: 'quiet', onClick: ctx.exit }),
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías')),
      h('p', { class: 'sol-soft' }, t('sol.intro')),
      h('p', { class: 'sol-soft sol-small' }, t('sol.rules')),
      h('div', { class: 'sol-expert' },
        Chip({ label: t('sol.expert'), pressed: expert, lang: 'es', onToggle: (on) => { expert = on; store.set('sol.expert', on); } }),
        h('span', { class: 'sol-soft sol-small' }, t('sol.expertHelp'))),
      h('div', { class: 'sol-levels' }, LEVELS_WITH_CARDS.map((l) => {
        const w = wins[l];
        const n = (w?.normal ?? 0) + (w?.experto ?? 0);
        return h('button', { type: 'button', class: 'sol-level', onClick: () => ctx.go(['play', l, ...(expert ? ['experto'] : [])]) },
          h('span', { class: 'sol-level__name' }, l),
          h('span', { class: 'sol-small' }, t('sol.levelCats', { n: poolFor(l).length })),
          n ? h('span', { class: 'sol-small sol-level__wins' }, icon('check'), t('sol.wins', { n })) : null);
      })));
  }

  /* ---------------- A game ---------------- */
  function playView(level: Level, mode: Mode): HTMLElement {
    const pool = poolFor(level);
    let s: GameState = newGame(pool, mode, { columns: columnsFor(content.clientWidth || window.innerWidth) });
    let sel: Source | null = null;
    let missesOnSel = 0;
    let hint: Target | null = null;
    let showTr = store.get<boolean>('sol.showTr', level === 'A1');

    const el = h('div', { class: 'sol-play' });
    const status = h('p', { class: 'sol-status', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string) => { status.textContent = m; };
    const word = (id: string) => s.cards[id].item.es;
    const sameSrc = (a: Source | null, b: Source) => !!a && a.kind === b.kind && (a.kind === 'waste' || (b.kind === 'col' && a.col === b.col && a.index === b.index));
    const pileName = (key: string, i: number) => (mode === 'normal' ? catOf(s, key)!.name_es : t('sol.group', { n: i + 1 }));
    const targetName = (tg: Target) => (tg.kind === 'pile' ? pileName(tg.key, Object.keys(s.piles).indexOf(tg.key)) : t('sol.column', { n: tg.col + 1 }));

    function select(src: Source | null) { sel = src; missesOnSel = 0; hint = null; }

    function tryMove(src: Source, tg: Target) {
      const run = runAt(s, src);
      if (!run) return;
      if (move(s, src, tg)) {
        select(null);
        playNote(Object.values(s.piles).reduce((n, p) => n + p.length, 0));
        announce(tg.kind === 'pile' ? t('sol.toPile', { word: word(run[0]), cat: targetName(tg) }) : t('sol.toColumn', { word: word(run[0]), n: tg.col + 1 }));
        if (isWon(s)) { mode === 'experto' ? naming() : finish(); return; }
      } else {
        missesOnSel++;
        const w0 = word(run[0]);
        announce(tg.kind === 'col' ? t('sol.notOnColumn', { word: w0 })
          : run.length > 1 ? t('sol.oneAtATime')
          : mode === 'normal' ? t('sol.notHere', { word: w0, cat: targetName(tg) }) : t('sol.notHereGroup', { word: w0 }));
        draw();
        for (const id of run) {
          const c = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
          c?.classList.add('is-wrong');
          setTimeout(() => c?.classList.remove('is-wrong'), 1100);
        }
        return;
      }
      draw();
    }

    function cardEl(id: string, src: Source | null, selected: boolean) {
      const c = s.cards[id];
      if (!c.up) return h('div', { class: 'sol-card is-down', 'aria-hidden': 'true' });
      return h('button', {
        type: 'button', class: `sol-card${selected ? ' is-selected' : ''}`, 'data-id': id,
        'data-src': src ? JSON.stringify(src) : undefined, 'aria-pressed': src ? String(selected) : undefined,
        tabindex: src ? undefined : '-1',
      }, h('span', { class: 'sol-card__word', lang: 'es' }, c.item.es), showTr ? h('span', { class: 'sol-card__tr', lang: getLang() === 'ru' ? 'ru' : 'en' }, trOf(c.item)) : null);
    }

    function draw() {
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
      const selRun = sel ? runAt(s, sel) ?? [] : [];
      const keys = Object.keys(s.piles);
      const piles = keys.map((key, i) => {
        const cards = s.piles[key];
        const cat = s.pileCat[key];
        const total = cat ? pileSize(s, cat) : 0;
        const full = total > 0 && cards.length === total;
        const tg = JSON.stringify({ kind: 'pile', key });
        return h('button', {
          type: 'button', class: `sol-pile${full ? ' is-full' : ''}${hint?.kind === 'pile' && hint.key === key ? ' is-hint' : ''}${sel ? ' is-target' : ''}`,
          'data-target': tg, 'data-focus-key': `pile-${key}`,
          'aria-label': `${pileName(key, i)}: ${cards.length ? cards.map(word).join(', ') : t('sol.emptyGroup')}${total ? ` (${cards.length}/${total})` : ''}`,
        },
          h('span', { class: 'sol-pile__name', lang: mode === 'normal' ? 'es' : undefined }, pileName(key, i)),
          cards.length ? h('span', { class: 'sol-card sol-pile__card', 'aria-hidden': 'true' }, h('span', { class: 'sol-card__word', lang: 'es' }, word(cards[cards.length - 1]))) : h('span', { class: 'sol-pile__empty', 'aria-hidden': 'true' }),
          h('span', { class: 'sol-pile__count' }, full ? icon('check') : null, total ? `${cards.length}/${total}` : ''));
      });
      const cols = s.cols.map((col, ci) => {
        const tg = JSON.stringify({ kind: 'col', col: ci });
        return h('div', {
          class: `sol-col${hint?.kind === 'col' && hint.col === ci ? ' is-hint' : ''}`, 'data-target': tg, role: 'group',
          'aria-label': `${t('sol.column', { n: ci + 1 })}${col.length ? '' : `, ${t('sol.emptyColumn')}`}`,
        },
          col.length ? col.map((id, idx) => {
            const src: Source | null = s.cards[id].up ? { kind: 'col', col: ci, index: idx } : null;
            const e = cardEl(id, src, selRun.includes(id) && sel?.kind === 'col');
            if (src) e.dataset.focusKey = `col-${ci}-${idx}`;
            return e;
          }) : h('button', { type: 'button', class: 'sol-slot', 'data-target': tg, 'data-focus-key': `col-${ci}-empty`, 'aria-label': `${t('sol.column', { n: ci + 1 })}, ${t('sol.emptyColumn')}` }));
      });
      const wasteTop = s.waste.length ? s.waste[s.waste.length - 1] : null;
      const deck = h('div', { class: 'sol-deck' },
        h('button', {
          type: 'button', class: `sol-stock${s.stock.length ? '' : ' is-empty'}`, 'data-stock': 'true', 'data-focus-key': 'stock',
          'aria-label': s.stock.length ? t('sol.stock', { n: s.stock.length }) : s.waste.length ? t('sol.recycle') : t('sol.deckEmpty'),
        }, s.stock.length ? h('span', { class: 'sol-card is-down' }, h('span', { class: 'sol-stock__n' }, String(s.stock.length))) : h('span', { class: 'sol-stock__again' }, icon('refresh'))),
        h('div', { class: 'sol-waste', 'aria-label': t('sol.waste') },
          wasteTop ? (() => { const e = cardEl(wasteTop, { kind: 'waste' }, sel?.kind === 'waste'); e.dataset.focusKey = 'waste'; return e; })() : h('span', { class: 'sol-slot is-quiet', 'aria-hidden': 'true' })));
      const showHint = !!sel && missesOnSel >= 2;
      put(el,
        h('div', { class: 'sol-bar' },
          Button({ label: t('sol.levelsBack'), icon: 'back', variant: 'quiet', onClick: () => ctx.go([]) }),
          h('span', { class: 'sol-badge' }, level),
          mode === 'experto' ? h('span', { class: 'sol-badge', lang: 'es' }, 'experto') : null,
          h('span', { class: 'sol-bar__space' }),
          Chip({ label: t('sol.translation'), pressed: showTr, onToggle: (on) => { showTr = on; store.set('sol.showTr', on); draw(); } }),
          Button({ label: t('sol.newGame'), icon: 'refresh', variant: 'quiet', onClick: () => { s = newGame(pool, mode, { columns: columnsFor(content.clientWidth || window.innerWidth) }); select(null); announce(''); draw(); } })),
        h('h1', { tabindex: '-1', class: 'sol-title k-sr', lang: 'es' }, 'Solitario de categorías'),
        h('section', { class: 'sol-top', 'aria-label': t('sol.foundations') }, piles),
        h('div', { class: 'sol-table', style: { '--cols': String(s.cols.length) } as unknown as Partial<CSSStyleDeclaration> },
          h('section', { class: 'sol-cols', 'aria-label': t('sol.columns') }, cols),
          deck),
        h('div', { class: 'sol-foot' },
          showHint ? Button({ label: t('sol.hint'), icon: 'bulb', variant: 'secondary', onClick: () => { hint = sel ? hintFor(s, sel) : null; s.hintsUsed++; announce(t('sol.hintShown')); draw(); } }) : null,
          status));
      el.querySelector<HTMLElement>('.sol-table')?.style.setProperty('--cols', String(s.cols.length));
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
        if (sameSrc(sel, src)) { select(null); draw(); return; } // tap again: put it down
        if (sel && src.kind === 'col') { tryMove(sel, { kind: 'col', col: src.col }); return; } // onto that column
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
    // Double-tap / double-click a card: send it to its foundation (the classic shortcut).
    function onDbl(e: MouseEvent) {
      const cardBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!cardBtn) return;
      const src = JSON.parse(cardBtn.dataset.src!) as Source;
      const run = runAt(s, src);
      if (!run || run.length !== 1) return;
      const k = pileFor(s, run[0]);
      if (k) tryMove(src, { kind: 'pile', key: k });
    }

    // Drag: a face-up card (and the cards on it) follows the pointer; drop on a column or a foundation.
    let drag: { src: Source; x: number; y: number; els: HTMLElement[]; moved: boolean } | null = null;
    let suppressClick = false;
    function onDown(e: PointerEvent) {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!c) return;
      const src = JSON.parse(c.dataset.src!) as Source;
      const run = runAt(s, src) ?? [];
      const els = run.map((id) => el.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)!).filter(Boolean);
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
      const colCard = under?.closest<HTMLElement>('.sol-col');
      const tgEl = under?.closest<HTMLElement>('[data-target]') ?? colCard;
      if (tgEl?.dataset.target) tryMove(d.src, JSON.parse(tgEl.dataset.target) as Target);
      else draw();
    }

    function naming() {
      const keys = Object.keys(s.piles);
      const opts = nameOptions(s, pool);
      const names: Record<string, string> = {};
      const fb = h('div', { 'aria-live': 'polite' });
      put(el,
        h('h1', { tabindex: '-1', class: 'sol-title' }, t('sol.nameTitle')),
        h('p', { class: 'sol-soft' }, t('sol.nameHelp')),
        h('div', { class: 'sol-names' }, keys.map((key, i) => {
          const id = `sol-name-${key}`;
          const selEl = h('select', { id, class: 'sol-select', lang: 'es' }, h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o }, o))) as HTMLSelectElement;
          selEl.addEventListener('change', () => { names[key] = selEl.value; fb.replaceChildren(); selEl.closest('.sol-name')?.classList.remove('is-wrong'); });
          return h('div', { class: 'sol-name', 'data-key': key },
            h('label', { for: id, class: 'sol-name__label' }, t('sol.group', { n: i + 1 })),
            h('p', { class: 'sol-name__words', lang: 'es' }, s.piles[key].map(word).join(' · ')),
            selEl);
        })),
        Button({ label: t('sol.nameCheck'), icon: 'check', size: 'lg', onClick: () => {
          const wrong = wrongNames(s, names);
          el.querySelectorAll<HTMLElement>('.sol-name').forEach((g) => g.classList.toggle('is-wrong', wrong.includes(g.dataset.key!)));
          if (!wrong.length) finish(); else put(fb, FeedbackBanner({ kind: 'retry', hint: t('sol.nameWrong') }));
        } }),
        fb);
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    function finish() {
      addWin(level, mode);
      recordCelebration();
      playMelody();
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      put(el,
        h('h1', { tabindex: '-1', class: 'sol-title', lang: 'es' }, 'Solitario de categorías'),
        h('div', { class: `sol-finish${prefersReducedMotion() ? '' : ' is-glowing'}` }, FeedbackBanner({ kind: 'correct', title: t('sol.finished') })),
        h('div', { class: 'sol-summary' }, s.cats.map((c) => h('section', { class: 'sol-sum' },
          h('h2', null, h('span', { lang: 'es' }, c.name_es), ' ', h('span', { class: 'sol-soft sol-small', lang }, trOf(c))),
          h('ul', null, Object.values(s.cards).filter((x) => x.cat === c.id).map((x) => h('li', null, h('span', { lang: 'es' }, x.item.es), ' ', h('span', { class: 'sol-soft', lang }, `· ${trOf(x.item)}`))))))),
        h('div', { class: 'sol-actions' },
          Button({ label: t('sol.newGame'), icon: 'refresh', onClick: () => put(content, playView(level, mode)) }),
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
