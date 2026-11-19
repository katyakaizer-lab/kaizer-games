/**
 * A calm "+3 ★" that rises a little and fades near where the stars were earned (static, then gone, with reduced
 * motion). Purely visual: screen readers hear the award through the game's own status messages.
 */
import { h } from '../ui/h';
import { prefersReducedMotion } from '../app/settings';
import { awardStars } from './wallet';
import './rewards.css';

export function showStars(amount: number, near?: Element | null): void {
  if (amount < 1 || typeof document === 'undefined') return;
  const el = h('div', { class: `k-stars-pop${prefersReducedMotion() ? ' is-still' : ''}`, 'aria-hidden': 'true' }, `+${amount} ★`);
  const r = near?.getBoundingClientRect();
  if (r) {
    el.style.left = `${Math.min(window.innerWidth - 48, Math.max(48, r.left + r.width / 2))}px`;
    el.style.top = `${Math.max(56, r.top)}px`;
  } else el.classList.add('is-centre');
  document.body.append(el);
  setTimeout(() => el.remove(), prefersReducedMotion() ? 1400 : 1600);
}

/** Award and show in one call. */
export function earn(gameId: string, amount: number, reason: string, near?: Element | null): void {
  awardStars(gameId, amount, reason);
  showStars(amount, near);
}
