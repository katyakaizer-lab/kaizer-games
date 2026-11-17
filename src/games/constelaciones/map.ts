/**
 * Galaxy map: each constellation is a small star cluster at a seeded position (same layout every time).
 * Stories are drawn as linked groups. Lit clusters glow, the suggested one pulses gently
 * (a static ring with reduced motion), due ones twinkle and carry a sparkle icon. No free panning.
 */
import { h } from '../../ui/h';
import { icon } from '../../ui/icons';
import { t } from '../../i18n';
import { numberOf } from './data';
import { clusterShape, galaxyLayout, MAP_W } from './layout';
import { hashString, rng, type Constellation } from './sentence';

export interface MapItem { c: Constellation; state: 'locked' | 'open' | 'cleared'; due: boolean; suggested: boolean; lockedNote?: string }

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function createMap(items: MapItem[], o: { onPick(item: MapItem, from: HTMLElement): void }): HTMLElement {
  const { pos, height } = galaxyLayout(items.map((i) => i.c.id));
  const svg = svgEl('svg', { viewBox: `0 0 ${MAP_W} ${height}`, class: 'cz-map__sky', 'aria-hidden': 'true' });

  // A quiet starfield (decoration only).
  const r = rng(hashString(`sky:${items.length}`));
  for (let i = 0; i < Math.round(height * 0.9); i++) svg.append(svgEl('circle', { cx: r() * MAP_W, cy: r() * height, r: 0.15 + r() * 0.25, class: 'cz-sky-dot' }));

  // Story links between consecutive parts.
  items.forEach((it, k) => {
    const prev = items[k - 1];
    if (!it.c.story || !prev?.c.story || prev.c.story.id !== it.c.story.id) return;
    const a = pos.get(prev.c.id)!, b = pos.get(it.c.id)!;
    svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `cz-story-link${it.state === 'cleared' && prev.state === 'cleared' ? ' is-lit' : ''}` }));
  });

  const buttons: HTMLElement[] = [];
  for (const it of items) {
    const p = pos.get(it.c.id)!;
    const shape = clusterShape(it.c.id, it.c.tokens.length);
    const g = svgEl('g', { class: `cz-cluster is-${it.state}${it.due ? ' is-due' : ''}${it.suggested ? ' is-suggested' : ''}`, transform: `translate(${p.x} ${p.y})` });
    if (it.suggested) g.append(svgEl('circle', { r: 10.5, class: 'cz-pulse' }));
    if (it.state === 'cleared') {
      const d = shape.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ');
      g.append(svgEl('path', { d, class: 'cz-cluster__line' }));
    }
    shape.forEach((q, i) => g.append(svgEl('circle', { cx: q.x, cy: q.y, r: it.state === 'cleared' ? 1.05 : 0.75, class: 'cz-cluster__dot', style: `--i:${i}` })));
    svg.append(g);

    const n = numberOf(it.c.id);
    const stateText = it.state === 'cleared' ? t('cz.cleared') : it.state === 'locked' ? (it.lockedNote ?? '') : t('cz.notCleared');
    const label = [t('cz.constellation', { n }), it.c.level, stateText, it.due ? t('cz.due') : '', it.suggested ? t('cz.suggested') : ''].filter(Boolean).join(', ');
    const b = h('button', {
      type: 'button',
      class: `cz-map__star is-${it.state}${it.due ? ' is-due' : ''}${it.suggested ? ' is-suggested' : ''}`,
      style: { left: `${(p.x / MAP_W) * 100}%`, top: `${(p.y / height) * 100}%` },
      'aria-label': label,
      'aria-disabled': it.state === 'locked' ? 'true' : undefined,
      'data-id': it.c.id,
    },
      h('span', { class: 'cz-map__tag', 'aria-hidden': 'true' },
        it.state === 'cleared' ? icon('check') : it.state === 'locked' ? icon('lock') : null,
        it.due ? icon('sparkles') : null,
        h('span', null, String(n))));
    b.addEventListener('click', () => { if (it.state !== 'locked') o.onPick(it, b); });
    buttons.push(b);
  }

  return h('div', { class: 'cz-map', style: { aspectRatio: `${MAP_W} / ${height}` }, role: 'group', 'aria-label': t('cz.mapLabel') }, svg, buttons);
}
