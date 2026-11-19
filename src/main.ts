/** App entry: boot, then render the screen for the current hash. */
import { boot } from './app/boot';
import { registerSW } from './app/pwa';
import { applySettings } from './app/settings';
import { getActivePet, migratePets } from './app/pet-state';
import { CreatorScreen } from './app/creator';
import { gameLoader, navigate, parseRoute, type GameHandle } from './app/router';
import { HomeScreen, MessageScreen, SettingsScreen } from './app/screens';
import { t } from './i18n';
import './app/app.css';

await boot();
migratePets(); // saves from before pet profiles (2026-11-19)
registerSW();

const root = document.getElementById('app')!;
let game: { id: string; handle: GameHandle } | null = null;
let renderId = 0;

async function render(): Promise<void> {
  const id = ++renderId;
  const route = parseRoute();
  if (game && route.name === 'game' && route.game === game.id) { game.handle.update(route.path); return; }
  game?.handle.destroy();
  game = null;
  applySettings();
  document.documentElement.dataset.theme = 'brote';
  if (!getActivePet() && route.name !== 'picker' && route.name !== 'settings') { navigate('#picker'); return; }
  root.className = `app app--${route.name}`;
  if (route.name === 'picker') CreatorScreen(root, { edit: !!getActivePet() });
  else if (route.name === 'pet') CreatorScreen(root, { edit: true });
  else if (route.name === 'settings') SettingsScreen(root, render);
  else if (route.name === 'game') {
    const load = gameLoader(route.game!);
    if (!load) { MessageScreen(root, t('home.soon'), 'clock'); return; }
    const mod = await load();
    if (id !== renderId) return;
    root.replaceChildren();
    const gid = route.game!;
    game = { id: gid, handle: mod.mount(root, {
      path: route.path,
      go: (path) => navigate(`#game/${gid}${path.length ? '/' + path.map(encodeURIComponent).join('/') : ''}`),
      exit: () => navigate('#home'),
    }) };
  } else HomeScreen(root);
  if (route.name !== 'game') { window.scrollTo(0, 0); root.querySelector<HTMLElement>('.screen__title')?.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', () => void render());
await render();
document.documentElement.dataset.ready = 'true';
