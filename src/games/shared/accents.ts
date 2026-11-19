/**
 * Accent and ñ check, shared by games that take typed Spanish. A "near miss" is a letter that matches the answer
 * except for its mark: O for Ó, E for É, U for Ü, N for Ñ. Games treat it as "¡Casi!", not as a mistake.
 */

/** The letter without accent marks or tilde (Á -> A, Ü -> U, Ñ -> N). */
export const bare = (ch: string): string => ch.normalize('NFD').replace(/[̀-ͯ]/g, '');

export type NearMiss = 'accent' | 'enye' | null;

/** Is `typed` the expected letter missing (or with a wrong / extra) mark? Case-insensitive. */
export function nearMiss(typed: string, expected: string): NearMiss {
  const a = typed.toLocaleUpperCase('es'), b = expected.toLocaleUpperCase('es');
  if (!a || a === b || bare(a) !== bare(b)) return null;
  return b === 'Ñ' || a === 'Ñ' ? 'enye' : 'accent';
}

/** Short Spanish message for a near miss, e.g. "¡Casi! Falta la tilde: Ó" or "¡Casi! Es Ñ". */
export function nearMissText(kind: Exclude<NearMiss, null>, expected: string): string {
  const b = expected.toLocaleUpperCase('es');
  if (kind === 'enye') return b === 'Ñ' ? '¡Casi! Es Ñ' : `¡Casi! Es ${b}, sin tilde`;
  return bare(b) === b ? `¡Casi! Sin tilde: ${b}` : b === 'Ü' ? '¡Casi! Lleva diéresis: Ü' : `¡Casi! Falta la tilde: ${b}`;
}
