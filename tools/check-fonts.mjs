// Static font check: every token font has self-hosted woff2 faces whose unicode ranges cover Spanish.
// (The style-test page also runs a live document.fonts test in the browser.)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read, isMain } from './lib.mjs';

export const ACCENT_LINE = '¿¡ áéíóúü ñ ÁÉÍÓÚÜ Ñ';
const CYRILLIC = 'Ёё Жж Щщ Юю Яя';

function ranges(s) {
  return s.split(',').map((r) => r.trim().replace(/^U\+/i, '')).map((r) => {
    const [a, b] = r.split('-');
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });
}

export function checkFonts(css = read('public/tokens.css')) {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const b = m[1];
    return {
      family: b.match(/font-family:\s*["']?([^"';]+)["']?/)?.[1].trim(),
      weight: Number(b.match(/font-weight:\s*(\d+)/)?.[1] ?? 400),
      url: b.match(/url\(([^)]+)\)/)?.[1].replace(/["']/g, ''),
      woff2: /format\(["']woff2["']\)/.test(b),
      swap: /font-display:\s*swap/.test(b),
      range: ranges(b.match(/unicode-range:\s*([^;]+)/)?.[1] ?? 'U+0-10FFFF'),
    };
  });
  const first = (tok) => css.match(new RegExp(`${tok}:\\s*([^;]+);`))?.[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
  const head = first('--font-head');
  const body = first('--font-body');
  const need = [
    [head, 400, ACCENT_LINE, true], [body, 400, ACCENT_LINE, true], [body, 700, ACCENT_LINE, true],
    [body, 400, CYRILLIC, true], [head, 400, CYRILLIC, false],
  ];
  const results = [];
  for (const f of faces) {
    if (!f.url || !existsSync(join(ROOT, 'public', f.url))) results.push({ ok: false, msg: `${f.family} ${f.weight}: file missing (${f.url})` });
    if (!f.woff2) results.push({ ok: false, msg: `${f.family} ${f.weight}: not woff2` });
    if (!f.swap) results.push({ ok: false, msg: `${f.family} ${f.weight}: font-display is not swap` });
  }
  for (const [family, weight, text, required] of need) {
    const mine = faces.filter((f) => f.family === family && f.weight === weight);
    const label = text === CYRILLIC ? 'Cyrillic' : 'Spanish';
    const missing = [...text.replace(/\s/g, '')].filter((ch) => !mine.some((f) => f.range.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b)));
    const covered = mine.length > 0 && missing.length === 0;
    const msg = `${family} ${weight} ${label}: ${!mine.length ? 'no self-hosted face' : covered ? 'covered' : `not covered: ${missing.join(' ')}`}`;
    results.push({ ok: covered || !required, note: !covered && !required, msg: required ? msg : `${msg} (optional, falls back)` });
  }
  return results;
}

if (isMain(import.meta.url)) {
  const res = checkFonts();
  for (const r of res) console.log(`${r.ok ? (r.note ? 'note' : 'ok  ') : 'FAIL'} ${r.msg}`);
  if (res.some((r) => !r.ok)) { console.error('check-fonts: failed'); process.exit(1); }
  console.log('check-fonts: pass');
}
