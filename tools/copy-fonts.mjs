// Copies the self-hosted woff2 files from @fontsource into public/fonts and the licences into licenses/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const files = {
  'caveat-brush': ['latin-400', 'latin-ext-400'],
  nunito: ['latin-400', 'latin-ext-400', 'cyrillic-400', 'latin-700', 'latin-ext-700', 'cyrillic-700'],
};
mkdirSync(join(ROOT, 'public/fonts'), { recursive: true });
for (const [pkg, list] of Object.entries(files)) {
  const dir = join(ROOT, 'node_modules/@fontsource', pkg);
  for (const f of list) copyFileSync(join(dir, 'files', `${pkg}-${f}-normal.woff2`), join(ROOT, 'public/fonts', `${pkg}-${f}-normal.woff2`));
  copyFileSync(join(dir, 'LICENSE'), join(ROOT, 'licenses', `${pkg}-OFL.txt`));
}
copyFileSync(join(ROOT, 'node_modules/@tabler/icons/LICENSE'), join(ROOT, 'licenses', 'tabler-icons-MIT.txt'));
console.log('copy-fonts: fonts and licences copied');
