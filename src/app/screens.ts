/** Hub screens: pet picker, home (room + games), settings. */
import { h, mount } from '../ui/h';
import { icon, type IconName } from '../ui/icons';
import { Button, Chip, Frame, Modal, Panel, toast } from '../ui/components';
import { artEl } from '../ui/art';
import { PetFigure, PET_IDS, petName, type PetId } from '../pets/pets';
import { getLang, LANGS, t, type Lang } from '../i18n';
import { getSettings, saveSettings, type Settings } from './settings';
import { currentMood, getPet, setPet } from './pet-state';
import { navigate, registry } from './router';
import { downloadProgress, pickProgressFile, store } from '../data/storage';
import { getStars } from '../rewards/wallet';
import '../rewards/rewards.css';

const heading = (text: string, level: 1 | 2 = 1) => {
  const el = level === 1 ? h('h1', { tabindex: '-1', class: 'screen__title' }, text) : h('h2', null, text);
  return el;
};

/* ---------------- Pet picker ---------------- */
export function PickerScreen(root: HTMLElement): void {
  const current = getPet();
  let chosen: PetId | null = current?.species ?? null;
  const nameInput = h('input', { id: 'pet-name', type: 'text', maxlength: '24', autocomplete: 'off', class: 'field__input', lang: 'es' }) as HTMLInputElement;
  if (current && current.name !== petName(current.species)) nameInput.value = current.name;
  const startBtn = Button({ label: current ? t('picker.save') : t('picker.start'), size: 'lg', icon: 'check', disabled: !chosen, onClick: () => {
    if (!chosen) return;
    setPet(chosen as (typeof PET_IDS)[number], nameInput.value);
    navigate('#home');
  } });
  const updateName = () => { nameInput.placeholder = chosen ? petName(chosen) : ''; startBtn.disabled = !chosen; };
  const cards = PET_IDS.map((p) => {
    const b = h('button', { type: 'button', class: 'picker__pet', 'aria-pressed': String(p === chosen), 'aria-label': petName(p), lang: 'es' },
      PetFigure({ pet: p, mood: 'calma', label: '' }),
      h('span', { class: 'picker__name' }, petName(p)),
      h('span', { class: 'picker__check' }, icon('check')));
    b.addEventListener('click', () => {
      chosen = p;
      cards.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      updateName();
    });
    return b;
  });
  updateName();
  mount(root, h('div', { class: 'screen picker' },
    current ? h('div', { class: 'screen__bar' }, Button({ label: t('common.back'), icon: 'back', variant: 'quiet', onClick: () => navigate('#settings') })) : null,
    heading(t('picker.title')),
    h('p', null, t('picker.intro')),
    h('div', { class: 'picker__grid', role: 'group', 'aria-label': t('picker.title') }, cards),
    h('label', { class: 'field', for: 'pet-name' }, h('span', { class: 'field__label' }, t('picker.nameLabel')), nameInput),
    h('div', { class: 'screen__actions' }, startBtn)));
}

/* ---------------- Home ---------------- */
export function HomeScreen(root: HTMLElement): void {
  const pet = getPet()!;
  const mood = currentMood();
  const slots = Array.from({ length: 4 }, (_, i) => h('div', { class: `home__slot home__slot--${i + 1}`, 'data-slot': String(i + 1), title: t('home.emptySlot') }, h('span', { class: 'k-sr' }, t('home.emptySlot'))));
  const room = h('section', { class: 'home__room', 'aria-label': t('home.room', { name: pet.name }) },
    h('div', { class: 'home__scene' }, artEl('scene.house.room1', { decorative: true })),
    ...slots,
    h('div', { class: 'home__pet' }, PetFigure({ pet: pet.species, mood, label: `${pet.name}, ${t(`mood.${mood}`)}` })),
    h('p', { class: 'home__caption' }, h('strong', { lang: 'es' }, pet.name), ' · ', h('span', { lang: mood === 'siesta' ? 'es' : undefined }, mood === 'siesta' ? 'Descansando' : t(`mood.${mood}`)),
      ' ', h('span', { class: 'k-star-total', 'data-stars': String(getStars()) }, h('span', { class: 'k-star-total__icon', 'aria-hidden': 'true' }, '★'), h('span', { 'aria-hidden': 'true' }, String(getStars())), h('span', { class: 'k-sr' }, t('home.stars', { n: getStars() })))));
  const lang = getLang();
  const games = registry.map((g) => {
    const playable = g.status === 'playable';
    const card = h(playable ? 'a' : 'div', {
      class: `home__game${playable ? '' : ' is-soon'}`,
      href: playable ? `#game/${g.id}` : undefined,
      'aria-disabled': playable ? undefined : 'true',
    },
      h('span', { class: 'home__game-art' }, artEl(g.art ?? `ui.game.${g.id}`, { decorative: true })),
      h('span', { class: 'home__game-text' },
        h('strong', { class: 'home__game-name', lang: 'es' }, g.name),
        h('span', { class: 'home__game-about' }, g.about[lang] ?? g.about.en),
        h('span', { class: 'home__game-meta' }, playable ? h('span', { class: 'home__play' }, icon('play'), t('home.play')) : h('span', { class: 'home__soon' }, icon('clock'), t('home.soon')), g.levels ? h('span', null, g.levels) : null)));
    return card;
  });
  mount(root, h('div', { class: 'screen home' },
    h('header', { class: 'home__header' },
      h('h1', { tabindex: '-1', class: 'screen__title' }, t('app.name')),
      Button({ label: t('home.settings'), icon: 'settings', iconOnly: true, variant: 'secondary', onClick: () => navigate('#settings') })),
    room,
    h('h2', null, t('home.games')),
    h('div', { class: 'home__games' }, games)));
}

/* ---------------- Settings ---------------- */
export function SettingsScreen(root: HTMLElement, rerender: () => void): void {
  const s = getSettings();
  const choice = <K extends keyof Settings>(key: K, label: string, options: { value: Settings[K]; label: string }[]) => {
    const name = `set-${String(key)}`;
    return h('fieldset', { class: 'set__group' },
      h('legend', null, label),
      h('div', { class: 'set__options' }, options.map((o) => {
        const id = `${name}-${String(o.value)}`;
        const input = h('input', { type: 'radio', name, id, value: String(o.value), checked: s[key] === o.value, class: 'set__radio' }) as HTMLInputElement;
        input.addEventListener('change', () => { saveSettings({ [key]: o.value } as Partial<Settings>); rerender(); });
        return h('label', { class: 'set__option', for: id }, input, h('span', null, o.label));
      })));
  };
  const pet = getPet();
  mount(root, h('div', { class: 'screen settings' },
    h('div', { class: 'screen__bar' }, Button({ label: t('common.back'), icon: 'back', variant: 'quiet', onClick: () => navigate('#home') })),
    heading(t('settings.title')),
    choice('lang', t('settings.language'), LANGS.map((l) => ({ value: l.id as Lang, label: l.label }))),
    choice('sound', t('settings.sound'), [{ value: true, label: t('settings.soundOn') }, { value: false, label: t('settings.soundOff') }]),
    choice('reduceMotion', t('settings.motion'), [{ value: true, label: t('common.yes') }, { value: false, label: t('common.no') }]),
    choice('vibration', t('settings.vibration'), [{ value: true, label: t('settings.vibrationOn') }, { value: false, label: t('settings.vibrationOff') }]),
    choice('textSize', t('settings.textSize'), [{ value: 'normal', label: t('settings.textNormal') }, { value: 'large', label: t('settings.textLarge') }, { value: 'xlarge', label: t('settings.textXlarge') }]),
    pet ? Panel({ title: t('settings.pet'), level: 2, children: [
      h('div', { class: 'set__pet' }, h('div', { class: 'set__pet-fig' }, PetFigure({ pet: pet.species, label: pet.name })), h('strong', { lang: 'es' }, pet.name)),
      Button({ label: t('settings.changePet'), variant: 'outline', icon: 'refresh', onClick: () => navigate('#picker') }),
    ] }) : null,
    Panel({ title: t('settings.progress'), level: 2, children: [
      h('p', { class: 'set__note' }, t('settings.progressNote')),
      h('div', { class: 'set__buttons' },
        Button({ label: t('settings.save'), icon: 'download', variant: 'secondary', onClick: () => { downloadProgress(); toast(t('progress.saved'), { icon: 'check' }); } }),
        Button({ label: t('settings.load'), icon: 'upload', variant: 'secondary', onClick: async () => {
          const r = await pickProgressFile();
          if (r.ok) { toast(t('progress.loaded'), { icon: 'check' }); rerender(); }
          else if (r.error !== 'cancelled') toast(t('progress.loadError'), { icon: 'info' });
        } }),
        Button({ label: t('settings.reset'), icon: 'undo', variant: 'outline', onClick: () => {
          const m = Modal({ title: t('settings.resetConfirmTitle'), children: [h('p', null, t('settings.resetConfirm'))], actions: [
            Button({ label: t('common.cancel'), variant: 'outline', onClick: () => m.close() }),
            Button({ label: t('settings.resetDo'), onClick: () => { store.clear(); m.close(); toast(t('settings.resetDone'), { icon: 'check' }); navigate('#picker'); } }),
          ] });
          m.open();
        } })),
    ] })));
}

/** Simple frame for "game not found" and similar. */
export function MessageScreen(root: HTMLElement, text: string, iconName: IconName = 'info'): void {
  mount(root, h('div', { class: 'screen' }, Frame({ children: [h('p', null, icon(iconName), ' ', text), Button({ label: t('common.back'), icon: 'back', onClick: () => navigate('#home') })] })));
}
