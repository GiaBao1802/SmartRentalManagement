import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { assertCatalog, readCatalog, unwrapTransaction } from './database-v19.mjs';

assert.equal(process.argv[2], '--apply-platform-v118');
assert.equal(process.env.GOCTRO_WRITE_PAUSE_CONFIRMED, 'yes');
const envPath = process.env.GOCTRO_NEON_ENV_FILE;
const contextPath = process.env.GOCTRO_NEON_CONTEXT_FILE;
const evidencePath = process.env.GOCTRO_BACKUP_EVIDENCE_FILE;
const applyEvidencePath = process.env.GOCTRO_APPLY_EVIDENCE_FILE;
assert.ok(envPath && contextPath && evidencePath && applyEvidencePath);
const context = JSON.parse(await readFile(contextPath, 'utf8'));
const vars = parseEnv(await readFile(envPath, 'utf8'));
assert.equal(context.projectId, 'patient-scene-93926977');
assert.equal(context.branch, 'production');
assert.equal(vars.NEON_BRANCH, 'production');
const target = new URL(vars.DATABASE_URL_UNPOOLED);
assert.equal(target.hostname, 'ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech');
assert.equal(target.pathname, '/neondb');
assert.equal(target.searchParams.get('sslmode'), 'require');
const backup = JSON.parse(await readFile(evidencePath, 'utf8'));
assert.equal(backup.result, 'PASS');
assert.equal(backup.catalog, 'V1.16_EXACT');
assert.equal(backup.tableCount, 47);
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(await readFile(backup.backupPath)), backup.backupSha256);
const v116 = JSON.parse(await readFile('database/baselines/v1.16/expected-catalog.json', 'utf8'));
const v117 = JSON.parse(await readFile('database/baselines/v1.17/expected-catalog.json', 'utf8'));
const v118 = JSON.parse(await readFile('database/baselines/v1.18/expected-catalog.json', 'utf8'));
const names116 = v116.relations.filter(row => row.kind === 'r').map(row => row.name).sort();
const names117 = v117.relations.filter(row => row.kind === 'r').map(row => row.name).sort();
const names118 = v118.relations.filter(row => row.kind === 'r').map(row => row.name).sort();
assert.equal(names116.length, 47);
assert.equal(names117.length, 49);
assert.equal(names118.length, 58);
for (const [version, files] of [
  ['1.17', ['schema.sql', 'seed.sql', 'expected-catalog.json', 'migrations/V1_16_to_V1_17_cloudy_unresolved_feedback.sql']],
  ['1.18', ['schema.sql', 'expected-catalog.json', 'runtime_validator.sql', 'migrations/V1_17_to_V1_18_platform.sql']]
]) {
  const manifest = JSON.parse(await readFile(`database/baselines/v${version}/PROVENANCE.json`, 'utf8'));
  assert.equal(manifest.version, version);
  for (const name of files) {
    const bytes = await readFile(`database/baselines/v${version}/${name}`);
    assert.equal(hash(bytes), manifest.sha256[name], `V${version} artifact mismatch: ${name}`);
  }
}
const cloudyMigration = unwrapTransaction(await readFile('database/baselines/v1.17/migrations/V1_16_to_V1_17_cloudy_unresolved_feedback.sql', 'utf8'));
const platformMigration = unwrapTransaction(await readFile('database/baselines/v1.18/migrations/V1_17_to_V1_18_platform.sql', 'utf8'));
const validator = await readFile('database/baselines/v1.18/runtime_validator.sql', 'utf8');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
async function fingerprint(db, names, omit = {}) {
  const result = {};
  for (const name of names) {
    const removed = omit[name] ?? [];
    const expression = removed.reduce((sql, column) => `${sql}-'${column}'`, 'to_jsonb(t)');
    const rows = (await db.query(`SELECT ${expression} AS value FROM public.${quote(name)} t`)).rows.map(row => JSON.stringify(row.value)).sort();
    result[name] = { count: rows.length, sha256: hash(rows.join('\n')) };
  }
  return result;
}
const db = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 12000, application_name: 'goctro-platform-v118-direct-upgrade' });
let committed = false;
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL TIME ZONE 'UTC'");
  await db.query('SELECT pg_advisory_xact_lock(1800180018)');
  assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
  assertCatalog(await readCatalog(db), v116);
  const before = await fingerprint(db, names116);
  assert.deepEqual(before, backup.tables, 'Neon source changed since verified backup');
  const conflicts = (await db.query(`SELECT
    (SELECT count(*)::int FROM (SELECT lower(trim(email)) FROM accounts WHERE email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x) AS account_email,
    (SELECT count(*)::int FROM (SELECT lower(trim(contact_email)) FROM owners WHERE contact_email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x) AS owner_email,
    (SELECT count(*)::int FROM owners o JOIN accounts a ON lower(trim(o.contact_email))=lower(trim(a.email)) WHERE a.owner_id IS DISTINCT FROM o.owner_id) AS cross_owner_email,
    (SELECT count(*)::int FROM accounts WHERE NOT ((role='admin' AND owner_id IS NOT NULL AND resident_id IS NULL) OR (role='resident' AND owner_id IS NULL AND resident_id IS NOT NULL))) AS invalid_role_scope`)).rows[0];
  assert.ok(Object.values(conflicts).every(value => value === 0), 'V1.18 identity conflicts detected');
  await db.query(cloudyMigration);
  assertCatalog(await readCatalog(db), v117);
  assert.deepEqual(await fingerprint(db, names116, { accounts: ['cloudy_feedback_opt_in_at'] }), before, 'Cloudy migration changed predecessor data');
  for (const name of names117.filter(name => !names116.includes(name))) {
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${quote(name)}`)).rows[0].n, 0);
  }
  const beforePlatform = await fingerprint(db, names117);
  await db.query(platformMigration);
  assertCatalog(await readCatalog(db), v118);
  assert.deepEqual(await fingerprint(db, names117, { properties: ['public_report_code'] }), beforePlatform, 'Platform migration changed predecessor data');
  const checks = (await db.query(validator)).rows[0];
  assert.ok(Object.values(checks).every(Boolean), `V1.18 validator failed: ${JSON.stringify(checks)}`);
  const platformTables = names118.filter(name => !names117.includes(name));
  assert.equal(platformTables.length, 9);
  for (const name of platformTables) {
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${quote(name)}`)).rows[0].n, 0);
  }
  await db.query('COMMIT');
  committed = true;
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  assertCatalog(await readCatalog(db), v118);
  assert.deepEqual(await fingerprint(db, names117, { properties: ['public_report_code'] }), beforePlatform, 'Post-commit data mismatch');
  const postChecks = (await db.query(validator)).rows[0];
  assert.ok(Object.values(postChecks).every(Boolean), `Post-commit V1.18 validation failed: ${JSON.stringify(postChecks)}`);
  await db.query('ROLLBACK');
  const evidence = { result: 'V1.18_APPLIED_AND_VERIFIED', projectId: context.projectId, branch: context.branch, database: 'neondb', backupPath: backup.backupPath, backupSha256: backup.backupSha256, predecessorTables: 47, cloudyTables: 2, platformTables: 9, oldContentsPreserved: true, runtimeChecks: postChecks, appliedAt: new Date().toISOString() };
  await writeFile(applyEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ result: evidence.result, database: evidence.database, predecessorTables: evidence.predecessorTables, cloudyTables: evidence.cloudyTables, platformTables: evidence.platformTables }));
} catch (error) {
  if (!committed) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await db.end().catch(() => {}); }
