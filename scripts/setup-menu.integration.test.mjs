import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';
import dotenv from 'dotenv';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.env.GOCTRO_SETUP_CONFIG_DIR;
const enabled=process.env.GOCTRO_SETUP_MENU_RUNTIME==='1' && directory && process.platform==='win32';
test('real setup menu on an explicitly isolated disposable configuration', {skip:!enabled,timeout:600000}, async t=>{
  const config=dotenv.parse(await readFile(path.join(directory,'backend.env')));
  const url=new URL(config.DATABASE_URL);
  const dbName=decodeURIComponent(url.pathname.slice(1));
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.username,'v18_smoke'); assert.notEqual(url.port||'5432','5432'); assert.match(dbName,/^goctro_setup_test_/);
  const client=new pg.Client({connectionString:url.toString()}); await client.connect();
  const logDirectory=path.join(directory,'evidence'); await mkdir(logDirectory,{recursive:true});
  let number=0;
  const menu=async (input,expected=0,configDir=directory,rehearsal=true)=>{
    console.log(`Đang chạy case menu ${number+1} trên disposable.`);
    const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','setup.bat'],{cwd:root,env:{...process.env,GOCTRO_SETUP_CONFIG_DIR:configDir,GOCTRO_SETUP_REHEARSAL_DEFAULT:rehearsal?'1':''},windowsHide:true,stdio:['pipe','pipe','pipe']});
    let log=''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',data=>{log+=data;}); child.stderr.on('data',data=>{log+=data;});
    child.stdin.end(input+'\r\n');
    const status=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill();reject(new Error('Menu timeout: '+log.slice(-2000)));},180000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    await writeFile(path.join(logDirectory,`${++number}.log`),log);
    assert.equal(status,expected,log.slice(-5000)); return log;
  };
  const snapshot=async()=>{
    const rows=(await client.query('SELECT account_id,password_hash,updated_at FROM accounts ORDER BY account_id')).rows;
    const counts=[];
    for(const table of ['owners','accounts','residents','rooms','room_residents','contracts']) counts.push((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
    return {rows:rows.map(row=>createHash('sha256').update(JSON.stringify(row)).digest('hex')),counts};
  };
  async function login(email,password) {
    const origin='http://localhost:3000',base='http://127.0.0.1:4000/api/v1';
    const csrf=await fetch(`${base}/auth/csrf`,{headers:{Origin:origin}});
    const token=(await csrf.json()).data.csrf_token;
    const cookie=csrf.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':token,Cookie:cookie},body:JSON.stringify({login:email,password})});
    const body=await response.json();
    const session=response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    return {status:response.status,body,session,base};
  }
  try {
    await t.test('update skips seed/provision/install/generate and preserves data/credentials',async()=>{
      const before=await snapshot(); await menu('2\r\ny\r\n'); const log=await menu('2\r\ny\r\n');
      assert.match(log,/bỏ qua npm ci/); assert.match(log,/bỏ qua generate/);
      assert.doesNotMatch(log,/dev:provision-credentials|Database V1.8 (seed|bootstrap): PASS|Mật khẩu demo local\/dev vừa/);
      assert.deepEqual(await snapshot(),before);
    });
    await t.test('Admin and Resident email login; rental is own and Admin endpoint is denied',async()=>{
      const admin=await login('admin.one@example.test','Goctro123456789'); assert.equal(admin.status,200); assert.equal(admin.body.data.account.role,'admin');
      const resident=await login('resident.one@example.test','Goctro123456789'); assert.equal(resident.status,200); assert.equal(resident.body.data.account.role,'resident');
      const rental=await fetch(`${resident.base}/me/rental`,{headers:{Cookie:resident.session}}); assert.equal(rental.status,200);
      const rentalBody=await rental.json(); assert.ok(JSON.stringify(rentalBody).includes('1001'));
      const denied=await fetch(`${resident.base}/accounts`,{headers:{Cookie:resident.session}}); assert.equal(denied.status,403);
    });
    await t.test('custom credential survives update and populated first-time without a reset question',async()=>{
      const {hashPassword}=await import('../backend/src/auth/password.ts');
      await client.query('UPDATE accounts SET password_hash=$1 WHERE account_id=1',[await hashPassword('UniqueCustom123456')]);
      const before=await snapshot(); await menu('2\r\ny\r\n'); assert.deepEqual(await snapshot(),before);
      assert.equal((await login('admin.one@example.test','UniqueCustom123456')).status,200);
      const log=await menu('1\r\ny\r\n'); assert.match(log,/Sử dụng mật khẩu hiện có/);
      assert.doesNotMatch(log,/Chọn 1 hoặc 2|Gõ chính xác|dev:provision-credentials|Mật khẩu demo local\/dev vừa/);
      assert.deepEqual(await snapshot(),before);
    });
    await t.test('RESET is a separate explicit tool; wrong confirmation refuses, correct confirmation changes only two rows',async()=>{
      const label=`${url.hostname}:${url.port}/${dbName}`;
      const before=await snapshot();
      process.env.DATABASE_URL=config.DATABASE_URL; process.env.NODE_ENV='development';
      const {provisionDemo}=await import('../backend/scripts/provision-dev-admin.ts');
      await assert.rejects(provisionDemo('RESET',dbName,label,'WRONG'));
      assert.deepEqual(await snapshot(),before);
      await provisionDemo('RESET',dbName,label,`RESET ${label} admin.one@example.test resident.one@example.test`);
      const after=await snapshot(); assert.deepEqual(after.counts,before.counts); assert.deepEqual(after.rows.slice(2),before.rows.slice(2));
      assert.equal((await login('admin.one@example.test','UniqueCustom123456')).status,401);
      assert.equal((await login('admin.one@example.test','Goctro123456789')).status,200);
    });
    await t.test('existing nondefault target is preserved and first-time stops before password/install/database',async()=>{
      const file=path.join(directory,'backend.env'),before=await readFile(file);
      const state=await snapshot(); const log=await menu('1\r\n',1,directory,false);
      assert.match(log,/Đã có cấu hình khác/);
      assert.doesNotMatch(log,/Mật khẩu PostgreSQL|Database state:|chạy npm ci|Xác nhận target/);
      assert.deepEqual(await readFile(file),before); assert.deepEqual(await snapshot(),state);
    });
    await t.test('update missing database never offers create or switches target',async()=>{
      const dir=path.join(directory,'missing'); await mkdir(path.join(dir,'runtime'),{recursive:true});
      const missing=new URL(url); missing.pathname='/goctro_setup_test_missing_update';
      await writeFile(path.join(dir,'backend.env'),Object.entries({...config,DATABASE_URL:missing.toString()}).map(([k,v])=>`${k}=${v}`).join('\n'));
      await cp(path.join(directory,'runtime/dependencies.sha256'),path.join(dir,'runtime/dependencies.sha256'));
      const log=await menu('2\r\ny\r\n',1,dir,false);
      assert.match(log,/Cần xử lý cấu hình hiện tại/); assert.doesNotMatch(log,/Tạo database mới|dev:provision-credentials|run db:generate/);
      assert.equal((await client.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[missing.pathname.slice(1)])).rows[0].n,0);
    });
    await t.test('unchanged update reuses the same verified app PIDs',async()=>{
      const stamp=path.join(directory,'runtime/dev-all/processes.json'); const before=JSON.parse((await readFile(stamp,'utf8')).replace(/^\uFEFF/,''));
      const log=await menu('2\r\ny\r\n'); assert.match(log,/tái sử dụng/); assert.deepEqual(JSON.parse((await readFile(stamp,'utf8')).replace(/^\uFEFF/,'')),before);
    });
    await t.test('real schema drift is reported and blocks dependent steps without writes',async()=>{
      await client.query('CREATE TABLE disposable_setup_drift(id integer)');
      try {
        const before=await snapshot(); const log=await menu('1\r\ny\r\n',1);
        assert.match(log,/Khác biệt schema:.*disposable_setup_drift/); assert.doesNotMatch(log,/Tạo database mới|dev:provision-credentials|run db:generate|Kiểm tra môi trường local/);
        assert.deepEqual(await snapshot(),before);
      } finally { await client.query('DROP TABLE disposable_setup_drift'); }
    });
    await t.test('connection/auth failures never offer database creation or dependent writes',async()=>{
      for(const kind of ['connection','auth']) {
        const dir=path.join(directory,kind); await mkdir(dir,{recursive:true});
        const bad=new URL(url); if(kind==='connection') bad.port='55449'; else bad.password='wrong-disposable-password';
        await writeFile(path.join(dir,'backend.env'),Object.entries({...config,DATABASE_URL:bad.toString()}).map(([k,v])=>`${k}=${v}`).join('\n'));
        await mkdir(path.join(dir,'runtime'),{recursive:true});
        await cp(path.join(directory,'runtime/dependencies.sha256'),path.join(dir,'runtime/dependencies.sha256'));
        const log=await menu('1\r\ny\r\n',1,dir);
        assert.doesNotMatch(log,/Tạo database mới|dev:provision-credentials|run db:generate|Kiểm tra môi trường local/);
        assert.match(log,kind==='connection'?/Không kết nối được PostgreSQL/:/từ chối xác thực/);
      }
    });
    await t.test('missing installed executable triggers real npm ci then Prisma generation and startup',async()=>{
      const executable=path.join(root,'node_modules/.bin/concurrently.cmd');
      const backup=path.join(directory,'concurrently.cmd.backup');
      await rename(executable,backup);
      try {
        const before=await snapshot(); const log=await menu('2\r\ny\r\n');
        assert.match(log,/chạy npm ci/); assert.match(log,/run db:generate/); await access(executable); assert.deepEqual(await snapshot(),before);
      } finally { try {await access(executable);} catch {await cp(backup,executable);} }
    });
    await t.test('first-time menu creates a missing database, bootstraps, seeds, provisions and starts another target',async()=>{
      const dir=path.join(directory,'first-time'); await mkdir(path.join(dir,'runtime'),{recursive:true});
      const fresh=new URL(url); fresh.pathname=`/goctro_setup_test_firsttime_${process.pid}`;
      await writeFile(path.join(dir,'backend.env'),Object.entries({...config,DATABASE_URL:fresh.toString()}).map(([k,v])=>`${k}=${v}`).join('\n'));
      await writeFile(path.join(dir,'frontend.env'),'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1\n');
      await cp(path.join(directory,'runtime/dependencies.sha256'),path.join(dir,'runtime/dependencies.sha256'));
      const log=await menu('1\r\ny\r\ny\r\ny\r\ny\r\n',0,dir);
      assert.match(log,/Database V1.8 bootstrap: PASS/); assert.match(log,/Database V1.8 seed: PASS/); assert.match(log,/DEMO_STATE=updated/); assert.match(log,/run db:generate/); assert.match(log,/Hoàn tất setup/);
      assert.doesNotMatch(log,/New DEV password|Confirm Admin password|Type INITIAL/);
      assert.doesNotMatch(log,/Host PostgreSQL local|Cổng PostgreSQL \(|Tên database dev|User\/role PostgreSQL|Đổi cấu hình/);
      assert.equal((await login('admin.one@example.test','Goctro123456789')).status,200);
      assert.equal((await login('resident.one@example.test','Goctro123456789')).status,200);
      const freshClient=new pg.Client({connectionString:fresh.toString()}); await freshClient.connect();
      try {assert.equal((await freshClient.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,6);}
      finally {await freshClient.end();}
      const again=await menu('2\r\ny\r\n',0,dir);
      assert.match(again,/bỏ qua npm ci/); assert.match(again,/bỏ qua generate/);
      assert.doesNotMatch(again,/dev:provision-credentials|Database V1.8 seed: PASS|Mật khẩu PostgreSQL/);
    });
  } finally { await client.end(); }
});
