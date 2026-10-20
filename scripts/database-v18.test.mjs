import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, rm, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { baselineDirectory, parseTarget, unwrapTransaction, loadBaseline, readCatalog, assertCatalog, runCommand } from './database-v18.mjs';

async function removeTemporary(directory) {
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.match(path.basename(resolved), /^goctro-v18-/);
  await rm(resolved, { recursive: true, force: true });
}

test('setup requires its own explicit URL and matching database confirmation', () => {
  assert.throws(() => parseTarget(undefined, 'goctro_new'), /GOCTRO_SETUP_DATABASE_URL/);
  assert.throws(() => parseTarget('postgresql://user@localhost:55448/goctro_new', 'wrong'), /matching/);
  assert.equal(parseTarget('postgresql://user@localhost:55448/goctro_new?schema=public', 'goctro_new').port, 55448);
});
test('remote/system databases and connection-option injection are rejected', () => {
  for (const url of ['postgresql://user@remote:5432/goctro_new', 'postgresql://user@localhost:5432/postgres', 'postgresql://user@localhost:5432/goctro_new?options=bad']) {
    assert.throws(() => parseTarget(url, new URL(url).pathname.slice(1)));
  }
});
test('DATABASE_URL alone cannot cause a connection', async () => {
  await assert.rejects(runCommand(['bootstrap', '--database', 'goctro_new'], { DATABASE_URL: 'not-used' }), /GOCTRO_SETUP_DATABASE_URL/);
});
test('SQL transaction stripping preserves function bodies and rejects missing envelopes', () => {
  const sql = '-- canonical\r\nBEGIN;\nCREATE FUNCTION f() RETURNS void AS $$ BEGIN NULL; END $$ LANGUAGE plpgsql;\nCOMMIT;\n';
  assert.match(unwrapTransaction(sql), /\$\$ BEGIN NULL; END \$\$/);
  assert.throws(() => unwrapTransaction('SELECT 1;'), /envelope/);
});
test('reviewed artifacts load and tampering fails closed', async () => {
  const baseline = await loadBaseline();
  assert.equal(baseline.catalog.relations.filter((r) => r.kind === 'r').length, 40);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'goctro-v18-artifacts-'));
  try {
    await cp(baselineDirectory, temporary, { recursive: true });
    await appendFile(path.join(temporary, 'seed.sql'), '\n-- unreviewed edit');
    await assert.rejects(loadBaseline(temporary), /integrity mismatch/);
  } finally { await removeTemporary(temporary); }
});
test('catalog drift in a constraint/index is rejected', () => {
  assert.throws(() => assertCatalog({ indexes: [] }, { indexes: ['expected'] }), /differs/);
});
test('catalog comparison order is independent of server collation', async () => {
  const rows = [{ name: 'accounts' }, { name: 'account_invitations' }, { name: 'z' }];
  const first = await readCatalog({ query: async () => ({ rows: [...rows] }) });
  const second = await readCatalog({ query: async () => ({ rows: [...rows].reverse() }) });
  assertCatalog(first, second);
});
test('legacy migration exits nonzero without reading connection configuration', () => {
  const entry = fileURLToPath(new URL('./database-v18.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [entry, 'block-legacy-migrate'], { encoding: 'utf8', env: { ...process.env, GOCTRO_SETUP_DATABASE_URL: 'not-used' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LEGACY\/demo history/);
  assert.match(result.stderr, /db:bootstrap/);
  assert.doesNotMatch(result.stderr, /not-used/);
});
test('Compose and npm commands use the new V1.8 path and separate PG18 volume', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const compose = await readFile(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /image: postgres:18\.6/);
  assert.match(compose, /postgres18_v18_data:\/var\/lib\/postgresql\s/);
  assert.doesNotMatch(compose, /postgres_data:|postgres:17/);
  for (const manifest of ['package.json', 'backend/package.json']) {
    const scripts = JSON.parse(await readFile(path.join(root, manifest), 'utf8')).scripts;
    assert.match(scripts['db:seed'], /database-v18\.mjs seed$/);
    assert.match(scripts['db:migrate'], /block-legacy-migrate$/);
    assert.match(scripts['db:generate'], /schema\.prisma|workspace=@goctro\/backend/);
  }
});

test('Windows setup continues after npm and preserves existing local env files', { skip: process.platform !== 'win32' }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'goctro-v18-batch-'));
  try {
    for (const directory of ['bin', 'backend', 'frontend']) await mkdir(path.join(temporary, directory));
    await cp(path.join(root, 'setup.bat'), path.join(temporary, 'setup.bat'));
    for (const filename of ['.env.example', 'backend/.env.example', 'frontend/.env.example']) {
      await cp(path.join(root, filename), path.join(temporary, filename));
    }
    await writeFile(path.join(temporary, 'package.json'), '{}');
    await writeFile(path.join(temporary, 'bin/npm.cmd'), '@echo off\r\nif "%~1"=="--version" (\r\n echo 11.6.0\r\n exit /b 0\r\n)\r\necho %*>>npm-steps.log\r\nexit /b 0\r\n');
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'Path';
    const env = { ...process.env, [key]: `${path.join(temporary, 'bin')}${path.delimiter}${process.env[key] || ''}` };
    const run = () => spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'setup.bat'], { cwd: temporary, env, input: '\r\n', encoding: 'utf8', timeout: 20000 });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Setup complete/);
    const steps = await readFile(path.join(temporary, 'npm-steps.log'), 'utf8');
    assert.match(steps, /ci/);
    assert.match(steps, /run db:generate/);
    for (const filename of ['.env', 'backend/.env', 'frontend/.env.local']) await access(path.join(temporary, filename));
    await writeFile(path.join(temporary, '.env'), 'PRESERVE_ROOT=1');
    await writeFile(path.join(temporary, 'backend/.env'), 'PRESERVE_BACKEND=1');
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(temporary, '.env'), 'utf8'), 'PRESERVE_ROOT=1');
    assert.equal(await readFile(path.join(temporary, 'backend/.env'), 'utf8'), 'PRESERVE_BACKEND=1');
  } finally { await removeTemporary(temporary); }
});
