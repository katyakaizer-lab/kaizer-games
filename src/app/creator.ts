/**
 * Pet creator: Especie -> Raza -> Colores -> Nombre, with a large live preview at the top. Used on first launch
 * (#picker) and from Settings ("Editar mascota", #pet). Editing changes only the look: the profile keeps its id,
 * and progress and stars are stored apart from the pet, so nothing else changes.
 */
import { h, mount } from '../ui/h';
import { icon } from '../ui/icons';
import { Button } from '../ui/components';
import { t } from '../i18n';
import { prefersReducedMotion } from './settings';
import { getActivePet, savePet } from './pet-state';
import { navigate } from './router';
import { PetPortrait, type PetPortraitEl } from '../pets/compose';
import {
  allSpecies, breedOf, describePet, makeProfile, patterns, speciesById, surprise, swatchesFor,
  type Breed, type ColorSlot, type PetProfile, type Species,
} from '../pets/species';
import './creator.css';

const STEPS = ['species', 'breed', 'colors', 'name'] as const;
type Step = (typeof STEPS)[number];

export function CreatorScreen(root: HTMLElement, o: { edit: boolean }): void {
  const existing = getActivePet();
  const editing = o.edit && !!existing;
  let draft: PetProfile = existing && editing ? structuredClone(existing) : makeProfile(allSpecies()[0].species);
  /** The name the learner typed (empty: the breed name is used). */
  let customName = editing && existing && existing.name !== breedName(existing) ? existing.name : '';
  let step: Step = 'species';
  let cycleTimer = 0;

  const sp = (): Species => speciesById(draft.species)!;
  const br = (): Breed => breedOf(sp(), draft.breed)!;
  function breedName(p: PetProfile) { const s = speciesById(p.species); return (s && breedOf(s, p.breed)?.name_es) ?? ''; }
  const finalName = () => customName.trim() || br().name_es;

  const previewBox = h('div', { class: 'creator__preview-fig' });
  const previewName = h('p', { class: 'creator__preview-name', lang: 'es' });
  const previewDesc = h('p', { class: 'creator__preview-desc', lang: 'es', 'aria-live': 'polite' });
  const preview = h('section', { class: 'creator__preview', 'aria-label': t('creator.preview') }, previewBox, h('div', null, previewName, previewDesc));
  const stepBox = h('div', { class: 'creator__step' });
  const progress = h('div', { class: 'creator__progress' });
  const nav = h('div', { class: 'creator__nav' });

  /** The preview pet; after a change it briefly shows its moods (static with reduced motion). */
  function updatePreview(cycle = true) {
    clearTimeout(cycleTimer);
    const fig = PetPortrait({ pet: { ...draft, name: finalName() }, mood: 'calma', items: [], label: `${finalName()}: ${describePet(draft)}` }) as PetPortraitEl;
    previewBox.replaceChildren(fig);
    previewName.textContent = finalName();
    previewDesc.textContent = describePet(draft);
    if (!cycle || prefersReducedMotion()) return;
    const seq: ('alegria' | 'siesta' | 'calma')[] = ['alegria', 'siesta', 'calma'];
    let i = 0;
    const next = () => { if (!fig.isConnected || i >= seq.length) return; fig.setMood?.(seq[i++]); cycleTimer = window.setTimeout(next, 650); };
    cycleTimer = window.setTimeout(next, 450);
  }

  const radio = (group: string, value: string, checked: boolean, content: (HTMLElement | string)[], label: string, onPick: () => void, cls = '') => {
    const id = `cr-${group}-${value}`;
    const input = h('input', { type: 'radio', name: `cr-${group}`, id, value, checked, class: 'creator__radio', 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('change', onPick);
    return h('label', { class: `creator__choice ${cls}`, for: id }, input, ...content);
  };

  function speciesStep(): HTMLElement {
    return h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.step.species')),
      h('div', { class: 'creator__cards' }, allSpecies().map((s) => radio('species', s.species, s.species === draft.species,
        [PetPortrait({ pet: makeProfile(s.species, undefined, `pv-${s.species}`), decorative: true, class: 'creator__card-pet' }), h('span', { class: 'creator__card-name', lang: 'es' }, s.name_es)],
        s.name_es, () => { draft = { ...makeProfile(s.species, undefined, draft.id), createdAt: draft.createdAt }; changed(); }, 'is-card'))));
  }
  function breedStep(): HTMLElement {
    return h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.step.breed')),
      h('div', { class: 'creator__cards' }, sp().breeds.map((b) => radio('breed', b.id, b.id === draft.breed,
        [PetPortrait({ pet: makeProfile(sp().species, b.id, `pv-${b.id}`), decorative: true, class: 'creator__card-pet' }), h('span', { class: 'creator__card-name', lang: 'es' }, b.name_es)],
        `${sp().name_es} ${b.name_es}`, () => { draft = { ...draft, breed: b.id, parts: {}, colors: { ...b.colors }, pattern: b.pattern }; changed(); }, 'is-card'))));
  }
  const slotLabel = (slot: ColorSlot) => (slot === 'nose' && sp().noseLabel === 'beak' ? t('creator.slot.beak') : t(`creator.slot.${slot}` as 'creator.slot.fur1'));
  function swatchRow(slot: ColorSlot, list: { c: string; es: string }[]): HTMLElement {
    return h('div', { class: 'creator__swatches' }, list.map((s) => radio(slot, s.c.slice(1), draft.colors[slot].toLowerCase() === s.c.toLowerCase(),
      [h('span', { class: 'creator__swatch', style: { '--sw': s.c }, 'aria-hidden': 'true' })],
      s.es, () => { draft = { ...draft, colors: { ...draft.colors, [slot]: s.c } }; changed(false); }, 'is-swatch')));
  }
  function colorsStep(): HTMLElement {
    const pats = patterns();
    return h('div', { class: 'creator__colors' },
      Button({ label: t('creator.surprise'), icon: 'sparkles', variant: 'secondary', onClick: () => { draft = { ...surprise(draft.species, draft), id: draft.id, createdAt: draft.createdAt }; changed(); } }),
      ...sp().slots.map((slot) => {
        const { natural, fantasy } = swatchesFor(sp(), slot);
        return h('fieldset', { class: 'creator__fieldset' }, h('legend', null, slotLabel(slot)),
          swatchRow(slot, natural),
          fantasy.length ? h('p', { class: 'creator__row-label' }, t('creator.fantasy')) : null,
          fantasy.length ? swatchRow(slot, fantasy) : null);
      }),
      br().patterns.length > 1 ? h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.pattern')),
        h('div', { class: 'creator__chips' }, br().patterns.map((id) => radio('pattern', id, draft.pattern === id,
          [h('span', { lang: 'es' }, pats[id]?.name_es ?? id)], pats[id]?.name_es ?? id, () => { draft = { ...draft, pattern: id }; changed(false); }, 'is-chip')))) : null);
  }
  function nameStep(): HTMLElement {
    const input = h('input', { id: 'cr-name', type: 'text', maxlength: '24', autocomplete: 'off', class: 'field__input', lang: 'es', placeholder: br().name_es, value: customName }) as HTMLInputElement;
    input.addEventListener('input', () => { customName = input.value; previewName.textContent = finalName(); });
    return h('div', { class: 'creator__name' },
      h('label', { class: 'field', for: 'cr-name' }, h('span', { class: 'field__label' }, t('creator.nameLabel')), input),
      h('p', { class: 'creator__hint' }, t('creator.nameHint', { name: br().name_es })));
  }

  function changed(cycle = true) {
    const focusId = (document.activeElement as HTMLElement | null)?.id;
    renderStep();
    updatePreview(cycle);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function renderStep() {
    const i = STEPS.indexOf(step);
    progress.replaceChildren(
      h('p', { class: 'creator__step-label' }, t('creator.stepOf', { n: i + 1, total: STEPS.length }), ' · ', h('strong', null, t(`creator.step.${step}` as 'creator.step.species'))),
      h('ol', { class: 'creator__dots', 'aria-hidden': 'true' }, STEPS.map((s, k) => h('li', { class: k < i ? 'is-done' : k === i ? 'is-current' : '' }))));
    mount(stepBox, step === 'species' ? speciesStep() : step === 'breed' ? breedStep() : step === 'colors' ? colorsStep() : nameStep());
    const last = i === STEPS.length - 1;
    nav.replaceChildren(
      i > 0 ? Button({ label: t('creator.back'), icon: 'back', variant: 'outline', onClick: () => go(i - 1) })
        : editing ? Button({ label: t('common.cancel'), icon: 'back', variant: 'outline', onClick: () => navigate('#settings') }) : h('span'),
      last ? Button({ label: editing ? t('creator.save') : t('creator.start'), icon: 'check', size: 'lg', onClick: finish })
        : Button({ label: t('creator.next'), icon: 'play', onClick: () => go(i + 1) }));
  }
  function go(i: number) {
    step = STEPS[i];
    renderStep();
    stepBox.querySelector<HTMLElement>('legend, label, input')?.closest('fieldset, .creator__name')?.scrollIntoView({ block: 'nearest' });
    (stepBox.querySelector<HTMLInputElement>('input:checked') ?? stepBox.querySelector<HTMLInputElement>('input'))?.focus({ preventScroll: true });
  }
  function finish() {
    savePet({ ...draft, name: finalName() });
    clearTimeout(cycleTimer);
    navigate(editing ? '#settings' : '#home');
  }

  mount(root, h('div', { class: 'screen creator' },
    h('h1', { tabindex: '-1', class: 'screen__title' }, editing ? t('creator.editTitle') : t('creator.title')),
    progress, preview, stepBox, nav));
  renderStep();
  updatePreview(false);
  void icon;
}
