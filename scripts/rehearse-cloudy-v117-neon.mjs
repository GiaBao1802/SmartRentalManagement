import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertCatalog, catalogsMatch, readCatalog, unwrapTransaction } from './database-v19.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database/baselines/v1.17');
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database/baselines/v1.16');
const migrationPath = path.join(root, 'migrations/V1_16_to_V1_17_cloudy_unresolved_feedback.sql');
const targetValue = process.env.CLOUDY_V117_TEST_DATABASE_URL;
const expectedHost = process.env.CLOUDY_V117_EXPECTED_HOST;
const parentHost = process.env.CLOUDY_V117_PARENT_HOST;
const branchName = process.env.CLOUDY_V117_BRANCH_NAME;
const branchId = process.env.CLOUDY_V117_BRANCH_ID;
const expiresAt = process.env.CLOUDY_V117_EXPIRES_AT;

if (!targetValue || !expectedHost || !parentHost || branchName !== 'goctro-cloudy-v117-test-20261029' || branchId !== 'br-small-tree-a1mhsspy' || expiresAt !== '2026-11-05T00:00:00Z') {
  throw new Error('Set the exact selected V1.17 rehearsal branch and its connection privately in the environment.');
}
const target = new URL(targetValue);
if (target.hostname !== expectedHost || !target.hostname.endsWith('.aws.neon.tech') || target.pathname !== '/neondb') {
  throw new Error('Refusing V1.17 rehearsal: the connection does not match the selected Neon test branch host/database.');
}
if (target.hostname === parentHost) {
  throw new Error('Refusing to migrate the shared-dev production parent branch.');
}

const client = new pg.Client({ connectionString: targetValue });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
async function fingerprints() {
  const tables = JSON.parse(await readFile(path.join(source, 'expected-catalog.json'), 'utf8')).relations
    .filter((row) => row.kind === 'r' || row.kind === 'p').map((row) => row.name);
  const result = {};
  for (const table of tables) {
    const rowJson = table === 'accounts' ? "(to_jsonb(t) - 'cloudy_feedback_opt_in_at')" : 'to_jsonb(t)';
    const query = `SELECT count(*)::text AS count, md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS hash FROM (SELECT md5(${rowJson}::text) AS row_hash FROM public.${quote(table)} AS t) AS rows`;
    result[table] = (await client.query(query)).rows[0];
  }
  return result;
}

await client.connect();
try {
  const identity = await client.query('SELECT current_database() AS database, current_setting($1) AS version, inet_server_addr()::text AS server', ['server_version_num']);
  if (identity.rows[0].database !== 'neondb' || Number(identity.rows[0].version) < 180000) throw new Error('Selected rehearsal target is not the expected PostgreSQL 18 neondb.');
  const existing = await readCatalog(client);
  const v116 = JSON.parse(await readFile(path.join(source, 'expected-catalog.json'), 'utf8'));
  const alreadyV117 = await readFile(path.join(root, 'expected-catalog.json'), 'utf8').then((value) => JSON.parse(value)).catch(() => null);
  if (alreadyV117 && catalogsMatch(existing, alreadyV117)) {
    console.log(`V1.17 catalog already present on selected rehearsal branch ${branchName}; validating baseline and preserving rows.`);
  } else {
    assertCatalog(existing, v116);
    const beforeRows = await fingerprints();
    const migration = unwrapTransaction(await readFile(migrationPath, 'utf8'));
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
      await client.query('SELECT pg_advisory_xact_lock(1800180020)');
      assertCatalog(await readCatalog(client), v116);
      await client.query(migration);
      const afterCatalog = await readCatalog(client);
      const baseTables = afterCatalog.relations.filter((row) => row.kind === 'r' || row.kind === 'p');
      if (baseTables.length !== 49) throw new Error(`Expected 49 tables after V1.17, found ${baseTables.length}.`);
      const prefs = await client.query('SELECT count(*)::int AS count FROM public.accounts WHERE cloudy_feedback_opt_in_at IS NOT NULL');
      if (prefs.rows[0].count !== 0) throw new Error('Existing accounts unexpectedly gained Cloudy feedback consent.');
      const afterRows = await fingerprints();
      if (JSON.stringify(beforeRows) !== JSON.stringify(afterRows)) throw new Error('V1.16 table row fingerprints changed during V1.17 migration.');
      await client.query('COMMIT');
      const finalRows = await fingerprints();
      if (JSON.stringify(beforeRows) !== JSON.stringify(finalRows)) throw new Error('V1.16 table row fingerprints changed after commit.');
      await writeFile(path.join(root, 'expected-catalog.json'), `${JSON.stringify(afterCatalog, null, 2)}\n`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  const catalog = await readCatalog(client);
  if (alreadyV117) assertCatalog(catalog, alreadyV117);
  const tables = catalog.relations.filter((row) => row.kind === 'r' || row.kind === 'p');
  if (tables.length !== 49) throw new Error(`Expected 49 V1.17 tables, found ${tables.length}.`);
  const empty = await client.query('SELECT (SELECT count(*) FROM public.cloudy_unresolved_feedback)::int AS feedback, (SELECT count(*) FROM public.cloudy_unresolved_feedback_reviews)::int AS reviews, (SELECT count(*) FROM public.accounts WHERE cloudy_feedback_opt_in_at IS NOT NULL)::int AS opted_in');
  if (empty.rows[0].feedback !== 0 || empty.rows[0].reviews !== 0 || empty.rows[0].opted_in !== 0) throw new Error('Rehearsal branch contains feature rows; refusing to overwrite the clean V1.17 baseline seed.');

  const schema116 = unwrapTransaction(await readFile(path.join(source, 'schema.sql'), 'utf8'));
  const migration = unwrapTransaction(await readFile(migrationPath, 'utf8'));
  await writeFile(path.join(root, 'schema.sql'), `BEGIN;\n${schema116}\n${migration}\nCOMMIT;\n`);
  await copyFile(path.join(source, 'seed.sql'), path.join(root, 'seed.sql'));
  const sha256 = {};
  for (const file of ['schema.sql', 'seed.sql', 'expected-catalog.json', 'migrations/V1_16_to_V1_17_cloudy_unresolved_feedback.sql']) {
    sha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  }
  await writeFile(path.join(root, 'PROVENANCE.json'), `${JSON.stringify({
    version: '1.17',
    predecessor: 'database/baselines/v1.16',
    status: 'REHEARSED_ON_DISPOSABLE_NEON_BRANCH',
    rehearsal: { provider: 'Neon shared-dev project', parent: 'production', branch: branchName, branchId, expiresAt, database: identity.rows[0].database, postgresVersionNum: identity.rows[0].version },
    sha256,
  }, null, 2)}\n`);
  await writeFile(path.join(root, 'README.md'), `# Database V1.17 — Cloudy unresolved feedback\n\nStatus: **REHEARSED_ON_DISPOSABLE_NEON_BRANCH; NOT APPLIED TO SHARED-DEV PRODUCTION OR LOCAL DATABASES**. This additive version extends account roles/consent and adds the opt-in Cloudy unresolved-message inbox plus append-only review history. It preserves all V1.16 rows. Retention is 30 days from first capture; duplicate occurrences do not extend the deadline.\n\nThe migration was rehearsed on Neon branch \`${branchName}\` (ID \`${branchId}\`), cloned from shared-dev \`production\` and expiring \`${expiresAt}\`. The parent branch and local \`Goctro_dev_v18\` were not changed. Do not apply this version to either target or create/invite a Superadmin account without separate authorization and a verified email.\n\nRun \`node scripts/rehearse-cloudy-v117-neon.mjs\` only with the selected branch's connection URL supplied through \`CLOUDY_V117_TEST_DATABASE_URL\`; the runner rejects other hosts and the parent branch.\n`);
  console.log(`V1.16→V1.17 rehearsal PASS on ${branchName}; 49 tables; predecessor rows preserved; new feature tables/preferences empty; baseline artifacts generated; parent/shared and local databases untouched.`);
} finally {
  await client.end();
}
