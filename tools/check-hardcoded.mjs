// Fails if a colour or font name is written anywhere in src/ or the HTML pages instead of coming from tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, read, isMain } from './lib.mjs';

// The style-test page's live token panel is a dev tool that offers alternative fonts and reads colour inputs.
const ALLOW = { 'src/style-test/main.ts': ['font', 'colour'] };
const GENERIC = ['cursive', 'serif', 'sans-serif', 'system-ui', 'monospace'];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|css|html)$/.test(f)) out.push(p);
  }
  return out;
}

export function fontFamilies(tokens = read('public/tokens.css')) {
  const families = new Set([...tokens.matchAll(/font-family:\s*["']([^"']+)["']/g)].map((m) => m[1]));
  for (const m of tokens.matchAll(/--font-[\w-]+:\s*([^;]+);/g)) {
    for (const f of m[1].split(',')) {
      const name = f.trim().replace(/^["']|["']$/g, '');
      if (!GENERIC.includes(name)) families.add(name);
    }
  }
  return families;
}

export function checkHardcoded() {
  const families = fontFamilies();
  const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html'), join(ROOT, 'style-test/index.html')];
  const problems = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    // Pet data holds the pets' own colours (art data, recoloured per pet), not interface colours.
    const allow = ALLOW[rel] ?? (rel.startsWith('src/data/pets/') ? ['colour'] : []);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (!allow.includes('colour')) {
        for (const m of code.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) problems.push(`${rel}:${i + 1} colour ${m[0]}`);
        for (const m of code.matchAll(/\b(?:rgba?|hsla?|oklch|lab)\(/g)) problems.push(`${rel}:${i + 1} colour function ${m[0]}`);
      }
      if (!allow.includes('font')) {
        for (const fam of families) if (code.includes(fam)) problems.push(`${rel}:${i + 1} font name "${fam}"`);
        const ff = code.match(/font-family:\s*([^;]+)/);
        if (ff && !/^(var\(|inherit)/.test(ff[1].trim())) problems.push(`${rel}:${i + 1} font-family not from a token`);
      }
    });
  }
  return { files: files.length, problems };
}

if (isMain(import.meta.url)) {
  const { files, problems } = checkHardcoded();
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`check-hardcoded: ${problems.length} hard-coded value(s)`);
    process.exit(1);
  }
  console.log(`check-hardcoded: ${files} files, no hard-coded colours or font names`);
}
