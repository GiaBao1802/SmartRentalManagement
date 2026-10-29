import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import path from 'node:path';
import pg from 'pg';
import { assertCatalog, readCatalog } from './database-v19.mjs';

assert.equal(process.argv[2], '--backup-and-restore');
assert.equal(process.env.GOCTRO_WRITE_PAUSE_CONFIRMED, 'yes');
const envPath = process.env.GOCTRO_NEON_ENV_FILE;
const contextPath = process.env.GOCTRO_NEON_CONTEXT_FILE;
const localEnvPath = process.env.GOCTRO_LOCAL_ENV_FILE;
const backupDir = process.env.GOCTRO_BACKUP_DIR;
assert.ok(envPath && contextPath && localEnvPath && backupDir, 'Explicit env/context and protected backup directory required');
const context = JSON.parse(await readFile(contextPath, 'utf8'));
const neonVars = parseEnv(await readFile(envPath, 'utf8'));
assert.equal(context.projectId, 'patient-scene-93926977');
assert.equal(context.branch, 'production');
assert.equal(neonVars.NEON_BRANCH, 'production');
const neon = new URL(neonVars.DATABASE_URL_UNPOOLED);
assert.equal(neon.hostname, 'ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech');
assert.equal(neon.pathname, '/neondb');
assert.equal(neon.searchParams.get('sslmode'), 'require');
const localVars = parseEnv(await readFile(localEnvPath, 'utf8'));
const local = new URL(localVars.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(local.hostname));
local.pathname = '/postgres';
const expected = JSON.parse(await readFile('database/baselines/v1.16/expected-catalog.json', 'utf8'));
const names = expected.relations.filter(row => row.kind === 'r').map(row => row.name).sort();
assert.equal(names.length, 47);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const hash = value => createHash('sha256').update(value).digest('hex');
const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
function pgEnv(url, sslmode) {
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: sslmode };
}
function run(file, args, env) {
  const result = spawnSync(path.join(bin, file), args, { env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${file} failed: ${(result.stderr || result.error?.message || '').slice(0, 1200)}`);
  return result.stdout;
}
async function snapshot(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='120s'");
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    const catalog = await readCatalog(client);
    assertCatalog(catalog, expected);
    const tables = {};
    for (const name of names) {
      const rows = (await client.query(`SELECT to_jsonb(t) AS value FROM public.${quote(name)} t`)).rows.map(row => JSON.stringify(row.value)).sort();
      tables[name] = { count: rows.length, sha256: hash(rows.join('\n')) };
    }
    return { database, tables };
  } finally { await client.query('ROLLBACK').catch(() => {}); }
}
const checkDir = await stat(backupDir);
assert.ok(checkDir.isDirectory());
const backupPath = path.join(backupDir, `neon-production-pre-v117-${new Date().toISOString().replaceAll(':', '-')}.dump`);
const restoreDb = `goctro_v117_restore_${randomBytes(6).toString('hex')}`;
const source = new pg.Client({ connectionString: neon.toString(), connectionTimeoutMillis: 12000, application_name: 'goctro-v117-backup-source' });
const admin = new pg.Client({ connectionString: local.toString(), connectionTimeoutMillis: 5000 });
let restored;
let created = false;
try {
  await source.connect();
  const before = await snapshot(source);
  assert.equal(before.database, 'neondb');
  run('pg_dump.exe', ['--format=custom', '--no-owner', '--no-acl', '--schema=public', `--file=${backupPath}`], pgEnv(neon, 'require'));
  const listing = run('pg_restore.exe', ['--list', backupPath], process.env);
  assert.ok(listing.includes('TABLE DATA'));
  const afterDump = await snapshot(source);
  assert.deepEqual(afterDump, before, 'Source changed while backup ran');
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quote(restoreDb)}`);
  created = true;
  const target = new URL(local); target.pathname = '/' + restoreDb;
  run('pg_restore.exe', ['--exit-on-error', '--no-owner', '--no-acl', `--dbname=${restoreDb}`, backupPath], pgEnv(target, 'disable'));
  restored = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 5000 });
  await restored.connect();
  const recovered = await snapshot(restored);
  assert.equal(recovered.database, restoreDb);
  assert.deepEqual(recovered.tables, before.tables, 'Restored table counts or content differ');
  const bytes = await readFile(backupPath);
  const evidence = { result: 'PASS', backupPath, backupBytes: bytes.length, backupSha256: hash(bytes), restoredDatabase: restoreDb, catalog: 'V1.16_EXACT', tableCount: names.length, tables: before.tables, verifiedAt: new Date().toISOString() };
  await writeFile(path.join(backupDir, 'restore-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ result: evidence.result, backupPath, backupBytes: evidence.backupBytes, backupSha256: evidence.backupSha256, catalog: evidence.catalog, tableCount: evidence.tableCount, restoredDatabase: restoreDb }));
} finally {
  if (restored) await restored.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE IF EXISTS ${quote(restoreDb)} WITH (FORCE)`).catch(error => console.error(`Temporary restore cleanup failed for ${restoreDb}: ${error.message}`));
  await admin.end().catch(() => {});
  await source.end().catch(() => {});
}
