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
  allSpecies, breedLabel, breedOf, defaultName, describePet, isDefaultName, editableSlots, makeProfile, normalizeProfile, patterns, slotChoices, speciesBreed, speciesById, surprise,
  type Breed, type ColorSlot, type PetProfile, type Species,
} from '../pets/species';
import './creator.css';

const STEPS = ['species', 'breed', 'colors', 'name'] as const;
type Step = (typeof STEPS)[number];

export function CreatorScreen(root: HTMLElement, o: { edit: boolean }): void {
  const existing = getActivePet();
  const editing = o.edit && !!existing;
  let draft: PetProfile = existing && editing ? normalizeProfile(structuredClone(existing)) : makeProfile(allSpecies()[0].species);
  /** The name the learner typed (empty: the breed name is used). */
  let customName = editing && existing && !isDefaultName(existing) ? existing.name : '';
  let step: Step = 'species';
  let cycleTimer = 0;

  const sp = (): Species => speciesById(draft.species)!;
  const br = (): Breed => breedOf(sp(), draft.breed)!;
  const finalName = () => customName.trim() || defaultName(draft);

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
        s.name_es, () => { draft = { ...makeProfile(s.species, undefined, draft.id), createdAt: draft.createdAt, gender: draft.gender }; changed(); }, 'is-card'))));
  }
  function breedStep(): HTMLElement {
    return h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.step.breed')),
      h('div', { class: 'creator__cards' }, sp().breeds.map((b) => radio('breed', b.id, b.id === draft.breed,
        [PetPortrait({ pet: makeProfile(sp().species, b.id, `pv-${b.id}`), decorative: true, class: 'creator__card-pet' }), h('span', { class: 'creator__card-name', lang: 'es' }, breedLabel(b, draft.gender))],
        speciesBreed(sp(), b, draft.gender), () => { draft = { ...draft, breed: b.id, parts: {}, colors: { ...b.colors, ...b.lockedColors }, pattern: b.pattern }; changed(); }, 'is-card'))));
  }
  /** The slot the current pattern is drawn in (none: no pattern). */
  const patternSlot = (): ColorSlot | null => { const pd = patterns()[draft.pattern]; return pd?.es ? pd.color ?? 'fur3' : null; };
  const slotLabel = (slot: ColorSlot) => {
    if (slot === 'nose' && sp().noseLabel === 'beak') return t('creator.slot.beak');
    if (draft.pattern === 'points') { if (slot === 'fur2') return t('creator.slot.points'); if (slot === 'fur1') return t('creator.slot.body'); }
    return t(`creator.slot.${slot}` as 'creator.slot.fur1');
  };
  function swatchRow(slot: ColorSlot, list: { c: string; es: string }[]): HTMLElement {
    return h('div', { class: 'creator__swatches' }, list.map((s) => radio(slot, s.c.slice(1), draft.colors[slot].toLowerCase() === s.c.toLowerCase(),
      [h('span', { class: 'creator__swatch', style: { '--sw': s.c }, 'aria-hidden': 'true' })],
      s.es, () => { draft = { ...draft, colors: { ...draft.colors, [slot]: s.c } }; changed(false); }, 'is-swatch')));
  }
  function slotField(slot: ColorSlot): HTMLElement | null {
    const { natural, fantasy } = slotChoices(sp(), br(), slot);
    if (!natural.length && !fantasy.length) return null;
    return h('fieldset', { class: 'creator__fieldset', 'data-slot': slot }, h('legend', null, slotLabel(slot)),
      swatchRow(slot, natural),
      fantasy.length ? h('p', { class: 'creator__row-label' }, t('creator.fantasy')) : null,
      fantasy.length ? swatchRow(slot, fantasy) : null);
  }
  /**
   * Main colours, then the pattern and its colour (shown only when a pattern is chosen, so every colour picked is
   * one that is drawn and described), then eyes and nose. Locked colours (Gato Negro's black) are not offered.
   */
  function colorsStep(): HTMLElement {
    const pats = patterns();
    const slots = editableSlots(sp(), br());
    const ps = patternSlot();
    const fur3Shown = ps === 'fur3';
    return h('div', { class: 'creator__colors' },
      Button({ label: t('creator.surprise'), icon: 'sparkles', variant: 'secondary', onClick: () => { draft = { ...surprise(draft.species, draft), id: draft.id, createdAt: draft.createdAt }; changed(); } }),
      ...slots.filter((s) => s === 'fur1' || s === 'fur2').map(slotField),
      br().patterns.length > 1 ? h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.pattern')),
        h('div', { class: 'creator__chips' }, br().patterns.map((id) => radio('pattern', id, draft.pattern === id,
          [h('span', { lang: 'es' }, pats[id]?.name_es ?? id)], pats[id]?.name_es ?? id, () => { draft = { ...draft, pattern: id }; changed(false); }, 'is-chip')))) : null,
      fur3Shown && slots.includes('fur3') ? slotField('fur3') : null,
      ...slots.filter((s) => s === 'eyes' || s === 'nose').map(slotField));
  }
  function nameStep(): HTMLElement {
    const input = h('input', { id: 'cr-name', type: 'text', maxlength: '24', autocomplete: 'off', class: 'field__input', lang: 'es', placeholder: defaultName(draft), value: customName }) as HTMLInputElement;
    input.addEventListener('input', () => { customName = input.value; previewName.textContent = finalName(); });
    const gender = h('fieldset', { class: 'creator__fieldset' }, h('legend', null, t('creator.gender')),
      h('div', { class: 'creator__chips' }, (['m', 'f'] as const).map((g) => radio('gender', g, (draft.gender ?? 'm') === g,
        [h('span', null, t(g === 'm' ? 'creator.male' : 'creator.female'))], t(g === 'm' ? 'creator.male' : 'creator.female'),
        () => { draft = { ...draft, gender: g }; changed(false); }, 'is-chip'))));
    return h('div', { class: 'creator__name' }, gender,
      h('label', { class: 'field', for: 'cr-name' }, h('span', { class: 'field__label' }, t('creator.nameLabel')), input),
      h('p', { class: 'creator__hint' }, t('creator.nameHint', { name: defaultName(draft) })));
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

  const screen = h('div', { class: 'screen creator' },
    h('h1', { tabindex: '-1', class: 'screen__title' }, editing ? t('creator.editTitle') : t('creator.title')),
    progress, preview, stepBox, nav);
  mount(root, screen);
  // The steps end above the fixed Atrás / Siguiente bar, whatever its height (text size, safe area).
  const fitNav = () => screen.style.setProperty('--creator-nav-h', `${Math.ceil(nav.getBoundingClientRect().height)}px`);
  fitNav();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitNav).observe(nav);
  renderStep();
  updatePreview(false);
  void icon;
}
