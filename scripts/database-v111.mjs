import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  SetupError,
  assertCatalog,
  assertEmptyDatabase,
  assertEmptyTables,
  catalogsMatch,
  classifySetupError,
  loadBaseline,
  parseTarget,
  readCatalog,
  setupExitCode,
  unwrapTransaction,
} from './database-v19.mjs';

export const baselineDirectory = fileURLToPath(new URL('../database/baselines/v1.11/', import.meta.url));
const v112Directory = fileURLToPath(new URL('../database/baselines/v1.12/', import.meta.url));
const v110Directory = fileURLToPath(new URL('../database/baselines/v1.10/', import.meta.url));
const v19Directory = fileURLToPath(new URL('../database/baselines/v1.9/', import.meta.url));
const v18Directory = fileURLToPath(new URL('../database/baselines/v1.8/', import.meta.url));
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const without = (catalog, phrase) => Object.fromEntries(Object.entries(catalog).map(([key, rows]) => [
  key,
  rows.filter((row) => !JSON.stringify(row).includes(phrase)),
]));

async function assertPublicOnly(client) {
  const { rows } = await client.query(`SELECT nspname FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_'`);
  if (rows.length) throw new SetupError('Unexpected user schema exists. This tool supports only the reviewed public-schema baseline.');
}

async function objectCount(client) {
  const { rows } = await client.query(`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS count`);
  return Number(rows[0].count);
}

async function readState(client, database, baselines) {
  await assertPublicOnly(client);
  if (await objectCount(client) === 0) return 'empty_schema';
  const actual = await readCatalog(client);
  const match = baselines.find((entry) => entry.key !== 'v110_booking_branch' && catalogsMatch(actual, entry.baseline.catalog));
  const branchMatch = database === 'Goctro_dev_v18'
    && catalogsMatch(actual, without(baselines.find((entry) => entry.key === 'v111').baseline.catalog, 'auth_sessions'));
  const version = match ?? (branchMatch ? baselines.find((entry) => entry.key === 'v110_booking_branch') : null);
  if (!version) return 'incompatible';
  for (const table of version.baseline.catalog.relations.filter((row) => ['r', 'p'].includes(row.kind))) {
    const { rows } = await client.query(`SELECT EXISTS(SELECT 1 FROM public.${quote(table.name)} LIMIT 1) AS populated`);
    if (rows[0].populated) return `${version.key}_populated`;
  }
  return `${version.key}_empty`;
}

async function applyDatabase(client, mode, current) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
    await client.query('SELECT pg_advisory_xact_lock(1800180020)');
    if (mode === 'bootstrap') {
      await assertEmptyDatabase(client);
      await client.query(current.schemaSql);
    } else if (mode === 'seed') {
      await assertPublicOnly(client);
      assertCatalog(await readCatalog(client), current.catalog);
      await assertEmptyTables(client, current.catalog);
      await client.query(current.seedSql);
    } else {
      throw new SetupError('Invalid write command.');
    }
    assertCatalog(await readCatalog(client), current.catalog);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function applyMigration(client, database, expected, next, migrationPath, version, afterCheck = null, allowProtectedTarget = false) {
  if (database === 'Goctro_test3' && !allowProtectedTarget) throw new SetupError('Schema migration is blocked for Goctro_test3 without the dedicated backup-confirmed upgrade path.', 'target');
  if (version === 'V1.12' && ['Goctro_test3', 'Goctro_dev_v18'].includes(database) && !allowProtectedTarget) throw new SetupError(`V1.12 migration is blocked for ${database} without the dedicated backup-confirmed upgrade path.`, 'target');
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
    await client.query('SELECT pg_advisory_xact_lock(1800180020)');
    await assertPublicOnly(client);
    const actual = await readCatalog(client);
    if (!expected(actual, database)) throw new SetupError('Database catalog does not exactly match the authorized migration predecessor; nothing changed.', 'schema');
    if (database === 'Goctro_dev_v18' || (database === 'Goctro_test3' && allowProtectedTarget)) await client.query('SELECT set_config(\'goctro.allow_locked_db_migration\',$1,true)', [version]);
    const sql = await readFile(migrationPath, 'utf8');
    await client.query(unwrapTransaction(sql));
    const after = await readCatalog(client);
    if (afterCheck ? !afterCheck(after) : !catalogsMatch(after, next.catalog)) {
      throw new SetupError(`Post-migration catalog does not match Database V${version}; transaction rolled back.`, 'schema');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function migrateV1_9ToV1_10(client, database, previous, current) {
  return applyMigration(
    client,
    database,
    (actual) => catalogsMatch(actual, previous.catalog),
    current,
    path.join(v110Directory, 'migrations/V1_9_to_V1_10_auth_sessions.sql'),
    'V1.10',
  );
}

export async function migrateV1_10ToV1_11(client, database, previous, current) {
  return applyMigration(
    client,
    database,
    (actual) => catalogsMatch(actual, previous.catalog),
    current,
    path.join(baselineDirectory, 'migrations/V1_10_to_V1_11_resident_service_bookings.sql'),
    'V1.11',
  );
}

export async function recoverLocalBookingBranchToV1_11(client, database, current) {
  const branchCatalog = without(current.catalog, 'auth_sessions');
  return applyMigration(
    client,
    database,
    (actual, targetDatabase) => targetDatabase === 'Goctro_dev_v18' && catalogsMatch(actual, branchCatalog),
    current,
    path.join(baselineDirectory, 'migrations/V1_10_local_booking_branch_to_V1_11_auth_sessions.sql'),
    'V1.11',
  );
}

export async function migrateV1_11ToV1_12(client, database, previous, next, allowProtectedTarget = false) {
  return applyMigration(
    client,
    database,
    (actual) => catalogsMatch(actual, previous.catalog),
    next,
    path.join(v112Directory, 'migrations/V1_11_to_V1_12_demo_payment.sql'),
    'V1.12',
    null,
    allowProtectedTarget,
  );
}

export async function runCommand(args, env = process.env) {
  const [mode, flag, database, ...extra] = args;
  if (mode === 'block-legacy-migrate') {
    throw new SetupError('db:migrate legacy is blocked: database/migrations is LEGACY/demo history. Use the versioned setup path through V1.12 after verifying a backup.');
  }
  const allowed = ['bootstrap', 'seed', 'inspect', 'state', 'migrate-v19', 'migrate-v110', 'migrate-v110-booking-branch', 'migrate-v112'];
  if (!allowed.includes(mode) || flag !== '--database' || extra.length) {
    throw new SetupError('Usage: database-v111.mjs bootstrap|seed|inspect|state|migrate-v19|migrate-v110|migrate-v110-booking-branch|migrate-v112 --database NAME');
  }
  const target = parseTarget(env.GOCTRO_SETUP_DATABASE_URL, database);
  const current = await loadBaseline(baselineDirectory, '1.11');
  const v112 = await loadBaseline(v112Directory, '1.12');
  const v110 = await loadBaseline(v110Directory, '1.10');
  const v19 = await loadBaseline(v19Directory, '1.9');
  const v18 = await loadBaseline(v18Directory, '1.8');
  const baselines = [
    { key: 'v112', baseline: v112 },
    { key: 'v111', baseline: current },
    { key: 'v110', baseline: v110 },
    { key: 'v110_booking_branch', baseline: { ...current, catalog: without(current.catalog, 'auth_sessions') } },
    { key: 'v19', baseline: v19 },
    { key: 'v18', baseline: v18 },
  ];
  const client = new pg.Client({ connectionString: target.connectionString, connectionTimeoutMillis: 5000, application_name: 'goctro-v112-setup' });
  try {
    await client.connect();
    const { rows: [server] } = await client.query("SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::int AS version");
    if (server.database !== target.database || server.port !== target.port || !['127.0.0.1', '::1'].includes(server.address)) throw new SetupError('Connected server identity differs from the explicit local setup target.');
    if (server.version < 180006 || server.version >= 190000) throw new SetupError('PostgreSQL 18.6 or a later 18.x minor is required.');
    if (mode === 'inspect') {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL search_path=public,pg_catalog');
      await assertPublicOnly(client);
      const actual = await readCatalog(client);
      const match = baselines.find((entry) => catalogsMatch(actual, entry.baseline.catalog)
        && (entry.key !== 'v110_booking_branch' || target.database === 'Goctro_dev_v18'));
      if (!match) throw new SetupError('Schema differs from reviewed V1.12/V1.11/V1.10/V1.9/V1.8 catalogs; no write was attempted.', 'schema');
      const label = { v112: 'V1.12', v111: 'V1.11', v110: 'V1.10', v110_booking_branch: 'local V1.10 booking-first recovery branch', v19: 'V1.9', v18: 'V1.8' }[match.key];
      console.log(`Database ${label} inspect: PASS; database=${target.database}; host=${target.host}; port=${target.port}. Chỉ đọc.`);
      await client.query('ROLLBACK');
    } else if (mode === 'state') {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL search_path=public,pg_catalog');
      const state = await readState(client, target.database, baselines);
      await client.query('ROLLBACK');
      if (state === 'incompatible') throw new SetupError('Database state: schema_incompatible. Inspect the existing database; no write was attempted.', 'schema');
      console.log(`Database state: ${state}; database=${target.database}; host=${target.host}; port=${target.port}. Chỉ đọc.`);
    } else if (mode === 'migrate-v19') {
      await migrateV1_9ToV1_10(client, target.database, v19, v110);
      console.log(`Database V1.9→V1.10 migration: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=42. Added auth_sessions.`);
    } else if (mode === 'migrate-v110') {
      await migrateV1_10ToV1_11(client, target.database, v110, current);
      console.log(`Database V1.10→V1.11 migration: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=43. Added Resident booking requests.`);
    } else if (mode === 'migrate-v110-booking-branch') {
      await recoverLocalBookingBranchToV1_11(client, target.database, current);
      console.log(`Database local booking-first→V1.11 recovery: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=43. Added missing auth_sessions only.`);
    } else if (mode === 'migrate-v112') {
      const protectedTarget = ['Goctro_test3', 'Goctro_dev_v18'].includes(target.database);
      const allowProtectedTarget = protectedTarget && env.GOCTRO_V112_BACKUP_VERIFIED === target.database;
      if (protectedTarget && !allowProtectedTarget) throw new SetupError(`V1.12 migration requires a verified backup confirmation for ${target.database}.`, 'target');
      await migrateV1_11ToV1_12(client, target.database, current, v112, allowProtectedTarget);
      console.log(`Database V1.11→V1.12 migration: PASS; database=${target.database}; host=${target.host}; port=${target.port}. Added the demo-only provider value; credentials hidden.`);
    } else {
      await applyDatabase(client, mode, current);
      console.log(`Database V1.11 ${mode}: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=43. Credentials hidden.`);
    }
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommand(process.argv.slice(2)).catch((error) => {
    const kind = classifySetupError(error);
    console.error(`SETUP_ERROR kind=${kind}`);
    const explanation = {
      missing: 'Database chưa tồn tại.',
      auth: 'PostgreSQL từ chối xác thực hoặc quyền truy cập.',
      connection: 'Không kết nối được PostgreSQL; kiểm tra host/cổng/dịch vụ.',
      schema: 'Schema không khớp baseline V1.12/V1.11/V1.10/V1.9/V1.8; không dùng bootstrap làm upgrade.',
      target: 'Instance/target hoặc phiên bản PostgreSQL không khớp target local PostgreSQL 18.6+.',
      unknown: 'Không hoàn thành được kiểm tra/cài đặt database; xem mã lỗi và hướng dẫn vận hành.',
    }[kind] || 'Target không hợp lệ.';
    console.error(`${explanation} SQLSTATE/mã lỗi=${error.code || 'UNAVAILABLE'}. Nếu transaction đã bắt đầu thì đã yêu cầu rollback. Đã ẩn URL/secret/SQL detail.`);
    process.exitCode = setupExitCode(kind);
  });
}
