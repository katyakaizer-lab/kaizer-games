/**
 * Rough geometry of pet parts, for the validator: is a part attached to another (touching or overlapping)?
 * Shapes are sampled as point outlines from the part SVG (ellipse, circle, path with M L H V C Q Z, absolute or
 * relative, and rotate() transforms). A stroked open path (a tail drawn as a thick line) counts with half its width.
 * Pure code (no DOM), used in Node by tools/validate-pets.ts.
 */
export type Pt = [number, number];
export interface Shape { pts: Pt[]; closed: boolean; pad: number }

const num = (tag: string, a: string, d = 0) => { const m = tag.match(new RegExp(`\\s${a}="(-?[\\d.]+)"`)); return m ? +m[1] : d; };
function rotate(pts: Pt[], tag: string): Pt[] {
  const m = tag.match(/transform="rotate\((-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)"/);
  if (!m) return pts;
  const a = (+m[1] * Math.PI) / 180, cx = +m[2], cy = +m[3], c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 48): Pt[] {
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Pt; });
}
/** Points along a path (each segment sampled). Returns the sub-paths. */
export function samplePath(d: string, steps = 16): { pts: Pt[]; closed: boolean }[] {
  const tok = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt = [0, 0], start: Pt = [0, 0], cmd = '', i = 0, sub: Pt[] = [];
  const n = () => +tok[i++];
  const flush = (closed: boolean) => { if (sub.length) out.push({ pts: sub, closed }); sub = []; };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const o = rel ? cur : ([0, 0] as Pt);
    switch (cmd.toUpperCase()) {
      case 'M': { flush(false); cur = [o[0] + n(), o[1] + n()]; start = cur; sub.push(cur); cmd = rel ? 'l' : 'L'; break; }
      case 'L': { cur = [o[0] + n(), o[1] + n()]; sub.push(cur); break; }
      case 'H': { cur = [(rel ? cur[0] : 0) + n(), cur[1]]; sub.push(cur); break; }
      case 'V': { cur = [cur[0], (rel ? cur[1] : 0) + n()]; sub.push(cur); break; }
      case 'C': {
        const p1: Pt = [o[0] + n(), o[1] + n()], p2: Pt = [o[0] + n(), o[1] + n()], p3: Pt = [o[0] + n(), o[1] + n()], p0 = cur;
        for (let k = 1; k <= steps; k++) { const t = k / steps, u = 1 - t; sub.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
        cur = p3; break;
      }
      case 'Q': {
        const p1: Pt = [o[0] + n(), o[1] + n()], p2: Pt = [o[0] + n(), o[1] + n()], p0 = cur;
        for (let k = 1; k <= steps; k++) { const t = k / steps, u = 1 - t; sub.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); }
        cur = p2; break;
      }
      case 'Z': { cur = start; flush(true); break; }
      default: i++;
    }
  }
  flush(false);
  return out;
}

/** The shapes of a part file (or any SVG markup). */
export function shapesOf(svg: string): Shape[] {
  const out: Shape[] = [];
  for (const [tag, name] of svg.matchAll(/<(ellipse|circle|path)\b[^>]*\/>/g)) {
    const none = /fill="none"/.test(tag);
    const pad = none ? num(tag, 'stroke-width', 2.4) / 2 : 0;
    if (name === 'ellipse') out.push({ pts: rotate(ellipse(num(tag, 'cx'), num(tag, 'cy'), num(tag, 'rx'), num(tag, 'ry')), tag), closed: !none, pad });
    else if (name === 'circle') { const r = num(tag, 'r'); out.push({ pts: rotate(ellipse(num(tag, 'cx'), num(tag, 'cy'), r, r), tag), closed: !none, pad }); }
    else {
      const d = tag.match(/\sd="([^"]*)"/)?.[1] ?? '';
      for (const s of samplePath(d)) out.push({ pts: rotate(s.pts, tag), closed: s.closed && !none, pad });
    }
  }
  return out;
}

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Smallest gap between two sets of shapes (0 when they overlap). Outlines (about 2.4px) count as touching. */
export function gap(a: Shape[], b: Shape[]): number {
  let best = Infinity;
  for (const s of a) for (const t of b) {
    if (t.closed && s.pts.some((p) => inside(p, t.pts))) return 0;
    if (s.closed && t.pts.some((p) => inside(p, s.pts))) return 0;
    for (const p of s.pts) for (const q of t.pts) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]) - s.pad - t.pad;
      if (d < best) best = d;
    }
  }
  return Math.max(0, best);
}
/** Parts that must be attached, and to what: [part slot, slots it may touch]. */
export const ATTACH: [string, string[]][] = [['head', ['body']], ['tail', ['body']], ['ears', ['head']], ['wings', ['body']], ['feet', ['body']], ['arms', ['body']], ['horns', ['head']]];
export const MAX_GAP = 2.5;
