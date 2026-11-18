/**
 * Card layout for Solitario (card-layout mockup v4 plus the word-fit and stacking fixes). Sizes come from tokens (rem-based).
 * - Columns: the level's setting, at most 6 under 400px, one fewer per text-size step, and fewer still if a
 *   word of the level would not fit a card at all (see fitSpanish).
 * - Card width = min(--card-max, (width - side padding - gaps) / columns); height = width x --card-ratio.
 * - Words, measured against the inner panel (card minus edge, frame line and padding on both sides):
 *   1. --card-word-max down to --card-word-min on one line;
 *   2. else wrapped at a syllable (soft hyphens), again from --card-word-max down until it fits in 2 lines;
 *   3. never below --card-word-floor; a word that still does not fit is a content problem (build report).
 * - Columns: face-down cards show a --down-peek strip; a face-up card on another sits card height x --up-step
 *   lower (covering the lower part), always leaving the covered word visible; the step shrinks only if the
 *   column would pass the bottom bar, never below that point.
 */
import { breakOptions } from '../shared/syllabify.ts';

export interface CardTokens {
  rootPx: number; boardPad: number; colGap: number; cardMax: number; ratio: number;
  edge: number; frame: number; pad: number; downPeek: number; upStep: number;
  wordMax: number; wordMin: number; wordFloor: number; trMax: number; trMin: number; nameMin: number; tag: number; line: number; tabH: number; bottomBtn: number;
}
export type Measure = (text: string, px: number, weight: number) => number;
export type TextSize = 'normal' | 'large' | 'xlarge';

/** Lines a word may use on a card. */
export const MAX_WORD_LINES = 2;
export const MAX_NAME_LINES = 3; // category names (two words) may use 3; their card has no translation

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
    rootPx, boardPad: v('--board-pad', 0.5), colGap: v('--col-gap', 0.375), cardMax: v('--card-max', 4.5), ratio: num('--card-ratio', 1.36),
    edge: v('--card-edge', 0.1875), frame: v('--card-frame-w', 0.09375), pad: v('--card-pad', 0.0625), downPeek: v('--down-peek', 1), upStep: num('--up-step', 0.6),
    wordMax: v('--card-word-max', 1), wordMin: v('--card-word-min', 0.8125), wordFloor: v('--card-word-floor', 0.6875), trMax: v('--card-tr-max', 0.75), trMin: v('--card-tr-min', 0.75),
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
export const innerWidth = (cardW: number, tk: Pick<CardTokens, 'edge' | 'frame' | 'pad'>) => cardW - 2 * (tk.edge + tk.frame + tk.pad) - 1;
export const cardWidthFor = (viewW: number, cols: number, tk: Pick<CardTokens, 'cardMax' | 'boardPad' | 'colGap'>) => Math.min(tk.cardMax, (viewW - 2 * tk.boardPad - tk.colGap * (cols - 1)) / cols);

/** Lines a text needs at `px` within `width`, breaking between words and (for Spanish) at syllables. 99 = does not fit. */
export function linesFor(text: string, px: number, width: number, m: Measure, weight: number, syllables: boolean): number {
  let lines = 1, cur = '';
  const fits = (t: string) => m(t, px, weight) <= width;
  for (const word of text.split(' ')) {
    let rest = word;
    let candidate = cur ? `${cur} ${rest}` : rest;
    while (!fits(candidate)) {
      // Break `rest` at the last syllable that still fits on the current line (with its hyphen).
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

export interface SpanishFit { px: number; lines: number; wrap: boolean; misfit: boolean }

/** The fit order for a Spanish word or name on a card (see the header). */
export function fitSpanish(text: string, inner: number, tk: Pick<CardTokens, 'wordMax' | 'wordMin' | 'wordFloor'>, m: Measure, min = tk.wordMin, maxLines = MAX_WORD_LINES): SpanishFit {
  for (let px = tk.wordMax; px >= min - 0.001; px -= 0.25) if (m(text, px, 700) <= inner) return { px, lines: 1, wrap: false, misfit: false };
  // Wrapped: 2 lines first (shrinking to the floor); only category names may then use a 3rd line.
  for (let limit = Math.min(2, maxLines); limit <= maxLines; limit++) {
    for (let px = tk.wordMax; px >= tk.wordFloor - 0.001; px -= 0.25) {
      const lines = linesFor(text, px, inner, m, 700, true);
      if (lines <= limit) return { px, lines, wrap: true, misfit: false };
    }
  }
  const lines = linesFor(text, tk.wordFloor, inner, m, 700, true);
  return { px: tk.wordFloor, lines: lines === 99 ? maxLines : lines, wrap: true, misfit: true };
}

export interface CardFont { word: number; wordLines: number; wrap: boolean; misfit: boolean; tr: number; trLines: number }

/** Text height inside a card: category tag row, word lines, and the translation (rule above it plus its lines). */
export function contentHeight(f: Pick<CardFont, 'word' | 'wordLines' | 'tr' | 'trLines'>, isCat: boolean, tk: Pick<CardTokens, 'tag' | 'line'>): number {
  return (isCat ? tk.tag * tk.line + 1 : 0) + f.wordLines * f.word * tk.line + (f.trLines ? 6 + f.trLines * f.tr * tk.line : 0);
}
export const innerHeight = (cardH: number, tk: Pick<CardTokens, 'edge' | 'frame' | 'pad'>) => cardH - 2 * (tk.edge + tk.frame + tk.pad);

/**
 * Word (and translation) sizes for one card: the fit order for the width, then, if the card is too short for the
 * word plus its translation, the word gets smaller (down to --card-word-floor), then the translation (down to
 * --card-tr-min). Still too tall = misfit (reported).
 */
export function cardFont(text: { es: string; tr?: string; isCat: boolean }, cardW: number, tk: CardTokens, m: Measure): CardFont {
  const inner = innerWidth(cardW, tk);
  const innerH = innerHeight(Math.round(cardW * tk.ratio), tk);
  const min = text.isCat ? tk.nameMin : tk.wordMin;
  const maxLines = text.isCat ? MAX_NAME_LINES : MAX_WORD_LINES;
  let w = fitSpanish(text.es, inner, tk, m, min, maxLines);
  let tr = tk.trMax;
  const trLinesAt = (px: number) => { if (!text.tr) return 0; const l = linesFor(text.tr, px, inner, m, 400, false); return l === 99 ? 2 : Math.min(2, l); };
  let f: CardFont = { word: w.px, wordLines: w.lines, wrap: w.wrap, misfit: w.misfit, tr, trLines: trLinesAt(tr) };
  while (contentHeight(f, text.isCat, tk) > innerH) {
    if (f.word - 0.25 >= tk.wordFloor - 0.001) {
      // Below --card-word-min the word is in the wrapped stage (soft hyphens), even if it ends up on one line.
      w = fitSpanish(text.es, inner, { ...tk, wordMax: f.word - 0.25 }, m, min, maxLines);
      f = { ...f, word: w.px, wordLines: w.lines, wrap: w.wrap, misfit: w.misfit };
      if (w.misfit) break;
    } else if (text.tr && tr - 0.25 >= tk.trMin - 0.001) {
      tr -= 0.25;
      f = { ...f, tr, trLines: trLinesAt(tr) };
    } else { f = { ...f, misfit: true }; break; }
  }
  return f;
}

export interface BoardLayout { columns: number; categories: number; down: number; cardW: number; cardH: number; tk: CardTokens }

export function boardLayout(o: { viewW: number; levelColumns: number; levelDown: number; textSize: TextSize; levelWords: string[]; levelNames?: string[]; tk: CardTokens; m: Measure }): BoardLayout {
  const { tk, m } = o;
  let cols = Math.min(7, o.levelColumns);
  if (o.viewW < 400) cols = Math.min(cols, 6);
  cols -= o.textSize === 'xlarge' ? 2 : o.textSize === 'large' ? 1 : 0;
  cols = Math.max(2, cols);
  // Fewer columns only if some word would not fit even wrapped at the floor size.
  const fitsAll = (c: number) => {
    const inner = innerWidth(cardWidthFor(o.viewW, c, tk), tk);
    return o.levelWords.every((w) => !fitSpanish(w, inner, tk, m).misfit)
      && (o.levelNames ?? []).every((w) => !fitSpanish(w, inner, tk, m, tk.nameMin, MAX_NAME_LINES).misfit);
  };
  while (cols > 2 && !fitsAll(cols)) cols--;
  return { columns: cols, categories: cols, down: o.levelDown, ...cardSize(o.viewW, cols, tk), tk };
}

/** Card size for a screen width and column count (also used when the screen is resized mid-game). */
export function cardSize(viewW: number, cols: number, tk: CardTokens): { cardW: number; cardH: number } {
  const cardW = Math.floor(cardWidthFor(viewW, cols, tk));
  return { cardW, cardH: Math.round(cardW * tk.ratio) };
}

/** Words that do not fit their card even wrapped at the floor size (a content problem; listed in the build report). */
export function wordsTooLong(words: string[], cardW: number, tk: CardTokens, m: Measure): string[] {
  const inner = innerWidth(cardW, tk);
  return words.filter((w) => fitSpanish(w, inner, tk, m).misfit);
}

/** Height a covered face-up card must keep visible: edge, frame, padding and its word lines (category cards: tag row too). */
export function visibleTop(f: Pick<CardFont, 'word' | 'wordLines'>, isCat: boolean, tk: Pick<CardTokens, 'edge' | 'frame' | 'pad' | 'tag' | 'line'>): number {
  return Math.ceil(tk.edge + tk.frame + tk.pad + (isCat ? tk.tag * tk.line + 1 : 0) + f.wordLines * f.word * tk.line + 3);
}

/**
 * Top offset of each card in a column. Face-down cards: --down-peek apart. Face-up cards: card height x --up-step
 * apart, or more for a card whose word needs it (faceUpTops); if the column would pass `availH`, the step shrinks,
 * but a covered card never shows less than its word.
 */
export function columnOffsets(down: number, faceUpTops: number[], cardH: number, tk: Pick<CardTokens, 'downPeek' | 'upStep'>, availH: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < down; i++) out.push(i * tk.downPeek);
  const startUp = down * tk.downPeek;
  const n = faceUpTops.length;
  if (!n) return out;
  const covered = faceUpTops.slice(0, -1);
  const height = (step: number) => covered.reduce((s, p) => s + Math.max(p, step), 0) + cardH;
  let step = cardH * tk.upStep;
  const room = availH - startUp;
  if (height(step) > room) {
    let lo = 0, hi = step;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (height(mid) > room) hi = mid; else lo = mid; }
    step = lo;
  }
  let y = startUp;
  for (let i = 0; i < n; i++) { out.push(Math.round(y * 100) / 100); if (i < n - 1) y += Math.max(faceUpTops[i], step); }
  return out;
}
