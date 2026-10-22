import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, rm, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { baselineDirectory, parseTarget, unwrapTransaction, loadBaseline, readCatalog, assertCatalog, catalogsMatch, classifySetupError, setupExitCode, runCommand } from './database-v18.mjs';

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
test('every artifact recorded in provenance retains its reviewed raw bytes', async () => {
  const manifest = JSON.parse(await readFile(path.join(baselineDirectory, 'PROVENANCE.json'), 'utf8'));
  for (const [filename, expected] of Object.entries(manifest.sha256)) {
    const bytes = await readFile(path.join(baselineDirectory, filename));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, filename);
  }
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
test('catalog comparison ignores physical column order but keeps semantic column attributes', () => {
  const expected = { columns: [
    { relation: 'residents', name: 'birth_date', position: 7, type: 'date', not_null: false, identity: '', generated: '', default_value: null },
    { relation: 'residents', name: 'avatar_storage_key', position: 8, type: 'text', not_null: false, identity: '', generated: '', default_value: null },
  ] };
  const reordered = { columns: [
    { ...expected.columns[1], position: 14 },
    { ...expected.columns[0], position: 7 },
  ] };
  assert.equal(catalogsMatch(reordered, expected), true);
  assert.throws(() => assertCatalog({ columns: [{ ...expected.columns[0], type: 'timestamp' }, expected.columns[1]] }, expected), /differs/);
});
test('only the reviewed room-image routine comment variants are normalized', async () => {
  const baseline = await loadBaseline();
  const expected = baseline.catalog.routines.find((row) => row.name === 'room_images_lock_parent_before_insert_fn');
  const commentOnly = expected.definition.replace('Fail fast if another transaction is inserting into this Room. A waiting\n    -- INSERT would retain its original statement snapshot after the row lock\n    -- is released and could miss the committed association in its count check.', 'Fail fast rather than wait for a parent row lock: a blocked INSERT keeps\n    -- its original statement snapshot and may miss the competing committed row.').replace('Updating updated_at both records the gallery mutation and makes a\n    -- transaction using a stale REPEATABLE READ snapshot fail serialization.', 'Update the parent version so a stale REPEATABLE READ transaction fails\n    -- with a serialization error instead of checking an old gallery snapshot.');
  assert.equal(catalogsMatch({ routines: [{ ...expected, definition: commentOnly }] }, { routines: [expected] }), true);
  assert.equal(catalogsMatch({ routines: [{ ...expected, definition: commentOnly.replace('RETURN NEW;', 'RETURN OLD;') }] }, { routines: [expected] }), false);
});
test('setup error classes have distinct guarded exit codes', () => {
  assert.equal(setupExitCode(classifySetupError({ code: '3D000' })), 2);
  assert.equal(setupExitCode(classifySetupError(new Error('database "missing" does not exist'))), 2);
  assert.equal(setupExitCode(classifySetupError({ code: '28P01' })), 3);
  assert.equal(setupExitCode(classifySetupError({ code: 'ECONNREFUSED' })), 4);
  assert.equal(setupExitCode(classifySetupError(new Error('Schema differs from the reviewed V1.8 catalog'))), 5);
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
  assert.match(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).scripts['db:state'], /database-v18\.mjs state$/);
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
    const env = { ...process.env, GOCTRO_SETUP_TEST: '1', [key]: `${path.join(temporary, 'bin')}${path.delimiter}${process.env[key] || ''}` };
    const run = () => spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'setup.bat'], { cwd: temporary, env, input: '\r\n', encoding: 'utf8', timeout: 20000 });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Setup complete/);
    const steps = await readFile(path.join(temporary, 'npm-steps.log'), 'utf8');
    assert.match(steps, /ci/);
    for (const filename of ['.env', 'backend/.env', 'frontend/.env.local']) await access(path.join(temporary, filename));
    await writeFile(path.join(temporary, '.env'), 'PRESERVE_ROOT=1');
    await writeFile(path.join(temporary, 'backend/.env'), 'PRESERVE_BACKEND=1');
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(temporary, '.env'), 'utf8'), 'PRESERVE_ROOT=1');
    assert.equal(await readFile(path.join(temporary, 'backend/.env'), 'utf8'), 'PRESERVE_BACKEND=1');
  } finally { await removeTemporary(temporary); }
});
