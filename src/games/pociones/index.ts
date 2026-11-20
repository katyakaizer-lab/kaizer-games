/**
 * Pociones de números. Routes after #game/pociones:
 *   (none)                         modes
 *   play/<mode>[/oir][/seed-<n>]   a round of 8 (oir: listening, type the number in digits)
 * Counting modes: count the things in the cauldron, type the digits, then the number word before its noun.
 * Other modes: read the digits and write them in words. No timer.
 */
import { h, mount as put } from '../../ui/h';
import { Button, Chip } from '../../ui/components';
import { t } from '../../i18n';
import { store } from '../../data/storage';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import type { GameContext, GameHandle } from '../../app/router';
import { answerField, cheer, decorBand, finishPanel, gameRoot, header, modeList, progress, showChecked, silhouette, statusLine } from '../kit/ui';
import { hasVoice, hush, say } from '../kit/voice';
import { MODES, checkDigits, checkWords, makeRound, type ModeId, type Task } from './engine';
import './pociones.css';

const GAME = 'pociones';
const NAMES: Record<ModeId, string> = {
  contar: 'Contar hasta 20', cien: 'Hasta 100', mil: 'Hasta 1000', precios: 'Precios en euros', millones: 'Miles y millones',
  ordinales: 'Ordinales', fechas: 'Años y fechas', mezcla: 'Mezcla de pociones',
};
type Done = Partial<Record<ModeId, number>>;

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = gameRoot(root, 'poc');
  let voice = false;
  void hasVoice().then((v) => { voice = v; if (!ctx.path.length) render(ctx.path); });

  function render(path: string[]): void {
    hush();
    const [head, mode, ...rest] = path;
    const m = MODES.find((x) => x.id === mode);
    const listen = rest.includes('oir');
    const seedSeg = rest.find((s) => s.startsWith('seed-'));
    const seed = seedSeg ? Number(seedSeg.slice(5)) : Math.floor(Math.random() * 1e9);
    put(content, head === 'play' && m ? playView(m.id, listen, seed) : modesView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  function modesView(): HTMLElement {
    let listen = store.get<boolean>('poc.listen', false) && voice;
    return h('div', { class: 'kit-list' },
      header('Pociones de números', ctx.exit),
      decorBand(GAME, ['caldero', 'estrella', 'gota', 'vela']),
      h('p', { class: 'kit-soft' }, t('poc.intro')),
      voice ? h('div', { class: 'kit-row' }, Chip({ label: t('poc.listenMode'), pressed: listen, onToggle: (on) => { listen = on; store.set('poc.listen', on); } }))
        : h('p', { class: 'kit-soft kit-small' }, t('poc.noVoice')),
      modeList(MODES.map((x) => ({ id: x.id, level: x.level, name: NAMES[x.id], note: t(`poc.mode.${x.id}` as 'poc.mode.contar') })),
        (id) => ctx.go(['play', id, ...(listen ? ['oir'] : [])]), store.get<Done>('poc.done', {}) as Record<string, number>));
  }

  function playView(mode: ModeId, listen: boolean, seed: number): HTMLElement {
    const tasks = makeRound(mode, seed);
    let i = 0, right = 0, stars = 0;
    const view = h('div', { class: 'kit-list' });
    const back = () => ctx.go([]);

    function cauldron(task: Task): HTMLElement {
      if (task.show.kind !== 'count') return h('p', { class: 'kit-big poc-digits', lang: 'es' }, task.show.text);
      const { n, tens, shape } = task.show;
      const id = `decor.pociones.${shape}`;
      return h('div', { class: 'poc-cauldron', role: 'img', 'aria-label': t('poc.cauldronLabel') },
        h('div', { class: 'poc-cauldron__things' },
          Array.from({ length: tens }, () => h('span', { class: 'poc-jar' }, silhouette(id, 'poc-thing'), h('span', { class: 'poc-jar__n' }, '10'))),
          Array.from({ length: n - tens * 10 }, () => silhouette(id, 'poc-thing'))),
        silhouette('decor.pociones.caldero', 'poc-cauldron__pot'));
    }

    function showTask(): void {
      const task = tasks[i];
      let firstTry = true;
      const status = statusLine();
      const next = Button({ label: i + 1 < tasks.length ? t('kit.next') : t('kit.finish'), icon: 'chevronRight', onClick: () => { i++; if (i < tasks.length) showTask(); else finish(); } });
      next.hidden = true;
      const done = (ok: boolean) => {
        if (ok && firstTry) { right++; stars += STARS.pociones.item; earn(GAME, STARS.pociones.item, `pociones ${mode}`, next); }
        field.setDisabled(true); next.hidden = false; next.focus();
      };
      const listenRow = listen ? h('div', { class: 'kit-row' },
        Button({ label: t('kit.listen'), icon: 'volume', onClick: () => void say(task.spoken) }),
        Button({ label: t('kit.slow'), icon: 'slow', variant: 'secondary', onClick: () => void say(task.spoken, true) })) : null;
      const counting = !listen && task.show.kind === 'count';
      let step: 'digits' | 'words' = listen || counting ? 'digits' : 'words';
      const wordsPrompt = () => (task.mode === 'precios' ? t('poc.askPrice') : task.mode === 'fechas' ? t('poc.askDate') : t('poc.askWords'));
      const prompt = h('p', { class: 'kit-prompt' }, step === 'digits' ? (listen ? t('poc.askListen') : t('poc.askCount')) : wordsPrompt());
      const field = answerField({
        label: prompt.textContent ?? '', inputMode: step === 'digits' ? (task.mode === 'precios' ? 'decimal' : 'numeric') : 'text',
        prefix: step === 'words' ? task.prefix : undefined, suffix: step === 'words' ? task.suffix : undefined,
        onSubmit: (v) => {
          if (step === 'digits') {
            if (checkDigits(task, v)) {
              if (listen) { status.show('ok', t('feedback.correct'), `${task.digits} · ${task.spoken}`); cheer(); return done(true); }
              status.show('ok', t('poc.countRight', { n: task.digits }));
              cheer(2);
            } else {
              firstTry = false;
              status.show('wrong', t('kit.answerIs'), listen ? `${task.digits} · ${task.spoken}` : task.digits);
              if (listen) return done(false);
            }
            // Counting: go on to the word.
            step = 'words';
            prompt.textContent = wordsPrompt();
            const f2 = answerField({ label: wordsPrompt(), prefix: task.prefix, suffix: task.suffix, onSubmit: (w) => checkW(w, f2) });
            field.el.replaceWith(f2.el);
            Object.assign(field, f2);
            f2.focus();
            return;
          }
          checkW(v, field);
        },
      });
      function checkW(v: string, f: ReturnType<typeof answerField>): void {
        const c = checkWords(task, v);
        const finished = showChecked(status, c, c.hint);
        if (c.verdict === 'wrong') firstTry = false;
        if (finished) { f.setDisabled(true); done(c.verdict === 'ok'); }
        else f.focus();
      }
      put(view,
        header(NAMES[mode], back, t('kit.modes')),
        progress(i + 1, tasks.length),
        h('section', { class: 'kit-card' }, listen ? h('p', { class: 'kit-soft' }, t('poc.listenNote')) : cauldron(task), listenRow, prompt, field.el, status.el, next));
      field.focus();
      if (listen) void say(task.spoken);
    }

    function finish(): void {
      const d = store.get<Done>('poc.done', {}); d[mode] = (d[mode] ?? 0) + 1; store.set('poc.done', d);
      const bonus = STARS.pociones.round;
      put(view, header(NAMES[mode], back, t('kit.modes')),
        finishPanel({ game: GAME, stars: stars + bonus, bonus, right, total: tasks.length, reason: `pociones ${mode} round`, again: () => ctx.go(['play', mode, ...(listen ? ['oir'] : [])]), modes: back }));
    }
    showTask();
    return view;
  }

  render(ctx.path);
  return { update: render, destroy: () => { hush(); } };
}
