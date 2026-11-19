/**
 * Review decisions for the word bank, kept on the device while reviewing (page /revision/), exported as a patch
 * file (revision-YYYY-MM-DD.json) and applied by tools/apply-review.ts, which sets reviewed:true.
 * Pure code (no DOM): shared by the page, the tool and tests.
 */
import type { WordEntry } from '../words/types.ts';

export type Decision = 'ok' | 'edited' | 'doubt';
export interface ReviewDecision {
  id: string;
  status: Decision;
  /** changed fields only (status "edited") */
  changes?: Partial<Pick<WordEntry, EditableField>>;
  /** why it is doubtful (status "doubt"), or a remark */
  note?: string;
  at: string;
}
export interface ReviewPatch { app: 'kaizer-games'; kind: 'word-review'; date: string; decisions: ReviewDecision[] }

/** Fields the reviewer may change. */
export const EDITABLE = ['lemma', 'gender', 'feminine', 'plural', 'pluralIrregular', 'genderIrregular', 'level', 'translations', 'clues', 'example', 'verbModel'] as const;
export type EditableField = (typeof EDITABLE)[number];

/** The patch file name for a date: revision-2026-11-19.json */
export const patchName = (d: Date) => `revision-${d.toISOString().slice(0, 10)}.json`;

export function makePatch(decisions: Record<string, ReviewDecision>, now = new Date()): ReviewPatch {
  return { app: 'kaizer-games', kind: 'word-review', date: now.toISOString(), decisions: Object.values(decisions).sort((a, b) => a.id.localeCompare(b.id)) };
}

/** Only the fields that differ from the entry (deep compare by JSON). */
export function diff(entry: WordEntry, edited: Partial<WordEntry>): Partial<Pick<WordEntry, EditableField>> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in edited && JSON.stringify(edited[k]) !== JSON.stringify(entry[k])) out[k] = edited[k];
  return out as Partial<Pick<WordEntry, EditableField>>;
}

/**
 * Applies a patch to entries (in place): "ok" and "edited" set reviewed:true (edited fields first); "doubt" keeps
 * reviewed:false and stores the note as reviewNote. Returns what happened, and ids that were not found.
 */
export function applyPatch(entries: WordEntry[], patch: ReviewPatch): { applied: number; doubtful: number; missing: string[]; badFields: string[] } {
  if (patch?.app !== 'kaizer-games' || patch.kind !== 'word-review' || !Array.isArray(patch.decisions)) throw new Error('not a word review patch');
  const byId = new Map(entries.map((e) => [e.id, e]));
  let applied = 0, doubtful = 0;
  const missing: string[] = [], badFields: string[] = [];
  for (const d of patch.decisions) {
    const e = byId.get(d.id);
    if (!e) { missing.push(d.id); continue; }
    if (d.status === 'doubt') { e.reviewed = false; if (d.note) (e as WordEntry & { reviewNote?: string }).reviewNote = d.note; doubtful++; continue; }
    for (const [k, v] of Object.entries(d.changes ?? {})) {
      if (!(EDITABLE as readonly string[]).includes(k)) { badFields.push(`${d.id}.${k}`); continue; }
      (e as unknown as Record<string, unknown>)[k] = v;
    }
    delete (e as WordEntry & { reviewNote?: string }).reviewNote;
    e.reviewed = true;
    applied++;
  }
  return { applied, doubtful, missing, badFields };
}
