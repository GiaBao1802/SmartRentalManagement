import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { assertCatalog, catalogsMatch, readCatalog } from './database-v19.mjs';
import { runCommand } from './database-v111.mjs';

// Explicit local maintenance URL only. Never read .env or connect to Neon.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname, '/postgres');
const prepare = process.argv.slice(2).join(' ') === '--prepare-catalog';
assert.ok(prepare || process.argv.length === 2);
const root = 'database/baselines/v1.17';
const migration = 'migrations/V1_16_to_V1_17_platform.sql';
const sql = file => readFile(file, 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
const admin = new pg.Client({ connectionString: url.toString() });
const names = ['clean', 'upgrade'].map(kind => `goctro_v117_${kind}_${randomBytes(6).toString('hex')}`);
let connected = false;
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function verifyReadOnlyState(name) {
  const target = new URL(url); target.pathname = '/' + name;
  const env = { GOCTRO_SETUP_DATABASE_URL: target.toString() };
  await runCommand(['inspect','--database',name], env);
  await runCommand(['state','--database',name], env);
}

async function withDatabase(name, work) {
  await admin.query(`CREATE DATABASE ${quote(name)}`);
  const target = new URL(url); target.pathname = '/' + name;
  const db = new pg.Client({ connectionString: target.toString() });
  try { await db.connect(); return await work(db); }
  finally { await db.end().catch(() => {}); }
}
async function tables(db) {
  return (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
}
async function snapshot(db, names, omitNewColumn = false) {
  const result = {};
  for (const name of names) {
    const expression = omitNewColumn && name === 'properties' ? "to_jsonb(t)-'public_report_code'" : 'to_jsonb(t)';
    const rows = (await db.query(`SELECT ${expression} AS value FROM public.${quote(name)} t`)).rows.map(r => JSON.stringify(r.value)).sort();
    result[name] = { count: rows.length, sha256: hash(rows.join('\n')) };
  }
  return result;
}
async function addRows(db) {
  // V1.15 seed leaves these tables empty. Use linked synthetic rows to test preservation.
  await db.query("INSERT INTO resident_meter_submissions(owner_id,property_id,room_id,contract_id,resident_id,invoice_id,utility,reading,image_bytes,image_sha256) VALUES (1,11,101,3001,1001,5010,'WATER',82,decode('010203','hex'),repeat('a',64))");
  await db.query("INSERT INTO complaint_room_requests(complaint_id,occupancy_id,request_key,equipment_code) VALUES (9002,4,'10000000-0000-4000-8000-000000000016','FRIDGE')");
  await db.query("INSERT INTO parking_slots(parking_slot_id,parking_area_id,property_id,owner_id,slot_code,status,accepted_vehicle_type,default_entitlement_id) OVERRIDING SYSTEM VALUE VALUES (8199,8001,11,1,'V117-TEST','active','MOTORCYCLE',13001)");
  await db.query("INSERT INTO parking_slot_requests(owner_id,property_id,parking_slot_id,vehicle_id,resident_id,room_id,contract_id,entitlement_id,started_at,expires_at) VALUES (1,11,8199,8301,1001,101,3001,13001,CURRENT_DATE,now()+interval '1 day')");
}
async function inspectConflicts(db) {
  const checks = {
    account_email: "SELECT lower(trim(email)) AS email,count(*)::int AS count FROM accounts WHERE email IS NOT NULL GROUP BY 1 HAVING count(*)>1",
    owner_email: "SELECT lower(trim(contact_email)) AS email,count(*)::int AS count FROM owners WHERE contact_email IS NOT NULL GROUP BY 1 HAVING count(*)>1",
    cross_owner: "SELECT o.owner_id,a.account_id FROM owners o JOIN accounts a ON lower(trim(o.contact_email))=lower(trim(a.email)) WHERE a.owner_id IS DISTINCT FROM o.owner_id",
    role_scope: "SELECT account_id FROM accounts WHERE NOT ((role='admin' AND owner_id IS NOT NULL AND resident_id IS NULL) OR (role='resident' AND owner_id IS NULL AND resident_id IS NOT NULL))"
  };
  for (const [name, query] of Object.entries(checks)) {
    const rows = (await db.query(query)).rows;
    if (rows.length) throw new Error(`Predecessor conflict ${name}: ${JSON.stringify(rows)}`);
  }
  console.log('IDENTITY_CONFLICT_INVENTORY PASS');
}
function domainRows(catalog, group) {
  const names = new Set(['parking_slots','parking_slot_requests','resident_meter_submissions','complaint_room_requests','room_equipment']);
  return catalog[group].filter(r => names.has(r.relation ?? r.tablename ?? r.table_name ?? r.table));
}
try {
  await admin.connect(); connected = true;
  const clean = await withDatabase(names[0], async db => {
    await db.query(await sql(`${root}/schema.sql`));
    assert.equal((await tables(db)).length, 56);
    const catalog = await readCatalog(db);
    const cleanChecks = (await db.query(await sql(`${root}/runtime_validator.sql`))).rows[0];
    assert.ok(Object.values(cleanChecks).every(value => value === true));
    if (!prepare) await verifyReadOnlyState(names[0]);
    return catalog;
  });
  const upgraded = await withDatabase(names[1], async db => {
    await db.query(await sql('database/baselines/v1.16/schema.sql'));
    await db.query(await sql('database/baselines/v1.16/seed.sql'));
    await addRows(db);
    const oldCatalog = JSON.parse(await sql('database/baselines/v1.16/expected-catalog.json'));
    assertCatalog(await readCatalog(db), oldCatalog);
    await verifyReadOnlyState(names[1]);
    const oldTables = await tables(db);
    assert.equal(oldTables.length, 47);
    await inspectConflicts(db);
    const before = await snapshot(db, oldTables);
    await db.query(await sql(`${root}/${migration}`));
    const after = await snapshot(db, oldTables, true);
    assert.deepEqual(after, before, 'Predecessor row counts or content changed');
    const catalog = await readCatalog(db);
    const upgradedChecks = (await db.query(await sql(`${root}/runtime_validator.sql`))).rows[0];
    assert.ok(Object.values(upgradedChecks).every(value => value === true));
    if (!prepare) await verifyReadOnlyState(names[1]);
    for (const group of ['constraints','indexes','triggers']) assert.deepEqual(domainRows(catalog,group),domainRows(oldCatalog,group),`Changed domain ${group}`);
    const codes = (await db.query("SELECT count(*)::int AS total,count(DISTINCT public_report_code)::int AS unique_codes,count(public_report_code)::int AS nonnull FROM properties")).rows[0];
    assert.equal(codes.total,codes.unique_codes);
    assert.equal(codes.total,codes.nonnull);
    console.log(`ROW_CONTENT PASS tables=${oldTables.length} parking_meter_room_constraints=PASS property_report_code_backfill=${codes.total}`);
    return catalog;
  });
  assert.ok(catalogsMatch(clean, upgraded), 'Clean and upgrade catalogs differ');
  if (prepare) {
    await writeFile(`${root}/expected-catalog.json`, JSON.stringify(clean,null,2)+'\n');
    const sha256 = {};
    for (const file of ['schema.sql','expected-catalog.json','runtime_validator.sql',migration]) sha256[file] = hash(await readFile(`${root}/${file}`));
    await writeFile(`${root}/PROVENANCE.json`, JSON.stringify({ version:'1.17', predecessor:'database/baselines/v1.16', status:'REHEARSED_NOT_APPLIED', sha256 },null,2)+'\n');
  } else assertCatalog(clean, JSON.parse(await sql(`${root}/expected-catalog.json`)));
  console.log('V1.17 CLEAN_AND_UPGRADE_EXACT_CATALOG PASS');
} finally {
  if (connected) {
    for (const name of names) await admin.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`).catch(e => console.error(`Cleanup failed ${name}: ${e.message}`));
    await admin.end();
  }
}

