/**
 * Pet loader. All pets share one rig (public/assets/pets/rig.json): canvas 200x240,
 * anchors in canvas pixels, items placed by anchor and scaled by headWidth/100.
 * Moods that are not drawn yet fall back to `calma`. There is no sad, sick or hungry mood.
 */
import { h } from '../ui/h';
import { art, artEl, artEntry, assetUrl, hasArt } from '../ui/art';

export const PET_IDS = ['cat', 'dog', 'dragon', 'raven', 'fox'] as const;
export type PetId = (typeof PET_IDS)[number] | 'brote';
export const MOODS = ['calma', 'alegria', 'siesta', 'comiendo', 'animando', 'pensando'] as const;
export type Mood = (typeof MOODS)[number];
export type Anchor = 'head-top' | 'face' | 'neck' | 'back' | 'feet' | 'top-extra';

export interface RigPet { name_es: string; headWidth: number; anchors: Record<Anchor, [number, number]> }
export interface Rig { moods: string[]; pets: Record<string, RigPet> }

export const CANVAS = { w: 200, h: 240 } as const;
let rig: Rig = { moods: [], pets: {} };
let rigPromise: Promise<Rig> | null = null;

export function setRig(r: Rig): void { rig = r; }
export function loadRig(): Promise<Rig> {
  rigPromise ??= fetch(assetUrl('pets/rig.json')).then((r) => r.json()).then((r: Rig) => (rig = r)).catch(() => rig);
  return rigPromise;
}
export const rigFor = (pet: PetId): RigPet | undefined => rig.pets[pet];
export const petName = (pet: PetId): string => rig.pets[pet]?.name_es ?? pet;

/** The art id for a pet in a mood, falling back to calma when that mood is not drawn. */
export function petArtId(pet: PetId, mood: Mood = 'calma'): string {
  const id = `pet.${pet}.${mood}`;
  return hasArt(id) ? id : `pet.${pet}.calma`;
}

/** Where an item sits on a pet, as a fraction of the 200x240 canvas, plus its scale. */
export function itemPlacement(pet: PetId, itemId: string): { x: number; y: number; scale: number; z: number } | null {
  const p = rig.pets[pet];
  const item = artEntry(itemId);
  if (!p || !item?.anchor) return null;
  const anchor = p.anchors[item.anchor as Anchor];
  if (!anchor) return null;
  const scale = p.headWidth / 100;
  const [px, py] = item.pivot ?? [CANVAS.w / 2, CANVAS.h / 2];
  return { x: anchor[0] - px * scale, y: anchor[1] - py * scale, scale, z: item.z ?? 10 };
}

/**
 * A pet with optional items. The pet sits in a fixed 200:240 box; images of any aspect
 * ratio are contained inside it, so replacement art with different proportions still fits.
 */
export function PetFigure(o: { pet: PetId; mood?: Mood; items?: string[]; label?: string; class?: string }): HTMLElement {
  const id = petArtId(o.pet, o.mood);
  const fig = h('figure', { class: `k-pet ${o.class ?? ''}`, 'data-pet': o.pet, 'data-mood': o.mood ?? 'calma' });
  fig.append(artEl(id, { class: 'k-pet__body', alt: o.label ?? art(id).alt }));
  for (const itemId of o.items ?? []) {
    const pl = itemPlacement(o.pet, itemId);
    if (!pl) continue;
    const el = artEl(itemId, { decorative: true, class: 'k-pet__item' });
    (el as HTMLElement).style.transform = `translate(${(pl.x / CANVAS.w) * 100}%, ${(pl.y / CANVAS.h) * 100}%) scale(${pl.scale})`;
    (el as HTMLElement).style.zIndex = String(pl.z);
    fig.append(el);
  }
  return fig;
}
