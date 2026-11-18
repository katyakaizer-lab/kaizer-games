/**
 * Spanish syllable division, used to mark where a word on a card may wrap (soft hyphens, U+00AD).
 * Browsers only hyphenate Spanish where they ship a dictionary, so the breaks are marked here instead.
 * Rules (RAE): one consonant between vowels goes with the next vowel (ca-sa); two consonants split
 * (al-to) unless they form an inseparable group (pr, bl, tr, ch, ll, rr...: o-tro, ca-lle); three or
 * four consonants keep an inseparable group with the next vowel (ins-tan-te, en-tre). Weak vowels (i, u)
 * form diphthongs with any vowel (cie-lo, rui-do); two strong vowels split (le-ón, a-é-re-o); an accented
 * weak vowel breaks the diphthong (dí-a, pa-na-de-rí-a). "qu" and "gu" before e/i act as one consonant.
 * No break leaves a single letter at the start or end of a word (abue-la, not a-bue-la).
 */
const VOWEL = 'aeiouáéíóúü';
const WEAK = 'iuü';
const ACCENTED_WEAK = 'íú';
const INSEPARABLE = new Set(['pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr', 'pl', 'bl', 'cl', 'gl', 'fl', 'kr', 'kl', 'ch', 'll', 'rr']);

const isVowel = (c: string) => VOWEL.includes(c);
const isStrong = (c: string) => isVowel(c) && (!WEAK.includes(c) || ACCENTED_WEAK.includes(c));

/** Splits one word (no spaces) into units: vowels, and consonants where ch/ll/rr/qu/gu(e,i) count as one. */
function units(w: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2).toLowerCase();
    const next = w[i + 2]?.toLowerCase() ?? '';
    if (two === 'ch' || two === 'll' || two === 'rr') { out.push(w.slice(i, i + 2)); i++; continue; }
    if ((two === 'qu' || two === 'gu') && 'eéií'.includes(next)) { out.push(w.slice(i, i + 2)); i++; continue; }
    out.push(w[i]);
  }
  return out;
}
const unitIsVowel = (u: string, i: number, all: string[]) => {
  const c = u.toLowerCase();
  if (c.length !== 1) return false;
  if (c === 'y') return i === all.length - 1 && i > 0; // final y sounds like i (rey, muy)
  return isVowel(c);
};

/** Syllables of a single word, e.g. "zanahoria" -> ["za", "na", "ho", "ria"]. */
export function syllabify(word: string): string[] {
  const u = units(word);
  const v = u.map((x, i) => unitIsVowel(x, i, u));
  // Nuclei: runs of vowels, split between two strong vowels or at an accented weak vowel next to another vowel.
  const breaks = new Set<number>(); // break before unit index
  for (let i = 1; i < u.length; i++) {
    if (v[i] && v[i - 1]) {
      const a = u[i - 1].toLowerCase(), b = u[i].toLowerCase();
      if (isStrong(a) && isStrong(b)) breaks.add(i);
    }
  }
  // Consonant clusters between vowels.
  let i = 0;
  while (i < u.length && !v[i]) i++;
  while (i < u.length) {
    while (i < u.length && v[i]) i++;
    const start = i;
    while (i < u.length && !v[i]) i++;
    if (i >= u.length) break; // trailing consonants stay with the last syllable
    const n = i - start;
    const pair = (k: number) => (u[k] + u[k + 1]).toLowerCase();
    if (n === 1) breaks.add(start);
    else if (n === 2) breaks.add(INSEPARABLE.has(pair(start)) && u[start].length === 1 && u[start + 1].length === 1 ? start : start + 1);
    else if (n >= 3) breaks.add(INSEPARABLE.has(pair(i - 2)) ? i - 2 : i - 1);
  }
  const out: string[] = [];
  let cur = '';
  u.forEach((x, k) => { if (breaks.has(k) && cur) { out.push(cur); cur = ''; } cur += x; });
  if (cur) out.push(cur);
  return out;
}

/** The word with soft hyphens where it may wrap (never leaving one letter alone at either end). */
export function softHyphenate(text: string): string {
  return text.split(' ').map((w) => {
    const s = syllabify(w);
    // Do not break a line between two vowels (hiatus): typographic convention (to-a-lla wraps as toa-lla).
    for (let k = s.length - 1; k > 0; k--) if (isVowel(s[k - 1].slice(-1).toLowerCase()) && isVowel(s[k][0].toLowerCase())) s.splice(k - 1, 2, s[k - 1] + s[k]);
    if (s.length > 1 && s[0].length === 1) s.splice(0, 2, s[0] + s[1]);
    if (s.length > 1 && s[s.length - 1].length === 1) s.splice(s.length - 2, 2, s[s.length - 2] + s[s.length - 1]);
    return s.join('­');
  }).join(' ');
}

/** Points where a word may break, as [before, after] pairs (for measuring). */
export function breakOptions(word: string): [string, string][] {
  const parts = softHyphenate(word).split('­');
  return parts.slice(1).map((_, k) => [parts.slice(0, k + 1).join(''), parts.slice(k + 1).join('')]);
}
