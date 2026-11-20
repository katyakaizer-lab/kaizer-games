/**
 * Libros de hechizos. Routes after #game/libros:
 *   (none)                      modes, and "Mi libro"
 *   play/<mode>[/seed-<n>]      a page: join beginnings and endings to make the six words of the page
 *   libro                       every word made so far, by mode
 * Tap a beginning, then an ending: a real word joins the libro. Pieces are coloured by family. No timer.
 */
import { h, mount as put } from '../../ui/h';
import { Button } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import { allWords } from '../../words/bank';
import type { GameContext, GameHandle } from '../../app/router';
import { cheer, decorBand, finishPanel, gameRoot, header, modeList, statusLine } from '../kit/ui';
import { MODES, TENSES, join, makePage, pageDone, type ModeId, type Page, type Piece } from './engine';
import './libros.css';

const GAME = 'libros';
const NAMES: Record<ModeId, string> = {
  silabas: 'Sílabas mágicas', sufijos: 'Sufijos', presente: 'Verbos: presente', indefinido: 'Verbos: indefinido', imperfecto: 'Verbos: imperfecto',
  futuro: 'Verbos: futuro', subjuntivo: 'Verbos: subjuntivo', 'subjuntivo-imperfecto': 'Verbos: imperfecto de subjuntivo',
};
type Book = Partial<Record<ModeId, string[]>>;
const getBook = (): Book => store.get<Book>('lib.book', {});
function addToBook(mode: ModeId, word: string): void {
  const b = getBook();
  const list = b[mode] ?? [];
  if (!list.includes(word)) { b[mode] = [...list, word]; store.set('lib.book', b); }
}
const bookSize = () => Object.values(getBook()).reduce((n, l) => n + (l?.length ?? 0), 0);

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = gameRoot(root, 'lib');

  function render(path: string[]): void {
    const [head, mode, seedSeg] = path;
    const m = MODES.find((x) => x.id === mode);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : Math.floor(Math.random() * 1e9);
    put(content, head === 'play' && m ? playView(m.id, seed) : head === 'libro' ? bookView() : modesView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  function modesView(): HTMLElement {
    const b = getBook();
    return h('div', { class: 'kit-list' },
      header('Libros de hechizos', ctx.exit),
      decorBand(GAME, ['libro', 'pluma', 'estrella', 'llave']),
      h('p', { class: 'kit-soft' }, t('lib.intro')),
      h('div', { class: 'kit-row' }, Button({ label: t('lib.myBook', { n: bookSize() }), icon: 'book', variant: 'secondary', onClick: () => ctx.go(['libro']) })),
      modeList(MODES.map((x) => ({ id: x.id, level: x.level, name: NAMES[x.id], note: TENSES[x.id] ? t('lib.mode.verbs', { tense: TENSES[x.id]!.name }) : t(`lib.mode.${x.id}` as 'lib.mode.silabas') })),
        (id) => ctx.go(['play', id]), Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v?.length ?? 0]))));
  }

  function bookView(): HTMLElement {
    const b = getBook();
    const modes = MODES.filter((m) => b[m.id]?.length);
    return h('div', { class: 'kit-list' },
      header(t('lib.bookTitle'), () => ctx.go([]), t('kit.modes')),
      modes.length ? modes.map((m) => h('section', { class: 'kit-card lib-book' },
        h('h2', { lang: 'es' }, NAMES[m.id]),
        h('ul', { class: 'lib-book__words', lang: 'es' }, b[m.id]!.slice().sort((x, y) => x.localeCompare(y, 'es')).map((w) => h('li', null, w)))))
        : h('p', { class: 'kit-message' }, t('lib.bookEmpty')));
  }

  function playView(mode: ModeId, seed: number): HTMLElement {
    const page = makePage(mode, allWords(), seed);
    const view = h('div', { class: 'kit-list' });
    const back = () => ctx.go([]);
    if (!page) { put(view, header(NAMES[mode], back, t('kit.modes')), h('p', { class: 'kit-message' }, t('kit.noItems'))); return view; }
    const found = new Set<string>();
    let stars = 0;
    let picked: Piece | null = null;
    const status = statusLine();
    const tr = (x: Page['targets'][number]['hint']) => (typeof x === 'string' ? x : getLang() === 'ru' ? x.ru : x.en);
    const targetsEl = h('ol', { class: 'lib-targets' });
    const made = h('p', { class: 'lib-made', lang: 'es', 'aria-hidden': 'true' });
    const pieceBtn = (p: Piece) => h('button', { type: 'button', class: `lib-piece is-${p.role} ${p.family < 0 ? 'fam-n' : `fam-${p.family % 4}`}`, lang: 'es', 'data-piece': p.id, 'aria-pressed': p.role === 'start' ? 'false' : undefined, onClick: () => tapPiece(p) }, p.text);
    const startsEl = h('div', { class: 'lib-pieces', role: 'group', 'aria-label': t('lib.starts') }, page.starts.map(pieceBtn));
    const endsEl = h('div', { class: 'lib-pieces', role: 'group', 'aria-label': t('lib.ends') }, page.ends.map(pieceBtn));
    const legend = h('p', { class: 'kit-small lib-legend' }, page.families.map((f, k) => h('span', { class: `lib-legend__item fam-${k % 4}`, lang: 'es' }, f)));

    function drawTargets(): void {
      put(targetsEl, page!.targets.map((tg) => h('li', { class: `lib-target fam-${tg.family % 4}${found.has(tg.word) ? ' is-found' : ''}` },
        found.has(tg.word) ? h('strong', { lang: 'es' }, tg.word) : h('span', { class: 'lib-target__blank', 'aria-hidden': 'true' }, '?'),
        h('span', { class: 'kit-small', lang: typeof tg.hint === 'string' ? 'es' : undefined }, tr(tg.hint)))));
    }
    function tapPiece(p: Piece): void {
      if (p.role === 'start') {
        picked = picked?.id === p.id ? null : p;
        startsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.piece === picked?.id)));
        made.textContent = picked ? `${picked.text} + …` : '';
        if (picked) status.show('info', t('lib.pickEnd'));
        return;
      }
      if (!picked) { status.show('info', t('lib.pickStartFirst')); return; }
      const res = join(page!, found, picked.text, p.text);
      made.textContent = `${picked.text} + ${p.text} = ${res.kind === 'target' ? res.target.word : res.word}`;
      if (res.kind === 'target') {
        found.add(res.target.word);
        addToBook(mode, res.target.word);
        stars += STARS.libros.item;
        earn(GAME, STARS.libros.item, `libros ${mode}`, targetsEl);
        cheer();
        status.show('ok', t('lib.newWord'), res.target.word);
        // A beginning used by all its targets is spent.
        if (page!.targets.filter((x) => x.start === picked!.text).every((x) => found.has(x.word))) startsEl.querySelector<HTMLButtonElement>(`[data-piece="${CSS.escape(picked.id)}"]`)?.setAttribute('disabled', '');
        picked = null;
        startsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        drawTargets();
        if (pageDone(page!, found)) finish();
      } else if (res.kind === 'extra') {
        addToBook(mode, res.word);
        status.show('info', t('lib.extraWord'), res.note ? `${res.word} (${res.note})` : res.word);
      } else status.show('wrong', t('lib.notAWord'), res.word);
    }
    function finish(): void {
      const bonus = STARS.libros.round;
      view.append(finishPanel({ game: GAME, stars: stars + bonus, bonus, right: found.size, total: page!.targets.length, reason: `libros ${mode} page`, again: () => ctx.go(['play', mode]), modes: back }));
      startsEl.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      endsEl.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
    }
    drawTargets();
    put(view,
      header(NAMES[mode], back, t('kit.modes')),
      h('section', { class: 'kit-card' },
        h('p', { class: 'kit-prompt' }, TENSES[mode] ? t('lib.askVerbs', { tense: TENSES[mode]!.name }) : t('lib.ask')),
        targetsEl, legend,
        h('h2', { class: 'lib-sub' }, t('lib.starts')), startsEl,
        h('h2', { class: 'lib-sub' }, t('lib.ends')), endsEl,
        made, status.el));
    return view;
  }

  render(ctx.path);
  return { update: render, destroy: () => {} };
}
