/**
 * Seeded layouts: the same id always gives the same picture on every device.
 * Stars keep a minimum distance measured on a 320px-wide phone frame, so tap targets
 * (44px) never overlap and labels have room. Wider screens only scale the distances up.
 */
import { hashString, rng } from './sentence';

export interface Pt { x: number; y: number }

/** Phone reference frame and the minimum gap between star centres (an ellipse, wider than tall for labels). */
export const FRAME_W = 320;
export const MIN_DX = 92;
export const MIN_DY = 66;

export function boardAspect(n: number): number {
  return n <= 3 ? 0.8 : n <= 5 ? 1.0 : n <= 7 ? 1.2 : 1.45;
}

/** Normalised star positions (0..1 in both axes) for `n` stars. */
export function starLayout(id: string, n: number): { pts: Pt[]; aspect: number } {
  const aspect = boardAspect(n);
  const H = FRAME_W * aspect;
  for (let attempt = 0, shrink = 1; attempt < 12; attempt++, shrink *= 0.95) {
    const r = rng(hashString(`${id}#${attempt}`));
    const pts: Pt[] = [];
    let tries = 0;
    while (pts.length < n && tries < 6000) {
      tries++;
      const p = { x: 0.13 + r() * 0.74, y: 0.09 + r() * 0.82 };
      const ok = pts.every((q) => (((p.x - q.x) * FRAME_W) / (MIN_DX * shrink)) ** 2 + (((p.y - q.y) * H) / (MIN_DY * shrink)) ** 2 >= 1);
      if (ok) pts.push(p);
    }
    if (pts.length === n) return { pts, aspect };
  }
  // Fallback: a jittered grid (never reached with the current limits, kept for safety)
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { pts: Array.from({ length: n }, (_, i) => ({ x: (i % cols + 0.5) / cols, y: (Math.floor(i / cols) + 0.5) / rows })), aspect };
}

/** Minimum distance between any two stars, in reference-frame pixels as an ellipse ratio (>= 1 means no overlap). */
export function minSpacing(pts: Pt[], aspect: number): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.sqrt((((pts[i].x - pts[j].x) * FRAME_W) / MIN_DX) ** 2 + (((pts[i].y - pts[j].y) * FRAME_W * aspect) / MIN_DY) ** 2);
    min = Math.min(min, d);
  }
  return min;
}

/* ---------- Galaxy map ---------- */

/** One cell of the map grid, in map units. Phones use 3 columns; wider screens use more, so cells keep about the same size on screen. */
export const CELL_W = 100 / 3;
const ROW_H = 34;
export const mapColumns = (widthPx: number): number => Math.max(3, Math.min(6, Math.floor(widthPx / 130)));

/**
 * Cluster positions in map units (width 100). Items fill a 3-column grid in snake order,
 * so consecutive story parts sit next to each other; each cell gets a seeded nudge.
 */
export function galaxyLayout(ids: string[], cols = 3): { pos: Map<string, Pt>; width: number; height: number } {
  const COLS = cols;
  const MAP_W = cols * CELL_W;
  const pos = new Map<string, Pt>();
  ids.forEach((id, i) => {
    const row = Math.floor(i / COLS);
    const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
    const r = rng(hashString(`map:${id}`));
    pos.set(id, { x: (col + 0.5) * (MAP_W / COLS) + (r() - 0.5) * 9, y: row * ROW_H + ROW_H / 2 + 4 + (r() - 0.5) * 10 });
  });
  return { pos, width: MAP_W, height: Math.max(1, Math.ceil(ids.length / COLS)) * ROW_H + 8 };
}

/** The little star pattern drawn for a cluster on the map (offsets in map units). */
export function clusterShape(id: string, n: number): Pt[] {
  const r = rng(hashString(`shape:${id}`));
  const k = Math.min(Math.max(n, 3), 6);
  return Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2 + r() * 0.9;
    const d = 3 + r() * 4.5;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8 };
  });
}
