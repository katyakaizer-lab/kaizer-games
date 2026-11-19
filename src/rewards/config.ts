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
} as const;
