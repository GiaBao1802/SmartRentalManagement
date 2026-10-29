import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = resolve(root, 'scripts/run-neon-dev.mjs');

test('Neon runner overrides an inherited local DATABASE_URL without printing credentials', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'goctro-neon-runner-test-'));
  try {
    writeFileSync(resolve(fixture, '.env.neon'), 'DATABASE_URL=postgresql://dummy:dummy@ep-polished-field-a1z99rb7-pooler.ap-southeast-1.aws.neon.tech/neondb\nNEON_BRANCH=production\n');
    const result = spawnSync(process.execPath, [runner, '--check-env'], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgresql://local:private@localhost:5432/Goctro_dev_v18', PORT: '4000', NEXT_PUBLIC_PLATFORM_DEMO_LINKS: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /database=neondb; branch=production/);
    assert.match(result.stdout, /root_port=unset/);
    assert.match(result.stdout, /frontend_port=3000; backend_port=4000/);
    assert.match(result.stdout, /demo_links=disabled/);
    assert.doesNotMatch(result.stdout, /localhost|private|Goctro_dev_v18/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
