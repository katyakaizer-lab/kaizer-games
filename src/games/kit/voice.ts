/** The device's Spanish voice for generated text (numbers, words). No files, nothing leaves the device. */
import { spanishVoice } from '../../audio/speech';

export const hasVoice = async (): Promise<boolean> => !!(await spanishVoice());

export async function say(text: string, slow = false): Promise<boolean> {
  const voice = await spanishVoice();
  if (!voice) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = slow ? 0.6 : 0.9;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; } // never break a game over speech
}
export const hush = (): void => { try { speechSynthesis?.cancel(); } catch { /* no speech here */ } };
