// Runs the browser smoke test against the built site in dist/ (run `npm run build` first).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run', 'tests/smoke-layout.test.ts', 'tests/solitario-browser.test.ts', 'tests/solitario-layout.test.ts', 'tests/crucigramas-browser.test.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, SMOKE_DIST: '1' } });
process.exit(r.status ?? 1);
