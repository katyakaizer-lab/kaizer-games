/**
 * Rules for the pet data (src/data/pets/*.json) and parts. Used by tools/validate-pets.ts (build) and the tests.
 * - every breed has the required layers (shadow, body, head, eyes, mouth), and every part id resolves to a file
 *   (eyes and mouth at least in calma); parts keep ink outlines;
 * - outlines stay visible on both themes (ink against the day background, and against the light halo pets get
 *   on the night theme), and a breed's default colours are swatches of its species;
 * - breed names are unique within a species; patterns exist; rig anchors use the clothing slots;
 * - locked colours and limited choices are swatches and agree with the breed's defaults;
 * - no floating parts: head, ears, tail (and wings, feet, arms, horns) touch or overlap what they hang on;
 * - patterns stay inside their part: a pattern file has only per-part groups, without outlines, in its colour,
 *   and once composed every group sits inside a clipPath made of that part's fur shapes.
 */
import { contrast } from '../ui/contrast.ts';
import { ANCHORS, COLOR_SLOTS, partId, swatchesFor, type ColorSlot, type PatternDef, type Species } from './species.ts';
import { composeFrom, patternOn, patternPiece, splitPart } from './markup.ts';
import { ATTACH, MAX_GAP, gap, shapesOf } from './geometry.ts';

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
      if (br.name_f !== undefined && (!br.name_f.trim() || /^(el|la|los|las|un|una)\s/i.test(br.name_f))) errors.push(`${b}: name_f must be a name without an article`);
      if (br.name_f && (sp.breedIsNoun || !sp.name_f)) errors.push(`${b}: name_f needs a species with a feminine noun (birds are epicene: "hembra")`);
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
      // Locked colours and limited choices: real swatches, and the defaults agree with them.
      const isSwatch = (slot: ColorSlot, c: string) => { const { natural, fantasy } = swatchesFor(sp, slot); return [...natural, ...fantasy].some((s) => s.c.toLowerCase() === c.toLowerCase()); };
      for (const [slot, c] of Object.entries(br.lockedColors ?? {}) as [ColorSlot, string][]) {
        if (!COLOR_SLOTS.includes(slot)) { errors.push(`${b}: lockedColors has unknown slot ${slot}`); continue; }
        if (!isSwatch(slot, c)) errors.push(`${b}: locked ${slot} ${c} is not a ${sp.species} swatch`);
        if (br.colors?.[slot]?.toLowerCase() !== c.toLowerCase()) errors.push(`${b}: default ${slot} must equal its locked colour ${c}`);
      }
      for (const [slot, list] of Object.entries(br.colorChoices ?? {}) as [ColorSlot, string[]][]) {
        if (!COLOR_SLOTS.includes(slot)) { errors.push(`${b}: colorChoices has unknown slot ${slot}`); continue; }
        if (br.lockedColors?.[slot]) errors.push(`${b}: ${slot} is both locked and limited`);
        if (!list.length) errors.push(`${b}: colorChoices ${slot} is empty`);
        for (const c of list) if (!isSwatch(slot, c)) errors.push(`${b}: choice ${slot} ${c} is not a ${sp.species} swatch`);
        if (!list.some((c) => c.toLowerCase() === br.colors?.[slot]?.toLowerCase())) errors.push(`${b}: default ${slot} is not one of its choices`);
      }
      // Attached parts: head, ears, tail (and wings, feet, arms, horns) touch or overlap what they hang on.
      const shapes = (slot: string) => { const part = br.parts[slot]; if (!part) return null; const tx = o.partText(partId(sp.species, part)); return tx ? shapesOf(tx) : null; };
      for (const [slot, to] of ATTACH) {
        const a = shapes(slot);
        if (!a) continue;
        const gaps = to.map((t) => { const s = shapes(t); return s ? gap(a, s) : Infinity; });
        const g = Math.min(...gaps);
        if (g > MAX_GAP && g !== Infinity) errors.push(`${b}: ${slot} floats ${g.toFixed(1)}px away from the ${to.join(' or ')}; it must touch or overlap`);
      }
      // Patterns stay inside their part: every pattern group is drawn inside a clipPath made of that part's fur.
      for (const pid of br.patterns) {
        const pd = patterns[pid];
        if (!pd?.art) continue;
        const has = (id: string) => o.partText(id) !== undefined;
        const m = composeFrom(sp, br, { parts: {}, pattern: pid }, pd, 'calma', o.partText, has);
        const file = o.partText(`pet-part.pattern.${pid}`) ?? '';
        let drawn = 0;
        for (const [, on] of file.matchAll(/<g data-on="([a-z]+)">/g)) {
          if (!patternOn(br).includes(on) || !br.parts[on]) continue;
          const fur = splitPart(o.partText(partId(sp.species, br.parts[on]))?.match(/<g data-slot[\s\S]*<\/g>/)?.[0] ?? '').fur.join('');
          const clipOk = fur && m.includes(`<clipPath id="kpc-${on}__UID__">${fur}</clipPath>`);
          const wrapOk = m.includes(`<g class="k-pat" data-on="${on}" clip-path="url(#kpc-${on}__UID__)" stroke="none">${patternPiece(file, on)}</g>`);
          if (!clipOk || !wrapOk) errors.push(`${b}: pattern ${pid} (${on}) is not inside a clipPath of the ${on}`);
          drawn++;
        }
        if (!drawn) errors.push(`${b}: pattern ${pid} draws nothing on this breed`);
      }
    }
  }
  // Pattern files: only groups per part (no loose shapes, which would not be clipped), drawn in the pattern's colour.
  for (const [id, pd] of Object.entries(patterns)) {
    if (pd.color && !COLOR_SLOTS.includes(pd.color)) errors.push(`pattern ${id}: unknown colour slot ${pd.color}`);
    if (!pd.art) continue;
    const file = o.partText(`pet-part.pattern.${id}`);
    if (file === undefined) continue;
    const inner = file.match(/<g data-slot[^>]*>([\s\S]*)<\/g>/)?.[1] ?? '';
    const loose = inner.replace(/<g data-on="[a-z]+">[\s\S]*?<\/g>/g, '').trim();
    if (loose) errors.push(`pattern ${id}: every shape must be inside a <g data-on="part"> group`);
    if (!/<g data-on=/.test(inner)) errors.push(`pattern ${id}: has no part groups`);
    if (/\sstroke="#/.test(file)) errors.push(`pattern ${id}: markings have no outline`);
    const n = (pd.color ?? 'fur3').replace('fur', '');
    for (const [, k] of file.matchAll(/class="([^"]*)"/g)) for (const c of k.split(/\s+/)) if (/^[fs]\d$/.test(c) && c.slice(1) !== n) errors.push(`pattern ${id}: class ${c} does not match its colour ${pd.color ?? 'fur3'}`);
  }
  for (const [id, pd] of Object.entries(patterns)) if (id !== 'none' && (!pd.es || !pd.g)) errors.push(`pattern ${id}: needs es and g for descriptions`);
  return { errors, breeds, parts: used };
}
