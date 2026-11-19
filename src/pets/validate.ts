/**
 * Rules for the pet data (src/data/pets/*.json) and parts. Used by tools/validate-pets.ts (build) and the tests.
 * - every breed has the required layers (shadow, body, head, eyes, mouth), and every part id resolves to a file
 *   (eyes and mouth at least in calma); parts keep ink outlines;
 * - outlines stay visible on both themes (ink against the day background, and against the light halo pets get
 *   on the night theme), and a breed's default colours are swatches of its species;
 * - breed names are unique within a species; patterns exist; rig anchors use the clothing slots.
 */
import { contrast } from '../ui/contrast.ts';
import { ANCHORS, COLOR_SLOTS, partId, swatchesFor, type PatternDef, type Species } from './species.ts';

export const REQUIRED_LAYERS = ['shadow', 'body', 'head', 'eyes', 'mouth'];
export const MIN_OUTLINE = 3;

export interface PetValidation { errors: string[]; breeds: number; parts: Set<string> }

export function validatePets(
  species: Species[], patterns: Record<string, PatternDef>,
  o: { partText: (id: string) => string | undefined; backgrounds: Record<string, string>; ink: string },
): PetValidation {
  const errors: string[] = [];
  const used = new Set<string>();
  let breeds = 0;
  for (const [theme, bg] of Object.entries(o.backgrounds)) {
    const c = contrast(o.ink, bg);
    if (c < MIN_OUTLINE) errors.push(`outline ink ${o.ink} has ${c.toFixed(2)}:1 against ${theme}; needs ${MIN_OUTLINE}:1`);
  }
  const ids = new Set<string>();
  for (const sp of species) {
    const w = `species ${sp.species}`;
    if (ids.has(sp.species)) errors.push(`${w}: repeats`);
    ids.add(sp.species);
    if (!sp.name_es) errors.push(`${w}: needs name_es`);
    for (const a of ANCHORS) if (!sp.rig?.anchors?.[a]) errors.push(`${w}: rig needs anchor ${a}`);
    if (!(sp.rig?.headWidth > 0)) errors.push(`${w}: rig needs headWidth`);
    for (const l of REQUIRED_LAYERS) if (!sp.layers.includes(l)) errors.push(`${w}: layers must include ${l}`);
    if (!sp.layers.includes('pattern')) errors.push(`${w}: layers must include pattern`);
    for (const s of sp.slots) if (!COLOR_SLOTS.includes(s)) errors.push(`${w}: unknown colour slot ${s}`);
    for (const [k, list] of Object.entries(sp.swatches)) for (const s of list) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(s.c)) errors.push(`${w}: swatch ${k} ${s.c} is not #RRGGBB`);
      if (!s.es?.trim()) errors.push(`${w}: swatch ${s.c} needs a Spanish name`);
    }
    if (!sp.breeds.some((b) => b.id === sp.default)) errors.push(`${w}: default breed ${sp.default} does not exist`);
    const names = new Set<string>(), bids = new Set<string>();
    for (const br of sp.breeds) {
      breeds++;
      const b = `${w} breed ${br.id}`;
      if (!/^[a-z0-9-]+$/.test(br.id)) errors.push(`${b}: id must be small letters, digits or -`);
      if (bids.has(br.id)) errors.push(`${b}: id repeats`);
      bids.add(br.id);
      const n = br.name_es?.trim().toLocaleLowerCase('es');
      if (!n) errors.push(`${b}: needs name_es`);
      else if (names.has(n)) errors.push(`${b}: name "${br.name_es}" repeats in ${sp.species}`);
      names.add(n ?? '');
      if (/^(el|la|los|las|un|una)\s/i.test(br.name_es ?? '')) errors.push(`${b}: name without an article`);
      for (const l of REQUIRED_LAYERS) if (!br.parts[l]) errors.push(`${b}: missing required layer ${l}`);
      for (const [slot, part] of Object.entries(br.parts)) {
        if (!sp.layers.includes(slot)) errors.push(`${b}: slot ${slot} is not in the species layers`);
        const id = slot === 'eyes' || slot === 'mouth' ? `${partId(sp.species, part)}.calma` : partId(sp.species, part);
        const text = o.partText(id);
        used.add(id);
        if (text === undefined) { errors.push(`${b}: part ${id} does not resolve (not in the manifest or no file)`); continue; }
        if (!new RegExp(`<g data-slot[^>]*stroke="${o.ink}"`, 'i').test(text)) errors.push(`${b}: part ${id} must keep ink outlines`);
        if ((slot === 'body' || slot === 'head') && /<g data-slot[^>]*>[\s\S]*<g/.test(text)) errors.push(`${b}: part ${id} must be plain shapes (it clips patterns)`);
        if (slot === 'eyes' || slot === 'mouth') for (const m of ['alegria', 'siesta']) { const mid = `${partId(sp.species, part)}.${m}`; if (o.partText(mid) !== undefined) used.add(mid); }
      }
      if (!br.patterns.includes(br.pattern)) errors.push(`${b}: default pattern ${br.pattern} is not in its patterns`);
      for (const pid of br.patterns) {
        const pd = patterns[pid];
        if (!pd) { errors.push(`${b}: unknown pattern ${pid}`); continue; }
        if (pd.art) { const id = `pet-part.pattern.${pid}`; used.add(id); if (o.partText(id) === undefined) errors.push(`${b}: pattern part ${id} does not resolve`); }
      }
      for (const slot of COLOR_SLOTS) {
        const c = br.colors?.[slot];
        if (!/^#[0-9A-Fa-f]{6}$/.test(c ?? '')) { errors.push(`${b}: default colour ${slot} is not #RRGGBB`); continue; }
        const { natural, fantasy } = swatchesFor(sp, slot);
        if (sp.slots.includes(slot) && ![...natural, ...fantasy].some((s) => s.c.toLowerCase() === c.toLowerCase())) errors.push(`${b}: default ${slot} ${c} is not one of the ${sp.species} swatches`);
      }
      for (const a of Object.keys(br.rig?.anchors ?? {})) if (!(ANCHORS as readonly string[]).includes(a)) errors.push(`${b}: rig anchor ${a} is not a clothing slot`);
    }
  }
  for (const [id, pd] of Object.entries(patterns)) if (id !== 'none' && (!pd.es || !pd.g)) errors.push(`pattern ${id}: needs es and g for descriptions`);
  return { errors, breeds, parts: used };
}
