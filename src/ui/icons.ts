// Tabler Icons (MIT, see licenses/tabler-icons-MIT.txt). Outline set only; stroke uses currentColor.
import check from '@tabler/icons/outline/check.svg?raw';
import refresh from '@tabler/icons/outline/refresh.svg?raw';
import x from '@tabler/icons/outline/x.svg?raw';
import settings from '@tabler/icons/outline/settings.svg?raw';
import volume from '@tabler/icons/outline/volume.svg?raw';
import volumeOff from '@tabler/icons/outline/volume-off.svg?raw';
import bulb from '@tabler/icons/outline/bulb.svg?raw';
import star from '@tabler/icons/outline/star.svg?raw';
import eye from '@tabler/icons/outline/eye.svg?raw';
import home from '@tabler/icons/outline/home.svg?raw';
import play from '@tabler/icons/outline/player-play.svg?raw';
import pause from '@tabler/icons/outline/player-pause.svg?raw';
import download from '@tabler/icons/outline/download.svg?raw';
import upload from '@tabler/icons/outline/upload.svg?raw';
import clock from '@tabler/icons/outline/clock.svg?raw';
import info from '@tabler/icons/outline/info-circle.svg?raw';
import back from '@tabler/icons/outline/chevron-left.svg?raw';
import undo from '@tabler/icons/outline/arrow-back-up.svg?raw';
import sparkles from '@tabler/icons/outline/sparkles.svg?raw';
import moon from '@tabler/icons/outline/moon.svg?raw';
import sun from '@tabler/icons/outline/sun.svg?raw';
import palette from '@tabler/icons/outline/palette.svg?raw';
import book from '@tabler/icons/outline/book.svg?raw';
import ear from '@tabler/icons/outline/ear.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import slow from '@tabler/icons/outline/snail.svg?raw';

export const ICONS = {
  check, refresh, x, settings, volume, volumeOff, bulb, star, eye, home, play, pause,
  download, upload, clock, info, back, undo, sparkles, moon, sun, palette, book, ear, lock, slow,
} as const;
export type IconName = keyof typeof ICONS;

/** An icon element. Decorative (aria-hidden) unless a label is given. */
export function icon(name: IconName, label?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'k-icon';
  span.innerHTML = ICONS[name];
  const svg = span.querySelector('svg');
  svg?.removeAttribute('width');
  svg?.removeAttribute('height');
  svg?.setAttribute('focusable', 'false');
  if (label) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', label); }
  else span.setAttribute('aria-hidden', 'true');
  return span;
}
