import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const source = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost','127.0.0.1'].includes(source.hostname));
assert.equal(source.pathname,'/postgres');
const name = `goctro_v116_browser_${process.pid}`;
const target = new URL(source); target.pathname = '/' + name;
const admin = new pg.Client({ connectionString: source.toString() });
let db: pg.Client | undefined;
let server: import('node:http').Server | undefined;
let prisma: import('@prisma/client').PrismaClient | undefined;
let created = false;
async function cleanup() {
  if (server) await new Promise<void>(done => server!.close(() => done()));
  await prisma?.$disconnect().catch(() => {});
  await db?.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  db = new pg.Client({ connectionString: target.toString() }); await db.connect();
  await db.query(await readFile(resolve('../database/baselines/v1.15/schema.sql'),'utf8'));
  await db.query(await readFile(resolve('../database/baselines/v1.15/seed.sql'),'utf8'));
  await db.query(await readFile(resolve('../database/baselines/v1.16/migrations/V1_15_to_V1_16_platform.sql'),'utf8'));
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../src/auth/password.js');
  prisma = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  const password = 'Browser-Review-2026!';
  const digest = await hashPassword(password);
  await db.query("UPDATE accounts SET password_hash=$1 WHERE account_id IN (1,2,4)",[digest]);
  await db.query("INSERT INTO accounts(role,email,password_hash) VALUES ('superadmin','browser-superadmin@example.test',$1)",[digest]);
  await db.query("INSERT INTO platform_permissions(account_id,permission,granted_by,request_reference,reason) SELECT account_id,'PLATFORM_AUDIT_READ','browser-fixture','local-review','UI check' FROM accounts WHERE email='browser-superadmin@example.test'");
  process.env.DATABASE_URL = target.toString();
  process.env.PORT = '4100';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3100';
  process.env.NODE_ENV = 'development';
  process.env.SESSION_SECRET = 'local-browser-review-secret-2026-very-long';
  const { default: app } = await import('../src/app.js');
  server = app.listen(4100,'127.0.0.1');
  console.log('V116_BROWSER_FIXTURE_READY port=4100 accounts=browser-superadmin@example.test,admin.one@example.test,resident.one@example.test password=Browser-Review-2026!');
  process.once('SIGINT', () => { void cleanup().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(0)); });
} catch (error) {
  console.error(error);
  await cleanup();
  process.exitCode = 1;
}
