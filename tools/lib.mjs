// Shared helpers for build tools (no dependencies).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Parse tokens.css into { base: {...}, themes: { brote: {...}, night: {...} } } */
export function parseTokens(css) {
  const out = { base: {}, themes: {} };
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(noComments))) {
    const sel = m[1].trim();
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const k = d.slice(0, i).trim();
      if (k.startsWith('--')) decls[k] = d.slice(i + 1).trim();
    }
    const t = sel.match(/^:root\[data-theme="([\w-]+)"\]$/);
    if (t) out.themes[t[1]] = { ...(out.themes[t[1]] || {}), ...decls };
    else if (sel === ':root') Object.assign(out.base, decls);
  }
  return out;
}

export function resolve(vars, name, depth = 0) {
  const v = vars[name];
  if (v == null) throw new Error(`token ${name} is not defined`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref && depth < 10) return resolve(vars, ref[1], depth + 1);
  return v;
}

export function parseColor(v) {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [m[1], m[2], m[3]].map(Number);
  throw new Error(`cannot parse colour "${v}"`);
}

export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const MIN = { body: 4.5, large: 3, icon: 3 };

import { pathToFileURL } from 'node:url';
/** true when the module at `url` is the script node was started with */
export const isMain = (url) => !!process.argv[1] && pathToFileURL(process.argv[1]).href === url;
