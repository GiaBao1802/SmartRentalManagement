import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { provisionDemo, demoPassword } from './provision-dev-admin.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
// @ts-expect-error Operational JS shares the same reviewed-baseline guards.
import { loadBaseline, applyDatabase } from '../../scripts/database-v18.mjs';

const adminUrl = process.env.GOCTRO_V18_TEST_ADMIN_URL;
test('demo credentials: PostgreSQL guards, exact seed evidence, reset and atomic rollback', { skip: !adminUrl }, async t => {
  const url = new URL(adminUrl!);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.username,'v18_smoke');
  assert.notEqual(url.port || '5432','5432');
  const database = `goctro_setup_test_credential_${process.pid}`;
  const admin = new pg.Client({connectionString:url.toString()}); await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const targetUrl=new URL(url); targetUrl.pathname=`/${database}`;
  const previous={DATABASE_URL:process.env.DATABASE_URL,NODE_ENV:process.env.NODE_ENV};
  process.env.DATABASE_URL=targetUrl.toString(); process.env.NODE_ENV='development';
  const label=`${url.hostname}:${url.port}/${database}`;
  const confirmation=`RESET ${label} admin.one@example.test resident.one@example.test`;
  const db=new pg.Client({connectionString:targetUrl.toString()}); await db.connect();
  try {
    const baseline=await loadBaseline();
    await applyDatabase(db,'bootstrap',baseline); await applyDatabase(db,'seed',baseline);
    const stored=async()=> (await db.query('SELECT password_hash FROM accounts WHERE account_id IN (1,2) ORDER BY account_id')).rows.map(r=>r.password_hash as string);
    await t.test('INITIAL accepts exact reviewed seed and hashes both demo credentials',async()=>{
      assert.equal(await provisionDemo('STATUS',database,label),'seeded');
      assert.equal(await provisionDemo('INITIAL',database,label),'updated');
      for(const hash of await stored()) assert.equal(await verifyPassword(demoPassword,hash),true);
    });
    await t.test('INITIAL rerun refuses and preserves both hashes',async()=>{
      const before=await stored(); await assert.rejects(provisionDemo('INITIAL',database,label),/Đã provision/); assert.deepEqual(await stored(),before);
    });
    await t.test('unknown/partial custom credential is not inferred from hash format',async()=>{
      await db.query('UPDATE accounts SET password_hash=$1 WHERE account_id=1',[await hashPassword('UniqueCustom123456')]);
      assert.equal(await provisionDemo('STATUS',database,label),'unknown');
      const before=await stored(); await assert.rejects(provisionDemo('INITIAL',database,label),/không rõ/); assert.deepEqual(await stored(),before);
    });
    await t.test('RESET requires exact target and both accounts',async()=>{
      const before=await stored(); await assert.rejects(provisionDemo('RESET',database,label,'wrong'),/xác nhận/); assert.deepEqual(await stored(),before);
      assert.equal(await provisionDemo('RESET',database,label,confirmation),'updated');
    });
    await t.test('error on second update rolls back first credential',async()=>{
      const before=await stored();
      const original=pg.Client.prototype.query;
      // Fault injection is local to this test, never a production CLI/env guard bypass.
      pg.Client.prototype.query = function (this: pg.Client, ...args: any[]) {
        if(typeof args[0]==='string' && args[0].startsWith('UPDATE accounts SET password_hash=') && args[1]?.[1]==='2') return Promise.reject(new Error('injected-second-update'));
        return (original as any).apply(this,args);
      } as typeof original;
      try { await assert.rejects(provisionDemo('RESET',database,label,confirmation),/injected-second-update/); }
      finally { pg.Client.prototype.query=original; }
      assert.deepEqual(await stored(),before);
    });
    await t.test('locked account and invalid linkage block before writing',async()=>{
      await db.query("UPDATE accounts SET status='locked' WHERE account_id=2");
      const before=await stored(); await assert.rejects(provisionDemo('RESET',database,label,confirmation),/Resident demo sai/); assert.deepEqual(await stored(),before);
      await db.query("UPDATE accounts SET status='active' WHERE account_id=2");
      await db.query('UPDATE residents SET archived_at=now() WHERE resident_id=1001');
      await assert.rejects(provisionDemo('RESET',database,label,confirmation),/thiếu Owner/); assert.deepEqual(await stored(),before);
      await db.query('UPDATE residents SET archived_at=NULL WHERE resident_id=1001');
    });
    await t.test('production, wrong target and schema drift are rejected',async()=>{
      process.env.NODE_ENV='production'; await assert.rejects(provisionDemo('INITIAL',database,label),/development/); process.env.NODE_ENV='development';
      await assert.rejects(provisionDemo('RESET',database,'wrong',confirmation),/Target/);
      const before=await stored(); await db.query('CREATE TABLE disposable_drift(id int)');
      await assert.rejects(provisionDemo('RESET',database,label,confirmation),/Schema differs/); assert.deepEqual(await stored(),before);
    });
  } finally {
    await db.end();
    if(previous.DATABASE_URL===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=previous.DATABASE_URL;
    if(previous.NODE_ENV===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previous.NODE_ENV;
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.end();
  }
});
