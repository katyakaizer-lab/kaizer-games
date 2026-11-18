/**
 * The star board: words are stars, tapped in order. Shared by every mode.
 * - Tap-in-order is the default; dragging a line through the stars is an optional extra.
 * - After each tap the sequence must be the start of an accepted order. If not, the star dims
 *   (shape change plus a text hint, never colour alone) and the line does not extend.
 * - No lives, no timer, no failure state.
 */
import { h } from '../../ui/h';
import { t } from '../../i18n';
import { playNote } from '../../audio/synth';
import { matchedOrder, nextHint, resolveTap, type Constellation } from './sentence';
import { starLayout } from './layout';

export interface BoardOpts {
  c: Constellation;
  /** 'show': labels visible; 'hidden': labels hidden until each star is connected (memory mode) */
  labels: 'show' | 'hidden';
  announce(msg: string): void;
  onWrongStreak?(count: number): void;
  onDone(order: number[]): void;
}

export interface Board {
  el: HTMLElement;
  /** show every label (for `ms` milliseconds, then hide the unconnected ones again; 0 = keep) */
  reveal(ms?: number): void;
  hideLabels(): void;
  showHint(): boolean;
  light(): void;
  readonly seq: number[];
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createBoard(o: BoardOpts): Board {
  const { c } = o;
  const n = c.tokens.length;
  const { pts, aspect } = starLayout(c.id, n);
  const VB_W = 1000, VB_H = 1000 * aspect;
  const seq: number[] = [];
  let wrongStreak = 0;
  let labelsHidden = o.labels === 'hidden';
  let revealTimer: ReturnType<typeof setTimeout> | null = null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('class', 'cz-board__lines');
  svg.setAttribute('aria-hidden', 'true');

  const el = h('div', { class: 'cz-board', style: { aspectRatio: `1 / ${aspect}` }, 'data-labels': labelsHidden ? 'hidden' : 'show' }, svg);
  el.style.setProperty('--aspect', String(aspect)); // lets CSS fit the board to the window height
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', t('cz.tapInOrder'));

  // Tab order follows the picture (top to bottom, left to right), never the answer.
  const visual = pts.map((p, i) => ({ p, i })).sort((a, b) => (Math.abs(a.p.y - b.p.y) < 0.06 ? a.p.x - b.p.x : a.p.y - b.p.y));
  const stars: HTMLButtonElement[] = new Array(n);
  for (const { p, i } of visual) {
    const word = c.tokens[i];
    const b = h('button', {
      type: 'button', class: 'cz-star', 'data-index': String(i),
      style: { left: `${p.x * 100}%`, top: `${p.y * 100}%` },
    }, h('span', { class: 'cz-star__dot' }), h('span', { class: 'cz-star__label', lang: 'es' }, word)) as HTMLButtonElement;
    stars[i] = b;
    el.append(b);
  }
  // While labels are hidden (memory mode), screen readers hear "★ 3" instead of the word.
  const label = (i: number) => (labelsHidden && !stars[i].classList.contains('is-done') && !el.classList.contains('is-revealed') ? `★ ${visual.findIndex((v) => v.i === i) + 1}` : c.tokens[i]);
  const refreshLabels = () => stars.forEach((s, i) => s.setAttribute('aria-label', label(i)));
  refreshLabels();

  function line(a: number, b: number) {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(pts[a].x * VB_W)); l.setAttribute('y1', String(pts[a].y * VB_H));
    l.setAttribute('x2', String(pts[b].x * VB_W)); l.setAttribute('y2', String(pts[b].y * VB_H));
    l.setAttribute('class', 'cz-line');
    svg.append(l);
  }

  // `seq` holds token indexes (the logic); `physOf` maps each to the star actually tapped.
  // They differ only for repeated words, which are interchangeable.
  const physOf = new Map<number, number>();
  const used = new Set<number>();

  function tap(p: number) {
    if (matchedOrder(c, seq) || used.has(p)) return;
    stars.forEach((s) => s.classList.remove('is-hint'));
    const i = resolveTap(c, seq, p);
    if (i === null) {
      const s = stars[p];
      s.classList.remove('is-wrong');
      void s.offsetWidth; // restart the gentle dim
      s.classList.add('is-wrong');
      setTimeout(() => s.classList.remove('is-wrong'), 1400);
      wrongStreak++;
      o.announce(t('cz.notYet'));
      o.onWrongStreak?.(wrongStreak);
      return;
    }
    wrongStreak = 0;
    o.onWrongStreak?.(0);
    if (seq.length) line(physOf.get(seq[seq.length - 1])!, p);
    seq.push(i);
    physOf.set(i, p);
    used.add(p);
    stars[p].classList.add('is-done');
    stars[p].setAttribute('aria-disabled', 'true');
    refreshLabels();
    playNote(seq.length - 1);
    o.announce(c.tokens[p]);
    const done = matchedOrder(c, seq);
    if (done) { el.classList.add('is-complete'); o.onDone(done); }
  }

  // Taps (and keyboard) via click; drag via pointer events. A drag's own taps suppress the follow-up click.
  let dragging = false;
  let lastStar = -1;
  let suppressClick = false;
  const starAt = (x: number, y: number): number => {
    const t0 = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cz-star');
    return t0 && el.contains(t0) ? Number(t0.dataset.index) : -1;
  };
  el.addEventListener('pointerdown', (e) => {
    const i = starAt(e.clientX, e.clientY);
    if (i < 0) return;
    dragging = true; lastStar = i; suppressClick = true;
    tap(i);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const i = starAt(e.clientX, e.clientY);
    if (i >= 0 && i !== lastStar) { lastStar = i; tap(i); }
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>('.cz-star');
    if (!s) return;
    if (suppressClick) { suppressClick = false; return; }
    tap(Number(s.dataset.index));
  });

  return {
    el,
    get seq() { return seq; },
    reveal(ms = 0) {
      el.classList.add('is-revealed');
      refreshLabels();
      if (revealTimer) clearTimeout(revealTimer);
      if (ms > 0) revealTimer = setTimeout(() => { el.classList.remove('is-revealed'); refreshLabels(); }, ms);
    },
    hideLabels() { labelsHidden = true; el.dataset.labels = 'hidden'; el.classList.remove('is-revealed'); refreshLabels(); },
    showHint() {
      const i = nextHint(c, seq);
      if (i === null) return false;
      // glow that star, or an untapped star with the same word
      const p = !used.has(i) ? i : c.tokens.findIndex((w, k) => w === c.tokens[i] && !used.has(k));
      stars[p].classList.add('is-hint');
      o.announce(t('cz.hintShown'));
      return true;
    },
    light() { el.classList.add('is-lit'); },
    destroy() { if (revealTimer) clearTimeout(revealTimer); },
  };
}
