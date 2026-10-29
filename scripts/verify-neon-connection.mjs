import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { assertCatalog, readCatalog } from './database-v19.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('NEON_CHECK_FAILED: DATABASE_URL is missing.');
  process.exit(1);
}
let target;
try { target = new URL(databaseUrl); } catch {
  console.error('NEON_CHECK_FAILED: DATABASE_URL is invalid.');
  process.exit(1);
}
if (target.hostname !== 'ep-polished-field-a1z99rb7-pooler.ap-southeast-1.aws.neon.tech' || target.pathname !== '/neondb' || process.env.NEON_BRANCH !== 'production') {
  console.error('NEON_CHECK_FAILED: refusing to check a non-Neon or non-production target.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 12_000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query('SELECT current_database() AS database');
  const expected = JSON.parse(await readFile('database/baselines/v1.18/expected-catalog.json', 'utf8'));
  assertCatalog(await readCatalog(client), expected);
  await client.query('ROLLBACK');
  const row = result.rows[0];
  if (row.database !== 'neondb') {
    throw new Error(`Unexpected target/schema: database=${row.database}`);
  }
  console.log(`Neon connection OK: database=${row.database}; catalog=V1.18 exact; branch=${process.env.NEON_BRANCH || 'production'}`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { }
  console.error(`NEON_CHECK_FAILED: ${error?.message || 'database query failed'}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
