import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { art, artEl, loadManifest, placeholder, setManifest, type ArtEntry } from '../src/ui/art';
import { itemPlacement, petArtId, setRig, PetFigure } from '../src/pets/pets';
import { mockFetch, publicFile, setupPage } from './helpers';

const manifest = JSON.parse(readFileSync(publicFile('assets/manifest.json'), 'utf8')).assets as ArtEntry[];
const rig = JSON.parse(readFileSync(publicFile('assets/pets/rig.json'), 'utf8'));

describe('art ids', () => {
  beforeEach(() => { setupPage(); setManifest(manifest); setRig(rig); });

  it('resolves a file by id', () => {
    const r = art('pet.cat.calma');
    expect(r.placeholder).toBe(false);
    expect(r.src).toBe('./assets/pets/cat-calma.svg');
  });
  it('resolves relative to the page root', () => {
    setupPage('brote', '../');
    expect(art('pet.dog.siesta').src).toBe('../assets/pets/dog-siesta.svg');
  });
  it('gives a placeholder for an id with no file or an unknown id', () => {
    expect(art('object.silla').placeholder).toBe(true);
    expect(art('object.nope').placeholder).toBe(true);
    const el = artEl('object.nope', { alt: 'nada' });
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.getAttribute('aria-label')).toBe('nada');
  });
  it('placeholder uses only tokens for colour', () => {
    const svg = placeholder('object.silla').outerHTML;
    expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(svg).toContain('var(--placeholder-fill)');
  });
  it('registers all 18 pet SVGs with AI provenance', () => {
    for (const p of ['brote', 'cat', 'dog', 'dragon', 'raven', 'fox']) {
      for (const m of ['calma', 'alegria', 'siesta']) {
        const e = manifest.find((a) => a.id === 'pet.' + p + '.' + m)!;
        expect(e.aiGenerated).toBe(true);
        expect(e.status).toBe('placeholder');
        expect(e.source.tool).toBe('Claude');
        expect(e.source.date).toBe('2026-11-17');
      }
    }
  });
  it('loads the manifest over fetch', async () => {
    setManifest([]);
    mockFetch();
    await loadManifest();
    expect(art('pet.fox.calma').placeholder).toBe(false);
  });
});

describe('pets', () => {
  beforeEach(() => { setupPage(); setManifest(manifest); setRig(rig); });

  it('falls back from a missing mood to calma', () => {
    expect(petArtId('cat', 'alegria')).toBe('pet.cat.alegria');
    expect(petArtId('cat', 'comiendo')).toBe('pet.cat.calma');
    expect(petArtId('dragon', 'pensando')).toBe('pet.dragon.calma');
  });
  it('places items by anchor and head width', () => {
    const p = itemPlacement('cat', 'pet-item.boina')!;
    expect(p.scale).toBeCloseTo(0.76);
    expect(p.x).toBeCloseTo(100 - 100 * 0.76);
    expect(p.y).toBeCloseTo(46 - 104 * 0.76);
    expect(itemPlacement('dragon', 'pet-item.boina')!.scale).toBeCloseTo(0.8);
  });
  it('renders a pet with an item', () => {
    const fig = PetFigure({ pet: 'fox', mood: 'siesta', items: ['pet-item.boina'] });
    expect(fig.querySelector('img')!.getAttribute('src')).toContain('fox-siesta.svg');
    expect(fig.querySelectorAll('.k-pet__item').length).toBe(1);
  });
});
