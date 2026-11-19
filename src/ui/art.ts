/**
 * Art system. Every picture is referenced by id (e.g. 'pet.brote.calma'), never by path.
 * The single source of truth is public/assets/manifest.json.
 * art(id) returns the file, or a generated vector placeholder when the id or its file is missing.
 */
export type ArtKind = 'pet' | 'pet-item' | 'pet-part' | 'object' | 'scene' | 'character' | 'ui' | 'icon' | 'background' | 'decor';

export interface ArtEntry {
  id: string;
  kind: ArtKind;
  files?: { '1x'?: string; '2x'?: string };
  alt: string;
  level?: string;
  word?: string;
  status: 'placeholder' | 'final';
  aiGenerated: boolean;
  source: { tool: string; date: string; terms: string; prompt: string };
  licence: string;
  /** which games use this id (for the placeholder report) */
  games?: string[];
  /** nine-slice frames: slice inset in image px, border width in CSS px */
  nineSlice?: { slice: number; width: number };
  /** pet items: rig anchor, point in the item canvas that sits on the anchor (designed at headWidth 100), z-order */
  anchor?: string;
  pivot?: [number, number];
  z?: number;
  /** painted art that only suits some themes (e.g. a light paper frame): list them; omitted = all themes */
  themes?: string[];
}

export interface ArtRef {
  id: string;
  /** resolved URL, or null when a placeholder must be drawn */
  src: string | null;
  alt: string;
  entry?: ArtEntry;
  placeholder: boolean;
}

let manifest = new Map<string, ArtEntry>();
let loadPromise: Promise<void> | null = null;

/** Root of the app relative to the current page, from <meta name="app-root">. */
export function appRoot(): string {
  const m = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="app-root"]') : null;
  return m?.content || './';
}
export const assetUrl = (file: string): string => `${appRoot()}assets/${file}`;

export function setManifest(entries: ArtEntry[]): void {
  manifest = new Map(entries.map((e) => [e.id, e]));
}

export function loadManifest(): Promise<void> {
  loadPromise ??= fetch(assetUrl('manifest.json'))
    .then((r) => (r.ok ? r.json() : { assets: [] }))
    .then((j: { assets: ArtEntry[] }) => setManifest(j.assets))
    .catch(() => setManifest([]));
  return loadPromise;
}

export const hasArt = (id: string): boolean => !!manifest.get(id)?.files?.['1x'];
export const artEntry = (id: string): ArtEntry | undefined => manifest.get(id);
export const allArt = (): ArtEntry[] => [...manifest.values()];

export function art(id: string): ArtRef {
  const entry = manifest.get(id);
  const file = entry?.files?.['1x'];
  return { id, src: file ? assetUrl(file) : null, alt: entry?.alt ?? '', entry, placeholder: !file };
}

/** Show dev-only id labels on placeholders (dev server, ?dev in the URL, or the style-test page). */
export function showDevLabels(): boolean {
  try {
    return import.meta.env.DEV || new URLSearchParams(location.search).has('dev') || document.documentElement.dataset.devLabels === 'true';
  } catch { return false; }
}

const ASPECT: Partial<Record<ArtKind, [number, number]>> = {
  pet: [200, 240], 'pet-item': [200, 240], character: [200, 240], scene: [400, 300], background: [400, 300], ui: [96, 96],
};

function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A simple generated vector placeholder: a shape chosen from the id, coloured only by tokens. */
export function placeholder(id: string, alt = '', kind?: ArtKind): SVGSVGElement {
  const k = kind ?? (manifest.get(id)?.kind || (id.split('.')[0] as ArtKind));
  const [w, hgt] = ASPECT[k] ?? [100, 100];
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'k-placeholder', 'data-art-id': id, 'data-art-kind': k, 'data-placeholder': 'true' }) as SVGSVGElement;
  if (alt) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', alt); } else svg.setAttribute('aria-hidden', 'true');
  const cx = w / 2, cy = hgt / 2, r = Math.min(w, hgt) * 0.32;
  const shape = hash(id) % 4;
  const common = { fill: 'var(--placeholder-fill)', stroke: 'var(--placeholder-ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': '6 5' };
  svg.append(svgEl('rect', { x: 1, y: 1, width: w - 2, height: hgt - 2, rx: 10, fill: 'none', stroke: 'var(--placeholder-ink)', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.5 }));
  if (shape === 0) svg.append(svgEl('circle', { cx, cy, r, ...common }));
  else if (shape === 1) svg.append(svgEl('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r * 0.3, ...common }));
  else if (shape === 2) svg.append(svgEl('path', { d: `M${cx} ${cy - r} L${cx + r} ${cy + r * 0.8} L${cx - r} ${cy + r * 0.8} Z`, ...common }));
  else {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
    svg.append(svgEl('polygon', { points: pts, ...common }));
  }
  if (showDevLabels()) {
    const t = svgEl('text', { x: cx, y: hgt - 8, 'text-anchor': 'middle', 'font-size': Math.max(9, w / 16), fill: 'var(--placeholder-ink)', class: 'k-placeholder-label' });
    t.textContent = id;
    svg.append(t);
  }
  return svg;
}

/**
 * The element for an art id: <img> for a real file, an inline placeholder otherwise.
 * If the file fails to load, it is replaced by a placeholder (and flagged with data-missing).
 */
export function artEl(id: string, opts: { decorative?: boolean; class?: string; alt?: string } = {}): HTMLElement | SVGSVGElement {
  const ref = art(id);
  const alt = opts.decorative ? '' : (opts.alt ?? ref.alt);
  if (!ref.src) {
    const p = placeholder(id, alt);
    if (opts.class) p.classList.add(...opts.class.split(' '));
    return p;
  }
  const img = document.createElement('img');
  img.src = ref.src;
  img.alt = alt;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  img.dataset.artId = id;
  img.dataset.artKind = ref.entry?.kind ?? id.split('.')[0];
  img.className = `k-art ${opts.class ?? ''}`.trim();
  img.addEventListener('error', () => {
    const p = placeholder(id, alt);
    p.dataset.missing = 'true';
    if (opts.class) p.classList.add(...opts.class.split(' '));
    img.replaceWith(p);
  }, { once: true });
  return img;
}
