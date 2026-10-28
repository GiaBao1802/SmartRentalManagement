import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = resolve(root, 'scripts/run-neon-dev.mjs');

test('Neon runner overrides an inherited local DATABASE_URL without printing credentials', () => {
  const result = spawnSync(process.execPath, [runner, '--check-env'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://local:private@localhost:5432/Goctro_dev_v18' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /database=neondb; branch=production/);
  assert.doesNotMatch(result.stdout, /localhost|private|Goctro_dev_v18/);
});
