/**
 * Card layout for Solitario, following the card-layout mockup v4. All sizes come from tokens (rem-based).
 * - Columns: the level's setting, at most 6 under 400px, one fewer per text-size step, and fewer still if a
 *   word of the level would not fit a card even wrapped at a syllable (2 lines at --card-word-min).
 * - Card width = min(--card-max, (width - side padding - gaps) / columns); height = width x --card-ratio.
 * - Words: --card-word-max down to --card-word-min on one line, then wrapped at a syllable (2 lines max).
 * - Columns: face-down cards show a --down-peek strip; face-up cards are fully visible, --stack-gap apart,
 *   and only squeeze (keeping their word visible) if the column would pass the bottom bar.
 */
import { breakOptions } from './syllables.ts';

export interface CardTokens {
  rootPx: number; boardPad: number; colGap: number; cardMax: number; ratio: number;
  edge: number; frame: number; pad: number; downPeek: number; stackGap: number;
  wordMax: number; wordMin: number; trMax: number; trMin: number; nameMin: number; tag: number; line: number; tabH: number; bottomBtn: number;
}
export type Measure = (text: string, px: number, weight: number) => number;
export type TextSize = 'normal' | 'large' | 'xlarge';

export function readTokens(): CardTokens {
  const cs = getComputedStyle(document.documentElement);
  const rootPx = parseFloat(cs.fontSize) || 16;
  const v = (name: string, fb: number) => {
    const raw = cs.getPropertyValue(name).trim();
    if (raw.endsWith('rem')) return parseFloat(raw) * rootPx;
    if (raw.endsWith('px')) return parseFloat(raw);
    return fb * rootPx;
  };
  const num = (name: string, fb: number) => parseFloat(cs.getPropertyValue(name)) || fb;
  return {
    rootPx, boardPad: v('--board-pad', 0.75), colGap: v('--col-gap', 0.625), cardMax: v('--card-max', 4.5), ratio: num('--card-ratio', 1.36),
    edge: v('--card-edge', 0.25), frame: v('--card-frame-w', 0.09375), pad: v('--card-pad', 0.125), downPeek: v('--down-peek', 1), stackGap: v('--stack-gap', 0.375),
    wordMax: v('--card-word-max', 1), wordMin: v('--card-word-min', 0.8125), trMax: v('--card-tr-max', 0.75), trMin: v('--card-tr-min', 0.75),
    nameMin: v('--card-name-min', 0.8125), tag: v('--card-tag-size', 0.6875), line: num('--card-line', 1.15), tabH: v('--slot-tab-h', 1.125), bottomBtn: v('--bottom-btn', 3.75),
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

/** Text width inside a card: card minus edge, frame line and padding on both sides (and a pixel of air). */
export const innerWidth = (cardW: number, tk: CardTokens) => cardW - 2 * (tk.edge + tk.frame + tk.pad) - 1;
export const cardWidthFor = (viewW: number, cols: number, tk: CardTokens) => Math.min(tk.cardMax, (viewW - 2 * tk.boardPad - tk.colGap * (cols - 1)) / cols);

/** Lines a text needs at `px` within `width`, breaking between words and (for Spanish) at syllables. 99 = does not fit. */
export function linesFor(text: string, px: number, width: number, m: Measure, weight: number, syllables: boolean): number {
  let lines = 1, cur = '';
  const fits = (t: string) => m(t, px, weight) <= width;
  for (const word of text.split(' ')) {
    let rest = word;
    let candidate = cur ? `${cur} ${rest}` : rest;
    while (!fits(candidate)) {
      // Try to break `rest` at a syllable so that the first part (with a hyphen) fits on the current line.
      const opts = syllables ? breakOptions(rest).reverse() : [];
      const prefix = cur ? `${cur} ` : '';
      const cut = opts.find(([a]) => fits(`${prefix}${a}-`));
      if (cut) { lines++; rest = cut[1]; cur = ''; candidate = rest; continue; }
      if (cur) { lines++; cur = ''; candidate = rest; continue; }
      return 99; // a piece longer than the line with no syllable to break at
    }
    cur = candidate;
  }
  return lines;
}

export interface CardFont { word: number; wordLines: number; tr: number; trLines: number }

/** Spanish text: largest size from max to min on one line; else wrap at a syllable at the minimum size. */
export function fitSpanish(text: string, inner: number, tk: CardTokens, m: Measure, min = tk.wordMin): { px: number; lines: number } {
  for (let px = tk.wordMax; px >= min; px -= 0.25) if (m(text, px, 700) <= inner) return { px, lines: 1 };
  return { px: min, lines: linesFor(text, min, inner, m, 700, true) };
}

export function cardFont(text: { es: string; tr?: string; isCat: boolean }, cardW: number, tk: CardTokens, m: Measure): CardFont {
  const inner = innerWidth(cardW, tk);
  const w = fitSpanish(text.es, inner, tk, m, text.isCat ? tk.nameMin : tk.wordMin);
  if (!text.tr) return { word: w.px, wordLines: w.lines, tr: tk.trMin, trLines: 0 };
  const trLines = linesFor(text.tr, tk.trMin, inner, m, 400, false);
  return { word: w.px, wordLines: w.lines, tr: tk.trMin, trLines: trLines === 99 ? 2 : Math.min(2, trLines) };
}

export interface BoardLayout { columns: number; categories: number; down: number; cardW: number; cardH: number; tk: CardTokens }

/** Lines allowed: words 2, category names 3 (category cards have no translation, so there is room). */
export const MAX_WORD_LINES = 2;
export const MAX_NAME_LINES = 3;

export function boardLayout(o: { viewW: number; levelColumns: number; levelDown: number; textSize: TextSize; levelWords: string[]; levelNames?: string[]; tk: CardTokens; m: Measure }): BoardLayout {
  const { tk, m } = o;
  let cols = Math.min(7, o.levelColumns);
  if (o.viewW < 400) cols = Math.min(cols, 6);
  cols -= o.textSize === 'xlarge' ? 2 : o.textSize === 'large' ? 1 : 0;
  cols = Math.max(2, cols);
  // Fewer columns until every word fits (one line, or two lines wrapped at a syllable).
  const fitsAll = (c: number) => { const inner = innerWidth(cardWidthFor(o.viewW, c, tk), tk); return o.levelWords.every((w) => fitSpanish(w, inner, tk, m).lines <= MAX_WORD_LINES)
    && (o.levelNames ?? []).every((w) => fitSpanish(w, inner, tk, m, tk.nameMin).lines <= MAX_NAME_LINES); };
  while (cols > 2 && !fitsAll(cols)) cols--;
  const cardW = Math.floor(cardWidthFor(o.viewW, cols, tk));
  return { columns: cols, categories: cols, down: o.levelDown, cardW, cardH: Math.round(cardW * tk.ratio), tk };
}

/** Words that do not fit their card even wrapped (a content problem; listed in the build report). */
export function wordsTooLong(words: string[], cardW: number, tk: CardTokens, m: Measure, maxLines = MAX_WORD_LINES): string[] {
  const inner = innerWidth(cardW, tk);
  return words.filter((w) => fitSpanish(w, inner, tk, m).lines > maxLines);
}

/** Height a squeezed face-up card keeps visible: edge, frame, padding and its word lines (category cards: tag row too). */
export function visibleTop(f: CardFont, isCat: boolean, tk: CardTokens): number {
  return Math.ceil(tk.edge + tk.frame + tk.pad + (isCat ? tk.tag * tk.line + 1 : 0) + f.wordLines * f.word * tk.line + 2);
}

/**
 * Top offset of each card in a column. Face-down cards: --down-peek apart. Face-up cards: full height plus
 * --stack-gap; if the column would pass `availH`, the covered face-up cards squeeze, each keeping its word visible.
 */
export function columnOffsets(down: number, faceUpTops: number[], cardH: number, tk: CardTokens, availH: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < down; i++) out.push(i * tk.downPeek);
  const startUp = down * tk.downPeek;
  const n = faceUpTops.length;
  if (!n) return out;
  const full = cardH + tk.stackGap;
  const room = availH - startUp;
  let step = full;
  if ((n - 1) * full + cardH > room) {
    const covered = faceUpTops.slice(0, -1);
    let lo = 0, hi = full;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (covered.reduce((s, p) => s + Math.max(p, mid), 0) + cardH > room) hi = mid; else lo = mid; }
    step = lo;
  }
  let y = startUp;
  for (let i = 0; i < n; i++) { out.push(y); if (i < n - 1) y += Math.max(step === full ? full : faceUpTops[i], step); }
  return out;
}
