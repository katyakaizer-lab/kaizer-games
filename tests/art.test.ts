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
    const r = art('pet.brote.calma');
    expect(r.placeholder).toBe(false);
    expect(r.src).toBe('./assets/pets/brote-calma.svg');
  });
  it('resolves relative to the page root', () => {
    setupPage('brote', '../');
    expect(art('pet.brote.siesta').src).toBe('../assets/pets/brote-siesta.svg');
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
  it('registers Brote and every pet part with AI provenance', () => {
    for (const m of ['calma', 'alegria', 'siesta']) expect(manifest.find((a) => a.id === 'pet.brote.' + m)!.aiGenerated).toBe(true);
    const parts = manifest.filter((a) => a.kind === 'pet-part');
    expect(parts.length).toBeGreaterThan(100);
    for (const e of parts) { expect(e.aiGenerated).toBe(true); expect(e.status).toBe('placeholder'); expect(e.source.tool).toBe('Claude'); }
  });
  it('loads the manifest over fetch', async () => {
    setManifest([]);
    mockFetch();
    await loadManifest();
    expect(art('pet.brote.calma').placeholder).toBe(false);
  });
});

describe('Brote (the mascot)', () => {
  beforeEach(() => { setupPage(); setManifest(manifest); setRig(rig); });

  it('falls back from a missing mood to calma', () => {
    expect(petArtId('brote', 'alegria')).toBe('pet.brote.alegria');
    expect(petArtId('brote', 'comiendo')).toBe('pet.brote.calma');
  });
  it('places items by anchor and head width', () => {
    const p = itemPlacement('brote', 'pet-item.boina')!;
    expect(p.scale).toBeCloseTo(1.24);
    expect(p.x).toBeCloseTo(100 - 100 * 1.24);
    expect(p.y).toBeCloseTo(104 - 104 * 1.24);
  });
  it('renders Brote with an item', () => {
    const fig = PetFigure({ pet: 'brote', mood: 'siesta', items: ['pet-item.boina'] });
    expect(fig.querySelector('img')!.getAttribute('src')).toContain('brote-siesta.svg');
    expect(fig.querySelectorAll('.k-pet__item').length).toBe(1);
  });
});
