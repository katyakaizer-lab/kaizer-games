/**
 * The SVG markup of a pet, built from its parts (pure code: used by the app, the tests and the build validator).
 * Layers follow the species' order. A pattern is drawn per part (a <g data-on="body"> group right after the body,
 * a <g data-on="head"> group right after the head), clipped to that part's fur shapes (class f1), then the part's
 * outline is drawn again and its details (muzzle, blush) go on top. So a pattern never crosses an outline, never
 * covers eyes, nose or beak (later layers), and reaches only the parts the breed allows (default body and head).
 * Moods swap only eyes and mouth; a missing mood falls back to calma.
 */
import { breedOf, partId, patterns, speciesById, type Breed, type Mood3, type PatternDef, type PetProfile, type Species } from './species.ts';

const PART_RE = /<g data-slot[\s\S]*<\/g>/;
const SHAPE_RE = /<(?:path|ellipse|circle|rect|polygon)\b[^>]*\/>/g;
/** Parts a pattern may be drawn on when the breed does not say. */
export const PATTERN_ON = ['body', 'head'];
export const patternOn = (br: Breed): string[] => br.patternOn ?? PATTERN_ON;
/** The fur shapes (class f1) and the other shapes (details) of a part group. */
export function splitPart(g: string): { open: string; fur: string[]; details: string[] } {
  const open = g.match(/^<g[^>]*>/)?.[0] ?? '<g>';
  const shapes = g.match(SHAPE_RE) ?? [];
  const fur = shapes.filter((s) => /\sclass="f1"/.test(s));
  return { open, fur, details: shapes.filter((s) => !fur.includes(s)) };
}
/** The group of a pattern file for one part (<g data-on="body">), or ''. */
export const patternPiece = (overlay: string, part: string): string => overlay.match(new RegExp(`<g data-on="${part}">[\\s\\S]*?</g>`))?.[0] ?? '';

/** Mood parts: pet-part.dog.eyes-dot.alegria, falling back to calma. */
export function moodPartId(species: string, part: string, mood: Mood3, has: (id: string) => boolean): string {
  const id = `${partId(species, part)}.${mood}`;
  return has(id) ? id : `${partId(species, part)}.calma`;
}

/** Every part id a profile needs (all moods), for preloading and validation. */
export function partIdsFor(p: Pick<PetProfile, 'species' | 'breed' | 'parts' | 'pattern'>, moods: Mood3[] = ['calma', 'alegria', 'siesta']): string[] {
  const sp = speciesById(p.species);
  const br = sp && breedOf(sp, p.breed);
  if (!sp || !br) return [];
  const ids = new Set<string>();
  for (const [slot, part] of Object.entries({ ...br.parts, ...p.parts })) {
    if (slot === 'eyes' || slot === 'mouth') for (const m of moods) ids.add(`${partId(sp.species, part)}.${m}`);
    else ids.add(partId(sp.species, part));
  }
  if (patterns()[p.pattern]?.art) ids.add(`pet-part.pattern.${p.pattern}`);
  return [...ids];
}

/**
 * The SVG markup of a pet (without colours; "__UID__" marks ids to make unique per instance).
 * getPart returns a part file's text, or undefined if it is not loaded or missing (that layer is skipped).
 */
export function composeMarkup(p: Pick<PetProfile, 'species' | 'breed' | 'parts' | 'pattern'>, mood: Mood3, getPart: (id: string) => string | undefined, has: (id: string) => boolean): string {
  const sp = speciesById(p.species);
  const br = sp && breedOf(sp, p.breed);
  if (!sp || !br) return '';
  return composeFrom(sp, br, p, patterns()[p.pattern], mood, getPart, has);
}

/** As composeMarkup, with the species, breed and pattern given (the validator composes data it is checking). */
export function composeFrom(sp: Species, br: Breed, p: Pick<PetProfile, 'parts' | 'pattern'>, pat: PatternDef | undefined, mood: Mood3,
  getPart: (id: string) => string | undefined, has: (id: string) => boolean): string {
  const parts = { ...br.parts, ...p.parts };
  const g = (slot: string): string => {
    const part = parts[slot];
    if (!part) return '';
    const id = slot === 'eyes' || slot === 'mouth' ? moodPartId(sp.species, part, mood, has) : partId(sp.species, part);
    return getPart(id)?.match(PART_RE)?.[0] ?? '';
  };
  const overlay = pat?.art ? getPart(`pet-part.pattern.${p.pattern}`)?.match(PART_RE)?.[0] ?? '' : '';
  const on = patternOn(br);
  const defs: string[] = [];
  const layers = sp.layers.map((slot) => {
    if (slot === 'pattern') return '';
    const group = g(slot);
    const piece = overlay && on.includes(slot) ? patternPiece(overlay, slot) : '';
    if (!group || !piece) return group;
    const { open, fur, details } = splitPart(group);
    if (!fur.length) return group;
    const plain = open.replace(/\sdata-slot="[^"]*"/, '');
    const clip = `kpc-${slot}__UID__`;
    defs.push(`<clipPath id="${clip}">${fur.join('')}</clipPath>`);
    // Outlines drawn again; where a part has several fur shapes (poodle head and tuft), each outline is hidden
    // under the shapes drawn after it, as the fills hide it in the part itself.
    const outlines = fur.map((s, i) => {
      if (i === fur.length - 1) return s;
      const id = `kpm-${slot}-${i}__UID__`;
      const later = fur.slice(i + 1).map((x) => x.replace(/\sclass="[^"]*"/, '')).join('');
      defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="340"><rect x="-50" y="-50" width="300" height="340" fill="white"/><g fill="black" stroke="none">${later}</g></mask>`);
      return `<g mask="url(#${id})">${s}</g>`;
    });
    return `${open}${fur.join('')}</g>`
      + `<g class="k-pat" data-on="${slot}" clip-path="url(#${clip})" stroke="none">${piece}</g>`
      + `${plain.replace('<g', '<g class="k-oo"')}${outlines.join('')}</g>`
      + (details.length ? `${plain.replace('<g', '<g class="k-detail"')}${details.join('')}</g>` : '');
  }).join('');
  const d = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" class="k-pet__svg" data-art-kind="pet" focusable="false">${d}<g>${layers}</g></svg>`;
}

/** CSS variables for a profile's colours (and the pattern's own variables, e.g. socks colour the feet). */
export function colorVars(p: Pick<PetProfile, 'colors' | 'pattern'>): Record<string, string> {
  const v: Record<string, string> = { '--fur-1': p.colors.fur1, '--fur-2': p.colors.fur2, '--fur-3': p.colors.fur3, '--eyes': p.colors.eyes, '--nose': p.colors.nose };
  return { ...v, ...(patterns()[p.pattern]?.vars ?? {}) };
}
