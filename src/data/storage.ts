/**
 * Storage: localStorage inside try/catch, with an in-memory fallback if it is blocked
 * (private mode, cleared site data, previews). Progress can be saved to and loaded from a file.
 */
const PREFIX = 'kz.';
const memory = new Map<string, string>();
let backend: Storage | null | undefined;

function ls(): Storage | null {
  if (backend !== undefined) return backend;
  try {
    const s = window.localStorage;
    s.setItem(`${PREFIX}__probe`, '1');
    s.removeItem(`${PREFIX}__probe`);
    backend = s;
  } catch { backend = null; }
  return backend;
}

/** For tests: force the in-memory fallback, or reset detection. */
export function _setBackend(b: Storage | null | undefined): void { backend = b; memory.clear(); }
export const usingMemoryFallback = (): boolean => ls() === null;

function rawGet(k: string): string | null {
  const s = ls();
  if (s) { try { return s.getItem(k); } catch { /* fall through */ } }
  return memory.get(k) ?? null;
}
function rawSet(k: string, v: string): void {
  const s = ls();
  if (s) { try { s.setItem(k, v); return; } catch { /* quota or blocked */ } }
  memory.set(k, v);
}
function rawRemove(k: string): void {
  const s = ls();
  if (s) { try { s.removeItem(k); } catch { /* ignore */ } }
  memory.delete(k);
}
function allKeys(): string[] {
  const out = new Set<string>(memory.keys());
  const s = ls();
  if (s) { try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k) out.add(k); } } catch { /* ignore */ } }
  return [...out].filter((k) => k.startsWith(PREFIX));
}

export const store = {
  get<T>(key: string, fallback: T): T {
    const v = rawGet(PREFIX + key);
    if (v == null) return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  },
  set(key: string, value: unknown): void { rawSet(PREFIX + key, JSON.stringify(value)); },
  remove(key: string): void { rawRemove(PREFIX + key); },
  clear(): void { for (const k of allKeys()) rawRemove(k); },
};

/** Save-file schema. 2 (2026-11-19): pets are profiles (pets[] + activePetId) instead of one { species, name }. */
export const SAVE_VERSION = 2;
export interface ProgressFile { app: 'kaizer-games'; version: 1 | 2; savedAt: string; data: Record<string, unknown> }

export function exportProgress(now = new Date()): ProgressFile {
  const data: Record<string, unknown> = {};
  for (const k of allKeys()) {
    const v = rawGet(k);
    if (v == null) continue;
    try { data[k.slice(PREFIX.length)] = JSON.parse(v); } catch { /* skip corrupt */ }
  }
  return { app: 'kaizer-games', version: SAVE_VERSION, savedAt: now.toISOString(), data };
}

const afterImport: (() => void)[] = [];
/** Runs after a progress file is loaded (used to migrate older saves). */
export function onImport(fn: () => void): void { if (!afterImport.includes(fn)) afterImport.push(fn); }

export function importProgress(text: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'not-json' }; }
  const f = parsed as Partial<ProgressFile>;
  if (!f || f.app !== 'kaizer-games' || (f.version !== 1 && f.version !== 2) || typeof f.data !== 'object' || f.data === null) return { ok: false, error: 'wrong-file' };
  store.clear();
  for (const [k, v] of Object.entries(f.data)) store.set(k, v);
  for (const fn of afterImport) fn(); // e.g. migrate an older save (pets)
  return { ok: true };
}

/** Offer the progress file as a download (stays on the device). */
export function downloadProgress(): void {
  const blob = new Blob([JSON.stringify(exportProgress(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kaizer-games-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/** Ask for a progress file and load it. */
export function pickProgressFile(): Promise<ReturnType<typeof importProgress>> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve({ ok: false, error: 'cancelled' });
      resolve(importProgress(await file.text()));
    });
    input.click();
  });
}
