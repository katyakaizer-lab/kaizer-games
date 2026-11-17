/** The page background picture for the current theme: art id `background.<theme>` (none if not in the manifest). */
import { art } from '../ui/art';
import { refreshFrames } from '../ui/components';

export function applyBackground(): void {
  const root = document.documentElement;
  const ref = art(`background.${root.dataset.theme ?? 'brote'}`);
  if (ref.src) root.style.setProperty('--bg-image', `url("${ref.src}")`);
  else root.style.removeProperty('--bg-image');
}

export function watchTheme(): void {
  const onTheme = () => { applyBackground(); refreshFrames(); };
  onTheme();
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
