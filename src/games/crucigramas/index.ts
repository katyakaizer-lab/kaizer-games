/**
 * Crucigramas. Routes inside the game (after #game/crucigramas):
 *   (none)                     choose a level
 *   play/<level>[/seed-<n>]    a crossword (without a seed: the level's game in progress, or a new one)
 * Phone layout, top to bottom: top bar (back, level and topic, clue list), the grid (cells as big as fit),
 * the current clue with previous/next, Pista and Comprobar, and our own Spanish keyboard (with Ñ and the
 * accented vowels: accents count). A physical keyboard works too. Wide screens show the clue list beside the grid.
 */
import { h, mount as put } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, FeedbackBanner, toast } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { playMelody, playNote } from '../../audio/synth';
import { recordCelebration } from '../../app/pet-state';
import { prefersReducedMotion } from '../../app/settings';
import type { GameContext, GameHandle } from '../../app/router';
import {
  DEFAULT_LEVEL, LEVELS, cellsOf, generate, isSolved, mistakes, pickTopic, solution, wordDone, wordsAt,
  type CrucigramaData, type Dir, type Level, type Letters, type Placed, type Puzzle,
} from './engine';
import './crucigramas.css';

const files = import.meta.glob<CrucigramaData>('../../data/crucigramas/*.json', { eager: true, import: 'default' });
const injected = (globalThis as { __cwTestData?: CrucigramaData }).__cwTestData;
const DATA: CrucigramaData = injected ?? {
  topics: Object.keys(files).sort().flatMap((k) => files[k].topics ?? []),
  levels: Object.assign({}, ...Object.keys(files).map((k) => files[k].levels ?? {})),
};
const topicsFor = (l: Level) => DATA.topics.filter((x) => x.level === l);
const cfgFor = (l: Level) => DATA.levels[l] ?? DEFAULT_LEVEL;
const LEVELS_WITH_TOPICS = LEVELS.filter((l) => topicsFor(l).length);

/** Keyboard rows; the last row has the accented vowels (accents count in the grid). */
export const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM', 'ÁÉÍÓÚÜ'];
const LETTER = /^[A-ZÁÉÍÓÚÜÑ]$/;

interface Saved { seed: number; letters: Letters; hints: number }
const savedKey = (l: Level) => `cw.game.${l}`;
type Records = Partial<Record<Level, { done: number }>>;

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'brote';
  const content = h('div', { class: 'cw' });
  put(root, content);
  let cleanupView: (() => void) | null = null;

  function render(path: string[]) {
    cleanupView?.();
    cleanupView = null;
    const [head, lvl, seedSeg] = path;
    const level = LEVELS_WITH_TOPICS.find((l) => l === lvl);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : undefined;
    const playing = head === 'play' && !!level;
    content.classList.toggle('is-playing', playing);
    put(content, playing ? playView(level!, seed) : levelsView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  /* ---------------- Choose a level ---------------- */
  function levelsView(): HTMLElement {
    const rec = store.get<Records>('cw.records', {});
    return h('div', { class: 'cw-list' },
      h('header', { class: 'cw-header' },
        Button({ label: t('common.back'), icon: 'home', iconOnly: true, variant: 'quiet', onClick: ctx.exit }),
        h('h1', { tabindex: '-1', class: 'cw-title', lang: 'es' }, 'Crucigramas')),
      h('p', { class: 'cw-soft' }, t('cw.intro')),
      h('p', { class: 'cw-soft cw-small' }, t('cw.rules')),
      h('div', { class: 'cw-levels' }, LEVELS_WITH_TOPICS.map((l) => {
        const inProgress = !!store.get<Saved | null>(savedKey(l), null);
        return h('button', { type: 'button', class: 'cw-level', onClick: () => ctx.go(['play', l]) },
          h('span', { class: 'cw-level__name' }, l),
          h('span', { class: 'cw-small', lang: 'es' }, topicsFor(l).map((x) => x.name_es).join(', ')),
          inProgress ? h('span', { class: 'cw-small cw-level__note' }, icon('play'), t('cw.inProgress')) : null,
          rec[l]?.done ? h('span', { class: 'cw-small cw-level__note' }, icon('check'), t('cw.done', { n: rec[l]!.done })) : null);
      })));
  }

  /* ---------------- A crossword ---------------- */
  function playView(level: Level, seedArg?: number): HTMLElement {
    const cfg = cfgFor(level);
    const saved = store.get<Saved | null>(savedKey(level), null);
    const seed = seedArg ?? saved?.seed ?? (Math.floor(Math.random() * 1e6) + 1);
    const topic = pickTopic(topicsFor(level), seed);
    const p: Puzzle = generate(topic, cfg, seed)!;
    const sol = solution(p);
    let letters: Letters = saved && saved.seed === seed ? { ...saved.letters } : {};
    let hints = saved && saved.seed === seed ? saved.hints : 0;
    let cur = p.words[0];
    let curCell = cellsOf(cur)[0];
    let marked = new Map<string, boolean>(); // cells shown as wrong after Comprobar (value: accent only)
    let listOpen = false;
    const save = () => store.set(savedKey(level), { seed, letters, hints } satisfies Saved);
    save();

    const el = h('div', { class: 'cw-play' });
    const status = h('p', { class: 'k-sr', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string, show = false) => { status.textContent = m; if (show) toast(m); };
    const dirName = (d: Dir) => (d === 'across' ? t('cw.across') : t('cw.down'));
    const clueLabel = (w: Placed) => `${w.num} ${dirName(w.dir)}`;

    function select(w: Placed, cell?: string) {
      cur = w;
      const cells = cellsOf(w);
      curCell = cell && cells.includes(cell) ? cell : cells.find((k) => !letters[k]) ?? cells[0];
      announce(`${clueLabel(w)}: ${w.clue.text}`);
    }
    function moveWord(delta: number) {
      const i = p.words.indexOf(cur);
      select(p.words[(i + delta + p.words.length) % p.words.length]);
      draw();
    }
    function tapCell(k: string) {
      const ws = wordsAt(p, k);
      if (!ws.length) return;
      // Tapping the current cell again switches between its across and down words.
      const w = k === curCell && ws.length > 1 ? ws.find((x) => x !== cur)! : ws.includes(cur) ? cur : ws[0];
      select(w, k);
      draw();
    }

    function type(ch: string) {
      const before = new Set(p.words.filter((w) => wordDone(w, letters)));
      letters[curCell] = ch;
      marked.delete(curCell);
      playNote(Object.keys(letters).length % 10);
      const cells = cellsOf(cur);
      const i = cells.indexOf(curCell);
      if (i < cells.length - 1) curCell = cells[i + 1];
      afterChange(before);
    }
    function erase() {
      if (letters[curCell]) delete letters[curCell];
      else {
        const cells = cellsOf(cur);
        const i = cells.indexOf(curCell);
        if (i > 0) { curCell = cells[i - 1]; delete letters[curCell]; }
      }
      marked.delete(curCell);
      save();
      draw();
    }
    function afterChange(before: Set<Placed>) {
      save();
      const now = p.words.filter((w) => wordDone(w, letters) && !before.has(w));
      if (isSolved(p, letters)) { finish(); return; }
      if (now.length) {
        playMelody();
        const right = t('cw.wordRight', { word: now.map((w) => w.answer.join('')).join(', ') });
        // Move on to the next word that is not done yet.
        announce(right);
        if (now.includes(cur)) {
          const i = p.words.indexOf(cur);
          const next = [...p.words.slice(i + 1), ...p.words.slice(0, i)].find((w) => !wordDone(w, letters));
          if (next) select(next);
          announce(`${right} ${status.textContent ?? ''}`.trim());
          if (!next) announce(right);
        }
      }
      draw();
    }
    /** Pista: the right letter in the current cell (or the first wrong or empty cell of the word). */
    function hint() {
      const cells = cellsOf(cur);
      const target = letters[curCell] !== sol.get(curCell) ? curCell : cells.find((k) => letters[k] !== sol.get(k));
      if (!target) { announce(t('cw.hintDone'), true); return; }
      const before = new Set(p.words.filter((w) => wordDone(w, letters)));
      hints++;
      curCell = target;
      letters[target] = sol.get(target)!;
      marked.delete(target);
      announce(t('cw.hintGiven', { ch: sol.get(target)! }));
      afterChange(before);
    }
    function check() {
      const m = mistakes(p, letters);
      marked = new Map(m.map((x) => [x.key, x.accent]));
      if (!m.length) announce(Object.keys(letters).length ? t('cw.allGood') : t('cw.nothingYet'), true);
      else announce(`${t('cw.toFix', { n: m.length })}${m.some((x) => x.accent) ? ` ${t('cw.accentNote')}` : ''}`, true);
      draw();
    }

    function gridEl(): HTMLElement {
      const curCells = new Set(cellsOf(cur));
      const done = new Set(p.words.filter((w) => wordDone(w, letters)).flatMap(cellsOf));
      const nums = new Map(p.words.map((w) => [cellsOf(w)[0], w.num]));
      const cells: HTMLElement[] = [];
      for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
        const k = `${r},${c}`;
        if (!sol.has(k)) { cells.push(h('span', { class: 'cw-block', 'aria-hidden': 'true' })); continue; }
        const ws = wordsAt(p, k);
        const w0 = ws.includes(cur) ? cur : ws[0];
        const pos = cellsOf(w0).indexOf(k) + 1;
        const cls = ['cw-cell'];
        if (curCells.has(k)) cls.push('is-word');
        if (k === curCell) cls.push('is-current');
        if (done.has(k)) cls.push('is-done');
        if (marked.has(k)) cls.push(marked.get(k) ? 'is-accent' : 'is-wrong');
        cells.push(h('button', {
          type: 'button', class: cls.join(' '), 'data-cell': k, tabindex: k === curCell ? '0' : '-1',
          'aria-label': `${clueLabel(w0)}, ${t('cw.cellOf', { i: pos, n: w0.answer.length })}: ${letters[k] ?? t('cw.empty')}`,
        },
          nums.has(k) ? h('span', { class: 'cw-num', 'aria-hidden': 'true' }, String(nums.get(k))) : null,
          h('span', { class: 'cw-letter', lang: 'es', 'aria-hidden': 'true' }, letters[k] ?? '')));
      }
      const g = h('div', { class: 'cw-grid', role: 'group', 'aria-label': t('cw.grid') }, cells);
      g.style.setProperty('--cols', String(p.cols));
      g.style.setProperty('--rows', String(p.rows));
      return g;
    }
    function clueList(): HTMLElement {
      const group = (d: Dir) => h('section', { class: 'cw-clues__group' },
        h('h2', null, dirName(d)),
        h('ol', null, p.words.filter((w) => w.dir === d).map((w) => h('li', null,
          h('button', { type: 'button', class: `cw-clue${w === cur ? ' is-current' : ''}${wordDone(w, letters) ? ' is-done' : ''}`, 'data-word': String(p.words.indexOf(w)) },
            h('span', { class: 'cw-clue__num' }, String(w.num)),
            h('span', { lang: 'es' }, w.clue.text),
            h('span', { class: 'cw-clue__len' }, `(${w.answer.length})`))))));
      return h('aside', { class: `cw-clues${listOpen ? ' is-open' : ''}`, 'aria-label': t('cw.clues') }, group('across'), group('down'));
    }
    function keyboard(): HTMLElement {
      return h('div', { class: 'cw-keys', role: 'group', 'aria-label': t('cw.keyboard') }, KEY_ROWS.map((row, ri) => h('div', { class: `cw-keys__row${ri === 3 ? ' is-accents' : ''}` },
        ...[...row].map((ch) => h('button', { type: 'button', class: 'cw-key', 'data-key': ch, lang: 'es' }, ch)),
        ri === 2 ? h('button', { type: 'button', class: 'cw-key is-wide', 'data-key': 'Backspace', 'aria-label': t('cw.delete') }, icon('backspace')) : null)));
    }

    function draw() {
      const focusOnCell = (document.activeElement as HTMLElement | null)?.classList?.contains('cw-cell');
      put(el,
        h('div', { class: 'cw-bar' },
          Button({ label: t('cw.levelsBack'), icon: 'back', iconOnly: true, variant: 'quiet', onClick: () => ctx.go([]) }),
          h('h1', { tabindex: '-1', class: 'cw-title cw-bar__title' }, h('span', null, level), h('span', { class: 'cw-bar__topic', lang: 'es' }, topic.name_es)),
          // Short screens: Pista and Comprobar sit here as icon buttons (the row of labelled buttons is hidden).
          h('button', { type: 'button', class: 'k-btn k-btn--quiet k-btn--icon cw-bar__act', 'data-act': 'hint', 'aria-label': t('cw.hint') }, icon('bulb')),
          h('button', { type: 'button', class: 'k-btn k-btn--quiet k-btn--icon cw-bar__act', 'data-act': 'check', 'aria-label': t('cw.check') }, icon('listCheck')),
          h('span', { class: 'cw-bar__list' }, Button({ label: t('cw.clues'), icon: 'list', iconOnly: true, variant: 'quiet', pressed: listOpen, onClick: () => { listOpen = !listOpen; draw(); } }))),
        h('div', { class: 'cw-main' },
          h('div', { class: 'cw-board' }, gridEl()),
          clueList()),
        h('div', { class: 'cw-cluebar' },
          h('button', { type: 'button', class: 'cw-cluebar__nav', 'data-nav': '-1', 'aria-label': t('cw.prev') }, icon('chevronLeft')),
          h('button', { type: 'button', class: 'cw-cluebar__text', 'data-nav': 'flip', 'aria-label': `${clueLabel(cur)}: ${cur.clue.text}. ${t('cw.flip')}` },
            h('span', { class: 'cw-cluebar__label' }, `${clueLabel(cur)} · ${cur.answer.length}`),
            h('span', { lang: 'es' }, cur.clue.text)),
          h('button', { type: 'button', class: 'cw-cluebar__nav', 'data-nav': '1', 'aria-label': t('cw.next') }, icon('chevronRight'))),
        h('div', { class: 'cw-actions' },
          h('button', { type: 'button', class: 'cw-action', 'data-act': 'hint' }, icon('bulb'), h('span', null, t('cw.hint'))),
          h('button', { type: 'button', class: 'cw-action', 'data-act': 'check' }, icon('listCheck'), h('span', null, t('cw.check')))),
        keyboard(),
        status);
      sizeGrid();
      // Sizes can still move once fonts load or the bar settles: measure again then.
      requestAnimationFrame(sizeGrid);
      document.fonts?.ready.then(sizeGrid).catch(() => {});
      if (focusOnCell) el.querySelector<HTMLElement>('.cw-cell.is-current')?.focus({ preventScroll: true });
    }

    /** Cells as big as the space allows (up to --cw-cell-max), so the grid, clue and keyboard fit one screen. */
    function sizeGrid() {
      const board = el.querySelector<HTMLElement>('.cw-board');
      if (!board) return;
      const cs = getComputedStyle(html);
      const rootPx = parseFloat(cs.fontSize) || 16;
      const max = parseFloat(cs.getPropertyValue('--cw-cell-max')) * rootPx || 44;
      const gap = 2;
      const w = board.clientWidth, hgt = board.clientHeight;
      const cell = Math.floor(Math.min(max, (w - gap * (p.cols - 1)) / p.cols, (hgt - gap * (p.rows - 1)) / p.rows));
      el.style.setProperty('--cell', `${Math.max(18, cell)}px`);
    }

    function onClick(e: MouseEvent) {
      const tEl = e.target as HTMLElement;
      const key = tEl.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (key) { if (key === 'Backspace') erase(); else type(key); return; }
      const cell = tEl.closest<HTMLElement>('[data-cell]')?.dataset.cell;
      if (cell) { tapCell(cell); return; }
      const nav = tEl.closest<HTMLElement>('[data-nav]')?.dataset.nav;
      if (nav === 'flip') { const k = curCell; const other = wordsAt(p, k).find((x) => x !== cur); if (other) { select(other, k); draw(); } else { listOpen = !listOpen; draw(); } return; }
      if (nav) { moveWord(Number(nav)); return; }
      const wi = tEl.closest<HTMLElement>('[data-word]')?.dataset.word;
      if (wi !== undefined) { select(p.words[Number(wi)]); listOpen = false; draw(); return; }
      const act = tEl.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'hint') hint();
      if (act === 'check') check();
    }
    function onKey(e: KeyboardEvent) {
      if (!el.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const k = e.key.length === 1 ? e.key.toLocaleUpperCase('es') : e.key;
      if (LETTER.test(k)) { e.preventDefault(); type(k); return; }
      if (k === 'Backspace') { e.preventDefault(); erase(); return; }
      if (k === 'Tab' || k === 'Enter') { e.preventDefault(); moveWord(e.shiftKey ? -1 : 1); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
      if (arrows[k] && (e.target as HTMLElement).closest('.cw-grid, body')) {
        e.preventDefault();
        const [r, c] = curCell.split(',').map(Number);
        const [dr, dc] = arrows[k];
        const want: Dir = dc ? 'across' : 'down';
        for (let s = 1; s < Math.max(p.rows, p.cols); s++) {
          const nk = `${r + dr * s},${c + dc * s}`;
          if (sol.has(nk)) { const ws = wordsAt(p, nk); select(ws.find((w) => w.dir === want) ?? ws[0], nk); draw(); break; }
        }
      }
    }

    function finish() {
      store.set(savedKey(level), null);
      const rec = store.get<Records>('cw.records', {});
      rec[level] = { done: (rec[level]?.done ?? 0) + 1 };
      store.set('cw.records', rec);
      recordCelebration();
      playMelody();
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      put(el,
        h('h1', { tabindex: '-1', class: 'cw-title', lang: 'es' }, 'Crucigramas'),
        h('div', { class: `cw-finish${prefersReducedMotion() ? '' : ' is-glowing'}` },
          FeedbackBanner({ kind: 'correct', title: t('cw.finished'), hint: `${topic.name_es} · ${lang === 'ru' ? topic.ru : topic.en}${hints ? ` · ${t('cw.hintsUsed', { n: hints })}` : ''}` })),
        h('div', { class: 'cw-board is-final' }, gridEl()),
        h('ul', { class: 'cw-summary' }, p.words.map((w) => h('li', null,
          h('strong', { lang: 'es' }, w.es), ' ', h('span', { class: 'cw-soft', lang: 'es' }, `· ${w.clue.text}`)))),
        h('div', { class: 'cw-actions is-end' },
          Button({ label: t('cw.newGame'), icon: 'refresh', onClick: () => ctx.go(['play', level, `seed-${Math.floor(Math.random() * 1e6) + 1}`]) }),
          Button({ label: t('cw.levelsBack'), icon: 'back', variant: 'outline', onClick: () => ctx.go([]) })));
      content.classList.remove('is-playing');
      const fin = el.querySelector<HTMLElement>('.cw-board.is-final');
      fin?.style.setProperty('--cell', '2rem');
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }

    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    const onResize = () => sizeGrid();
    window.addEventListener('resize', onResize);
    cleanupView = () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    select(cur);
    queueMicrotask(draw);
    return el;
  }

  render(ctx.path);
  return { update: (path) => render(path), destroy: () => { cleanupView?.(); } };
}
