/** Service worker registration (offline after first load). Nothing is sent anywhere. */
export function registerSW(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const root = document.querySelector<HTMLMetaElement>('meta[name="app-root"]')?.content || './';
  navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => { /* offline support is optional */ });
}
