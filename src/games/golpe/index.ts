/**
 * Golpe de voz. Routes after #game/golpe:
 *   (none)                      modes
 *   play/<mode>[/seed-<n>]      a round (10 words, or 8 sentences in the diacritic mode)
 * Word: tap the stressed syllable, then say whether it needs a written accent; a rule card explains it.
 * Sentence: tap the words that need a diacritic accent, then check. No timer.
 */
import { h, mount as put } from '../../ui/h';
import { Button } from '../../ui/components';
import { getLang, t } from '../../i18n';
import { store } from '../../data/storage';
import { earn } from '../../rewards/show';
import { STARS } from '../../rewards/config';
import { allWords } from '../../words/bank';
import type { GameContext, GameHandle } from '../../app/router';
import { cheer, decorBand, finishPanel, gameRoot, header, modeList, progress, statusLine } from '../kit/ui';
import { hasVoice, hush, say } from '../kit/voice';
import { MODES, accentedForm, makeSentenceRound, makeWordRound, sentenceRight, wordRight, type ModeId, type SentenceTask, type WordTask } from './engine';
import './golpe.css';

const GAME = 'golpe';
const NAMES: Record<ModeId, string> = { tipos: 'Agudas, llanas y esdrújulas', hiatos: 'Diptongos e hiatos', diacriticas: 'Tildes diacríticas', mezcla: 'Palabras difíciles' };
const TYPE_ES: Record<string, string> = { aguda: 'Aguda', llana: 'Llana', 'esdrújula': 'Esdrújula', sobresdrújula: 'Sobresdrújula' };
type Done = Partial<Record<ModeId, number>>;

export function mount(root: HTMLElement, ctx: GameContext): GameHandle {
  const content = gameRoot(root, 'gv');
  let voice = false;
  void hasVoice().then((v) => { voice = v; });

  function render(path: string[]): void {
    hush();
    const [head, mode, seedSeg] = path;
    const m = MODES.find((x) => x.id === mode);
    const seed = seedSeg?.startsWith('seed-') ? Number(seedSeg.slice(5)) : Math.floor(Math.random() * 1e9);
    put(content, head === 'play' && m ? playView(m.id, seed) : modesView());
    window.scrollTo(0, 0);
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  function modesView(): HTMLElement {
    return h('div', { class: 'kit-list' },
      header('Golpe de voz', ctx.exit),
      decorBand(GAME, ['microfono', 'nota', 'tambor', 'rayo']),
      h('p', { class: 'kit-soft' }, t('gv.intro')),
      modeList(MODES.map((x) => ({ id: x.id, level: x.level, name: NAMES[x.id], note: t(`gv.mode.${x.id}` as 'gv.mode.tipos') })),
        (id) => ctx.go(['play', id]), store.get<Done>('gv.done', {}) as Record<string, number>));
  }

  function playView(mode: ModeId, seed: number): HTMLElement {
    const tasks: (WordTask | SentenceTask)[] = mode === 'diacriticas' ? makeSentenceRound(seed) : makeWordRound(mode, allWords(), seed);
    let i = 0, right = 0, stars = 0;
    const view = h('div', { class: 'kit-list' });
    const back = () => ctx.go([]);
    const tr = (x: { en: string; ru: string }) => (getLang() === 'ru' ? x.ru : x.en);

    function nextButton(): HTMLButtonElement {
      const b = Button({ label: i + 1 < tasks.length ? t('kit.next') : t('kit.finish'), icon: 'chevronRight', onClick: () => { i++; if (i < tasks.length) showTask(); else finish(); } });
      b.hidden = true;
      return b;
    }
    const award = (ok: boolean, near: Element) => { if (ok) { right++; stars += STARS.golpe.item; earn(GAME, STARS.golpe.item, `golpe ${mode}`, near); cheer(); } };

    function wordView(task: WordTask): HTMLElement {
      const status = statusLine();
      const next = nextButton();
      let tapped = -1;
      const listen = voice ? Button({ label: t('kit.listen'), icon: 'volume', variant: 'secondary', onClick: () => void say(task.word) }) : null;
      const sylls = task.shown.map((s, k) => h('button', { type: 'button', class: 'gv-syl', lang: 'es', 'data-i': String(k), onClick: () => tap(k) }, s));
      const ask = h('div', { class: 'gv-ask', hidden: true },
        h('p', { class: 'kit-prompt' }, t('gv.askAccent')),
        h('div', { class: 'kit-row' },
          Button({ label: 'Sí, lleva tilde', onClick: () => answer(true) }),
          Button({ label: 'No lleva tilde', variant: 'secondary', onClick: () => answer(false) })));
      const prompt = h('p', { class: 'kit-prompt' }, t('gv.askSyllable'));
      const rule = h('div', { class: 'gv-reveal', hidden: true });
      function tap(k: number): void {
        if (tapped >= 0) return;
        tapped = k;
        sylls.forEach((b, j) => { b.disabled = true; b.classList.toggle('is-picked', j === k); b.classList.toggle('is-stressed', j === task.info.stressed); });
        if (k === task.info.stressed) status.show('ok', t('gv.sylRight'));
        else status.show('wrong', t('gv.sylWas', { s: task.shown[task.info.stressed] }));
        ask.hidden = false;
        ask.querySelector('button')?.focus();
      }
      function answer(yes: boolean): void {
        ask.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const ok = wordRight(task, tapped, yes);
        const accentRight = yes === task.info.hasAccent;
        status.show(ok ? 'ok' : accentRight ? 'near' : 'wrong', ok ? t('feedback.correct') : accentRight ? t('gv.accentRightOnly') : t(task.info.hasAccent ? 'gv.needsAccent' : 'gv.noAccent'));
        rule.hidden = false;
        put(rule,
          h('p', { class: 'kit-big gv-word', lang: 'es' }, task.info.syllables.map((s, j) => h('span', { class: j === task.info.stressed ? 'gv-word__stress' : undefined }, s)).flatMap((s, j) => (j ? ['·', s] : [s]))),
          h('p', { class: 'kit-rule', lang: 'es' }, h('strong', null, `${TYPE_ES[task.info.type]}. `), task.info.reason));
        award(ok, rule);
        if (voice) void say(task.word);
        next.hidden = false; next.focus();
      }
      return h('section', { class: 'kit-card' },
        h('p', { class: 'kit-soft kit-small' }, tr(task.translation)),
        h('div', { class: 'gv-syls', role: 'group', 'aria-label': t('gv.syllables') }, sylls),
        listen, prompt, ask, status.el, rule, next);
    }

    function sentenceView(task: SentenceTask): HTMLElement {
      const status = statusLine();
      const next = nextButton();
      const choices: boolean[] = [];
      const buttons: HTMLButtonElement[] = [];
      const body = h('p', { class: 'gv-sentence', lang: 'es' }, task.parts.map((p) => {
        if ('text' in p) return p.text;
        const k = buttons.length; choices.push(false);
        const b = h('button', { type: 'button', class: 'gv-choice', 'aria-pressed': 'false', onClick: () => {
          choices[k] = !choices[k]; b.setAttribute('aria-pressed', String(choices[k])); b.textContent = choices[k] ? accentedForm(p.plain) : p.plain;
        } }, p.plain) as HTMLButtonElement;
        buttons.push(b);
        return b;
      }));
      const words = task.parts.filter((p): p is Extract<SentenceTask['parts'][number], { plain: string }> => 'plain' in p);
      const rules = h('ul', { class: 'gv-rules', hidden: true });
      const check = Button({ label: t('kit.check'), icon: 'check', onClick: () => {
        check.disabled = true;
        const ok = sentenceRight(task, choices);
        buttons.forEach((b, k) => { b.disabled = true; b.textContent = words[k].answer; b.classList.add((words[k].answer !== words[k].plain) === choices[k] ? 'is-right' : 'is-wrong'); });
        status.show(ok ? 'ok' : 'wrong', ok ? t('feedback.correct') : t('gv.sentenceWas'), task.sentence);
        rules.hidden = false;
        put(rules, words.map((w) => h('li', { class: 'kit-rule', lang: 'es' }, w.rule)));
        award(ok, body);
        if (voice) void say(task.sentence);
        next.hidden = false; next.focus();
      } });
      return h('section', { class: 'kit-card' }, h('p', { class: 'kit-prompt' }, t('gv.askSentence')), body, check, status.el, rules, next);
    }

    function showTask(): void {
      const task = tasks[i];
      put(view, header(NAMES[mode], back, t('kit.modes')), progress(i + 1, tasks.length), task.kind === 'word' ? wordView(task) : sentenceView(task));
      view.querySelector<HTMLElement>('.gv-syl, .gv-choice')?.focus({ preventScroll: true });
    }
    function finish(): void {
      const d = store.get<Done>('gv.done', {}); d[mode] = (d[mode] ?? 0) + 1; store.set('gv.done', d);
      const bonus = STARS.golpe.round;
      put(view, header(NAMES[mode], back, t('kit.modes')),
        finishPanel({ game: GAME, stars: stars + bonus, bonus, right, total: tasks.length, reason: `golpe ${mode} round`, again: () => ctx.go(['play', mode]), modes: back }));
    }
    if (!tasks.length) put(view, header(NAMES[mode], back, t('kit.modes')), h('p', { class: 'kit-message' }, t('kit.noItems')));
    else showTask();
    return view;
  }

  render(ctx.path);
  return { update: render, destroy: () => hush() };
}
