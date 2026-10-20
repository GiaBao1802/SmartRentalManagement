import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { applyDatabase, baselineDirectory, loadBaseline, readCatalog, assertCatalog } from './database-v18.mjs';

const adminUrl = process.env.GOCTRO_V18_TEST_ADMIN_URL;
test('V1.8 real PostgreSQL bootstrap/seed and safety guards', { skip: !adminUrl }, async (t) => {
  const url = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.notEqual(Number(url.port || 5432), 5432, 'runtime tests may not use normal PostgreSQL port');
  assert.equal(decodeURIComponent(url.username), 'v18_smoke', 'use a dedicated disposable cluster role');
  assert.equal(url.pathname, '/postgres');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const databases = [];
  const clients = [];
  const baseline = await loadBaseline();
  const script = fileURLToPath(new URL('./database-v18.mjs', import.meta.url));
  async function createDatabase() {
    const name = `goctro_setup_test_${randomBytes(6).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    databases.push(name);
    const target = new URL(url); target.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect(); clients.push(client);
    return { name, client, url: target.toString() };
  }
  function cli(mode, db) {
    return spawnSync(process.execPath, [script, mode, '--database', db.name], {
      encoding: 'utf8', timeout: 120000,
      env: { ...process.env, GOCTRO_SETUP_DATABASE_URL: db.url, DATABASE_URL: 'postgresql://unused@invalid:1/never_used' },
    });
  }
  async function countTables(client) {
    return Number((await client.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count);
  }
  try {
    const db = await createDatabase();
    await t.test('empty database bootstrap runs the actual canonical SQL and creates 40 tables', async () => {
      const result = cli('bootstrap', db);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(await countTables(db.client), 40);
      await db.client.query('SET search_path=public,pg_catalog');
      assertCatalog(await readCatalog(db.client), baseline.catalog);
    });
    await t.test('seed accepts existing V1.8 schema with zero business rows', async () => {
      const result = cli('seed', db);
      assert.equal(result.status, 0, result.stderr);
      assert.equal((await db.client.query('SELECT count(*)::int AS n FROM owners')).rows[0].n, 2);
      assert.equal((await db.client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 6);
    });
    await t.test('Prisma reads the actual seeded V1.8 relations', async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
      try {
        assert.equal((await prisma.owner.findMany({ select: { ownerId: true } })).length, 2);
        assert.ok((await prisma.invoice.findMany({ select: { invoiceId: true, periodStart: true, periodEnd: true } })).length > 0);
      } finally { await prisma.$disconnect(); }
    });
    await t.test('repeat bootstrap and repeat seed reject without altering existing business data', async () => {
      const before = (await db.client.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY owner_id) AS value FROM owners o')).rows[0].value;
      const bootstrap = cli('bootstrap', db);
      const seed = cli('seed', db);
      assert.equal(bootstrap.status, 1);
      assert.match(bootstrap.stderr, /target already has schema objects/);
      assert.equal(seed.status, 1);
      assert.match(seed.stderr, /application data exists/);
      const after = (await db.client.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY owner_id) AS value FROM owners o')).rows[0].value;
      assert.deepEqual(after, before);
    });
    await t.test('canonical CORE and FIXTURE validators execute on the seeded disposable database', async () => {
      const notices = [];
      const capture = (notice) => { if (/VALIDATION = PASS/.test(notice.message)) notices.push(notice.message); };
      db.client.on('notice', capture);
      try {
      for (const filename of ['runtime_validator.sql', 'runtime_validator_fixture.sql']) {
        const sql = await readFile(path.join(baselineDirectory, filename), 'utf8');
        await db.client.query(sql);
      }
      } finally { db.client.removeListener('notice', capture); }
      assert.ok(notices.some((message) => /V1.8 CORE.*TOTAL=78 PASS=78 FAIL=0/.test(message)));
      assert.ok(notices.some((message) => /TOTAL=171 PASS=171 FAIL=0/.test(message)));
      t.diagnostic('Canonical validators: CORE 78/78 PASS; FIXTURE 171/171 PASS; probe transactions rolled back.');
    });
    await t.test('bootstrap blocks an existing application table', async () => {
      const used = await createDatabase();
      await used.client.query('CREATE TABLE owners(marker text)');
      const result = cli('bootstrap', used);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /target already has schema objects/);
      assert.equal(await countTables(used.client), 1);
    });
    await t.test('bootstrap and seed block incompatible Prisma migration history', async () => {
      const old = await createDatabase();
      await old.client.query('CREATE TABLE _prisma_migrations(id text)');
      const result = cli('bootstrap', old);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /target already has schema objects/);
      assert.equal(await countTables(old.client), 1);
      const seededHistory = await createDatabase();
      assert.equal(cli('bootstrap', seededHistory).status, 0);
      await seededHistory.client.query('CREATE TABLE _prisma_migrations(id text)');
      const seed = cli('seed', seededHistory);
      assert.equal(seed.status, 1);
      assert.match(seed.stderr, /Schema differs/);
      assert.equal((await seededHistory.client.query('SELECT count(*)::int AS n FROM owners')).rows[0].n, 0);
    });
    await t.test('seed blocks V1.7-like drift in the recurring Parking index', async () => {
      const drift = await createDatabase();
      assert.equal(cli('bootstrap', drift).status, 0);
      await drift.client.query('DROP INDEX invoice_items_invoice_parking_assignment_unique');
      const result = cli('seed', drift);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Schema differs/);
      assert.equal((await drift.client.query('SELECT count(*)::int AS n FROM owners')).rows[0].n, 0);
    });
    await t.test('seed blocks any existing application row, preserves it, and inserts nothing else', async () => {
      const data = await createDatabase();
      assert.equal(cli('bootstrap', data).status, 0);
      await data.client.query("INSERT INTO owners(display_name) VALUES('Preserve this test row')");
      const result = cli('seed', data);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /application data exists/);
      assert.equal((await data.client.query('SELECT count(*)::int AS n FROM owners')).rows[0].n, 1);
      assert.equal((await data.client.query('SELECT count(*)::int AS n FROM properties')).rows[0].n, 0);
    });
    await t.test('actual SQL error rolls back all bootstrap DDL', async () => {
      const failure = await createDatabase();
      await assert.rejects(applyDatabase(failure.client, 'bootstrap', { ...baseline, schemaSql: baseline.schemaSql + '\nSELECT missing_setup_test_function();' }));
      assert.equal(await countTables(failure.client), 0);
    });
    await t.test('actual seed SQL error rolls back inserted rows', async () => {
      const failure = await createDatabase();
      assert.equal(cli('bootstrap', failure).status, 0);
      await assert.rejects(applyDatabase(failure.client, 'seed', { ...baseline, seedSql: baseline.seedSql + '\nSELECT missing_setup_test_function();' }));
      assert.equal((await failure.client.query('SELECT count(*)::int AS n FROM owners')).rows[0].n, 0);
    });
  } finally {
    for (const client of clients) await client.end();
    for (const name of databases) {
      assert.match(name, /^goctro_setup_test_[a-f0-9]+$/);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.end();
  }
});
