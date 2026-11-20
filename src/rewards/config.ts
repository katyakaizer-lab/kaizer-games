/**
 * Star rewards: every value in one place, so they are easy to tune.
 * Stars are earned only by playing. They can never be bought, never expire and are never taken away.
 */
export const STARS = {
  crucigramas: {
    /** each word solved (the first time in a puzzle; hints never subtract) */
    word: 1,
    /** finishing a crossword */
    finish: 3,
    /** extra for finishing with less help */
    helpBonus: { none: 3, little: 1, normal: 0 },
  },
  solitario: {
    /** each category completed */
    category: 1,
    /** clearing the table */
    win: 3,
  },
  constelaciones: {
    /** each constellation lit */
    lit: 2,
  },
  /** Pociones de números: each answer right first time (a fixed near miss counts), and finishing a round of 8. */
  pociones: { item: 1, round: 2 },
  /** Golpe de voz: each word with the stressed syllable and the accent both right, and finishing a round. */
  golpe: { item: 1, round: 2 },
  /** Libros de hechizos: each word built, and completing a page. */
  libros: { item: 1, round: 2 },
  /** Cartas de verbos: each card played with the right form, finishing a game, and winning it. */
  cartas: { card: 1, finish: 1, win: 3 },
  /** ¿Pero o perro?: each pair heard right first time, and finishing a round. */
  pares: { item: 1, round: 2 },
} as const;
