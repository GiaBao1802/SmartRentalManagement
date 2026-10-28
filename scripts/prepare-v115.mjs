import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { loadBaseline, readCatalog, assertCatalog, unwrapTransaction } from './database-v19.mjs';

// Build and verify the additive Parking candidate only in a disposable database.
dotenv.config({ path: 'backend/.env', quiet: true });
const configured = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) throw new Error('Local PostgreSQL required');
const root = 'database/baselines/v1.15';
const name = `goctro_v115_rehearsal_${randomBytes(6).toString('hex')}`;
const old = await loadBaseline('database/baselines/v1.14', '1.14');
const migrationFile = 'migrations/V1_14_to_V1_15_resident_parking_requests.sql';
const migration = unwrapTransaction(await readFile(`${root}/${migrationFile}`, 'utf8'));
const admin = new pg.Client({ connectionString: configured.href });
let client;
let created = false;
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
  await copyFile('database/baselines/v1.14/seed.sql', `${root}/seed.sql`);
  await writeFile(`${root}/expected-catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
  const sha256 = {};
  for (const file of ['schema.sql', 'seed.sql', 'expected-catalog.json', migrationFile]) {
    sha256[file] = createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex');
  }
  await writeFile(`${root}/PROVENANCE.json`, `${JSON.stringify({ version: '1.15', predecessor: 'database/baselines/v1.14', status: 'REHEARSED_NOT_APPLIED', sha256 }, null, 2)}\n`);
  console.log(`V1.14→V1.15 rehearsal PASS; disposable database ${name}; application database untouched.`);
} finally {
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
