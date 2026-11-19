/**
 * Brote (the app mascot, not a selectable pet) is a single drawing per mood on the shared rig
 * (public/assets/pets/rig.json). The learner's pets are built from parts: see species.ts and compose.ts.
 * Moods that are not drawn yet fall back to `calma`. There is no sad, sick or hungry mood.
 */
import { h } from '../ui/h';
import { art, artEl, assetUrl, hasArt } from '../ui/art';
import { placeItem } from './compose';
import type { AnchorName } from './species';

export const MOODS = ['calma', 'alegria', 'siesta', 'comiendo', 'animando', 'pensando'] as const;
export type Mood = (typeof MOODS)[number];
export type PetId = 'brote';

export interface RigPet { name_es: string; headWidth: number; anchors: Record<AnchorName, [number, number]> }
export interface Rig { moods: string[]; slots?: string[]; pets: Record<string, RigPet>; companions?: unknown }

export const CANVAS = { w: 200, h: 240 } as const;
let rig: Rig = { moods: [], pets: {} };
let rigPromise: Promise<Rig> | null = null;

export function setRig(r: Rig): void { rig = r; }
export function loadRig(): Promise<Rig> {
  rigPromise ??= fetch(assetUrl('pets/rig.json')).then((r) => r.json()).then((r: Rig) => (rig = r)).catch(() => rig);
  return rigPromise;
}
export const rigFor = (pet: PetId): RigPet | undefined => rig.pets[pet];

/** The art id for Brote in a mood, falling back to calma when that mood is not drawn. */
export function petArtId(pet: PetId, mood: Mood = 'calma'): string {
  const id = `pet.${pet}.${mood}`;
  return hasArt(id) ? id : `pet.${pet}.calma`;
}

/** Where an item sits on Brote, as canvas px, plus its scale. */
export function itemPlacement(pet: PetId, itemId: string): { x: number; y: number; scale: number; z: number } | null {
  const p = rig.pets[pet];
  return p ? placeItem(p, itemId) : null;
}

/** Brote with optional items, in a fixed 200:240 box. */
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
