/**
 * ¿Pero o perro?. Routes after #game/pares:
 *   (none)                    sets of pairs
 *   play/<set>[/seed-<n>]     a round of 10
 * Hear a word (Katya's recording audio/pairs/<id>.mp3 when present, else the device's Spanish voice) and choose
 * between two. Replay is always there. Without a Spanish voice the game shows a short message instead.
 */
import { h, mount as put } from '../../ui/h';
import { Button } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import { allWords } from '../../words/bank';
import { artEl, hasArt } from '../../ui/art';
import { speakerFor, spanishVoice, type Speaker } from '../../audio/speech';
import type { GameContext, GameHandle } from '../../app/router';
import { cheer, decorBand, finishPanel, gameRoot, header, modeList, progress, statusLine } from '../kit/ui';
import { hush } from '../kit/voice';
import { SETS, audioId, bankPairs, isRight, makeRound, type Question, type SetId } from './engine';
import './pares.css';

const GAME = 'pares';
type Done = Record<string, number>;
const speaker = (word: string): Promise<Speaker> => speakerFor(`pairs-${audioId(word)}`, word, `audio/pairs/${audioId(word)}.mp3`);

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = gameRoot(root, 'par');
  const pairs = bankPairs(allWords());
  let current: Speaker | null = null;
  let token = 0;

  async function render(path: string[]): Promise<void> {
    const my = ++token;
    current?.stop(); hush();
    const [head, set, seedSeg] = path;
    const s = SETS.find((x) => x.id === set);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : Math.floor(Math.random() * 1e9);
    // The game needs a voice: the device's, or a recording of the first word.
    const ok = !!(await spanishVoice()) || (await speaker(pairs[0]?.a ?? 'pero')).available;
    if (my !== token) return;
    put(content, !ok ? noVoiceView() : head === 'play' && s ? playView(s.id, seed) : setsView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  function noVoiceView(): HTMLElement {
    return h('div', { class: 'kit-list' }, header('¿Pero o perro?', ctx.exit), h('p', { class: 'kit-message' }, t('par.noVoice')));
  }

  function setsView(): HTMLElement {
    const done = store.get<Done>('par.done', {});
    return h('div', { class: 'kit-list' },
      header('¿Pero o perro?', ctx.exit),
      decorBand(GAME, ['oreja', 'huella', 'hueso', 'nota']),
      h('p', { class: 'kit-soft' }, t('par.intro')),
      modeList(SETS.filter((x) => x.id === 'mezcla' || pairs.some((p) => p.set === x.id)).map((x) => ({
        id: x.id, level: x.level, name: x.name,
        note: x.id === 'mezcla' ? t('par.mixNote') : pairs.filter((p) => p.set === x.id).slice(0, 3).map((p) => `${p.a} / ${p.b}`).join(', '),
      })), (id) => ctx.go(['play', id]), done));
  }

  function playView(set: SetId | 'mezcla', seed: number): HTMLElement {
    const qs = makeRound(pairs, set, seed);
    const name = SETS.find((x) => x.id === set)!.name;
    let i = 0, right = 0, stars = 0;
    const view = h('div', { class: 'kit-list' });
    const back = () => ctx.go([]);
    const tr = (w: string, q: Question) => { const e = q.pair.entries[w]; return e ? (getLang() === 'ru' ? e.translations.ru : e.translations.en) : ''; };

    function show(): void {
      const q = qs[i];
      const status = statusLine();
      const next = Button({ label: i + 1 < qs.length ? t('kit.next') : t('kit.finish'), icon: 'chevronRight', onClick: () => { i++; if (i < qs.length) show(); else finish(); } });
      next.hidden = true;
      let answered = false;
      const play = async (slow = false) => { current?.stop(); current = await speaker(q.heard); await current.play(slow); };
      const option = (w: string) => {
        const e = q.pair.entries[w];
        const pic = e && hasArt(e.art) ? h('span', { class: 'par-pic' }, artEl(e.art, { decorative: true })) : null;
        const b = h('button', { type: 'button', class: 'par-option', lang: 'es', onClick: () => choose(w, b) }, pic, h('span', { class: 'par-option__word' }, w)) as HTMLButtonElement;
        return b;
      };
      const opts = q.options.map(option);
      function choose(w: string, b: HTMLButtonElement): void {
        if (answered) return;
        answered = true;
        opts.forEach((o) => { o.disabled = true; });
        const ok = isRight(q, w);
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        opts.find((o) => o.textContent === q.heard)?.classList.add('is-right');
        const detail = q.options.map((x) => (tr(x, q) ? `${x}: ${tr(x, q)}` : x)).join(' · ');
        if (ok) { right++; stars += STARS.pares.item; earn(GAME, STARS.pares.item, `pares ${set}`, b); cheer(); status.show('ok', t('feedback.correct'), detail); }
        else status.show('wrong', t('par.itWas', { w: q.heard }), detail);
        next.hidden = false; next.focus();
      }
      put(view,
        header(name, back, t('kit.modes')),
        progress(i + 1, qs.length),
        h('section', { class: 'kit-card' },
          h('p', { class: 'kit-prompt' }, t('par.ask')),
          h('div', { class: 'kit-row' },
            Button({ label: t('par.again'), icon: 'volume', onClick: () => void play() }),
            Button({ label: t('kit.slow'), icon: 'slow', variant: 'secondary', onClick: () => void play(true) })),
          h('div', { class: 'par-options', role: 'group', 'aria-label': t('par.options') }, opts),
          status.el, next));
      void play();
    }
    function finish(): void {
      const d = store.get<Done>('par.done', {}); d[set] = (d[set] ?? 0) + 1; store.set('par.done', d);
      const bonus = STARS.pares.round;
      put(view, header(name, back, t('kit.modes')),
        finishPanel({ game: GAME, stars: stars + bonus, bonus, right, total: qs.length, reason: `pares ${set} round`, again: () => ctx.go(['play', set]), modes: back }));
    }
    if (!qs.length) put(view, header(name, back, t('kit.modes')), h('p', { class: 'kit-message' }, t('kit.noItems')));
    else show();
    return view;
  }

  void render(ctx.path);
  return { update: (p) => void render(p), destroy: () => { current?.stop(); hush(); } };
}
