// Fails if any colour pair used by components drops below WCAG minimums, in any theme.
import { isMain, read, parseTokens, resolve, parseColor, contrast, MIN } from './lib.mjs';

export function checkContrast(css = read('public/tokens.css')) {
  const tokens = parseTokens(css);
  const { pairs } = JSON.parse(read('tools/contrast-pairs.json'));
  const results = [];
  for (const [theme, vars] of Object.entries(tokens.themes)) {
    for (const [fg, bg, kind, use] of pairs) {
      const a = parseColor(resolve(vars, fg));
      const b = parseColor(resolve(vars, bg));
      const ratio = contrast(a, b);
      results.push({ theme, fg, bg, kind, use, ratio, ok: ratio >= MIN[kind] });
    }
  }
  return results;
}

if (isMain(import.meta.url)) {
  const res = checkContrast();
  const bad = res.filter((r) => !r.ok);
  for (const r of res) {
    const mark = r.ok ? 'ok ' : 'LOW';
    if (!r.ok || process.argv.includes('-v')) console.log(`${mark} ${r.theme.padEnd(6)} ${r.ratio.toFixed(2).padStart(5)}:1  ${r.fg} on ${r.bg} (${r.kind}, ${r.use})`);
  }
  if (bad.length) { console.error(`check-contrast: ${bad.length} pair(s) below minimum`); process.exit(1); }
  console.log(`check-contrast: ${res.length} pairs pass in ${new Set(res.map((r) => r.theme)).size} themes`);
}
