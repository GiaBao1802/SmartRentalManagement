import pg from 'pg';

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
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT current_database() AS database,
           count(*)::int AS public_tables
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  await client.query('ROLLBACK');
  const row = result.rows[0];
  if (row.database !== 'neondb' || row.public_tables !== 47) {
    throw new Error(`Unexpected target/schema: database=${row.database}; public_tables=${row.public_tables}`);
  }
  console.log(`Neon connection OK: database=${row.database}; public_tables=${row.public_tables}; branch=${process.env.NEON_BRANCH || 'production'}`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { }
  console.error(`NEON_CHECK_FAILED: ${error?.message || 'database query failed'}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
