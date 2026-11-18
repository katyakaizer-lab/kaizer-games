/**
 * Dense one-screen board for Solitario (all sizes from tokens in tokens.css, rem-based).
 * - Columns: the level's setting (data), at most 6 under 400px, one fewer per text-size step,
 *   and fewer still if the level's longest word would not fit a card at --card-word-min.
 * - Card width = (screen width - side padding - gaps) / columns; height = width x --card-ratio.
 *   One size for every card and slot in a game. As many categories as columns, slots in one row.
 * - Text auto-fits per card: the Spanish word from --card-word-max down to --card-word-min on one line;
 *   translations down to --card-tr-min, wrapping to two lines; category names down to --card-name-min,
 *   wrapping between words.
 * - Stacking: every card fully visible with a small gap; a column overlaps only when it would run past
 *   the bottom of the screen, and a covered card always keeps its word (or category tag and name) visible.
 */

export interface DenseTokens {
  rootPx: number; boardPad: number; gap: number; ratio: number; pad: number;
  wordMax: number; wordMin: number; trMax: number; trMin: number; nameMin: number; tag: number; line: number;
}

export type Measure = (text: string, px: number, weight: number) => number;
export type TextSize = 'normal' | 'large' | 'xlarge';

export function readTokens(): DenseTokens {
  const cs = getComputedStyle(document.documentElement);
  const rootPx = parseFloat(cs.fontSize) || 16;
  const v = (name: string, fallbackRem: number) => {
    const raw = cs.getPropertyValue(name).trim();
    if (raw.endsWith('rem')) return parseFloat(raw) * rootPx;
    if (raw.endsWith('px')) return parseFloat(raw);
    return fallbackRem * rootPx;
  };
  const num = (name: string, fb: number) => parseFloat(cs.getPropertyValue(name)) || fb;
  return {
    rootPx, boardPad: v('--board-pad', 0.5), gap: v('--card-gap', 0.3125), ratio: num('--card-ratio', 1.35), pad: v('--card-pad', 0.1875),
    wordMax: v('--card-word-max', 1.0625), wordMin: v('--card-word-min', 0.8125), trMax: v('--card-tr-max', 0.8125), trMin: v('--card-tr-min', 0.75),
    nameMin: v('--card-name-min', 0.625), tag: v('--card-tag-size', 0.6875), line: num('--card-line', 1.2),
  };
}

export function canvasMeasure(fontFamily: string): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  return (text, px, weight) => {
    if (!ctx) return text.length * px * 0.6;
    ctx.font = `${weight} ${px}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}

/** Lines needed when text may wrap only between words. */
export function lineCount(text: string, px: number, width: number, m: Measure, weight: number): number {
  let lines = 1, cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? `${cur} ${word}` : word;
    if (m(t, px, weight) <= width || !cur) cur = t; else { lines++; cur = word; }
  }
  return lines;
}

const BORDER_WORD = 2; // 1px each side
const BORDER_CAT = 4;  // 2px frame each side

export const innerWidth = (cardW: number, tk: DenseTokens, isCat: boolean) => cardW - 2 * tk.pad - (isCat ? BORDER_CAT : BORDER_WORD) - 1;
export const cardWidthFor = (viewW: number, cols: number, tk: DenseTokens) => (viewW - 2 * tk.boardPad - tk.gap * (cols - 1)) / cols;

export interface DenseLayout { columns: number; categories: number; rows: number; cardW: number; cardH: number; tk: DenseTokens }

export function denseLayout(o: { viewW: number; levelColumns: number; levelRows: number; textSize: TextSize; levelWords: string[]; tk: DenseTokens; m: Measure }): DenseLayout {
  const { tk, m } = o;
  let cols = Math.min(7, o.levelColumns);
  if (o.viewW < 400) cols = Math.min(cols, 6);
  cols -= o.textSize === 'xlarge' ? 2 : o.textSize === 'large' ? 1 : 0;
  cols = Math.max(2, cols);
  // Never cut a word: fewer columns until the level's longest word fits at the minimum size.
  const longest = Math.max(...o.levelWords.map((w) => m(w, tk.wordMin, 700)));
  while (cols > 2 && longest > innerWidth(cardWidthFor(o.viewW, cols, tk), tk, false)) cols--;
  const cardW = Math.floor(cardWidthFor(o.viewW, cols, tk));
  return { columns: cols, categories: cols, rows: o.levelRows, cardW, cardH: Math.round(cardW * tk.ratio), tk };
}

export interface CardFont { word: number; tr: number; trLines: number; nameLines: number }

function fit(text: string, max: number, min: number, width: number, m: Measure, weight: number): number {
  for (let px = max; px > min; px -= 0.25) if (m(text, px, weight) <= width) return px;
  return min;
}

/** Font sizes for one card's text. */
export function cardFont(text: { es: string; tr?: string; isCat: boolean }, cardW: number, cardH: number, tk: DenseTokens, m: Measure): CardFont {
  const inner = innerWidth(cardW, tk, text.isCat);
  if (text.isCat) {
    // Category name: largest size at which each word fits and the name fits under the tag row.
    const avail = cardH - 2 * tk.pad - BORDER_CAT - tk.tag * tk.line - 2;
    for (let px = tk.wordMax; px >= tk.nameMin; px -= 0.25) {
      const words = text.es.split(' ');
      if (words.some((w) => m(w, px, 700) > inner)) continue;
      const lines = lineCount(text.es, px, inner, m, 700);
      if (lines * px * tk.line <= avail) return { word: px, tr: tk.trMin, trLines: 0, nameLines: lines };
    }
    return { word: tk.nameMin, tr: tk.trMin, trLines: 0, nameLines: lineCount(text.es, tk.nameMin, inner, m, 700) };
  }
  const word = fit(text.es, tk.wordMax, tk.wordMin, inner, m, 700);
  if (!text.tr) return { word, tr: tk.trMin, trLines: 0, nameLines: 1 };
  const tr = fit(text.tr, tk.trMax, tk.trMin, inner, m, 400);
  // Lines at the minimum size; a word wider than the card breaks, so it counts for as many lines as it needs.
  const trLines = m(text.tr, tr, 400) <= inner ? 1 : text.tr.split(' ').reduce((n, w) => n + Math.max(0, Math.ceil(m(w, tk.trMin, 400) / inner) - 1), lineCount(text.tr, tk.trMin, inner, m, 400));
  return { word, tr: trLines > 1 ? tk.trMin : tr, trLines, nameLines: 1 };
}

/** Height a covered card must keep visible: its word line (category cards: tag row and name). */
export function peekFor(f: CardFont, isCat: boolean, tk: DenseTokens): number {
  const border = isCat ? 2 : 1;
  const text = isCat ? tk.tag * tk.line + 2 + f.nameLines * f.word * tk.line : f.word * tk.line;
  return Math.ceil(border + tk.pad + text + 2);
}

/**
 * Offsets (top of each card from the top of the column). Full cards with a gap if they fit in `availH`,
 * otherwise the covered cards share the space, each keeping at least its own peek.
 */
export function stackOffsets(peeks: number[], cardH: number, gap: number, availH: number): number[] {
  const n = peeks.length;
  if (!n) return [];
  const full = cardH + gap;
  if ((n - 1) * full + cardH <= availH) return peeks.map((_, i) => i * full);
  const covered = peeks.slice(0, -1);
  let lo = 0, hi = full;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const total = covered.reduce((s, p) => s + Math.max(p, mid), 0) + cardH;
    if (total > availH) hi = mid; else lo = mid;
  }
  const out = [0];
  for (let i = 0; i < n - 1; i++) out.push(out[i] + Math.max(covered[i], lo));
  return out;
}
