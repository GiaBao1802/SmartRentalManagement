import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const envPath = resolve(process.cwd(), '.env.neon');
let neonEnv;
try {
  neonEnv = parseEnv(readFileSync(envPath, 'utf8'));
} catch {
  console.error('NEON_START_FAILED: .env.neon is missing or unreadable. Choose setup.bat option 5 first.');
  process.exit(1);
}

// Explicit assignment matters: Node --env-file and dotenv do not override a
// DATABASE_URL inherited from a shell or backend/.env.
Object.assign(process.env, neonEnv);
// PORT belongs to the backend's backend/.env (or its 4000 default). Keeping
// the shared root PORT in the parent makes Next.js bind to the backend port.
delete process.env.PORT;
// A shared Neon development session must not render local demo-token controls.
process.env.NEXT_PUBLIC_PLATFORM_DEMO_LINKS = '0';

let target;
try {
  target = new URL(process.env.DATABASE_URL);
} catch {
  console.error('NEON_START_FAILED: .env.neon has no valid DATABASE_URL.');
  process.exit(1);
}
const database = target.pathname.replace(/^\//, '');
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !target.hostname.endsWith('.neon.tech')
  || database !== 'neondb'
  || process.env.NEON_BRANCH !== 'production') {
  console.error('NEON_START_FAILED: refusing to start because .env.neon is not the configured Neon production branch.');
  process.exit(1);
}

if (process.argv.includes('--check-env')) {
  console.log(`Neon runtime environment OK: host=${target.hostname}; database=${database}; branch=${process.env.NEON_BRANCH}; root_port=${process.env.PORT ?? 'unset'}; frontend_port=3000; backend_port=4000; demo_links=${process.env.NEXT_PUBLIC_PLATFORM_DEMO_LINKS === '0' ? 'disabled' : 'enabled'}`);
  process.exit(0);
}

// Manual startup must pass the same exact, read-only V1.18 catalog guard as setup.
const sourceCheck = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts/verify-baseline-integrity.mjs')], {
  cwd: process.cwd(), env: process.env, stdio: 'ignore', windowsHide: true,
});
if (sourceCheck.error || sourceCheck.status !== 0) {
  console.error('NEON_START_FAILED: local V1.18 source artifacts or provenance are invalid; app was not started.');
  process.exit(1);
}
const clientCheck = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts/verify-prisma-client.mjs')], {
  cwd: process.cwd(), env: process.env, stdio: 'ignore', windowsHide: true,
});
if (clientCheck.error || clientCheck.status !== 0) {
  console.error('NEON_START_FAILED: Prisma Client is missing or stale; run npm run db:generate locally first.');
  process.exit(1);
}
const catalogCheck = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts/verify-neon-connection.mjs')], {
  cwd: process.cwd(), env: process.env, stdio: 'inherit', windowsHide: true,
});
if (catalogCheck.error || catalogCheck.status !== 0) {
  console.error('NEON_START_FAILED: target or V1.18 catalog verification failed; app was not started.');
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'dev'], {
  cwd: process.cwd(),
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(`NEON_START_FAILED: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
