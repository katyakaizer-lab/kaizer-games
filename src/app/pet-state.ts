/**
 * The learner's pets and recent practice. Pets are never hungry, sad or sick, and nothing goes down while the
 * learner is away. Mood comes only from recent practice:
 *   alegria: right after finishing something (within CHEER_MINUTES)
 *   siesta:  after REST_DAYS or more away ("Descansando")
 *   calma:   otherwise
 *
 * Pets are profiles in an array (pets[]) with an active one (activePetId), so a second pet can come later without
 * another migration. Saves from before 2026-11-19 had one { species, name } under "pet": migratePets() turns it
 * into a profile of that species' default breed, keeping the name (stars and all other progress are untouched).
 */
import { onImport, store } from '../data/storage';
import '../pets/data';
import { makeProfile, normalizeProfile, profileProblems, speciesById, type PetProfile } from '../pets/species';
import type { Mood } from '../pets/pets';

export interface Activity { lastPracticeAt?: number; lastCelebrationAt?: number }
export const CHEER_MINUTES = 20;
export const REST_DAYS = 3;
const DAY = 86_400_000;

/** Turns an old single-pet save into a profile. Returns true if something was migrated. */
export function migratePets(now = Date.now()): boolean {
  const old = store.get<{ species?: string; name?: string } | null>('pet', null);
  if (!old) return false;
  const pets = store.get<PetProfile[]>('pets', []);
  if (!pets.length && old.species && speciesById(old.species)) {
    const p = makeProfile(old.species, undefined, 'pet-1');
    const named = old.name?.trim();
    const profile: PetProfile = { ...p, name: named || p.name, createdAt: now };
    store.set('pets', [profile]);
    store.set('activePetId', profile.id);
  }
  store.remove('pet');
  store.set('schema', 2);
  return true;
}
onImport(() => { migratePets(); });

/** The learner's pets (an old single-pet save is migrated first, wherever it is read). */
export function getPets(): PetProfile[] {
  if (store.get('pet', null)) migratePets();
  // Profiles follow the current breed data (a breed that now locks a colour, or a pattern it no longer offers).
  return store.get<PetProfile[]>('pets', []).filter((p) => speciesById(p.species)).map(normalizeProfile);
}
export function getActivePet(): PetProfile | null {
  const pets = getPets();
  const id = store.get<string | null>('activePetId', null);
  return pets.find((p) => p.id === id) ?? pets[0] ?? null;
}
/** Saves a profile (new or edited) and makes it the active pet. Progress and stars are not touched. */
export function savePet(p: PetProfile): PetProfile {
  const clean: PetProfile = { ...p, name: p.name.trim() || p.name };
  const pets = getPets();
  const i = pets.findIndex((x) => x.id === clean.id);
  if (i >= 0) pets[i] = clean; else pets.push(clean);
  store.set('pets', pets);
  store.set('activePetId', clean.id);
  store.set('schema', 2);
  return clean;
}
export const isValidPet = (p: PetProfile) => profileProblems(p).length === 0;

export const getActivity = (): Activity => store.get<Activity>('activity', {});
export function recordPractice(now = Date.now()): void { store.set('activity', { ...getActivity(), lastPracticeAt: now }); }
export function recordCelebration(now = Date.now()): void { store.set('activity', { ...getActivity(), lastPracticeAt: now, lastCelebrationAt: now }); }

export function moodFor(a: Activity, now = Date.now()): Extract<Mood, 'calma' | 'alegria' | 'siesta'> {
  if (a.lastCelebrationAt && now - a.lastCelebrationAt < CHEER_MINUTES * 60_000) return 'alegria';
  if (a.lastPracticeAt && now - a.lastPracticeAt >= REST_DAYS * DAY) return 'siesta';
  return 'calma';
}
export const currentMood = (now = Date.now()) => moodFor(getActivity(), now);
