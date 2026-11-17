/** Shared start-up for every page: settings, art manifest, pet rig, background. */
import '../ui/ui.css';
import { applySettings } from './settings';
import { loadManifest } from '../ui/art';
import { loadRig } from '../pets/pets';
import { watchTheme } from './background';

export async function boot(): Promise<void> {
  applySettings();
  await Promise.all([loadManifest(), loadRig()]);
  watchTheme();
}
