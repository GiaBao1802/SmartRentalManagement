import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const baselineDirectory = fileURLToPath(new URL('../database/baselines/v1.8/', import.meta.url));
export class SetupError extends Error {}
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

export function assertCatalog(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new SetupError('Schema differs from the reviewed V1.8 catalog (including migration history/constraints/indexes/triggers). Stop and review the existing database; bootstrap is not an upgrade.');
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
  if (!['bootstrap', 'seed', 'inspect'].includes(mode) || flag !== '--database' || extra.length) throw new SetupError('Usage: database-v18.mjs bootstrap|seed|inspect --database NAME');
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
    } else await applyDatabase(client, mode, baseline);
    console.log(`Database V1.8 ${mode}: PASS; database=${target.database}; host=${target.host}; port=${target.port}; tables=40. Credentials hidden.`);
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommand(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof SetupError ? error.message : `Database setup failed; SQLSTATE/error code=${error.code || 'UNAVAILABLE'}. Transaction rolled back if started. Connection strings and SQL detail are hidden.`);
    process.exitCode = 1;
  });
}
