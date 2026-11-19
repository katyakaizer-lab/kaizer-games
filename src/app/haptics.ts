/**
 * A short vibration, shared by every game. Uses Capacitor's Haptics plugin when the app runs inside the store
 * builds (later), else navigator.vibrate where it exists (Android browsers). iOS Safari has no vibration: nothing
 * happens there and nothing breaks. Off when the "Vibración" setting is off or reduced motion is on.
 */
import { getSettings, prefersReducedMotion } from './settings';

type CapHaptics = { impact?: (o: { style: string }) => Promise<unknown> };

export function vibrate(ms = 60): boolean {
  try {
    if (!getSettings().vibration || prefersReducedMotion()) return false;
    const cap = (globalThis as { Capacitor?: { Plugins?: { Haptics?: CapHaptics } } }).Capacitor?.Plugins?.Haptics;
    if (cap?.impact) { void cap.impact({ style: 'LIGHT' }).catch(() => {}); return true; }
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.vibrate === 'function') return nav.vibrate(ms);
  } catch { /* never break a game over a vibration */ }
  return false;
}
