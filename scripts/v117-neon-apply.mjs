import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { assertCatalog, readCatalog, unwrapTransaction } from './database-v19.mjs';

assert.equal(process.argv[2], '--apply-platform-v117');
assert.equal(process.env.GOCTRO_WRITE_PAUSE_CONFIRMED, 'yes');
const envPath = process.env.GOCTRO_NEON_ENV_FILE;
const contextPath = process.env.GOCTRO_NEON_CONTEXT_FILE;
const evidencePath = process.env.GOCTRO_BACKUP_EVIDENCE_FILE;
const applyEvidencePath = process.env.GOCTRO_APPLY_EVIDENCE_FILE;
assert.ok(envPath && contextPath && evidencePath && applyEvidencePath, 'Explicit target and verified backup evidence required');
const context = JSON.parse(await readFile(contextPath, 'utf8'));
const vars = parseEnv(await readFile(envPath, 'utf8'));
assert.equal(context.projectId, 'patient-scene-93926977');
assert.equal(context.branch, 'production');
assert.equal(vars.NEON_BRANCH, 'production');
const target = new URL(vars.DATABASE_URL_UNPOOLED);
assert.equal(target.hostname, 'ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech');
assert.equal(target.pathname, '/neondb');
assert.equal(target.searchParams.get('sslmode'), 'require');
const source = JSON.parse(await readFile(evidencePath, 'utf8'));
assert.equal(source.result, 'PASS');
assert.equal(source.catalog, 'V1.16_EXACT');
assert.equal(source.tableCount, 47);
const backupBytes = await readFile(source.backupPath);
assert.equal(createHash('sha256').update(backupBytes).digest('hex'), source.backupSha256);
const pre = JSON.parse(await readFile('database/baselines/v1.16/expected-catalog.json', 'utf8'));
const post = JSON.parse(await readFile('database/baselines/v1.17/expected-catalog.json', 'utf8'));
const manifest = JSON.parse(await readFile('database/baselines/v1.17/PROVENANCE.json', 'utf8'));
assert.equal(manifest.version, '1.17');
assert.equal(manifest.predecessor, 'database/baselines/v1.16');
assert.equal(manifest.status, 'REHEARSED_NOT_APPLIED');
for (const [name, expected] of Object.entries(manifest.sha256)) {
  const bytes = await readFile(`database/baselines/v1.17/${name}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `V1.17 artifact mismatch: ${name}`);
}
const migration = unwrapTransaction(await readFile('database/baselines/v1.17/migrations/V1_16_to_V1_17_platform.sql', 'utf8'));
const validator = await readFile('database/baselines/v1.17/runtime_validator.sql', 'utf8');
const names = pre.relations.filter(row => row.kind === 'r').map(row => row.name).sort();
assert.equal(names.length, 47);
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const hash = value => createHash('sha256').update(value).digest('hex');
async function fingerprint(db, omitReportCode = false) {
  const result = {};
  for (const name of names) {
    const expression = omitReportCode && name === 'properties' ? "to_jsonb(t)-'public_report_code'" : 'to_jsonb(t)';
    const rows = (await db.query(`SELECT ${expression} AS value FROM public.${quote(name)} t`)).rows.map(row => JSON.stringify(row.value)).sort();
    result[name] = { count: rows.length, sha256: hash(rows.join('\n')) };
  }
  return result;
}
const db = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 12000, application_name: 'goctro-platform-v117-direct-upgrade' });
let committed = false;
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
  await db.query('SELECT pg_advisory_xact_lock(1800180017)');
  assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
  assertCatalog(await readCatalog(db), pre);
  const before = await fingerprint(db);
  assert.deepEqual(before, source.tables, 'Source changed since verified backup');
  const conflicts = (await db.query(`SELECT
    (SELECT count(*)::int FROM (SELECT lower(trim(email)) FROM accounts WHERE email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x) AS account_email,
    (SELECT count(*)::int FROM (SELECT lower(trim(contact_email)) FROM owners WHERE contact_email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x) AS owner_email,
    (SELECT count(*)::int FROM owners o JOIN accounts a ON lower(trim(o.contact_email))=lower(trim(a.email)) WHERE a.owner_id IS DISTINCT FROM o.owner_id) AS cross_owner_email,
    (SELECT count(*)::int FROM accounts WHERE NOT ((role='admin' AND owner_id IS NOT NULL AND resident_id IS NULL) OR (role='resident' AND owner_id IS NULL AND resident_id IS NOT NULL))) AS invalid_role_scope`)).rows[0];
  assert.ok(Object.values(conflicts).every(value => value === 0), 'V1.17 identity conflicts detected');
  await db.query(migration);
  assertCatalog(await readCatalog(db), post);
  const after = await fingerprint(db, true);
  assert.deepEqual(after, before, 'Old table content changed unexpectedly');
  const checks = (await db.query(validator)).rows[0];
  assert.ok(Object.values(checks).every(Boolean), `V1.17 runtime validator failed: ${JSON.stringify(checks)}`);
  const platformTables = post.relations.filter(row => row.kind === 'r' && !names.includes(row.name));
  assert.equal(platformTables.length, 9);
  for (const row of platformTables) assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${quote(row.name)}`)).rows[0].n, 0, `New platform table ${row.name} must start empty`);
  await db.query('COMMIT');
  committed = true;
  await db.query('BEGIN READ ONLY');
  assertCatalog(await readCatalog(db), post);
  assert.deepEqual(await fingerprint(db, true), before, 'Post-commit predecessor data mismatch');
  const postChecks = (await db.query(validator)).rows[0];
  assert.ok(Object.values(postChecks).every(Boolean), `Post-commit V1.17 runtime check failed: ${JSON.stringify(postChecks)}`);
  await db.query('ROLLBACK');
  const evidence = { result: 'V1.17_APPLIED_AND_VERIFIED', projectId: context.projectId, branch: context.branch, database: 'neondb', backupPath: source.backupPath, backupSha256: source.backupSha256, predecessorTables: names.length, newPlatformTables: platformTables.length, oldContentsPreserved: true, runtimeChecks: postChecks, appliedAt: new Date().toISOString() };
  await writeFile(applyEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ result: evidence.result, database: evidence.database, predecessorTables: evidence.predecessorTables, newPlatformTables: evidence.newPlatformTables }));
} catch (error) {
  if (!committed) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await db.end().catch(() => {}); }
