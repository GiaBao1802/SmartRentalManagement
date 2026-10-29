import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { assertCatalog, readCatalog } from './database-v19.mjs';

const target = new URL(process.env.GOCTRO_SETUP_DATABASE_URL ?? '');
assert.ok(['localhost','127.0.0.1'].includes(target.hostname), 'Local PostgreSQL only');
assert.match(target.pathname, /^\/goctro_v116_[a-z0-9_]+$/, 'Disposable V1.16 target only');
const root = 'database/baselines/v1.16';
const manifest = JSON.parse(await readFile(`${root}/PROVENANCE.json`, 'utf8'));
assert.equal(manifest.version,'1.16');
assert.equal(manifest.predecessor,'database/baselines/v1.15');
assert.equal(manifest.status,'REHEARSED_NOT_APPLIED');
for (const [name, expected] of Object.entries(manifest.sha256)) {
  const bytes = await readFile(`${root}/${name}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`Artifact ${name}`);
}
const db = new pg.Client({ connectionString: target.toString() });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const identity = (await db.query('SELECT current_database() AS name')).rows[0].name;
  assert.equal(identity,decodeURIComponent(target.pathname.slice(1)));
  const actual = await readCatalog(db);
  assertCatalog(actual, JSON.parse(await readFile(`${root}/expected-catalog.json`,'utf8')));
  const checks = (await db.query(await readFile(`${root}/runtime_validator.sql`,'utf8'))).rows[0];
  for (const [name, passed] of Object.entries(checks)) assert.equal(passed,true,`V1.16 runtime ${name}`);
  console.log(`V1.16 VALIDATOR PASS checks=${Object.keys(checks).length} exact_catalog=PASS database=${identity}`);
} finally {
  await db.query('ROLLBACK').catch(()=>{});
  await db.end().catch(()=>{});
}
