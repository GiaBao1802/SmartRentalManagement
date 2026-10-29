import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { normalizeCatalog, readCatalog } from './database-v19.mjs';

const baselineDirectory = new URL('../database/baselines/v1.17/', import.meta.url);

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
if (!target.hostname.endsWith('.neon.tech') || process.env.NEON_BRANCH !== 'production') {
  console.error('NEON_CHECK_FAILED: refusing to check a non-Neon or non-production target.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 12_000 });
try {
  const manifest = JSON.parse(await readFile(new URL('PROVENANCE.json', baselineDirectory), 'utf8'));
  if (manifest.version !== '1.17') throw new Error('Unexpected database baseline version; expected V1.17.');
  const catalogText = (await readFile(new URL('expected-catalog.json', baselineDirectory), 'utf8')).replace(/\r\n/g, '\n');
  const catalogBytes = Buffer.from(catalogText, 'utf8');
  const catalogHash = createHash('sha256').update(catalogBytes).digest('hex');
  if (catalogHash !== manifest.sha256?.['expected-catalog.json']) throw new Error('V1.17 catalog integrity mismatch.');
  const expectedCatalog = normalizeCatalog(JSON.parse(catalogText));
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const { rows: [identity] } = await client.query('SELECT current_database() AS database');
  const actualCatalog = normalizeCatalog(await readCatalog(client));
  await client.query('ROLLBACK');
  if (identity.database !== 'neondb') throw new Error(`Unexpected target: database=${identity.database}`);

  const missing = [];
  for (const [category, expectedRows] of Object.entries(expectedCatalog)) {
    const actualRows = new Set((actualCatalog[category] ?? []).map((row) => JSON.stringify(row)));
    for (const row of expectedRows) {
      if (!actualRows.has(JSON.stringify(row))) {
        const object = row.relation && row.name ? `${row.relation}.${row.name}`
          : row.tablename && row.indexname ? `${row.tablename}.${row.indexname}`
            : row.name ?? JSON.stringify(row);
        missing.push(`${category}:${object}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Required V1.17 schema objects are missing or changed (${missing.length}): ${missing.slice(0, 5).join(', ')}`);
  }

  const baselineTables = expectedCatalog.relations.filter((row) => ['r', 'p'].includes(row.kind)).length;
  const publicTables = actualCatalog.relations.filter((row) => ['r', 'p'].includes(row.kind)).length;
  console.log(`Neon schema OK: required_catalog=V1.17; database=${identity.database}; public_tables=${publicTables}; baseline_tables=${baselineTables}; additive objects preserved; branch=${process.env.NEON_BRANCH || 'production'}`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { }
  console.error(`NEON_CHECK_FAILED: ${error?.message || 'database query failed'}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
