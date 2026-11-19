import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publicFile, setupPage } from './helpers';
import { setManifest, type ArtEntry } from '../src/ui/art';
import { _setBackend, exportProgress, importProgress, store } from '../src/data/storage';
import { getStars } from '../src/rewards/wallet';
import {
  agree, allSpecies, breedOf, colorName, describePet, editableSlots, loadPetFiles, makeProfile, normalizeProfile, patterns, profileProblems, rigOf,
  defaultName, isDefaultName, slotChoices, speciesBreed, speciesById, surprise, type PetProfile,
} from '../src/pets/species';
import { colorVars, composeMarkup, placeItem, partIdsFor } from '../src/pets/compose';
import { validatePets } from '../src/pets/validate';
import { getActivePet, migratePets, savePet } from '../src/app/pet-state';

const files = readdirSync(join(ROOT, 'src/data/pets')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ROOT, 'src/data/pets', f), 'utf8')));
const manifest = JSON.parse(readFileSync(publicFile('assets/manifest.json'), 'utf8')).assets as ArtEntry[];
const byId = new Map(manifest.map((a) => [a.id, a]));
const partText = (id: string) => { const f = byId.get(id)?.files?.['1x']; const p = f && publicFile(`assets/${f}`); return p && existsSync(p) ? readFileSync(p, 'utf8') : undefined; };
const BG = { 'brote --bg': '#FFF4E0', 'night --art-halo': '#FFF4E0' };
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

beforeEach(() => { loadPetFiles(files); setManifest(manifest); });

describe('breed data', () => {
  it('loads the five species and the starting breeds, named exactly as agreed (no articles)', () => {
    const names = Object.fromEntries(allSpecies().map((s) => [s.name_es, s.breeds.map((b) => b.name_es)]));
    expect(names).toEqual({
      Perro: ['Salchicha', 'Pastor', 'Caniche', 'Labrador', 'Chihuahua'],
      Gato: ['Atigrado', 'Siamés', 'Persa', 'Negro', 'Carey'],
      Zorro: ['Rojo', 'Ártico', 'Fénec'],
      Pájaro: ['Cuervo', 'Urraca', 'Búho', 'Loro', 'Canario', 'Petirrojo', 'Pingüino'],
      Dragón: ['Del bosque', 'De fuego', 'De agua', 'De aire', 'Eléctrico'],
    });
  });
  it('a breed is only data: adding one needs no code', () => {
    const dog = structuredClone(files.find((f) => f.species === 'dog'));
    dog.breeds.push({ ...dog.breeds[3], id: 'mestizo', name_es: 'Mestizo' });
    loadPetFiles([...files.filter((f) => f.species !== 'dog'), dog]);
    const p = makeProfile('dog', 'mestizo');
    expect(profileProblems(p)).toEqual([]);
    expect(composeMarkup(p, 'calma', partText, (id) => !!partText(id))).toContain('data-slot="head"');
  });
  it('breed rig: species anchors plus offsets, headWidth override', () => {
    expect(rigOf({ species: 'dog', breed: 'caniche' })).toMatchObject({ headWidth: 84, anchors: { head: [100, 38] } });
    expect(rigOf({ species: 'dog', breed: 'labrador' })).toMatchObject({ headWidth: 76, anchors: { head: [100, 50] } });
  });
});

describe('validator', () => {
  it('passes the data and parts', () => {
    const r = validatePets(allSpecies(), files.find((f) => f.patterns).patterns, { partText, backgrounds: BG, ink: '#2B2D42' });
    expect(r.errors).toEqual([]);
    expect(r.breeds).toBe(25);
  });
  const broken = (f: (sp: ReturnType<typeof allSpecies>) => void) => {
    const sp = structuredClone(allSpecies()); f(sp);
    return validatePets(sp, files.find((x) => x.patterns).patterns, { partText, backgrounds: BG, ink: '#2B2D42' }).errors.join('\n');
  };
  it('catches a missing required layer', () => expect(broken((s) => { delete s[0].breeds[0].parts.mouth; })).toMatch(/missing required layer mouth/));
  it('catches a part that does not resolve', () => expect(broken((s) => { s[0].breeds[0].parts.ears = 'ears-nope'; })).toMatch(/does not resolve/));
  it('catches a repeated breed name', () => expect(broken((s) => { s[0].breeds[1].name_es = s[0].breeds[0].name_es; })).toMatch(/repeats/));
  it('catches a floating head (Salchicha before the fix: head 24px above the body)', () => {
    const old = (id: string) => id === 'pet-part.dog.body-long'
      ? '<svg><g data-slot="body" stroke="#2B2D42"><path d="M46 206 C38 170 58 142 100 142 C142 142 162 170 154 206 C136 216 64 216 46 206 Z" class="f1"/></g></svg>' : partText(id);
    const r = validatePets(allSpecies(), files.find((f) => f.patterns).patterns, { partText: old, backgrounds: BG, ink: '#2B2D42' });
    expect(r.errors.join('\n')).toMatch(/salchicha: head floats/);
  });
  it('catches a pattern shape outside a part group (it would not be clipped)', () => {
    const loose = (id: string) => id === 'pet-part.pattern.spots' ? partText(id)!.replace('<g data-on="body">', '<circle cx="1" cy="1" r="1" class="f3"/><g data-on="body">') : partText(id);
    const r = validatePets(allSpecies(), files.find((f) => f.patterns).patterns, { partText: loose, backgrounds: BG, ink: '#2B2D42' });
    expect(r.errors.join('\n')).toMatch(/pattern spots: every shape must be inside/);
  });
  it('catches a locked colour that is not the default', () => expect(broken((s) => { s[1].breeds.find((b) => b.id === 'negro')!.colors.fur1 = '#E5A25A'; })).toMatch(/must equal its locked colour/));
  it('every breed: head, ears and tail touch the body (or head)', () => {
    const r = validatePets(allSpecies(), files.find((f) => f.patterns).patterns, { partText, backgrounds: BG, ink: '#2B2D42' });
    expect(r.errors.filter((e) => /floats/.test(e))).toEqual([]);
  });
  it('catches outlines that would vanish on a dark background without the halo', () => {
    const r = validatePets(allSpecies(), files.find((f) => f.patterns).patterns, { partText, backgrounds: { night: '#1E2440' }, ink: '#2B2D42' });
    expect(r.errors.join()).toMatch(/outline ink/);
  });
});

describe('profiles, migration and save files', () => {
  beforeEach(() => { _setBackend(null); setupPage(); });
  it('turns the old single pet into a profile of the default breed, keeping name, stars and progress', () => {
    store.set('pet', { species: 'cat', name: 'Michi' });
    store.set('rewards.wallet', { balance: 12, earned: 12, byGame: { crucigramas: 12 }, owned: [], recent: [] });
    store.set('cw.records', { A1: { done: 3 } });
    expect(migratePets(1000)).toBe(true);
    const p = getActivePet()!;
    expect(p).toMatchObject({ species: 'cat', breed: 'atigrado', name: 'Michi', createdAt: 1000 });
    expect(profileProblems(p)).toEqual([]);
    expect(store.get('pet', null)).toBe(null);
    expect(getStars()).toBe(12);
    expect(store.get('cw.records', {})).toEqual({ A1: { done: 3 } });
    expect(migratePets()).toBe(false); // runs once
  });
  it('an old pet with no name gets the breed name; every old species maps to a default breed', () => {
    for (const [species, breed] of [['dog', 'labrador'], ['cat', 'atigrado'], ['fox', 'rojo'], ['bird', 'canario'], ['dragon', 'bosque']]) {
      store.clear();
      store.set('pet', { species });
      migratePets();
      expect(getActivePet()).toMatchObject({ species, breed, name: breedOf(speciesById(species)!, breed)!.name_es });
    }
  });
  it('loading an old (version 1) save file migrates it; new files are version 2 and keep the pets', () => {
    const v1 = JSON.stringify({ app: 'kaizer-games', version: 1, savedAt: 'x', data: { pet: { species: 'fox', name: 'Rayo' }, 'rewards.wallet': { balance: 5 } } });
    expect(importProgress(v1)).toEqual({ ok: true });
    expect(getActivePet()).toMatchObject({ species: 'fox', breed: 'rojo', name: 'Rayo' });
    expect(getStars()).toBe(5);
    const out = exportProgress();
    expect(out.version).toBe(2);
    store.clear();
    expect(importProgress(JSON.stringify(out))).toEqual({ ok: true });
    expect(getActivePet()).toMatchObject({ species: 'fox', name: 'Rayo' });
    store.clear(); // reset clears pets too
    expect(getActivePet()).toBe(null);
  });
  it('old saves with the species "raven" become a Pájaro cuervo (single-pet saves and profiles)', () => {
    store.set('pet', { species: 'raven', name: 'Pico' });
    migratePets();
    expect(getActivePet()).toMatchObject({ species: 'bird', breed: 'cuervo', name: 'Pico', gender: 'm' });
    store.clear();
    store.set('pets', [{ ...makeProfile('bird', 'buho', 'pet-1'), species: 'raven' }]);
    store.set('activePetId', 'pet-1');
    expect(getActivePet()).toMatchObject({ species: 'bird', breed: 'buho' });
  });
  it('editing keeps the id (and so all progress); only the look changes', () => {
    const p = savePet(makeProfile('dog', 'pastor', 'pet-1'));
    savePet({ ...p, breed: 'caniche', colors: { ...p.colors, fur1: '#F2A7C3' } });
    expect(getActivePet()).toMatchObject({ id: 'pet-1', breed: 'caniche' });
    expect(store.get<PetProfile[]>('pets', []).length).toBe(1);
  });
});

describe('Sorpréndeme and descriptions', () => {
  it('always gives a valid pet of the chosen species', () => {
    for (const sp of allSpecies()) for (let s = 1; s <= 60; s++) {
      const p = surprise(sp.species, null, rng(s * 31 + 7));
      expect(p.species).toBe(sp.species);
      expect(profileProblems(p), `${sp.species} ${s}`).toEqual([]);
    }
  });
  it('describes the pet for screen readers, with Spanish agreement and the agreed labels', () => {
    const p = makeProfile('dog', 'labrador');
    expect(describePet({ ...p, colors: { ...p.colors, fur1: '#7A4E2E', fur3: '#FAF6EF' }, pattern: 'spots' })).toBe('Perro labrador, marrón con manchas blancas');
    expect(describePet(makeProfile('cat', 'atigrado'))).toBe('Gato atigrado, pardo con rayas marrones');
    expect(describePet(makeProfile('dragon', 'fuego'))).toBe('Dragón de fuego, rojo');
    expect(describePet(makeProfile('dragon', 'bosque'))).toBe('Dragón del bosque, verde');
    // Breed equal to species: once. Colour already in the breed name: not repeated.
    expect(describePet(makeProfile('bird', 'cuervo'))).toBe('Cuervo, negro');
    expect(describePet(makeProfile('cat', 'negro'))).toBe('Gato negro');
    expect(describePet({ ...makeProfile('cat', 'negro'), pattern: 'chest' })).toBe('Gato negro con pecho blanco');
    expect(describePet(makeProfile('cat', 'siames'))).toBe('Gato siamés, crema con puntas chocolate');
    expect(speciesBreed(speciesById('dog')!, breedOf(speciesById('dog')!, 'salchicha')!)).toBe('Perro salchicha');
    const sp = speciesById('cat')!;
    expect(agree(sp.swatches.fur.find((s) => s.es === 'gris')!, 'fp')).toBe('grises');
    expect(agree(sp.swatches.fur.find((s) => s.es === 'crema')!, 'fp')).toBe('crema');
  });
  it('the colours described are the colours drawn: main colour and the slot the pattern uses', () => {
    for (const sp of allSpecies()) for (const br of sp.breeds) for (const pat of br.patterns) {
      const pd = patterns()[pat];
      for (const slot of editableSlots(sp, br)) for (const sw of slotChoices(sp, br, slot).natural) {
        const p = normalizeProfile({ ...makeProfile(sp.species, br.id), pattern: pat, colors: { ...makeProfile(sp.species, br.id).colors, [slot]: sw.c } });
        const d = describePet(p);
        const main = colorName(sp, p.colors.fur1).es;
        if (!br.name_es.toLocaleLowerCase('es').split(' ').includes(main)) expect(d, `${br.id} ${pat}`).toContain(`, ${main}`);
        if (pd?.es && pd.g) expect(d, `${br.id} ${pat}`).toContain(` con ${pd.es} ${agree(colorName(sp, p.colors[pd.color ?? 'fur3'], pd.color ?? 'fur3'), pd.g)}`);
        // The pattern's art is drawn in that same slot.
        if (pd?.art) expect(partText(`pet-part.pattern.${pat}`)).toMatch(new RegExp(`class="[fs]${(pd.color ?? 'fur3').slice(3)}`));
      }
    }
  });
});

describe('gender (wording only)', () => {
  const f = (species: string, breed: string, extra: Partial<PetProfile> = {}) => describePet({ ...makeProfile(species, breed), gender: 'f', ...extra });
  it('Spanish nouns and adjectives agree for a hembra', () => {
    expect(f('dog', 'salchicha')).toBe('Perra salchicha, rojiza');
    expect(f('dog', 'labrador')).toBe('Perra labradora, dorada');
    expect(f('cat', 'atigrado')).toBe('Gata atigrada, parda con rayas marrones');
    expect(f('cat', 'negro')).toBe('Gata negra');
    expect(f('cat', 'negro', { pattern: 'chest' })).toBe('Gata negra con pecho blanco');
    expect(f('cat', 'siames')).toBe('Gata siamesa, crema con puntas chocolate');
    expect(f('fox', 'rojo')).toBe('Zorra roja, naranja');
    expect(f('dragon', 'electrico')).toBe('Dragona eléctrica, amarillo limón');
    expect(f('dragon', 'aire')).toBe('Dragona de aire, azul claro');
  });
  it('birds are epicene: "hembra", adjectives masculine; the drawing never changes', () => {
    expect(f('bird', 'buho')).toBe('Búho hembra, pardo');
    expect(f('bird', 'pinguino')).toBe('Pingüino hembra, negro');
    expect(describePet(makeProfile('bird', 'loro'))).toBe('Loro, verde');
    const p = makeProfile('cat', 'persa');
    expect(composeMarkup({ ...p, gender: 'f' } as PetProfile, 'calma', partText, (id) => !!partText(id))).toBe(composeMarkup(p, 'calma', partText, (id) => !!partText(id)));
  });
  it('default names follow the gender; Sorpréndeme keeps the gender; a missing gender is macho', () => {
    expect(defaultName({ species: 'cat', breed: 'atigrado', gender: 'f' })).toBe('Atigrada');
    expect(defaultName({ species: 'bird', breed: 'buho', gender: 'f' })).toBe('Búho');
    for (let s = 1; s < 20; s++) expect(surprise('dog', { ...makeProfile('dog'), gender: 'f' }, rng(s)).gender).toBe('f');
    const { gender: _, ...noGender } = makeProfile('dog');
    expect(normalizeProfile(noGender as PetProfile).gender).toBe('m');
    expect(isDefaultName({ species: 'cat', breed: 'atigrado', name: 'Atigrada' })).toBe(true);
  });
});

describe('more eye colours', () => {
  it('every species offers at least 7 natural eye colours and 2 fantasy ones, all different', () => {
    for (const sp of allSpecies()) {
      expect(sp.swatches.eyes.length, sp.species).toBeGreaterThanOrEqual(7);
      expect(sp.swatches.eyesFantasy.length, sp.species).toBeGreaterThanOrEqual(2);
      const all = [...sp.swatches.eyes, ...sp.swatches.eyesFantasy].map((s) => s.c.toLowerCase());
      expect(new Set(all).size, sp.species).toBe(all.length);
    }
  });
});

describe('colour-defined breeds', () => {
  it('Gato Negro is always black: main colour locked, eyes and the white chest still free', () => {
    const sp = speciesById('cat')!, br = breedOf(sp, 'negro')!;
    expect(editableSlots(sp, br)).toEqual(['eyes', 'nose']);
    expect(br.patterns).toEqual(['none', 'chest']);
    for (let s = 1; s <= 40; s++) { const p = surprise('cat', null, rng(s)); if (p.breed === 'negro') expect(p.colors.fur1).toBe('#34384A'); }
    // An older profile with another colour is put right.
    const old = { ...makeProfile('cat', 'negro'), colors: { ...makeProfile('cat', 'negro').colors, fur1: '#E5A25A' } };
    expect(profileProblems(old).join()).toMatch(/locked/);
    expect(normalizeProfile(old).colors.fur1).toBe('#34384A');
  });
  it('Siamés is colour points: light body, darker muzzle oval, ears, paws and tail tip, blue eyes', () => {
    const sp = speciesById('cat')!, br = breedOf(sp, 'siames')!;
    expect(editableSlots(sp, br)).toEqual(['fur1', 'fur2']);
    expect(br.patterns).toEqual(['points']);
    const p = makeProfile('cat', 'siames');
    expect(p.colors.eyes).toBe('#5AA9E6');
    expect(colorVars(p)).toMatchObject({ '--points': 'var(--fur-2)', '--feet': 'var(--fur-2)' });
    const m = composeMarkup(p, 'calma', partText, (id) => !!partText(id));
    expect(m).toContain('<g class="k-pat" data-on="head"');
    expect(m).not.toContain('data-on="body"');
    expect(m).toMatch(/class="fk"/); // ears
    expect(m).toMatch(/class="sk"/); // tail tip
    // Body shade light, points dark.
    const lum = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
    for (const s of slotChoices(sp, br, 'fur1').natural) for (const d of slotChoices(sp, br, 'fur2').natural) expect(lum(s.c)).toBeGreaterThan(lum(d.c) + 150);
  });
  it('breeds named after a colour only offer that colour family', () => {
    const fur1 = (s: string, b: string) => slotChoices(speciesById(s)!, breedOf(speciesById(s)!, b)!, 'fur1').natural.map((x) => x.es);
    expect(fur1('dragon', 'agua').every((n) => n.startsWith('azul'))).toBe(true);
    expect(fur1('dragon', 'bosque').every((n) => n.startsWith('verde'))).toBe(true);
    expect(fur1('bird', 'urraca')).toEqual([]);
    expect(slotChoices(speciesById('fox')!, breedOf(speciesById('fox')!, 'rojo')!, 'fur1').fantasy).toEqual([]);
  });
});

describe('composition', () => {
  it('every breed has its required layers in every mood; moods swap only eyes and mouth', () => {
    for (const sp of allSpecies()) for (const br of sp.breeds) {
      const p = makeProfile(sp.species, br.id);
      const calma = composeMarkup(p, 'calma', partText, (id) => !!partText(id));
      for (const l of ['shadow', 'body', 'head', 'eyes', 'mouth']) expect(calma, `${br.id} ${l}`).toContain(`data-slot="${l}"`);
      const happy = composeMarkup(p, 'alegria', partText, (id) => !!partText(id));
      const strip = (s: string) => s.replace(/<g data-slot="(eyes|mouth)"[\s\S]*?<\/g>/g, '');
      expect(strip(happy)).toBe(strip(calma));
      expect(happy).not.toBe(calma);
    }
  });
  it('a missing mood falls back to calma', () => {
    const p = makeProfile('cat', 'persa');
    const noSiesta = (id: string) => !!partText(id) && !id.endsWith('.siesta');
    expect(composeMarkup(p, 'siesta', partText, noSiesta)).toBe(composeMarkup(p, 'calma', partText, noSiesta));
  });
  it('a pattern is drawn per part, clipped to that part, under its outline, details and the later layers', () => {
    const m = composeMarkup(makeProfile('cat', 'atigrado'), 'calma', partText, (id) => !!partText(id));
    for (const on of ['body', 'head']) {
      expect(m).toContain(`<clipPath id="kpc-${on}__UID__">`);
      expect(m).toContain(`<g class="k-pat" data-on="${on}" clip-path="url(#kpc-${on}__UID__)"`);
    }
    // Order: body, its pattern, its outline; the belly comes after (so stripes never cross it); eyes are on top.
    const at = (s: string) => m.indexOf(s);
    expect(at('data-slot="body"')).toBeLessThan(at('data-on="body"'));
    expect(at('data-on="body"')).toBeLessThan(at('data-slot="belly"'));
    expect(at('data-on="head"')).toBeLessThan(at('class="k-detail"')); // the muzzle covers the pattern
    expect(at('data-on="head"')).toBeLessThan(at('data-slot="eyes"'));
    expect(m).toContain('class="k-oo"');
    // Ears and wings are never patterned unless the breed lists them.
    const owl = composeMarkup({ ...makeProfile('bird', 'buho'), pattern: 'spots' }, 'calma', partText, (id) => !!partText(id));
    expect(owl).not.toMatch(/data-on="(ears|wings)"/);
  });
  it('spots have no outline', () => {
    expect(partText('pet-part.pattern.spots')).not.toMatch(/stroke="#/);
    expect(partText('pet-part.pattern.spots')).toContain('data-slot="pattern" stroke="none"');
  });
  it('colours are classes for CSS variables; outlines stay ink', () => {
    const m = composeMarkup(makeProfile('dog', 'pastor'), 'calma', partText, (id) => !!partText(id));
    expect(m).toMatch(/class="f1"/);
    expect(m).toContain('stroke="#2B2D42"');
    expect(partIdsFor(makeProfile('dog', 'pastor'))).toContain('pet-part.pattern.saddle');
  });
  it('the boina sits on every breed, scaled by its headWidth', () => {
    for (const sp of allSpecies()) for (const br of sp.breeds) {
      const rig = rigOf({ species: sp.species, breed: br.id })!;
      const pl = placeItem(rig, 'pet-item.boina')!;
      expect(pl.scale).toBeCloseTo(rig.headWidth / 100);
      // The boina's pivot (100, 104) lands on the breed's head anchor.
      expect(pl.x + 100 * pl.scale).toBeCloseTo(rig.anchors.head[0]);
      expect(pl.y + 104 * pl.scale).toBeCloseTo(rig.anchors.head[1]);
    }
  });
});
