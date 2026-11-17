// Manifest checks: unique ids, valid kinds, files exist, AI provenance logged, pets complete, no text inside SVGs,
// and every art id written in the code is in the manifest (or reported as a placeholder).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read, isMain } from './lib.mjs';

const KINDS = ['pet', 'pet-item', 'object', 'scene', 'character', 'ui', 'icon', 'background'];
const ANCHORS = ['head-top', 'face', 'neck', 'back', 'feet', 'top-extra'];
const ID_IN_CODE = /['"](?:pet-item|pet|object|scene|character|ui|icon|background)\.[a-z0-9][\w.-]*['"]/g;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

export function checkArt() {
  const { assets } = JSON.parse(read('public/assets/manifest.json'));
  const rig = JSON.parse(read('public/assets/pets/rig.json'));
  const errors = [];
  const warnings = [];
  const seen = new Set();
  for (const a of assets) {
    if (seen.has(a.id)) errors.push(`duplicate id ${a.id}`);
    seen.add(a.id);
    if (!KINDS.includes(a.kind)) errors.push(`${a.id}: unknown kind ${a.kind}`);
    if (!a.id.startsWith(`${a.kind}.`)) errors.push(`${a.id}: id must start with its kind "${a.kind}."`);
    if (!['placeholder', 'final'].includes(a.status)) errors.push(`${a.id}: status must be placeholder or final`);
    if (typeof a.alt !== 'string') errors.push(`${a.id}: alt text missing`);
    for (const f of Object.values(a.files ?? {})) if (!existsSync(join(ROOT, 'public/assets', f))) errors.push(`${a.id}: file not found assets/${f}`);
    if (a.aiGenerated && !(a.source?.tool && a.source?.date && a.source?.terms)) errors.push(`${a.id}: aiGenerated needs source.tool, date and terms`);
    if (a.kind === 'pet-item' && !ANCHORS.includes(a.anchor)) errors.push(`${a.id}: pet-item needs an anchor (${ANCHORS.join(', ')})`);
    if (a.status === 'final' && !a.files?.['1x']) errors.push(`${a.id}: final but has no file`);
  }
  for (const pet of Object.keys(rig.pets)) {
    if (!seen.has(`pet.${pet}.calma`)) errors.push(`rig pet ${pet} has no pet.${pet}.calma (the fallback mood)`);
    for (const anc of ANCHORS) if (!rig.pets[pet].anchors?.[anc]) errors.push(`rig pet ${pet} lacks anchor ${anc}`);
  }
  // No text inside images. <title>/<desc> are accessibility metadata and allowed.
  const files = walk(join(ROOT, 'public/assets'));
  for (const f of files.filter((x) => x.endsWith('.svg'))) {
    if (/<text[\s>]/.test(readFileSync(f, 'utf8'))) errors.push(`${f.slice(ROOT.length + 1)}: contains <text>; text must never live inside an image`);
  }
  const rasters = files.filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  if (rasters.length) warnings.push(`${rasters.length} raster image(s): check by eye that none contains text, characters or brands`);
  // Ids written in the code
  const code = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const used = new Set([...code.matchAll(ID_IN_CODE)].map((m) => m[0].slice(1, -1)));
  for (const id of used) if (!seen.has(id)) warnings.push(`code uses ${id}, which is not in the manifest (shows a placeholder)`);
  return { assets, errors, warnings, used: [...used] };
}

if (isMain(import.meta.url)) {
  const { assets, errors, warnings } = checkArt();
  warnings.forEach((w) => console.log(`note ${w}`));
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`check-art: ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`check-art: ${assets.length} ids, all files present`);
}
