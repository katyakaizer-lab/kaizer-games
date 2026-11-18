/**
 * Card sizing for Solitario, worked out from the real text before a game is drawn.
 * - One width and one height for every card in a game.
 * - Width: the longest Spanish word of the level fits on one line at --card-word-min. Columns are as
 *   many as fit (2 to 9); phones usually get 3.
 * - Each card's text starts at the preferred size and shrinks only as far as the minimum.
 *   Spanish words never wrap; translations may wrap onto two lines; category names wrap between words.
 * - Height: the tallest content in the game (word, dividing line, translation, or a category card's
 *   tag row and name) plus padding. No empty space under the text.
 * - The visible strip of a covered card shows its whole word; the extra room is dropped if the
 *   table would be taller than the screen.
 * All sizes come from tokens in tokens.css (rem-based, so the text-size setting scales them).
 */

export interface SizeTokens {
  rootPx: number; pad: number; gap: number;
  wordMax: number; wordMin: number; trMax: number; trMin: number;
  tag: number; line: number; peekExtra: number; minW: number;
}

export interface CardText { es: string; tr?: string; isCat: boolean }

export interface Layout {
  columns: number;
  categories: number;
  rows: number;
  cardW: number;
  cardH: number;
  peek: number;
  /** the size tokens actually used (minimums may be lowered to the absolute 16px / 14px floor on very narrow screens) */
  tk: SizeTokens;
  /** per text: font sizes in px and translation line count */
  fonts: Map<string, { word: number; tr: number; trLines: number; nameLines: number }>;
}

/** The absolute minimums from the spec (never smaller, whatever the screen). */
export const FLOOR_WORD_PX = 16;
export const FLOOR_TR_PX = 14;

export type Measure = (text: string, px: number, weight: number) => number;

/** Reads the size tokens (rem values resolved to px with the current text size). */
export function readTokens(el: Element = document.documentElement): SizeTokens {
  const cs = getComputedStyle(el);
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const v = (name: string, fallbackRem: number) => {
    const raw = cs.getPropertyValue(name).trim();
    if (raw.endsWith('rem')) return parseFloat(raw) * rootPx;
    if (raw.endsWith('px')) return parseFloat(raw);
    if (raw && !isNaN(Number(raw))) return Number(raw);
    return fallbackRem * rootPx;
  };
  return {
    rootPx, pad: v('--card-pad', 0.375), gap: v('--card-gap', 0.375),
    wordMax: v('--card-word-max', 1.125), wordMin: v('--card-word-min', 1),
    trMax: v('--card-tr-max', 0.9375), trMin: v('--card-tr-min', 0.875),
    tag: v('--card-tag-size', 0.75), line: parseFloat(cs.getPropertyValue('--card-line')) || 1.25,
    peekExtra: v('--stack-peek-extra', 0.25), minW: v('--card-min-w', 5),
  };
}

/** Canvas text measurement in the card font. */
export function canvasMeasure(fontFamily: string): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  return (text, px, weight) => {
    if (!ctx) return text.length * px * 0.6;
    ctx.font = `${weight} ${px}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}

/** Lines needed to show `text` in `width` when it may wrap only between words. */
export function lineCount(text: string, px: number, width: number, m: Measure, weight: number): number {
  let lines = 1, cur = '';
  for (const word of text.split(' ')) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (m(tryLine, px, weight) <= width || !cur) cur = tryLine;
    else { lines++; cur = word; }
  }
  return lines;
}

/** The largest size between max and min at which `text` fits `width` on one line (min if it never fits). */
function fitSize(text: string, max: number, min: number, width: number, m: Measure, weight: number): number {
  for (let px = max; px > min; px -= 0.5) if (m(text, px, weight) <= width) return px;
  return min;
}

export function computeLayout(o: {
  availW: number; availH: number; levelWords: string[]; cards: CardText[]; tk: SizeTokens; m: Measure; showTr: boolean; headH: number;
}): Layout {
  const { m } = o;
  let tk = o.tk;
  const border = 4; // category cards have a 2px frame
  // Width: the longest word of the level at the minimum size, plus padding.
  const needFor = (t: SizeTokens) => Math.ceil(Math.max(...o.levelWords.map((w) => m(w, t.wordMin, 700))) + 2 * t.pad + border + 1);
  let need = needFor(tk);
  let fit = Math.floor((o.availW + tk.gap) / (need + tk.gap));
  if (fit < 2) {
    // Very narrow screen with large text: let the text shrink to the absolute floor (16px word, 14px translation).
    tk = { ...tk, wordMin: Math.min(tk.wordMin, FLOOR_WORD_PX), trMin: Math.min(tk.trMin, FLOOR_TR_PX) };
    need = needFor(tk);
    fit = Math.floor((o.availW + tk.gap) / (need + tk.gap));
  }
  const columns = Math.max(2, Math.min(9, fit));
  const phoneFill = (o.availW - tk.gap * (columns - 1)) / columns;
  // As wide as the words need (at least --card-min-w), with at most 10% spare when the screen has room.
  const base = Math.max(need, Math.min(tk.minW, phoneFill));
  const cardW = Math.floor(Math.max(need, Math.min(phoneFill, base * 1.1)));
  const categories = columns <= 3 ? 4 : columns <= 5 ? 5 : columns <= 7 ? 6 : 7;
  const rows = columns <= 3 ? 5 : 4;
  return { columns, categories, rows, cardW, tk, ...heights({ ...o, tk }, cardW, Math.ceil(categories / columns)) };
}

/** Font sizes per card and the shared card height, for the cards actually dealt. */
export function heights(o: { cards: CardText[]; tk: SizeTokens; m: Measure; showTr: boolean; availH: number; headH: number }, cardW: number, slotRows: number) {
  const { tk, m } = o;
  const innerWord = cardW - 2 * tk.pad - 2 - 1;
  const innerCat = cardW - 2 * tk.pad - 4 - 1; // 2px frame
  const fonts = new Map<string, { word: number; tr: number; trLines: number; nameLines: number }>();
  let contentH = 0;
  let catStrip = 0; // tallest category card top: tag row + all name lines
  for (const c of o.cards) {
    const inner = c.isCat ? innerCat : innerWord;
    // Category names wrap between words: size them so their longest single word fits.
    const longestPart = c.isCat ? c.es.split(' ').sort((a, b) => m(b, tk.wordMin, 700) - m(a, tk.wordMin, 700))[0] : c.es;
    const word = fitSize(longestPart, tk.wordMax, tk.wordMin, inner, m, 700);
    const nameLines = c.isCat ? lineCount(c.es, word, inner, m, 700) : 1;
    let tr = tk.trMax, trLines = 0;
    if (o.showTr && c.tr) {
      tr = fitSize(c.tr, tk.trMax, tk.trMin, inner, m, 400);
      trLines = m(c.tr, tr, 400) <= inner ? 1 : lineCount(c.tr, tk.trMin, inner, m, 400);
      if (trLines > 1) tr = tk.trMin;
    }
    fonts.set(c.es + '|' + (c.tr ?? ''), { word, tr, trLines, nameLines });
    const h = (c.isCat ? tk.tag * tk.line + 2 : 0) + nameLines * word * tk.line + (trLines ? 5 + trLines * tr * tk.line : 0);
    contentH = Math.max(contentH, h);
    if (c.isCat) catStrip = Math.max(catStrip, tk.tag * tk.line + 2 + nameLines * word * tk.line);
  }
  const cardH = Math.ceil(contentH + 2 * tk.pad + 4 + 1); // up to a 2px frame top and bottom
  // Visible strip of a covered card: its whole word line (category cards: tag row + first name line).
  const minPeek = Math.ceil(2 + tk.pad + Math.max(tk.wordMax * tk.line, catStrip) + 2); // frame + padding + text + a little air
  let peek = minPeek + Math.round(tk.peekExtra);
  // If a full column (rows cards) would push the table past the screen, drop the extra room.
  const tableH = o.headH + slotRows * (cardH + tk.tag * 2.6) + cardH + 4 * peek;
  if (tableH > o.availH) peek = minPeek;
  return { cardH, peek, fonts };
}
