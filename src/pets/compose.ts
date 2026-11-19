/**
 * Shows a pet built from its parts (markup.ts) at runtime: loads and caches the part files and the composed
 * markup per breed, parts, pattern and mood. Colours are CSS variables on the figure, so a recolour costs nothing.
 */
import { h } from '../ui/h';
import { artEl, artEntry, assetUrl } from '../ui/art';
import './data';
import { describePet, partId, rigOf, type AnchorName, type Mood3, type PetProfile } from './species';
import { colorVars, composeMarkup, moodPartId, partIdsFor } from './markup';

export { partId, colorVars, composeMarkup, moodPartId, partIdsFor };

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
    // Clothes load with the pet: a lazy image inside a transformed layer may never be judged "near the viewport".
    if (el instanceof HTMLImageElement) el.loading = 'eager';
    el.style.transform = `translate(${(pl.x / 200) * 100}%, ${(pl.y / 240) * 100}%) scale(${pl.scale})`;
    el.style.zIndex = String(pl.z);
    fig.append(el);
  }
  (fig as HTMLElement & { setMood?: (m: Mood3) => void }).setMood = (m: Mood3) => { if (ids.every((id) => partText.has(id))) draw(m); };
  return fig;
}
export type PetPortraitEl = HTMLElement & { setMood?: (m: Mood3) => void };
