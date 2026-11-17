/**
 * Stage two, "Ilumina la frase": the ordered sentence as chips with no capitals or marks.
 * Tasks by level: A1 capital + closing mark; A2 + accents; B1 and above + commas and opening marks.
 * Tap a word to capitalise it; choose a mark from the tray and tap a gap; flagged words offer their
 * accent options (shuffled). Unlimited retries, a short rule hint on a miss.
 */
import { h, mount } from '../../ui/h';
import { icon } from '../../ui/icons';
import { Button, FeedbackBanner } from '../../ui/components';
import { t, type Key } from '../../i18n';
import {
  hashString, initialLightState, lightIssues, shuffled, tasksFor, wordAt, type Constellation, type LightState, type Task,
} from './sentence';

export function createLight(c: Constellation, order: number[], onSolved: () => void): HTMLElement {
  const tasks = tasksFor(c.level);
  const s: LightState = initialLightState(c, order, tasks);
  const n = order.length;
  const marks = [...(tasks.has('open') ? ['¿', '¡'] : []), ...(tasks.has('comma') ? [','] : []), '.', '?', '!'];
  let selected: string | null = null;
  let openWord: number | null = null;
  const accentIdx = new Set(tasks.has('accent') ? c.accents.map((a) => a.index) : []);

  const rowEl = h('div', { class: 'cz-light__row', lang: 'es' });
  const popEl = h('div', { class: 'cz-light__pop', 'aria-live': 'polite' });
  const feedback = h('div', { class: 'cz-light__feedback', 'aria-live': 'polite' });
  const trayButtons = new Map<string, HTMLButtonElement>();

  const gapInteractive = (g: number) => (g === 0 ? tasks.has('open') : g === n ? true : tasks.has('comma'));
  const gapName = (g: number) => (g === 0 ? t('cz.light.gapStart') : g === n ? t('cz.light.gapEnd') : t('cz.light.gap', { n: g }));

  function renderRow() {
    const parts: HTMLElement[] = [];
    for (let g = 0; g <= n; g++) {
      if (g > 0) {
        const pos = g - 1;
        const t0 = order[pos];
        const flagged = accentIdx.has(t0);
        const w = h('button', {
          type: 'button', class: `cz-word${flagged ? ' is-flagged' : ''}${s.caps[pos] ? ' is-cap' : ''}${openWord === pos ? ' is-open' : ''}`,
          'aria-pressed': flagged ? undefined : String(s.caps[pos]),
          'aria-expanded': flagged ? String(openWord === pos) : undefined,
          onClick: () => {
            if (flagged) { openWord = openWord === pos ? null : pos; }
            else { s.caps[pos] = !s.caps[pos]; openWord = null; }
            clearFeedback(); renderRow();
          },
        }, wordAt(c, s, pos), flagged ? h('span', { class: 'cz-word__flag', 'aria-hidden': 'true' }, '´') : null);
        parts.push(w);
      }
      if (gapInteractive(g)) {
        const mark = s.gaps[g];
        parts.push(h('button', {
          type: 'button', class: `cz-gap${mark ? ' is-filled' : ''}${g === 0 ? ' is-start' : g === n ? ' is-end' : ''}`,
          'aria-label': `${gapName(g)}: ${mark || '—'}`,
          // With a mark chosen: place it. With "remove", or nothing chosen: empty the gap.
          onClick: () => { s.gaps[g] = selected && selected !== 'remove' ? selected : ''; clearFeedback(); renderRow(); },
        }, mark || h('span', { class: 'cz-gap__dot', 'aria-hidden': 'true' })));
      } else if (s.gaps[g]) {
        parts.push(h('span', { class: 'cz-fixed', 'aria-hidden': 'true' }, s.gaps[g]));
      }
    }
    mount(rowEl, parts);
    renderPop();
  }

  function renderPop() {
    if (openWord === null) { popEl.replaceChildren(); return; }
    const pos = openWord;
    const t0 = order[pos];
    const acc = c.accents.find((a) => a.index === t0)!;
    const opts = shuffled(acc.options, hashString(c.id + t0));
    mount(popEl, h('div', { class: 'cz-pop', role: 'group', 'aria-label': t('cz.light.accentButton', { word: c.tokens[t0] }) },
      h('button', { type: 'button', class: `cz-pop__cap${s.caps[pos] ? ' is-on' : ''}`, 'aria-pressed': String(s.caps[pos]), onClick: () => { s.caps[pos] = !s.caps[pos]; clearFeedback(); renderRow(); } }, 'Aa'),
      opts.map((opt) => h('button', {
        type: 'button', class: `cz-pop__opt${s.accents[t0] === opt ? ' is-on' : ''}`, 'aria-pressed': String(s.accents[t0] === opt), lang: 'es',
        onClick: () => { s.accents[t0] = opt; clearFeedback(); renderRow(); },
      }, s.caps[pos] ? opt.charAt(0).toLocaleUpperCase('es') + opt.slice(1) : opt)),
      h('button', { type: 'button', class: 'cz-pop__close', 'aria-label': t('common.close'), onClick: () => { openWord = null; renderRow(); } }, icon('x'))));
  }

  function selectMark(m: string) {
    selected = selected === m ? null : m;
    trayButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === selected)));
  }
  const tray = h('div', { class: 'cz-tray', role: 'group', 'aria-label': t('cz.light.tray') },
    [...marks, 'remove'].map((m) => {
      const b = h('button', { type: 'button', class: `cz-tray__mark${m === 'remove' ? ' is-remove' : ''}`, 'aria-pressed': 'false', 'aria-label': m === 'remove' ? t('cz.light.remove') : undefined, onClick: () => selectMark(m) },
        m === 'remove' ? [icon('undo'), h('span', null, t('cz.light.remove'))] : m) as HTMLButtonElement;
      trayButtons.set(m, b);
      return b;
    }));

  function clearFeedback() { feedback.replaceChildren(); }
  const order0: Task[] = ['capital', 'close', 'open', 'accent', 'comma'];
  const taskList = h('ul', { class: 'cz-light__tasks' }, order0.filter((k) => tasks.has(k)).filter((k) => k !== 'accent' || accentIdx.size).map((k) => h('li', null, t(`cz.light.task.${k}` as Key))));

  const el = h('section', { class: 'cz-light', 'aria-labelledby': 'cz-light-title' },
    h('h2', { id: 'cz-light-title', lang: 'es' }, icon('sparkles'), ' ', t('cz.light.title')),
    h('p', null, t('cz.light.intro')),
    taskList,
    rowEl, popEl,
    h('p', { class: 'cz-light__help' }, t('cz.light.trayHelp')),
    tray,
    h('div', { class: 'cz-light__actions' }, Button({ label: t('cz.light.check'), icon: 'check', size: 'lg', onClick: () => {
      const issues = lightIssues(c, s);
      if (!issues.length) { onSolved(); return; }
      mount(feedback, FeedbackBanner({ kind: 'retry', hint: t(`cz.hint.${issues[0]}` as Key) }));
    } })),
    feedback);
  renderRow();
  return el;
}
