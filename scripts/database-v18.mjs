import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const baselineDirectory = fileURLToPath(new URL('../database/baselines/v1.8/', import.meta.url));
export class SetupError extends Error {
  constructor(message, kind = null) {
    super(message);
    this.name = 'SetupError';
    this.kind = kind;
  }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

export function parseTarget(value, expectedDatabase) {
  if (!value) throw new SetupError('Set GOCTRO_SETUP_DATABASE_URL explicitly. DATABASE_URL and backend/.env are never loaded by this tool.');
  let url;
  try { url = new URL(value); } catch { throw new SetupError('Invalid setup URL (value hidden).'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new SetupError('This local-development setup tool accepts only local PostgreSQL URLs.');
  }
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw new SetupError('Invalid database name.'); }
  if (!expectedDatabase || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(expectedDatabase) || database !== expectedDatabase) {
    throw new SetupError('Supply --database NAME matching the setup URL exactly.');
  }
  if (['postgres', 'template0', 'template1'].includes(database.toLowerCase())) throw new SetupError('Maintenance/template databases cannot be setup targets.');
  for (const [key, param] of url.searchParams) {
    if (key !== 'schema' || param !== 'public') throw new SetupError('Only the optional schema=public URL parameter is supported.');
  }
  return { connectionString: value, database, host, port: Number(url.port || 5432) };
}

// Preserve every SQL statement, stripping only the verified outer transaction envelope.
// The caller owns BEGIN/COMMIT so preflight, DDL/data and postflight are atomic.
export function unwrapTransaction(sql) {
  const opening = /^(?:\uFEFF)?(?:\s|--[^\r\n]*(?:\r?\n|$))*BEGIN\s*;/i;
  const closing = /COMMIT\s*;\s*$/i;
  if (!opening.test(sql) || !closing.test(sql)) throw new SetupError('Canonical SQL must have one BEGIN/COMMIT envelope.');
  return sql.replace(opening, '').replace(closing, '');
}

export async function loadBaseline(directory = baselineDirectory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'PROVENANCE.json'), 'utf8'));
  if (manifest.version !== '1.8') throw new SetupError('Unexpected baseline version.');
  const artifacts = {};
  for (const filename of ['schema.sql', 'seed.sql', 'expected-catalog.json']) {
    const bytes = await readFile(path.join(directory, filename));
    if (hash(bytes) !== manifest.sha256[filename]) throw new SetupError(`Baseline integrity mismatch: ${filename}. Restore the reviewed V1.8 artifact.`);
    artifacts[filename] = bytes.toString('utf8');
  }
  return {
    schemaSql: unwrapTransaction(artifacts['schema.sql']),
    seedSql: unwrapTransaction(artifacts['seed.sql']),
    catalog: JSON.parse(artifacts['expected-catalog.json']),
  };
}

// Stable structural catalog; excludes owners/OIDs/statistics/sequence current values/data.
// Captures columns/defaults, CHECK/FK/UNIQUE, partial indexes, routines and triggers.
export async function readCatalog(client) {
  const queries = {
    relations: `SELECT c.relname AS name,c.relkind AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.relpersistence AS persistence FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname`,
    columns: `SELECT c.relname AS relation,a.attname AS name,a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    constraints: `SELECT co.conname AS name,c.relname AS relation,co.contype AS type,pg_get_constraintdef(co.oid,false) AS definition,co.convalidated AS validated FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace LEFT JOIN pg_class c ON c.oid=co.conrelid WHERE n.nspname='public' ORDER BY c.relname,co.conname`,
    indexes: `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
    routines: `SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`,
    triggers: `SELECT c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    sequences: `SELECT c.relname AS name,format_type(s.seqtypid,NULL) AS type,s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmax::text AS max,s.seqmin::text AS min,s.seqcache::text AS cache,s.seqcycle AS cycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname`,
    enums: `SELECT t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`,
    types: `SELECT t.typname AS name,t.typtype AS kind,CASE WHEN t.typbasetype=0 THEN NULL ELSE format_type(t.typbasetype,t.typtypmod) END AS base_type,t.typnotnull AS not_null,t.typdefault AS default_value FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname`,
    extensions: `SELECT e.extname AS name,e.extversion AS version FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE n.nspname='public' ORDER BY e.extname`,
    policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
    views: `SELECT c.relname AS name,pg_get_viewdef(c.oid,false) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname`,
  };
  const result = {};
  for (const [key, sql] of Object.entries(queries)) {
    // PostgreSQL native/Windows and Docker may use different default collations.
    // Compare structures in a locale-independent order, never host localeCompare().
    result[key] = (await client.query(sql)).rows.sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return result;
}

const routineCommentVariants = {
  room_images_lock_parent_before_insert_fn: [
    `    -- Fail fast if another transaction is inserting into this Room. A waiting\n    -- INSERT would retain its original statement snapshot after the row lock\n    -- is released and could miss the committed association in its count check.\n`,
    `    -- Fail fast rather than wait for a parent row lock: a blocked INSERT keeps\n    -- its original statement snapshot and may miss the competing committed row.\n`,
    `    -- Updating updated_at both records the gallery mutation and makes a\n    -- transaction using a stale REPEATABLE READ snapshot fail serialization.\n`,
    `    -- Update the parent version so a stale REPEATABLE READ transaction fails\n    -- with a serialization error instead of checking an old gallery snapshot.\n`,
  ],
};

function normalizeRoutine(row) {
  const variants = routineCommentVariants[row.name];
  if (!variants) return row;
  let definition = row.definition;
  for (const comment of variants) definition = definition.replace(comment, '');
  return { ...row, definition };
}

export function normalizeCatalog(catalog) {
  const normalized = {};
  for (const [key, rows] of Object.entries(catalog)) {
    normalized[key] = rows.map((row) => {
      const copy = { ...row };
      if (key === 'columns') delete copy.position;
      return key === 'routines' ? normalizeRoutine(copy) : copy;
    }).sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return normalized;
}

export function catalogsMatch(actual, expected) {
  return JSON.stringify(normalizeCatalog(actual)) === JSON.stringify(normalizeCatalog(expected));
}

export function assertCatalog(actual, expected) {
  if (!catalogsMatch(actual, expected)) throw new SetupError('Schema differs from the reviewed V1.8 catalog (including migration history/constraints/indexes/triggers). Stop and review the existing database; bootstrap is not an upgrade.', 'schema');
}

export function catalogDifferences(actual, expected) {
  const a = normalizeCatalog(actual), e = normalizeCatalog(expected);
  const result = [];
  for (const group of new Set([...Object.keys(a), ...Object.keys(e)])) {
    if (JSON.stringify(a[group]) === JSON.stringify(e[group])) continue;
    const key = row => [row.relation, row.tablename, row.name, row.indexname, row.arguments].filter(v => v !== undefined).join('/');
    const actualRows = new Map((a[group] || []).map(row => [key(row), row]));
    const expectedRows = new Map((e[group] || []).map(row => [key(row), row]));
    for (const id of new Set([...actualRows.keys(), ...expectedRows.keys()])) {
      const left = actualRows.get(id), right = expectedRows.get(id);
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
      const fields = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].filter(f => JSON.stringify(left?.[f]) !== JSON.stringify(right?.[f]));
      result.push(`${group}: ${id}; ${!left ? 'thiếu' : !right ? 'ngoài baseline' : 'khác thuộc tính ' + fields.join(', ')}`);
    }
  }
  return result;
}

async function assertPublicOnly(client) {
  const { rows } = await client.query(`SELECT nspname FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_'`);
  if (rows.length) throw new SetupError('Unexpected user schema exists. This tool supports only the reviewed public-schema baseline.');
}

export async function assertEmptyDatabase(client) {
  await assertPublicOnly(client);
  const { rows } = await client.query(`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS count`);
  if (Number(rows[0].count) !== 0) throw new SetupError('Bootstrap refused: target already has schema objects or migration history. Nothing was applied. See docs/10_operations/DATABASE_V1_8_SETUP.md.');
}

export async function assertEmptyTables(client, catalog) {
  const tables = catalog.relations.filter((r) => ['r', 'p'].includes(r.kind)).map((r) => r.name);
  await client.query(`LOCK TABLE ${tables.map((t) => `public.${quote(t)}`).join(',')} IN ACCESS EXCLUSIVE MODE`);
  for (const table of tables) {
    const { rows } = await client.query(`SELECT EXISTS(SELECT 1 FROM public.${quote(table)} LIMIT 1) AS populated`);
    if (rows[0].populated) throw new SetupError(`Seed refused: application data exists in ${table}. Seed is one-shot, not an upsert/upgrade tool.`);
  }
}

export async function readDatabaseState(client, baseline) {
  await assertPublicOnly(client);
  const { rows: objectRows } = await client.query(`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS count`);
  if (Number(objectRows[0].count) === 0) return 'empty_schema';
  const actual = await readCatalog(client);
  if (!catalogsMatch(actual, baseline.catalog)) {
    for (const difference of catalogDifferences(actual, baseline.catalog)) console.error(`Khác biệt schema: ${difference}`);
    return 'incompatible';
  }
  const tables = baseline.catalog.relations.filter((r) => ['r', 'p'].includes(r.kind));
  for (const table of tables) {
    const { rows } = await client.query(`SELECT EXISTS(SELECT 1 FROM public.${quote(table.name)} LIMIT 1) AS populated`);
    if (rows[0].populated) return 'v18_populated';
  }
  return 'v18_empty';
}

export function classifySetupError(error) {
  if (error?.kind) return error.kind;
  if (error?.code === '3D000') return 'missing';
  if (['28P01', '28000', '42501'].includes(error?.code)) return 'auth';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET'].includes(error?.code)) return 'connection';
  if (/database .* does not exist/i.test(error?.message || '')) return 'missing';
  if (/password authentication failed|authentication failed|no pg_hba\.conf entry|client password must be a string/i.test(error?.message || '')) return 'auth';
  if (/connect ECONNREFUSED|connect ETIMEDOUT|ENOTFOUND/i.test(error?.message || '')) return 'connection';
  if (/Schema differs|incompatible|Unexpected user schema/.test(error?.message || '')) return 'schema';
  if (/Connected server identity|PostgreSQL 18\.6/.test(error?.message || '')) return 'target';
  return 'unknown';
}

export function setupExitCode(kind) {
  return { unknown: 1, missing: 2, auth: 3, connection: 4, schema: 5, target: 6 }[kind] || 1;
}

export async function applyDatabase(client, mode, baseline) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
    await client.query('SELECT pg_advisory_xact_lock(1800180018)');
    if (mode === 'bootstrap') {
      await assertEmptyDatabase(client);
      await client.query(baseline.schemaSql);
    } else if (mode === 'seed') {
      await assertPublicOnly(client);
      assertCatalog(await readCatalog(client), baseline.catalog);
      await assertEmptyTables(client, baseline.catalog);
      await client.query(baseline.seedSql);
    } else {
      throw new SetupError('Invalid write command.');
    }
    assertCatalog(await readCatalog(client), baseline.catalog);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function runCommand(args, env = process.env) {
  const [mode, flag, database, ...extra] = args;
  if (mode === 'block-legacy-migrate') {
    throw new SetupError('db:migrate is blocked: database/migrations is LEGACY/demo history, not Database V1.8. For a NEW EMPTY database use npm run db:bootstrap -- --database NAME, then db:seed. For existing data follow docs/10_operations/DATABASE_V1_8_SETUP.md; no automatic upgrade is supplied.');
  }
  if (!['bootstrap', 'seed', 'inspect', 'state'].includes(mode) || flag !== '--database' || extra.length) throw new SetupError('Usage: database-v18.mjs bootstrap|seed|inspect|state --database NAME');
  const target = parseTarget(env.GOCTRO_SETUP_DATABASE_URL, database);
  const baseline = await loadBaseline();
  const client = new pg.Client({ connectionString: target.connectionString, connectionTimeoutMillis: 5000, application_name: 'goctro-v18-setup' });
  try {
    await client.connect();
    const { rows: [server] } = await client.query("SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::int AS version");
    if (server.database !== target.database || server.port !== target.port || !['127.0.0.1', '::1'].includes(server.address)) throw new SetupError('Connected server identity differs from the explicit local setup target.');
    if (server.version < 180006 || server.version >= 190000) throw new SetupError('PostgreSQL 18.6 or a later 18.x minor is required. PostgreSQL 17 data directories/volumes cannot be reused.');
    if (mode === 'inspect') {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL search_path=public,pg_catalog');
      await assertPublicOnly(client);
      assertCatalog(await readCatalog(client), baseline.catalog);
      await client.query('ROLLBACK');
    } else if (mode === 'state') {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL search_path=public,pg_catalog');
      const state = await readDatabaseState(client, baseline);
      await client.query('ROLLBACK');
      if (state === 'incompatible') throw new SetupError('Database state: schema_incompatible. Inspect the existing database; no write was attempted.', 'schema');
      console.log(`Database state: ${state}; database=${target.database}; host=${target.host}; port=${target.port}. Chỉ đọc.`);
      return;
    } else await applyDatabase(client, mode, baseline);
    console.log(`Database V1.8 ${mode}: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=40. Đã ẩn credential.`);
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommand(process.argv.slice(2)).catch((error) => {
    const kind = classifySetupError(error);
    console.error(`SETUP_ERROR kind=${kind}`);
    const explanation = modeIsLegacy(error) ? 'db:migrate bị chặn: database/migrations là lịch sử LEGACY/demo, không phải baseline V1.8. Dùng setup/db:bootstrap chỉ cho database mới trống hoặc review migration riêng cho dữ liệu hiện có.' : {
      missing: 'Database chưa tồn tại.',
      auth: 'PostgreSQL từ chối xác thực hoặc quyền truy cập.',
      connection: 'Không kết nối được PostgreSQL; kiểm tra host/cổng/dịch vụ.',
      schema: 'Schema không tương thích catalog V1.8; không dùng bootstrap làm upgrade.',
      target: 'Identity/phiên bản server không khớp target local PostgreSQL 18.6+.',
      unknown: 'Không hoàn thành được kiểm tra/cài đặt database; xem mã lỗi và hướng dẫn vận hành.',
    }[kind] || 'Target không hợp lệ.';
    console.error(`${explanation} SQLSTATE/mã lỗi=${error.code || 'UNAVAILABLE'}. Nếu transaction đã bắt đầu thì đã yêu cầu rollback. Đã ẩn URL/secret/SQL detail.`);
    process.exitCode = setupExitCode(kind);
  });
}

function modeIsLegacy(error) { return error instanceof SetupError && error.message.startsWith('db:migrate is blocked:'); }
