/**
 * Crucigramas. Routes inside the game (after #game/crucigramas):
 *   (none)                                   choose a level
 *   new/<level>                              before each crossword: topic (or "Sorpréndeme") and help level
 *   play/<level>                             the level's crossword in progress (or the setup if there is none)
 *   play/<level>/<topic>/seed-<n>[/<help>]   a new crossword with that topic and seed (tests, links)
 *
 * Page (normal flow, scrolls vertically): top bar, decorations, the grid in its own container (cells 32-44px; if
 * the grid is wider or taller than its space, the container scrolls inside itself, with soft edge fades), a
 * slim border, then the clue list. Fixed at the bottom: the current clue, Pista and Comprobar, and our own
 * Spanish keyboard. The page never scrolls sideways.
 */
import { h, mount as put } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, FeedbackBanner, toast } from '../../ui/components';
import { hasArt, art, placeholder, showDevLabels } from '../../ui/art';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { playMelody, playNote } from '../../audio/synth';
import { recordCelebration } from '../../app/pet-state';
import { prefersReducedMotion } from '../../app/settings';
import { vibrate } from '../../app/haptics';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import type { GameContext, GameHandle } from '../../app/router';
import { nearMiss, nearMissText } from '../shared/accents';
import {
  DEFAULT_LEVEL, HELP_LEVELS, LEVELS, cellsOf, generate, hintCell, hintLimit, isSolved, mistakes, pushRecent, rng, solution,
  surpriseTopic, wordDone, wordId, wordsAt,
  type CrucigramaData, type Dir, type HelpLevel, type Level, type Letters, type LevelConfig, type Placed, type Puzzle, type Topic,
} from './engine';
import './crucigramas.css';

const files = import.meta.glob<Record<string, unknown>>('../../data/crucigramas/**/*.json', { eager: true, import: 'default' });
const injected = (globalThis as { __cwTestData?: CrucigramaData }).__cwTestData;
const DATA: CrucigramaData = injected ?? {
  topics: Object.keys(files).sort().map((k) => files[k]).filter((f): f is Topic & Record<string, unknown> => Array.isArray(f.words)) as Topic[],
  levels: Object.assign({}, ...Object.keys(files).map((k) => (files[k].levels as object) ?? {})),
};
const topicsFor = (l: Level) => DATA.topics.filter((x) => x.level === l);
const topicById = (id: string) => DATA.topics.find((x) => x.id === id);
const cfgFor = (l: Level): LevelConfig => DATA.levels[l] ?? DEFAULT_LEVEL;
const LEVELS_WITH_TOPICS = LEVELS.filter((l) => topicsFor(l).length);

/** Keyboard rows; the last row has the accented vowels (accents count in the grid). */
export const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM', 'ÁÉÍÓÚÜ'];
const LETTER = /^[A-ZÁÉÍÓÚÜÑ]$/;
const CELL_MIN = 32, CELL_GAP = 2;
const DECOR_COLOURS = ['--accent', '--primary', '--secondary', '--highlight'];

interface Saved {
  topicId: string; help: HelpLevel; puzzle: Puzzle; letters: Letters;
  /** hints used per word (wordId) */
  hints: Record<string, number>;
  hintsUsed: number;
  /** words that already gave their star */
  starred: string[];
  /** stars earned in this crossword */
  stars: number;
}
type Records = Partial<Record<Level, { done: number }>>;
const savedKey = (l: Level) => `cw.game.${l}`;
const getHelp = (): HelpLevel => { const h0 = store.get<HelpLevel>('cw.help', 'normal'); return HELP_LEVELS.includes(h0) ? h0 : 'normal'; };
const helpName = (hl: HelpLevel) => t(`cw.help.${hl}` as 'cw.help.none');

/** Starts a crossword: picks words fresh for this learner (no repeats from the last puzzles of the topic). */
function newGame(level: Level, topic: Topic, help: HelpLevel, seed: number): Saved | null {
  const recent = store.get<string[][]>(`cw.seen.${topic.id}`, []);
  const puzzle = generate(topic, cfgFor(level), seed, recent);
  if (!puzzle) return null;
  store.set(`cw.seen.${topic.id}`, pushRecent(recent, puzzle));
  const rt = store.get<string[]>(`cw.recentTopics.${level}`, []);
  store.set(`cw.recentTopics.${level}`, [topic.id, ...rt.filter((x) => x !== topic.id)].slice(0, Math.max(1, topicsFor(level).length - 1)));
  store.set('cw.help', help);
  const g: Saved = { topicId: topic.id, help, puzzle, letters: {}, hints: {}, hintsUsed: 0, starred: [], stars: 0 };
  store.set(savedKey(level), g);
  return g;
}

/** CSS url() in a custom property resolves against the stylesheet (assets/), so pass an absolute URL. */
const absUrl = (src: string) => new URL(src, document.baseURI).href;

/** Decorations of a topic: a band of small objects with an ornament border between them (aria-hidden). */
function decorBand(topic: Topic, count: number): HTMLElement {
  const items = (topic.decor?.items ?? []).slice(0, count);
  const obj = (name: string, i: number) => {
    const id = `decor.${topic.id}.${name}`;
    const colour = `var(${DECOR_COLOURS[i % DECOR_COLOURS.length]})`;
    if (hasArt(id)) {
      const e = h('span', { class: 'cw-decor__obj', 'data-decor': id });
      e.style.setProperty('--src', `url("${absUrl(art(id).src!)}")`);
      e.style.setProperty('--c', colour);
      return e;
    }
    const p = placeholder(id, '', 'object');
    p.classList.add('cw-decor__obj', 'is-placeholder');
    return p;
  };
  const half = Math.ceil(items.length / 2);
  return h('div', { class: 'cw-decor', 'aria-hidden': 'true' },
    ...items.slice(0, half).map(obj),
    border(topic, 'cw-decor__border'),
    ...items.slice(half).map((n, i) => obj(n, i + half)));
}
function border(topic: Topic, cls: string): HTMLElement {
  const id = `decor.border.${topic.decor?.style ?? 'dots'}`;
  const e = h('span', { class: cls, 'data-decor': id, 'aria-hidden': 'true' });
  if (hasArt(id)) e.style.setProperty('--src', `url("${absUrl(art(id).src!)}")`);
  else e.classList.add('is-plain');
  return e;
}

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const html = document.documentElement;
  html.dataset.theme = 'brote';
  const content = h('div', { class: 'cw' });
  put(root, content);
  let cleanupView: (() => void) | null = null;

  function render(path: string[]) {
    cleanupView?.();
    cleanupView = null;
    const [head, lvl, topicId, seedSeg, helpSeg] = path;
    const level = LEVELS_WITH_TOPICS.find((l) => l === lvl);
    content.classList.remove('is-playing');
    let view: HTMLElement;
    if (head === 'new' && level) view = setupView(level);
    else if (head === 'play' && level) {
      let g = store.get<Saved | null>(savedKey(level), null);
      const topic = topicId ? topicById(topicId) : undefined;
      if (topic && seedSeg?.startsWith('seed-')) {
        const help = HELP_LEVELS.includes(helpSeg as HelpLevel) ? (helpSeg as HelpLevel) : getHelp();
        const seed = Number(seedSeg.slice(5));
        if (!g || g.topicId !== topic.id || g.puzzle.seed !== seed || g.help !== help) g = newGame(level, topic, help, seed);
      }
      if (g && topicById(g.topicId)) { content.classList.add('is-playing'); view = playView(level, g); }
      else view = setupView(level);
    } else view = levelsView();
    put(content, view);
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
        const inProgress = store.get<Saved | null>(savedKey(l), null);
        return h('div', { class: 'cw-level' },
          h('span', { class: 'cw-level__name' }, l),
          h('span', { class: 'cw-small', lang: 'es' }, topicsFor(l).map((x) => x.name_es).join(', ')),
          rec[l]?.done ? h('span', { class: 'cw-small cw-level__note' }, icon('check'), t('cw.done', { n: rec[l]!.done })) : null,
          h('div', { class: 'cw-level__actions' },
            inProgress ? Button({ label: t('cw.continue'), icon: 'play', size: undefined, onClick: () => ctx.go(['play', l]) }) : null,
            Button({ label: t('cw.newPuzzle'), icon: 'star', variant: inProgress ? 'outline' : 'primary', onClick: () => ctx.go(['new', l]) })));
      })));
  }

  /* ---------------- Before each crossword: topic and help ---------------- */
  function setupView(level: Level): HTMLElement {
    const topics = topicsFor(level);
    let topicChoice = 'surprise';
    let help = getHelp();
    const dev = showDevLabels();
    const radio = (group: string, value: string, checked: boolean, label: HTMLElement | string, note: string | null, onPick: () => void) => {
      const id = `cw-${group}-${value}`;
      const input = h('input', { type: 'radio', name: `cw-${group}`, id, checked, class: 'cw-choice__radio' }) as HTMLInputElement;
      input.addEventListener('change', onPick);
      return h('label', { class: 'cw-choice', for: id }, input, h('span', { class: 'cw-choice__text' }, h('strong', null, label), note ? h('span', { class: 'cw-small cw-soft' }, note) : null));
    };
    return h('div', { class: 'cw-setup' },
      h('header', { class: 'cw-header' },
        Button({ label: t('cw.levelsBack'), icon: 'back', iconOnly: true, variant: 'quiet', onClick: () => ctx.go([]) }),
        h('h1', { tabindex: '-1', class: 'cw-title' }, t('cw.setupTitle', { level }))),
      h('fieldset', { class: 'cw-fieldset' },
        h('legend', null, t('cw.help')),
        h('div', { class: 'cw-choices is-help' }, HELP_LEVELS.map((hl) => radio('help', hl, hl === help, helpName(hl), t(`cw.help.${hl}Note` as 'cw.help.noneNote'), () => { help = hl; })))),
      h('fieldset', { class: 'cw-fieldset' },
        h('legend', null, t('cw.topic')),
        h('div', { class: 'cw-choices is-topics' },
          radio('topic', 'surprise', true, h('span', null, icon('sparkles'), ' ', t('cw.surprise')), null, () => { topicChoice = 'surprise'; }),
          ...topics.map((tp) => radio('topic', tp.id, false, h('span', { lang: 'es' }, tp.name_es), dev && !tp.reviewed ? t('cw.unreviewed') : null, () => { topicChoice = tp.id; })))),
      h('div', { class: 'cw-actions is-end' },
        Button({ label: t('cw.start'), icon: 'play', size: 'lg', onClick: () => {
          const seed = Math.floor(Math.random() * 1e6) + 1;
          const topic = topicChoice === 'surprise' ? surpriseTopic(topics, store.get<string[]>(`cw.recentTopics.${level}`, []), rng(seed)) : topicById(topicChoice)!;
          if (newGame(level, topic, help, seed)) ctx.go(['play', level]);
        } })));
  }

  /* ---------------- A crossword ---------------- */
  function playView(level: Level, g: Saved): HTMLElement {
    const topic = topicById(g.topicId)!;
    const p = g.puzzle;
    const sol = solution(p);
    const letters = g.letters;
    let cur = p.words[0];
    let curCell = cellsOf(cur)[0];
    let marked = new Map<string, boolean>(); // cells marked by Comprobar (true = near miss)
    let nearTimer = 0;
    const save = () => store.set(savedKey(level), g);

    const el = h('div', { class: 'cw-play' });
    const status = h('p', { class: 'k-sr', role: 'status', 'aria-live': 'polite' });
    const announce = (m: string, show = false) => { status.textContent = m; if (show) toast(m); };
    const dirName = (d: Dir) => (d === 'across' ? t('cw.across') : t('cw.down'));
    const clueLabel = (w: Placed) => `${w.num} ${dirName(w.dir)}`;
    const hintsLeft = (w: Placed) => hintLimit(g.help, w.answer.length) - (g.hints[wordId(w)] ?? 0);

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
      scrollToWord(cur);
    }
    function tapCell(k: string) {
      const ws = wordsAt(p, k);
      if (!ws.length) return;
      const w = k === curCell && ws.length > 1 ? ws.find((x) => x !== cur)! : ws.includes(cur) ? cur : ws[0];
      select(w, k);
      draw();
    }

    function type(ch: string) {
      const before = new Set(p.words.filter((w) => wordDone(w, letters)));
      const k = curCell;
      letters[k] = ch;
      marked.delete(k);
      playNote(Object.keys(letters).length % 10);
      const cells = cellsOf(cur);
      const i = cells.indexOf(k);
      if (i < cells.length - 1) curCell = cells[i + 1];
      afterChange(before);
      const near = nearMiss(ch, sol.get(k)!);
      if (near) showNear(k, near);
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
      const now = p.words.filter((w) => wordDone(w, letters) && !before.has(w));
      // A star for each word solved (once per word, even if it is erased and typed again).
      for (const w of now) {
        if (g.starred.includes(wordId(w))) continue;
        g.starred.push(wordId(w));
        g.stars += STARS.crucigramas.word;
        earn('crucigramas', STARS.crucigramas.word, `word ${w.es}`, el.querySelector(`[data-cell="${cellsOf(w).at(-1)}"]`));
      }
      save();
      if (isSolved(p, letters)) { finish(); return; }
      if (now.length) {
        playMelody();
        const right = t('cw.wordRight', { word: now.map((w) => w.answer.join('')).join(', ') });
        let next: Placed | undefined;
        if (now.includes(cur)) {
          const i = p.words.indexOf(cur);
          next = [...p.words.slice(i + 1), ...p.words.slice(0, i)].find((w) => !wordDone(w, letters));
          if (next) select(next);
        }
        announce(next ? `${right} ${clueLabel(next)}: ${next.clue.text}` : right);
      }
      draw();
    }

    /** "¡Casi!": a high-visibility window near the cell, with the right letter to tap in. */
    function showNear(k: string, kind: 'accent' | 'enye') {
      el.querySelector('.cw-near')?.remove();
      clearTimeout(nearTimer);
      const right = sol.get(k)!;
      const text = nearMissText(kind, right);
      vibrate(60);
      announce(text);
      const close = () => { clearTimeout(nearTimer); box.remove(); };
      const fix = h('button', { type: 'button', class: 'cw-near__fix', lang: 'es', 'aria-label': t('cw.nearUse', { ch: right }) }, right);
      fix.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        const before = new Set(p.words.filter((w) => wordDone(w, letters)));
        letters[k] = right;
        marked.delete(k);
        afterChange(before);
      });
      const box = h('div', { class: 'cw-near', role: 'alert', lang: 'es' }, icon('alert'), h('span', { class: 'cw-near__text' }, text), fix);
      box.addEventListener('click', close);
      el.append(box);
      // Near the cell: above it if there is room, else below; always inside the screen.
      const cellEl = el.querySelector<HTMLElement>(`[data-cell="${k}"]`);
      const r = cellEl?.getBoundingClientRect();
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const margin = 8;
      if (r) {
        const top = r.top - bh - margin >= 8 ? r.top - bh - margin : r.bottom + margin;
        box.style.top = `${Math.round(top)}px`;
        box.style.left = `${Math.round(Math.min(window.innerWidth - bw - 8, Math.max(8, r.left + r.width / 2 - bw / 2)))}px`;
      }
      nearTimer = window.setTimeout(close, 4000);
    }

    /** Pista: one letter of the selected word (its first empty cell), within the word's limit. */
    function hint() {
      if (g.help === 'none' || hintsLeft(cur) <= 0 || wordDone(cur, letters)) return;
      const target = hintCell(cur, letters);
      if (!target) return;
      const before = new Set(p.words.filter((w) => wordDone(w, letters)));
      g.hints[wordId(cur)] = (g.hints[wordId(cur)] ?? 0) + 1;
      g.hintsUsed++;
      curCell = target;
      letters[target] = sol.get(target)!;
      marked.delete(target);
      announce(t('cw.hintGiven', { ch: sol.get(target)! }));
      afterChange(before);
    }
    function check() {
      const m = mistakes(p, letters);
      marked = new Map(m.map((x) => [x.key, x.near]));
      const wrong = m.filter((x) => !x.near).length, near = m.length - wrong;
      if (!m.length) announce(Object.keys(letters).length ? t('cw.allGood') : t('cw.nothingYet'), true);
      else announce([wrong ? t('cw.toFix', { n: wrong }) : '', near ? t('cw.nearNote', { n: near }) : ''].filter(Boolean).join(' '), true);
      draw();
    }

    function gridEl(interactive = true): HTMLElement {
      const curCells = new Set(interactive ? cellsOf(cur) : []);
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
        if (interactive && k === curCell) cls.push('is-current');
        if (done.has(k)) cls.push('is-done');
        const near = letters[k] && letters[k] !== sol.get(k) && nearMiss(letters[k], sol.get(k)!);
        if (near) cls.push('is-near');
        else if (marked.has(k)) cls.push('is-wrong');
        cells.push(h(interactive ? 'button' : 'span', {
          type: interactive ? 'button' : undefined, class: cls.join(' '), 'data-cell': k, tabindex: interactive ? (k === curCell ? '0' : '-1') : undefined,
          'aria-label': interactive ? `${clueLabel(w0)}, ${t('cw.cellOf', { i: pos, n: w0.answer.length })}: ${letters[k] ?? t('cw.empty')}` : undefined,
        },
          nums.has(k) ? h('span', { class: 'cw-num', 'aria-hidden': 'true' }, String(nums.get(k))) : null,
          h('span', { class: 'cw-letter', lang: 'es', 'aria-hidden': interactive ? 'true' : undefined }, letters[k] ?? '')));
      }
      const grid = h('div', { class: 'cw-grid', role: interactive ? 'group' : undefined, 'aria-label': t('cw.grid') }, cells);
      grid.style.setProperty('--cols', String(p.cols));
      grid.style.setProperty('--rows', String(p.rows));
      const box = h('div', { class: 'cw-gridbox' }, grid);
      box.addEventListener('scroll', () => fades(wrap), { passive: true });
      const wrap = h('div', { class: 'cw-gridwrap' }, box,
        h('span', { class: 'cw-fade is-l', 'aria-hidden': 'true' }), h('span', { class: 'cw-fade is-r', 'aria-hidden': 'true' }),
        h('span', { class: 'cw-fade is-t', 'aria-hidden': 'true' }), h('span', { class: 'cw-fade is-b', 'aria-hidden': 'true' }));
      return wrap;
    }
    function clueList(interactive = true): HTMLElement {
      const group = (d: Dir) => h('section', { class: 'cw-clues__group' },
        h('h2', null, dirName(d)),
        h('ol', null, p.words.filter((w) => w.dir === d).map((w) => h('li', null,
          h(interactive ? 'button' : 'div', {
            type: interactive ? 'button' : undefined,
            class: `cw-clue${interactive && w === cur ? ' is-current' : ''}${wordDone(w, letters) ? ' is-done' : ''}`, 'data-word': interactive ? String(p.words.indexOf(w)) : undefined,
          },
            h('span', { class: 'cw-clue__num' }, String(w.num)),
            h('span', { class: 'cw-clue__text' }, interactive ? null : h('strong', { lang: 'es' }, `${w.es} · `), h('span', { lang: 'es' }, w.clue.text)),
            h('span', { class: 'cw-clue__len' }, `(${w.answer.length})`))))));
      return h('section', { class: 'cw-clues', 'aria-label': t('cw.clues') }, group('across'), group('down'));
    }
    function keyboard(): HTMLElement {
      return h('div', { class: 'cw-keys', role: 'group', 'aria-label': t('cw.keyboard') }, KEY_ROWS.map((row, ri) => h('div', { class: `cw-keys__row${ri === 3 ? ' is-accents' : ''}` },
        ...[...row].map((ch) => h('button', { type: 'button', class: 'cw-key', 'data-key': ch, lang: 'es' }, ch)),
        ri === 2 ? h('button', { type: 'button', class: 'cw-key is-wide', 'data-key': 'Backspace', 'aria-label': t('cw.delete') }, icon('backspace')) : null)));
    }
    function hintButton(compact: boolean): HTMLElement | null {
      if (g.help === 'none') return null;
      const left = hintsLeft(cur);
      const done = wordDone(cur, letters);
      const out = left <= 0 && !done;
      const label = out ? t('cw.noHints') : t('cw.hintLeft', { n: Math.max(0, left) });
      return compact
        ? h('button', { type: 'button', class: 'k-btn k-btn--quiet k-btn--icon cw-bar__act', 'data-act': 'hint', disabled: out || done, 'aria-label': label, title: label }, icon('bulb'))
        : h('button', { type: 'button', class: `cw-action${out ? ' is-out' : ''}`, 'data-act': 'hint', disabled: out || done }, icon('bulb'), h('span', null, label));
    }

    function draw() {
      const focusOnCell = (document.activeElement as HTMLElement | null)?.classList?.contains('cw-cell');
      const box = el.querySelector<HTMLElement>('.cw-gridbox');
      const keep = box ? [box.scrollLeft, box.scrollTop] : null;
      const narrow = window.innerWidth < 400;
      put(el,
        h('div', { class: 'cw-bar' },
          Button({ label: t('cw.levelsBack'), icon: 'back', iconOnly: true, variant: 'quiet', onClick: () => ctx.go([]) }),
          h('h1', { tabindex: '-1', class: 'cw-title cw-bar__title' },
            h('span', null, `${level} · ${helpName(g.help)}`),
            h('span', { class: 'cw-bar__topic', lang: 'es' }, topic.name_es),
            showDevLabels() && !topic.reviewed ? h('span', { class: 'cw-dev' }, t('cw.unreviewed')) : null),
          hintButton(true),
          h('button', { type: 'button', class: 'k-btn k-btn--quiet k-btn--icon cw-bar__act', 'data-act': 'check', 'aria-label': t('cw.check'), title: t('cw.check') }, icon('listCheck'))),
        decorBand(topic, narrow ? 2 : 6),
        gridEl(),
        border(topic, 'cw-border'),
        clueList(),
        h('div', { class: 'cw-dock' },
          h('div', { class: 'cw-cluebar' },
            h('button', { type: 'button', class: 'cw-cluebar__nav', 'data-nav': '-1', 'aria-label': t('cw.prev') }, icon('chevronLeft')),
            h('button', { type: 'button', class: 'cw-cluebar__text', 'data-nav': 'flip', 'aria-label': `${clueLabel(cur)}: ${cur.clue.text}. ${t('cw.flip')}` },
              h('span', { class: 'cw-cluebar__label' }, `${clueLabel(cur)} · ${cur.answer.length}`),
              h('span', { lang: 'es' }, cur.clue.text)),
            h('button', { type: 'button', class: 'cw-cluebar__nav', 'data-nav': '1', 'aria-label': t('cw.next') }, icon('chevronRight'))),
          h('div', { class: 'cw-actions' },
            hintButton(false),
            h('button', { type: 'button', class: 'cw-action', 'data-act': 'check' }, icon('listCheck'), h('span', null, t('cw.check')))),
          keyboard()),
        status);
      sizeGrid();
      const nb = el.querySelector<HTMLElement>('.cw-gridbox');
      if (nb && keep) { nb.scrollLeft = keep[0]; nb.scrollTop = keep[1]; }
      ensureCellVisible(curCell);
      requestAnimationFrame(sizeGrid);
      document.fonts?.ready.then(sizeGrid).catch(() => {});
      if (focusOnCell) el.querySelector<HTMLElement>('.cw-cell.is-current')?.focus({ preventScroll: true });
    }

    /** Cells as big as the width allows (32-44px); a grid that still does not fit scrolls inside its container. */
    function sizeGrid() {
      const wrap = el.querySelector<HTMLElement>('.cw-gridwrap');
      const dock = el.querySelector<HTMLElement>('.cw-dock');
      if (dock) el.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
      if (!wrap) return;
      const cs = getComputedStyle(html);
      const rootPx = parseFloat(cs.fontSize) || 16;
      const max = parseFloat(cs.getPropertyValue('--cw-cell-max')) * rootPx || 44;
      const w = wrap.clientWidth;
      // Fit the width (and, while playing, the height above the keyboard); never below 32px: then the box scrolls.
      const box = wrap.querySelector<HTMLElement>(".cw-gridbox");
      const maxH = box && !el.classList.contains("is-final") ? parseFloat(getComputedStyle(box).maxHeight) || Infinity : Infinity;
      const pad = 4; // grid padding
      const fitW = Math.floor((w - pad - CELL_GAP * (p.cols - 1)) / p.cols);
      const fitH = Math.floor((maxH - pad - CELL_GAP * (p.rows - 1)) / p.rows);
      const cell = Math.max(CELL_MIN, Math.min(max, fitW, fitH));
      el.style.setProperty('--cell', `${cell}px`);
      fades(wrap);
    }
    function fades(wrap: HTMLElement) {
      const box = wrap.querySelector<HTMLElement>('.cw-gridbox');
      if (!box) return;
      wrap.classList.toggle('more-l', box.scrollLeft > 1);
      wrap.classList.toggle('more-r', box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
      wrap.classList.toggle('more-t', box.scrollTop > 1);
      wrap.classList.toggle('more-b', box.scrollTop + box.clientHeight < box.scrollHeight - 1);
    }
    /** Scrolls the grid container (not the page sideways) so a cell is visible. */
    function ensureCellVisible(k: string) {
      const box = el.querySelector<HTMLElement>('.cw-gridbox');
      const cell = el.querySelector<HTMLElement>(`[data-cell="${k}"]`);
      if (!box || !cell) return;
      const pad = 8;
      if (cell.offsetLeft < box.scrollLeft + pad) box.scrollLeft = cell.offsetLeft - pad;
      else if (cell.offsetLeft + cell.offsetWidth > box.scrollLeft + box.clientWidth - pad) box.scrollLeft = cell.offsetLeft + cell.offsetWidth - box.clientWidth + pad;
      if (cell.offsetTop < box.scrollTop + pad) box.scrollTop = cell.offsetTop - pad;
      else if (cell.offsetTop + cell.offsetHeight > box.scrollTop + box.clientHeight - pad) box.scrollTop = cell.offsetTop + cell.offsetHeight - box.clientHeight + pad;
      fades(box.parentElement!);
    }
    /** After choosing a clue: the grid comes into view on the page and the word inside the grid container. */
    function scrollToWord(w: Placed) {
      const wrap = el.querySelector<HTMLElement>('.cw-gridwrap');
      if (!wrap) return;
      const bar = el.querySelector<HTMLElement>('.cw-bar');
      const top = wrap.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0) - 8;
      const dockH = el.querySelector<HTMLElement>('.cw-dock')?.offsetHeight ?? 0;
      const r = wrap.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight - dockH) window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      const cells = cellsOf(w);
      ensureCellVisible(cells[cells.length - 1]);
      ensureCellVisible(cells[0]);
    }

    function onClick(e: MouseEvent) {
      const tEl = e.target as HTMLElement;
      if (tEl.closest('.cw-near')) return;
      const key = tEl.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (key) { if (key === 'Backspace') erase(); else type(key); return; }
      const cell = tEl.closest<HTMLElement>('[data-cell]')?.dataset.cell;
      if (cell) { tapCell(cell); return; }
      const nav = tEl.closest<HTMLElement>('[data-nav]')?.dataset.nav;
      if (nav === 'flip') { const other = wordsAt(p, curCell).find((x) => x !== cur); if (other) { select(other, curCell); draw(); } return; }
      if (nav) { moveWord(Number(nav)); return; }
      const wi = tEl.closest<HTMLElement>('[data-word]')?.dataset.word;
      if (wi !== undefined) { select(p.words[Number(wi)]); draw(); scrollToWord(cur); return; }
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
      if (arrows[k]) {
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
      const bonus = STARS.crucigramas.finish + STARS.crucigramas.helpBonus[g.help];
      g.stars += bonus;
      earn('crucigramas', bonus, `finish ${g.help}`, null);
      store.set(savedKey(level), null);
      const rec = store.get<Records>('cw.records', {});
      rec[level] = { done: (rec[level]?.done ?? 0) + 1 };
      store.set('cw.records', rec);
      recordCelebration();
      playMelody();
      cleanupKeys();
      el.querySelector('.cw-near')?.remove();
      const lang = getLang() === 'ru' ? 'ru' : 'en';
      content.classList.remove('is-playing');
      put(el,
        h('h1', { tabindex: '-1', class: 'cw-title', lang: 'es' }, 'Crucigramas'),
        h('div', { class: `cw-finish${prefersReducedMotion() ? '' : ' is-glowing'}` },
          FeedbackBanner({ kind: 'correct', title: t('cw.finished'), hint: `${topic.name_es} · ${lang === 'ru' ? topic.ru : topic.en}` }),
          h('p', { class: 'cw-finish__meta' },
            h('span', { class: 'k-star-total' }, h('span', { 'aria-hidden': 'true' }, '★'), ` ${t('cw.starsEarned', { n: g.stars })}`),
            h('span', null, t(g.hintsUsed === 1 ? 'cw.helpSummaryOne' : 'cw.helpSummary', { help: helpName(g.help), n: g.hintsUsed })))),
        gridEl(false),
        clueList(false),
        h('div', { class: 'cw-actions is-end' },
          Button({ label: t('cw.newGame'), icon: 'refresh', onClick: () => ctx.go(['new', level]) }),
          Button({ label: t('cw.levelsBack'), icon: 'back', variant: 'outline', onClick: () => ctx.go([]) })));
      el.classList.add('is-final');
      sizeGrid();
      requestAnimationFrame(sizeGrid);
      el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }

    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    const onResize = () => sizeGrid();
    window.addEventListener('resize', onResize);
    const cleanupKeys = () => document.removeEventListener('keydown', onKey);
    cleanupView = () => { cleanupKeys(); window.removeEventListener('resize', onResize); clearTimeout(nearTimer); };
    select(cur);
    queueMicrotask(draw);
    return el;
  }

  render(ctx.path);
  return { update: (path) => render(path), destroy: () => { cleanupView?.(); } };
}
