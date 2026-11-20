/**
 * Cartas de verbos. Routes after #game/cartas:
 *   (none)                              level and number of bots
 *   play/<level>/<bots>[/seed-<n>]      a game
 * Your turn: tap a card that matches the top card's tense or person, type its form. Right: it goes on the pile.
 * Wrong: the right form is shown and the card stays in your hand. No matching card: take one from the deck.
 */
import { h, mount as put } from '../../ui/h';
import { Button } from '../../ui/components';
import { t } from '../../i18n';
import { store } from '../../data/storage';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import { allWords } from '../../words/bank';
import { prefersReducedMotion } from '../../app/settings';
import type { GameContext, GameHandle } from '../../app/router';
import { LEVELS, checkAnswer, rng, type Level } from '../kit/answer';
import { answerField, cheer, decorBand, finishPanel, gameRoot, header, statusLine } from '../kit/ui';
import { LEVEL_TENSES, TENSE, botTurn, canPlay, deal, draw, play, playable, top, type Card, type GameState } from './engine';
import './cartas.css';

const GAME = 'cartas';

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = gameRoot(root, 'cv');
  let timers: number[] = [];
  const clearTimers = () => { timers.forEach((x) => clearTimeout(x)); timers = []; };

  function render(path: string[]): void {
    clearTimers();
    const [head, lvl, botsSeg, seedSeg] = path;
    const level = LEVELS.find((l) => l === lvl);
    const bots = Math.max(1, Math.min(3, Number(botsSeg) || 1));
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : Math.floor(Math.random() * 1e9);
    put(content, head === 'play' && level ? tableView(level, bots, seed) : setupView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  function setupView(): HTMLElement {
    let level = store.get<Level>('cv.level', 'A1');
    let bots = store.get<number>('cv.bots', 1);
    const radio = (name: string, value: string, checked: boolean, label: string, note: string, on: () => void) => {
      const id = `cv-${name}-${value}`;
      const input = h('input', { type: 'radio', name: `cv-${name}`, id, value, checked, class: 'cv-radio' }) as HTMLInputElement;
      input.addEventListener('change', on);
      return h('label', { class: 'cv-opt', for: id }, input, h('span', { class: 'cv-opt__text' }, h('strong', null, label), note ? h('span', { class: 'kit-small', lang: 'es' }, note) : null));
    };
    return h('div', { class: 'kit-list' },
      header('Cartas de verbos', ctx.exit),
      decorBand(GAME, ['carta', 'estrella', 'sol', 'nube']),
      h('p', { class: 'kit-soft' }, t('cv.intro')),
      h('p', { class: 'kit-soft kit-small' }, t('cv.rules')),
      h('fieldset', { class: 'cv-set' }, h('legend', null, t('cv.level')),
        h('div', { class: 'cv-opts' }, LEVELS.map((l) => radio('level', l, l === level, l, LEVEL_TENSES[l].map((x) => TENSE[x].name).join(', '), () => { level = l; store.set('cv.level', l); })))),
      h('fieldset', { class: 'cv-set' }, h('legend', null, t('cv.bots')),
        h('div', { class: 'cv-opts is-row' }, [1, 2, 3].map((n) => radio('bots', String(n), n === bots, String(n), '', () => { bots = n; store.set('cv.bots', n); })))),
      Button({ label: t('cv.deal'), icon: 'play', size: 'lg', onClick: () => ctx.go(['play', level, String(bots)]) }));
  }

  function cardEl(c: Card, o: { onClick?: () => void; playable?: boolean; big?: boolean; selected?: boolean } = {}): HTMLElement {
    const inner = [
      h('span', { class: 'cv-card__pron', lang: 'es' }, c.pronoun),
      h('span', { class: 'cv-card__verb', lang: 'es' }, c.verb),
      h('span', { class: 'cv-card__tense', lang: 'es' }, TENSE[c.tense].name),
    ];
    const cls = `cv-card tense-${TENSE[c.tense].colour}${o.big ? ' is-big' : ''}${o.playable ? ' is-playable' : ''}${o.selected ? ' is-selected' : ''}`;
    if (!o.onClick) return h('div', { class: cls }, inner);
    return h('button', { type: 'button', class: cls, 'aria-pressed': String(!!o.selected), onClick: o.onClick, 'aria-label': `${c.pronoun}, ${c.verb}, ${TENSE[c.tense].name}${o.playable ? '' : `. ${t('cv.noMatch')}`}` }, inner);
  }

  function tableView(level: Level, bots: number, seed: number): HTMLElement {
    const s: GameState = deal(allWords(), level, bots, seed);
    const r = rng(seed ^ 0x5bd1e995);
    const view = h('div', { class: 'kit-list cv-table' });
    const status = statusLine();
    const log = h('p', { class: 'cv-log', 'aria-live': 'polite' });
    let selected = -1, played = 0, stars = 0, busy = false;
    const back = () => ctx.go([]);
    const delay = prefersReducedMotion() ? 350 : 900;

    function draw_(): void {
      const me = s.turn === 0 && s.winner === null && !busy;
      const opts = playable(s, 0);
      const answerBox = h('div', { class: 'cv-answer' });
      if (me && selected >= 0) {
        const c = s.players[0].hand[selected];
        const f = answerField({ label: t('cv.typeForm'), prefix: c.pronoun, onSubmit: (v) => {
          const res = checkAnswer(v, c.answer);
          if (res.verdict === 'near') { status.show('near', res.note ?? '¡Casi!', t('kit.fixIt')); f.focus(); return; }
          if (res.verdict === 'ok') {
            play(s, 0, selected); selected = -1; played++; stars += STARS.cartas.card;
            earn(GAME, STARS.cartas.card, `cartas ${level}`, pileEl);
            cheer();
            status.show('ok', t('feedback.correct'), `${c.pronoun} ${c.answer}`);
          } else {
            status.show('wrong', t('cv.keepCard'), `${c.pronoun} ${c.answer}`);
            selected = -1;
            s.turn = (s.turn + 1) % s.players.length;
          }
          afterMove();
        } });
        put(answerBox, h('p', { class: 'kit-prompt', lang: 'es' }, `${c.pronoun} · ${c.verb} · ${TENSE[c.tense].name}`), f.el);
        timers.push(window.setTimeout(() => f.focus(), 0));
      } else if (me) {
        put(answerBox, h('p', { class: 'kit-soft' }, opts.length ? t('cv.yourTurn') : t('cv.noCard')),
          Button({ label: t('cv.take'), icon: 'download', variant: opts.length ? 'secondary' : 'primary', onClick: () => { draw(s, 0, r); status.show('info', t('cv.took')); afterMove(); } }));
      }
      const pileEl = h('div', { class: 'cv-pile' },
        h('span', { class: 'kit-small' }, t('cv.pile')), cardEl(top(s), { big: true }),
        h('span', { class: 'kit-small' }, t('cv.deck', { n: s.deck.length })));
      put(view,
        header('Cartas de verbos', back, t('kit.modes')),
        h('ul', { class: 'cv-bots' }, s.players.slice(1).map((p, k) => h('li', { class: `cv-bot${s.turn === k + 1 ? ' is-turn' : ''}` }, h('strong', { lang: 'es' }, p.name), t('cv.cards', { n: p.hand.length })))),
        pileEl, log, status.el,
        h('h2', { class: 'cv-hand__title' }, t('cv.yourHand', { n: s.players[0].hand.length })),
        h('div', { class: 'cv-hand' }, s.players[0].hand.map((c, i) => cardEl(c, {
          playable: me && canPlay(c, top(s)), selected: i === selected,
          onClick: () => {
            if (!me) return;
            if (!canPlay(c, top(s))) { status.show('info', t('cv.noMatch')); return; }
            selected = selected === i ? -1 : i; status.clear(); draw_();
          },
        }))),
        answerBox);
      if (s.winner !== null) finish();
    }
    function afterMove(): void {
      draw_();
      if (s.winner === null && s.turn !== 0) botStep();
    }
    function botStep(): void {
      busy = true;
      timers.push(window.setTimeout(() => {
        const name = s.players[s.turn].name;
        const res = botTurn(s, r);
        log.textContent = res.played ? `${name}: ${res.played.pronoun} ${res.played.answer}` : t('cv.botTook', { name });
        busy = s.winner === null && s.turn !== 0;
        draw_();
        log.textContent = res.played ? `${name}: ${res.played.pronoun} ${res.played.answer}` : t('cv.botTook', { name });
        if (busy) botStep();
      }, delay));
    }
    function finish(): void {
      const won = s.winner === 0;
      const bonus = STARS.cartas.finish + (won ? STARS.cartas.win : 0);
      put(view, header('Cartas de verbos', back, t('kit.modes')),
        h('p', { class: 'kit-prompt' }, won ? t('cv.youWon') : t('cv.botWon', { name: s.players[s.winner!].name })),
        finishPanel({ game: GAME, stars: stars + bonus, bonus, right: played, total: played + s.players[0].hand.length, reason: `cartas ${level} game`, again: () => ctx.go(['play', level, String(bots)]), modes: back }));
    }
    draw_();
    return view;
  }

  render(ctx.path);
  return { update: render, destroy: clearTimers };
}
