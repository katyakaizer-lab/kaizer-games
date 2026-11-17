/**
 * The learner's pet and recent practice. Nothing to buy, no coins, never sad, sick, hungry or angry.
 * Mood comes only from recent practice:
 *   alegria: right after finishing a constellation (within CHEER_MINUTES)
 *   siesta:  after REST_DAYS or more away ("Descansando")
 *   calma:   otherwise
 */
import { store } from '../data/storage';
import { PET_IDS, petName, type Mood, type PetId } from '../pets/pets';

export interface PetChoice { species: (typeof PET_IDS)[number]; name: string }
export interface Activity { lastPracticeAt?: number; lastCelebrationAt?: number }

export const CHEER_MINUTES = 20;
export const REST_DAYS = 3;
const DAY = 86_400_000;

export const getPet = (): PetChoice | null => {
  const p = store.get<PetChoice | null>('pet', null);
  return p && (PET_IDS as readonly string[]).includes(p.species) ? p : null;
};
export function setPet(species: PetChoice['species'], name?: string): PetChoice {
  const p = { species, name: name?.trim() || petName(species as PetId) };
  store.set('pet', p);
  return p;
}

export const getActivity = (): Activity => store.get<Activity>('activity', {});
export function recordPractice(now = Date.now()): void { store.set('activity', { ...getActivity(), lastPracticeAt: now }); }
export function recordCelebration(now = Date.now()): void { store.set('activity', { ...getActivity(), lastPracticeAt: now, lastCelebrationAt: now }); }

export function moodFor(a: Activity, now = Date.now()): Extract<Mood, 'calma' | 'alegria' | 'siesta'> {
  if (a.lastCelebrationAt && now - a.lastCelebrationAt < CHEER_MINUTES * 60_000) return 'alegria';
  if (a.lastPracticeAt && now - a.lastPracticeAt >= REST_DAYS * DAY) return 'siesta';
  return 'calma';
}
export const currentMood = (now = Date.now()) => moodFor(getActivity(), now);
