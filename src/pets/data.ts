/** Loads the pet data files in the app (Vite). Imported by compose.ts, so any screen that shows a pet has it. */
import { loadPetFiles } from './species';

const files = import.meta.glob<Record<string, unknown>>('../data/pets/*.json', { eager: true, import: 'default' });
loadPetFiles(Object.values(files));
