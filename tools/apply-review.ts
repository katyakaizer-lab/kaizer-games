// Applies a word review patch exported from the dev page /revision/ (revision-YYYY-MM-DD.json) to src/data/words:
//   node tools/apply-review.ts path/to/revision-2026-11-20.json [--dry-run]
// "Correcto" and "Editar" set reviewed:true (edited fields are written first); "Dudoso" keeps reviewed:false and stores
// the note as reviewNote. The bank is validated before anything is written; with errors nothing changes.
import { readFileSync } from 'node:fs';
import { applyPatch, type ReviewPatch } from '../src/revision/decisions.ts';
import { validateWords } from '../src/words/rules.ts';
import { loadWordFiles, writeTopicFile } from './words-lib.ts';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry-run');
if (!file) { console.error('usage: node tools/apply-review.ts revision-YYYY-MM-DD.json [--dry-run]'); process.exit(2); }
const patch = JSON.parse(readFileSync(file, 'utf8')) as ReviewPatch;
const { topics, files, entries } = loadWordFiles();
const res = applyPatch(entries, patch);
const check = validateWords(entries, topics);
if (res.missing.length) console.warn(`  not in the bank (skipped): ${res.missing.join(', ')}`);
if (res.badFields.length) console.warn(`  fields that cannot be edited (skipped): ${res.badFields.join(', ')}`);
if (check.errors.length) {
  console.error(check.errors.map((e) => `  ${e}`).join('\n'));
  console.error(`apply-review: the edits break ${check.errors.length} rule(s); nothing was written. Fix the patch or the words and run again.`);
  process.exit(1);
}
if (!dry) for (const f of files) writeTopicFile(f.name, f.data);
const reviewed = entries.filter((e) => e.reviewed).length;
console.log(`apply-review: ${res.applied} entries marked reviewed, ${res.doubtful} doubtful${dry ? ' (dry run, nothing written)' : ''}; the bank now has ${reviewed} of ${entries.length} reviewed`);
