/**
 * Hearing a sentence: our own recording audio/<id>.mp3 (and audio/<id>-slow.mp3) when present,
 * otherwise the device's speech synthesis with a Spanish voice (es-ES or es-MX preferred).
 * Device voices vary and may not work offline; callers hide the mode when neither exists.
 */
import { appRoot } from '../ui/art';

let voicePromise: Promise<SpeechSynthesisVoice | null> | null = null;

export function spanishVoice(timeoutMs = 1500): Promise<SpeechSynthesisVoice | null> {
  voicePromise ??= new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof synth.getVoices !== 'function') return resolve(null);
    const pick = () => {
      const vs = synth.getVoices();
      return vs.find((v) => /^es[-_]ES/i.test(v.lang)) ?? vs.find((v) => /^es[-_]MX/i.test(v.lang)) ?? vs.find((v) => /^es\b/i.test(v.lang)) ?? null;
    };
    const now = pick();
    if (now || synth.getVoices().length) return resolve(now);
    const done = () => resolve(pick());
    synth.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
  return voicePromise;
}

const fileCache = new Map<string, Promise<boolean>>();
function fileExists(url: string): Promise<boolean> {
  if (!fileCache.has(url)) fileCache.set(url, fetch(url, { method: 'HEAD' }).then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')).catch(() => false));
  return fileCache.get(url)!;
}
export const recordingUrl = (id: string, slow = false): string => `${appRoot()}audio/${id}${slow ? '-slow' : ''}.mp3`;

export interface Speaker { available: boolean; source: 'file' | 'voice' | 'none'; play(slow?: boolean): Promise<void>; stop(): void }

export async function speakerFor(id: string, text: string, audioField?: string | null): Promise<Speaker> {
  const url = audioField ? `${appRoot()}${audioField}` : recordingUrl(id);
  let current: HTMLAudioElement | null = null;
  if (await fileExists(url)) {
    const slowUrl = recordingUrl(id, true);
    const hasSlow = await fileExists(slowUrl);
    return {
      available: true, source: 'file',
      async play(slow = false) { current?.pause(); current = new Audio(slow && hasSlow ? slowUrl : url); if (slow && !hasSlow) current.playbackRate = 0.75; await current.play().catch(() => {}); },
      stop() { current?.pause(); },
    };
  }
  const voice = await spanishVoice();
  if (voice) {
    return {
      available: true, source: 'voice',
      async play(slow = false) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice; u.lang = voice.lang; u.rate = slow ? 0.65 : 0.9;
        speechSynthesis.speak(u);
      },
      stop() { speechSynthesis.cancel(); },
    };
  }
  return { available: false, source: 'none', async play() {}, stop() {} };
}
