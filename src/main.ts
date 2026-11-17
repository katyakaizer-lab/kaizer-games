/** Stage 1 shell. The hub, pet picker and Constelaciones replace this in stage 2. */
import { boot } from './app/boot';
import { registerSW } from './app/pwa';
import { h, mount } from './ui/h';
import { Frame } from './ui/components';
import { PetFigure } from './pets/pets';
import { t } from './i18n';
import './app/shell.css';

await boot();
registerSW();

const app = document.getElementById('app')!;
mount(app,
  Frame({ class: 'shell__card', children: [
    h('div', { class: 'shell__pet' }, PetFigure({ pet: 'brote', mood: 'alegria' })),
    h('h1', null, t('app.name')),
    h('p', null, t('shell.stage1')),
    h('a', { class: 'k-btn k-btn--primary k-btn--lg', href: 'style-test/index.html' }, t('shell.openStyleTest')),
  ] }),
);

