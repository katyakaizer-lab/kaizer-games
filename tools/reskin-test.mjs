// Re-skin acceptance test (RESKIN.md).
// Copies the project to a temp folder, applies reskin-demo/ (tokens.css + three swapped assets + one new font file),
// proves that nothing else changed, runs the full build with every check, and writes the result to dist-reskin/.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT } from './lib.mjs';

const DEMO = join(ROOT, 'reskin-demo');
const APPLY = [
  ['tokens.css', 'public/tokens.css'],
  ['assets/pets/brote-alegria.svg', 'public/assets/pets/brote-alegria.svg'],
  ['assets/backgrounds/paper.svg', 'public/assets/backgrounds/paper.svg'],
  ['assets/ui/frame-card.svg', 'public/assets/ui/frame-card.svg'],
  ['fonts/patrick-hand-latin-400-normal.woff2', 'public/fonts/patrick-hand-latin-400-normal.woff2'],
  ['fonts/patrick-hand-latin-ext-400-normal.woff2', 'public/fonts/patrick-hand-latin-ext-400-normal.woff2'],
];
const SKIP = new Set(['node_modules', 'dist', 'dist-reskin', '.git']);
const WATCH = ['src', 'public', 'index.html', 'style-test', 'tools', 'vite.config.ts', 'package.json'];

function hashTree(base) {
  const out = new Map();
  const walk = (p) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); return; }
    out.set(relative(base, p).replace(/\\/g, '/'), createHash('sha1').update(readFileSync(p)).digest('hex'));
  };
  for (const w of WATCH) walk(join(base, w));
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), 'kaizer-reskin-'));
console.log(`reskin-test: working copy in ${tmp}`);
try {
  cpSync(ROOT, tmp, { recursive: true, filter: (src) => !SKIP.has(relative(ROOT, src).split(/[\\/]/)[0]) });
  symlinkSync(join(ROOT, 'node_modules'), join(tmp, 'node_modules'), 'junction');
  for (const [from, to] of APPLY) cpSync(join(DEMO, from), join(tmp, to));

  // 1. Only tokens.css, the three assets and the new font files differ.
  const before = hashTree(ROOT);
  const after = hashTree(tmp);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
  const expected = APPLY.map(([, to]) => to).sort();
  console.log('changed files:\n  ' + changed.join('\n  '));
  if (JSON.stringify(changed) !== JSON.stringify(expected)) throw new Error(`unexpected changes; expected exactly:\n  ${expected.join('\n  ')}`);
  if (changed.some((f) => f.startsWith('src/'))) throw new Error('code changed');

  // 2-4. Full build: contrast, hard-coded values, fonts (now Patrick Hand), art ids, build report.
  execSync('npm run build', { cwd: tmp, stdio: 'inherit' });
  rmSync(join(ROOT, 'dist-reskin'), { recursive: true, force: true });
  cpSync(join(tmp, 'dist'), join(ROOT, 'dist-reskin'), { recursive: true });
  console.log('\nreskin-test: PASS. New look built with no code edits -> dist-reskin/');
} finally {
  try { unlinkSync(join(tmp, 'node_modules')); } catch { /* not created */ }
  rmSync(tmp, { recursive: true, force: true });
}
