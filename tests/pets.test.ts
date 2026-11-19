import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publicFile, setupPage } from './helpers';
import { setManifest, type ArtEntry } from '../src/ui/art';
import { _setBackend, exportProgress, importProgress, store } from '../src/data/storage';
import { getStars } from '../src/rewards/wallet';
import {
  agree, allSpecies, breedOf, describePet, loadPetFiles, makeProfile, profileProblems, rigOf, speciesById, surprise, type PetProfile,
} from '../src/pets/species';
import { composeMarkup, placeItem, partIdsFor } from '../src/pets/compose';
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
      Cuervo: ['Cuervo', 'Urraca', 'Búho'],
      Dragón: ['Del bosque', 'De fuego', 'De agua'],
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
    expect(r.breeds).toBe(19);
  });
  const broken = (f: (sp: ReturnType<typeof allSpecies>) => void) => {
    const sp = structuredClone(allSpecies()); f(sp);
    return validatePets(sp, files.find((x) => x.patterns).patterns, { partText, backgrounds: BG, ink: '#2B2D42' }).errors.join('\n');
  };
  it('catches a missing required layer', () => expect(broken((s) => { delete s[0].breeds[0].parts.mouth; })).toMatch(/missing required layer mouth/));
  it('catches a part that does not resolve', () => expect(broken((s) => { s[0].breeds[0].parts.ears = 'ears-nope'; })).toMatch(/does not resolve/));
  it('catches a repeated breed name', () => expect(broken((s) => { s[0].breeds[1].name_es = s[0].breeds[0].name_es; })).toMatch(/repeats/));
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
    for (const [species, breed] of [['dog', 'labrador'], ['cat', 'atigrado'], ['fox', 'rojo'], ['raven', 'cuervo'], ['dragon', 'bosque']]) {
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
  it('describes the pet for screen readers, with Spanish agreement', () => {
    const p = makeProfile('dog', 'labrador');
    expect(describePet({ ...p, colors: { ...p.colors, fur1: '#7A4E2E', fur3: '#FAF6EF' }, pattern: 'spots' })).toBe('Perro Labrador, marrón con manchas blancas');
    expect(describePet(makeProfile('cat', 'atigrado'))).toBe('Gato Atigrado, pardo con rayas marrones');
    expect(describePet(makeProfile('dragon', 'fuego'))).toBe('Dragón De fuego, rojo');
    const sp = speciesById('cat')!;
    expect(agree(sp.swatches.fur.find((s) => s.es === 'gris')!, 'fp')).toBe('grises');
    expect(agree(sp.swatches.fur.find((s) => s.es === 'crema')!, 'fp')).toBe('crema');
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
  it('a pattern is clipped to body and head, and their outlines are drawn again on top', () => {
    const m = composeMarkup(makeProfile('cat', 'atigrado'), 'calma', partText, (id) => !!partText(id));
    expect(m).toContain('<clipPath id="kpc__UID__">');
    expect(m).toContain('clip-path="url(#kpc__UID__)"');
    expect(m).toContain('class="k-oo"');
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
