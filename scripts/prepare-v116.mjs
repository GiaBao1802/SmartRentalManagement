import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { loadBaseline, readCatalog, assertCatalog, unwrapTransaction } from './database-v19.mjs';

// Build and verify the additive Marketplace amenities candidate only in a disposable database.
dotenv.config({ path: 'backend/.env', quiet: true });
const configured = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) throw new Error('Local PostgreSQL required');
const root = 'database/baselines/v1.16';
const name = `goctro_v116_rehearsal_${randomBytes(6).toString('hex')}`;
const populatedName = `goctro_v116_populated_${randomBytes(6).toString('hex')}`;
const old = await loadBaseline('database/baselines/v1.15', '1.15');
const migrationFile = 'migrations/V1_15_to_V1_16_marketplace_amenities.sql';
const migration = unwrapTransaction(await readFile(`${root}/${migrationFile}`, 'utf8'));
const admin = new pg.Client({ connectionString: configured.href });
let client;
let created = false;
let populatedClient;
let populatedCreated = false;
async function fingerprints(client, baseline) {
  const tables = baseline.catalog.relations.filter((row) => row.kind === 'r').map((row) => row.name);
  const result = {};
  for (const table of tables) {
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const { rows: [row] } = await client.query(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash FROM (SELECT md5((to_jsonb(t) - 'marketplace_amenities')::text) AS row_hash FROM ${quoted} t) x`);
    result[table] = row;
  }
  return result;
}
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  configured.pathname = `/${name}`;
  client = new pg.Client({ connectionString: configured.href });
  await client.connect();
  await client.query(`BEGIN;\n${old.schemaSql}\nCOMMIT;`);
  assertCatalog(await readCatalog(client), old.catalog);
  await client.query('BEGIN');
  await client.query(migration);
  const catalog = await readCatalog(client);
  await client.query('COMMIT');
  await client.query(old.seedSql);
  await client.query('COMMIT');
  await writeFile(`${root}/schema.sql`, `BEGIN;\n${old.schemaSql}\n${migration}\nCOMMIT;\n`);
  await copyFile('database/baselines/v1.15/seed.sql', `${root}/seed.sql`);
  await writeFile(`${root}/expected-catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
  const sha256 = {};
  for (const file of ['schema.sql', 'seed.sql', 'expected-catalog.json', migrationFile]) {
    sha256[file] = createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex');
  }
  await writeFile(`${root}/PROVENANCE.json`, `${JSON.stringify({ version: '1.16', predecessor: 'database/baselines/v1.15', status: 'REHEARSED_NOT_APPLIED', sha256 }, null, 2)}\n`);
  await admin.query(`CREATE DATABASE "${populatedName}"`);
  populatedCreated = true;
  const populatedUrl = new URL(process.env.DATABASE_URL);
  populatedUrl.pathname = `/${populatedName}`;
  populatedClient = new pg.Client({ connectionString: populatedUrl.href });
  await populatedClient.connect();
  await populatedClient.query(`BEGIN;\n${old.schemaSql}\nCOMMIT;`);
  await populatedClient.query(old.seedSql);
  await populatedClient.query('COMMIT');
  assertCatalog(await readCatalog(populatedClient), old.catalog);
  const before = await fingerprints(populatedClient, old);
  await populatedClient.query(migration);
  assertCatalog(await readCatalog(populatedClient), catalog);
  const after = await fingerprints(populatedClient, old);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('V1.15 predecessor table rows changed during the populated migration rehearsal.');
  const emptyAmenities = await populatedClient.query("SELECT count(*)::int AS count FROM rooms WHERE marketplace_amenities <> '{}'::text[]");
  if (emptyAmenities.rows[0].count !== 0) throw new Error('Pre-existing Rooms did not receive the empty amenities default.');
  await populatedClient.query('BEGIN');
  await populatedClient.query("UPDATE rooms SET marketplace_amenities = ARRAY['air_conditioning','parking']::text[] WHERE room_id = (SELECT min(room_id) FROM rooms)");
  const filtered = await populatedClient.query("SELECT count(*)::int AS count FROM rooms WHERE marketplace_amenities @> ARRAY['air_conditioning','parking']::text[]");
  if (filtered.rows[0].count !== 1) throw new Error('Exact all-requested-amenities filter failed.');
  let invalidRejected = false;
  try { await populatedClient.query("UPDATE rooms SET marketplace_amenities = ARRAY['guessed_feature']::text[] WHERE room_id = (SELECT min(room_id) FROM rooms)"); }
  catch (error) { invalidRejected = error.code === '23514'; }
  if (!invalidRejected) throw new Error('Database did not reject an unapproved Marketplace amenity code.');
  await populatedClient.query('ROLLBACK');
  console.log(`V1.15→V1.16 clean and populated rehearsals PASS; disposable databases ${name}, ${populatedName}; predecessor rows preserved; application database untouched.`);
} finally {
  if (populatedClient) await populatedClient.end();
  if (populatedCreated) await admin.query(`DROP DATABASE "${populatedName}"`);
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
