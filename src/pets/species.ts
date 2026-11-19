/**
 * Species and breeds, as data (src/data/pets/<species>.json, loaded by data.ts). Adding a breed, or a species file,
 * needs no code. No DOM and no Vite-only code here (the build validator uses it in Node).
 * A pet profile stores its species, breed, colours, pattern and name; parts can override the breed's parts.
 */

export type ColorSlot = 'fur1' | 'fur2' | 'fur3' | 'eyes' | 'nose';
export const COLOR_SLOTS: ColorSlot[] = ['fur1', 'fur2', 'fur3', 'eyes', 'nose'];
export type PetColors = Record<ColorSlot, string>;
export type Mood3 = 'calma' | 'alegria' | 'siesta';
export const PET_MOODS: Mood3[] = ['calma', 'alegria', 'siesta'];
/** Clothing slots on the rig (items sit on these anchors, scaled by headWidth / 100). */
export const ANCHORS = ['head', 'face', 'neck', 'body', 'feet', 'back'] as const;
export type AnchorName = (typeof ANCHORS)[number];

export interface Swatch { c: string; es: string; inv?: boolean }
export interface PetRig { headWidth: number; anchors: Record<AnchorName, [number, number]> }
export interface Breed {
  id: string; name_es: string;
  parts: Record<string, string>;
  colors: PetColors;
  pattern: string; patterns: string[];
  rig?: { headWidth?: number; anchors?: Partial<Record<AnchorName, [number, number]>> };
}
export interface Species {
  species: string; name_es: string; default: string; noseLabel?: string;
  layers: string[]; slots: ColorSlot[];
  rig: PetRig;
  swatches: { fur: Swatch[]; furFantasy: Swatch[]; eyes: Swatch[]; eyesFantasy: Swatch[]; nose: Swatch[]; noseFantasy: Swatch[] };
  breeds: Breed[];
}
export interface PatternDef { name_es: string; es?: string; g?: 'm' | 'f' | 'mp' | 'fp'; art?: boolean; vars?: Record<string, string> }

export interface PetProfile {
  id: string; species: string; breed: string;
  /** part overrides by slot (empty: the breed's parts) */
  parts: Record<string, string>;
  colors: PetColors; pattern: string; name: string; createdAt: number;
}

/** Loaded species, in a fixed order (the order of the creator). */
export const SPECIES_ORDER = ['dog', 'cat', 'fox', 'raven', 'dragon'];
let SPECIES: Species[] = [];
let PATTERNS: Record<string, PatternDef> = {};
export function setPetData(species: Species[], patterns: Record<string, PatternDef>): void {
  SPECIES = [...species].sort((a, b) => (SPECIES_ORDER.indexOf(a.species) + 1 || 99) - (SPECIES_ORDER.indexOf(b.species) + 1 || 99));
  PATTERNS = patterns;
}

/** Loads species and patterns from parsed JSON files (src/data/pets/*.json). */
export function loadPetFiles(files: Record<string, unknown>[]): void {
  setPetData(files.filter((f) => Array.isArray(f.breeds)) as unknown as Species[], (files.find((f) => f.patterns)?.patterns ?? {}) as Record<string, PatternDef>);
}
/** Art id of a part: "shared.shadow" -> pet-part.shared.shadow, "body-long" -> pet-part.dog.body-long. */
export const partId = (species: string, part: string) => (part.includes('.') ? `pet-part.${part}` : `pet-part.${species}.${part}`);

export const allSpecies = (): Species[] => SPECIES;
export const patterns = (): Record<string, PatternDef> => PATTERNS;
export const speciesById = (id: string): Species | undefined => SPECIES.find((s) => s.species === id);
export const breedOf = (sp: Species, id: string): Breed | undefined => sp.breeds.find((b) => b.id === id);
export const defaultBreed = (sp: Species): Breed => breedOf(sp, sp.default) ?? sp.breeds[0];

/** The pet's rig: the species rig adjusted by the breed (headWidth, anchor offsets). */
export function rigOf(p: Pick<PetProfile, 'species' | 'breed'>): PetRig | null {
  const sp = speciesById(p.species);
  const br = sp && breedOf(sp, p.breed);
  if (!sp || !br) return null;
  const anchors = { ...sp.rig.anchors };
  for (const [k, off] of Object.entries(br.rig?.anchors ?? {})) {
    const a = anchors[k as AnchorName];
    if (a && off) anchors[k as AnchorName] = [a[0] + off[0], a[1] + off[1]];
  }
  return { headWidth: br.rig?.headWidth ?? sp.rig.headWidth, anchors };
}

/** A new profile with the breed's defaults (name: the breed name). */
export function makeProfile(species: string, breed?: string, id = `pet-${Date.now().toString(36)}`): PetProfile {
  const sp = speciesById(species)!;
  const br = (breed && breedOf(sp, breed)) || defaultBreed(sp);
  return { id, species: sp.species, breed: br.id, parts: {}, colors: { ...br.colors }, pattern: br.pattern, name: br.name_es, createdAt: Date.now() };
}

export const furSwatches = (sp: Species): Swatch[] => [...sp.swatches.fur, ...sp.swatches.furFantasy];
export function swatchesFor(sp: Species, slot: ColorSlot): { natural: Swatch[]; fantasy: Swatch[] } {
  if (slot === 'eyes') return { natural: sp.swatches.eyes, fantasy: sp.swatches.eyesFantasy };
  if (slot === 'nose') return { natural: sp.swatches.nose, fantasy: sp.swatches.noseFantasy };
  return { natural: sp.swatches.fur, fantasy: sp.swatches.furFantasy };
}

/* ---------------- Description for screen readers ---------------- */
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** The Spanish name of a colour: the swatch with that value, or the nearest one. */
export function colorName(sp: Species, hex: string, slot: ColorSlot = 'fur1'): Swatch {
  const { natural, fantasy } = swatchesFor(sp, slot);
  const all = [...natural, ...fantasy];
  const exact = all.find((s) => s.c.toLowerCase() === hex.toLowerCase());
  if (exact) return exact;
  const [r, g, b] = hexRgb(hex);
  return all.reduce((best, s) => { const [r2, g2, b2] = hexRgb(s.c); const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2; return d < best.d ? { s, d } : best; }, { s: all[0], d: Infinity }).s;
}
const plural = (w: string) => /[aeiou]$/.test(w) ? `${w}s` : /z$/.test(w) ? `${w.slice(0, -1)}ces` : /ón$/.test(w) ? `${w.slice(0, -2)}ones` : `${w}es`;
/** A colour adjective agreeing with a noun (m, f, mp, fp); invariable names stay as they are. */
export function agree(s: Swatch, g: 'm' | 'f' | 'mp' | 'fp'): string {
  if (s.inv || g === 'm') return s.es;
  const fem = g === 'f' || g === 'fp' ? s.es.replace(/o$/, 'a') : s.es;
  return g === 'mp' || g === 'fp' ? plural(fem) : fem;
}
/** "Perro Salchicha, marrón con manchas blancas" */
export function describePet(p: PetProfile): string {
  const sp = speciesById(p.species);
  const br = sp && breedOf(sp, p.breed);
  if (!sp || !br) return p.name;
  const main = colorName(sp, p.colors.fur1).es;
  const pat = PATTERNS[p.pattern];
  const extra = pat?.es && pat.g ? ` con ${pat.es} ${agree(colorName(sp, p.colors.fur3), pat.g)}` : '';
  return `${sp.name_es} ${br.name_es}, ${main}${extra}`;
}

/* ---------------- "Sorpréndeme" ---------------- */
const pick = <T>(a: T[], r: () => number): T => a[Math.floor(r() * a.length)];
/** A random breed of the species with random colours from its swatches (mostly natural) and an allowed pattern. */
export function surprise(species: string, base: PetProfile | null = null, r: () => number = Math.random): PetProfile {
  const sp = speciesById(species)!;
  const br = pick(sp.breeds, r);
  const fur = () => (r() < 0.2 && sp.swatches.furFantasy.length ? pick(sp.swatches.furFantasy, r) : pick(sp.swatches.fur, r)).c;
  const fur1 = fur();
  let fur2 = fur(), fur3 = fur();
  for (let i = 0; i < 8 && fur2 === fur1; i++) fur2 = fur();
  for (let i = 0; i < 8 && (fur3 === fur1 || fur3 === fur2); i++) fur3 = fur();
  const colors: PetColors = {
    fur1, fur2, fur3,
    eyes: (r() < 0.15 && sp.swatches.eyesFantasy.length ? pick(sp.swatches.eyesFantasy, r) : pick(sp.swatches.eyes, r)).c,
    nose: pick(sp.swatches.nose, r).c,
  };
  const p = base ? { ...base } : makeProfile(sp.species, br.id);
  return { ...p, species: sp.species, breed: br.id, parts: {}, colors, pattern: pick(br.patterns, r), name: base && base.name !== breedName(base) ? base.name : br.name_es };
}
const breedName = (p: PetProfile) => { const sp = speciesById(p.species); return (sp && breedOf(sp, p.breed)?.name_es) ?? ''; };

/** Is this a valid profile for the loaded data (known species and breed, colours from the swatches, allowed pattern)? */
export function profileProblems(p: PetProfile): string[] {
  const out: string[] = [];
  const sp = speciesById(p.species);
  const br = sp && breedOf(sp, p.breed);
  if (!sp) return [`unknown species ${p.species}`];
  if (!br) return [`unknown breed ${p.breed}`];
  if (!br.patterns.includes(p.pattern)) out.push(`pattern ${p.pattern} not allowed for ${br.id}`);
  for (const slot of COLOR_SLOTS) {
    const { natural, fantasy } = swatchesFor(sp, slot);
    if (!/^#[0-9a-fA-F]{6}$/.test(p.colors[slot] ?? '')) out.push(`${slot} is not a colour`);
    else if (sp.slots.includes(slot) && ![...natural, ...fantasy].some((s) => s.c.toLowerCase() === p.colors[slot].toLowerCase())) out.push(`${slot} ${p.colors[slot]} is not a swatch`);
  }
  return out;
}
