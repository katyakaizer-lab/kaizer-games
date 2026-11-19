/**
 * Builds a pet from its parts at runtime: one inline SVG on the shared 200x240 rig, layers in the species'
 * order, pattern overlays clipped to body and head (with the outlines drawn again on top), and moods that swap
 * only eyes and mouth (a missing mood falls back to calma). Colours are CSS variables on the root SVG, so a
 * recolour costs nothing; the structure is cached per breed, parts, pattern and mood.
 */
import { h } from '../ui/h';
import { artEl, artEntry, assetUrl } from '../ui/art';
import './data';
import { breedOf, describePet, partId, patterns, rigOf, speciesById, type AnchorName, type Mood3, type PetProfile } from './species';

export { partId };

const PART_RE = /<g data-slot[\s\S]*<\/g>/;
const innerOf = (g: string) => g.replace(/^<g[^>]*>/, '').replace(/<\/g>$/, '');

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
  const parts = { ...br.parts, ...p.parts };
  const ids = new Set<string>();
  for (const [slot, part] of Object.entries(parts)) {
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
  const parts = { ...br.parts, ...p.parts };
  const g = (slot: string): string => {
    const part = parts[slot];
    if (!part) return '';
    const id = slot === 'eyes' || slot === 'mouth' ? moodPartId(sp.species, part, mood, has) : partId(sp.species, part);
    return getPart(id)?.match(PART_RE)?.[0] ?? '';
  };
  const body = g('body'), head = g('head');
  const pat = patterns()[p.pattern];
  const layers = sp.layers.map((slot) => {
    if (slot !== 'pattern') return g(slot);
    if (!pat?.art) return '';
    const overlay = getPart(`pet-part.pattern.${p.pattern}`)?.match(PART_RE)?.[0] ?? '';
    if (!overlay) return '';
    // The overlay is clipped to body and head; then their outlines are drawn again so the pattern never covers them.
    return `<g clip-path="url(#kpc__UID__)" stroke="none">${overlay}</g><g class="k-oo">${body}${head}</g>`;
  }).join('');
  const clip = pat?.art ? `<defs><clipPath id="kpc__UID__">${innerOf(body)}${innerOf(head)}</clipPath></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" class="k-pet__svg" data-art-kind="pet" focusable="false">${clip}<g>${layers}</g></svg>`;
}

/** CSS variables for a profile's colours (and the pattern's own variables, e.g. socks colour the feet). */
export function colorVars(p: Pick<PetProfile, 'colors' | 'pattern'>): Record<string, string> {
  const v: Record<string, string> = { '--fur-1': p.colors.fur1, '--fur-2': p.colors.fur2, '--fur-3': p.colors.fur3, '--eyes': p.colors.eyes, '--nose': p.colors.nose };
  return { ...v, ...(patterns()[p.pattern]?.vars ?? {}) };
}

/* ---------------- Loading and caching (browser) ---------------- */
const partText = new Map<string, string>();
const partLoad = new Map<string, Promise<void>>();
const markupCache = new Map<string, string>();
let uid = 0;
const hasPart = (id: string) => !!artEntry(id)?.files?.['1x'];

/** Loads the part files a profile needs (cached). */
export function loadParts(ids: string[]): Promise<void> {
  return Promise.all(ids.map((id) => {
    if (partText.has(id)) return Promise.resolve();
    let pr = partLoad.get(id);
    if (!pr) {
      const file = artEntry(id)?.files?.['1x'];
      pr = file ? fetch(assetUrl(file)).then((r) => (r.ok ? r.text() : '')).then((t) => { partText.set(id, t); }).catch(() => { partText.set(id, ''); }) : Promise.resolve();
      partLoad.set(id, pr);
    }
    return pr;
  })).then(() => undefined);
}
/** For tests: provide part texts directly. */
export function setPartTexts(texts: Record<string, string>): void { for (const [k, v] of Object.entries(texts)) partText.set(k, v); markupCache.clear(); }

function cachedMarkup(p: PetProfile, mood: Mood3): string {
  const key = `${p.species}|${p.breed}|${JSON.stringify(p.parts)}|${p.pattern}|${mood}`;
  let m = markupCache.get(key);
  if (m === undefined) { m = composeMarkup(p, mood, (id) => partText.get(id), (id) => hasPart(id) && partText.get(id) !== ''); markupCache.set(key, m); }
  return m;
}

/** Where an item sits on a pet (rig anchor, scaled by headWidth / 100), as canvas px. */
export function placeItem(rig: { headWidth: number; anchors: Partial<Record<string, [number, number]>> }, itemId: string): { x: number; y: number; scale: number; z: number } | null {
  const item = artEntry(itemId);
  if (!item?.anchor) return null;
  const name = ANCHOR_ALIAS[item.anchor] ?? item.anchor;
  const anchor = rig.anchors[name];
  if (!anchor) return null;
  const scale = rig.headWidth / 100;
  const [px, py] = item.pivot ?? [100, 120];
  return { x: anchor[0] - px * scale, y: anchor[1] - py * scale, scale, z: item.z ?? 10 };
}
/** Older anchor names still accepted. */
export const ANCHOR_ALIAS: Record<string, AnchorName> = { 'head-top': 'head', 'top-extra': 'head' };

/**
 * A pet built from parts, with optional items and a mood. Returns at once; the drawing appears when the parts
 * are loaded (instantly when cached). The accessible name is the generated description unless a label is given.
 */
export function PetPortrait(o: { pet: PetProfile; mood?: Mood3; items?: string[]; label?: string; decorative?: boolean; class?: string }): HTMLElement {
  const mood = o.mood ?? 'calma';
  const fig = h('figure', { class: `k-pet ${o.class ?? ''}`, 'data-pet': o.pet.species, 'data-breed': o.pet.breed, 'data-mood': mood });
  if (o.decorative) fig.setAttribute('aria-hidden', 'true');
  else { fig.setAttribute('role', 'img'); fig.setAttribute('aria-label', o.label ?? `${o.pet.name}: ${describePet(o.pet)}`); }
  for (const [k, v] of Object.entries(colorVars(o.pet))) fig.style.setProperty(k, v);
  const body = h('div', { class: 'k-pet__body', 'aria-hidden': 'true' });
  fig.append(body);
  const draw = (m: Mood3) => { body.innerHTML = cachedMarkup(o.pet, m).replace(/__UID__/g, String(++uid)); fig.dataset.mood = m; };
  const ids = partIdsFor(o.pet);
  if (ids.every((id) => partText.has(id))) draw(mood);
  else void loadParts(ids).then(() => draw(mood));
  const rig = rigOf(o.pet);
  for (const itemId of o.items ?? []) {
    const pl = rig && placeItem(rig, itemId);
    if (!pl) continue;
    const el = artEl(itemId, { decorative: true, class: 'k-pet__item' }) as HTMLElement;
    el.style.transform = `translate(${(pl.x / 200) * 100}%, ${(pl.y / 240) * 100}%) scale(${pl.scale})`;
    el.style.zIndex = String(pl.z);
    fig.append(el);
  }
  (fig as HTMLElement & { setMood?: (m: Mood3) => void }).setMood = (m: Mood3) => { if (ids.every((id) => partText.has(id))) draw(m); };
  return fig;
}
export type PetPortraitEl = HTMLElement & { setMood?: (m: Mood3) => void };
