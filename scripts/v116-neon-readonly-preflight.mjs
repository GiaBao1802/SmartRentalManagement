import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { assertCatalog, catalogsMatch, catalogDifferences, readCatalog } from './database-v19.mjs';

const envPath = process.env.GOCTRO_NEON_ENV_FILE;
const contextPath = process.env.GOCTRO_NEON_CONTEXT_FILE;
assert.ok(envPath && contextPath, 'Explicit ignored env and context paths required');
const context = JSON.parse(await readFile(contextPath,'utf8'));
const vars = parseEnv(await readFile(envPath,'utf8'));
assert.equal(context.orgId,'org-cool-term-43890018');
assert.equal(context.projectId,'patient-scene-93926977');
assert.equal(context.branch,'production');
assert.equal(vars.NEON_BRANCH,'production');
const pooled = new URL(vars.DATABASE_URL);
const direct = new URL(vars.DATABASE_URL_UNPOOLED);
for (const u of [pooled,direct]) {
  assert.ok(['postgres:','postgresql:'].includes(u.protocol));
  assert.ok(u.hostname.endsWith('.neon.tech'));
  assert.equal(u.pathname,'/neondb');
  assert.equal(u.searchParams.get('sslmode'),'require');
}
assert.ok(pooled.hostname.includes('-pooler.'));
assert.ok(!direct.hostname.includes('-pooler.'));
assert.equal(pooled.hostname.replace('-pooler.','.'),direct.hostname);
const db = new pg.Client({ connectionString: direct.toString(), connectionTimeoutMillis: 12000, application_name:'goctro-v116-readonly-preflight' });
const quote = name => '"' + name.replaceAll('"','""') + '"';
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL statement_timeout=120000');
  const server = (await db.query("SELECT current_database() db,current_setting('server_version_num')::int version")).rows[0];
  assert.equal(server.db,'neondb');
  assert.ok(server.version >= 180006 && server.version < 190000);
  const expected = JSON.parse(await readFile('database/baselines/v1.16/expected-catalog.json','utf8'));
  const actual = await readCatalog(db);
  if (!catalogsMatch(actual, expected)) {
    const differences = catalogDifferences(actual, expected);
    console.error(JSON.stringify({target:{project:context.projectId,branch:context.branch,database:server.db,version:server.version,hostname:direct.hostname},catalog:'V1.16_MISMATCH',differenceCount:differences.length,differences:differences.slice(0,30)}));
    assertCatalog(actual, expected);
  }
  const inventory = {
    account_email: "SELECT count(*)::int AS n FROM (SELECT lower(trim(email)) FROM accounts WHERE email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x",
    owner_email: "SELECT count(*)::int AS n FROM (SELECT lower(trim(contact_email)) FROM owners WHERE contact_email IS NOT NULL GROUP BY 1 HAVING count(*)>1) x",
    cross_owner_email: "SELECT count(*)::int AS n FROM owners o JOIN accounts a ON lower(trim(o.contact_email))=lower(trim(a.email)) WHERE a.owner_id IS DISTINCT FROM o.owner_id",
    invalid_role_scope: "SELECT count(*)::int AS n FROM accounts WHERE NOT ((role='admin' AND owner_id IS NOT NULL AND resident_id IS NULL) OR (role='resident' AND owner_id IS NULL AND resident_id IS NOT NULL))"
  };
  const conflicts = {};
  for(const [key,query] of Object.entries(inventory)) conflicts[key]=(await db.query(query)).rows[0].n;
  const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
  assert.equal(names.length,47);
  const fingerprints = {};
  for(const name of names) {
    const rows=(await db.query(`SELECT to_jsonb(t) AS value FROM public.${quote(name)} t`)).rows.map(x=>JSON.stringify(x.value)).sort();
    fingerprints[name]={count:rows.length,sha256:createHash('sha256').update(rows.join('\n')).digest('hex')};
  }
  console.log(JSON.stringify({target:{project:context.projectId,branch:context.branch,database:server.db,version:server.version,hostname:direct.hostname},catalog:'V1.16_EXACT',conflicts,fingerprints}));
  if (Object.values(conflicts).some(x=>x!==0)) process.exitCode=2;
} finally {
  await db.query('ROLLBACK').catch(()=>{});
  await db.end().catch(()=>{});
}
