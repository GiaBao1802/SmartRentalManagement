import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, rm, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { baselineDirectory, parseTarget, unwrapTransaction, loadBaseline, readCatalog, assertCatalog, catalogsMatch, classifySetupError, setupExitCode, runCommand } from './database-v18.mjs';

async function removeTemporary(directory) {
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.match(path.basename(resolved), /^goctro-v18-/);
  await rm(resolved, { recursive: true, force: true });
}

test('setup requires its own explicit URL and matching database confirmation', () => {
  assert.throws(() => parseTarget(undefined, 'goctro_new'), /GOCTRO_SETUP_DATABASE_URL/);
  assert.throws(() => parseTarget('postgresql://user@localhost:55448/goctro_new', 'wrong'), /matching/);
  assert.equal(parseTarget('postgresql://user@localhost:55448/goctro_new?schema=public', 'goctro_new').port, 55448);
});
test('remote/system databases and connection-option injection are rejected', () => {
  for (const url of ['postgresql://user@remote:5432/goctro_new', 'postgresql://user@localhost:5432/postgres', 'postgresql://user@localhost:5432/goctro_new?options=bad']) {
    assert.throws(() => parseTarget(url, new URL(url).pathname.slice(1)));
  }
});
test('DATABASE_URL alone cannot cause a connection', async () => {
  await assert.rejects(runCommand(['bootstrap', '--database', 'goctro_new'], { DATABASE_URL: 'not-used' }), /GOCTRO_SETUP_DATABASE_URL/);
});
test('SQL transaction stripping preserves function bodies and rejects missing envelopes', () => {
  const sql = '-- canonical\r\nBEGIN;\nCREATE FUNCTION f() RETURNS void AS $$ BEGIN NULL; END $$ LANGUAGE plpgsql;\nCOMMIT;\n';
  assert.match(unwrapTransaction(sql), /\$\$ BEGIN NULL; END \$\$/);
  assert.throws(() => unwrapTransaction('SELECT 1;'), /envelope/);
});
test('reviewed artifacts load and tampering fails closed', async () => {
  const baseline = await loadBaseline();
  assert.equal(baseline.catalog.relations.filter((r) => r.kind === 'r').length, 40);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'goctro-v18-artifacts-'));
  try {
    await cp(baselineDirectory, temporary, { recursive: true });
    await appendFile(path.join(temporary, 'seed.sql'), '\n-- unreviewed edit');
    await assert.rejects(loadBaseline(temporary), /integrity mismatch/);
  } finally { await removeTemporary(temporary); }
});
test('every artifact recorded in provenance retains its reviewed raw bytes', async () => {
  const manifest = JSON.parse(await readFile(path.join(baselineDirectory, 'PROVENANCE.json'), 'utf8'));
  for (const [filename, expected] of Object.entries(manifest.sha256)) {
    const bytes = await readFile(path.join(baselineDirectory, filename));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, filename);
  }
});
test('catalog drift in a constraint/index is rejected', () => {
  assert.throws(() => assertCatalog({ indexes: [] }, { indexes: ['expected'] }), /differs/);
});
test('catalog comparison order is independent of server collation', async () => {
  const rows = [{ name: 'accounts' }, { name: 'account_invitations' }, { name: 'z' }];
  const first = await readCatalog({ query: async () => ({ rows: [...rows] }) });
  const second = await readCatalog({ query: async () => ({ rows: [...rows].reverse() }) });
  assertCatalog(first, second);
});
test('catalog comparison ignores physical column order but keeps semantic column attributes', () => {
  const expected = { columns: [
    { relation: 'residents', name: 'birth_date', position: 7, type: 'date', not_null: false, identity: '', generated: '', default_value: null },
    { relation: 'residents', name: 'avatar_storage_key', position: 8, type: 'text', not_null: false, identity: '', generated: '', default_value: null },
  ] };
  const reordered = { columns: [
    { ...expected.columns[1], position: 14 },
    { ...expected.columns[0], position: 7 },
  ] };
  assert.equal(catalogsMatch(reordered, expected), true);
  assert.throws(() => assertCatalog({ columns: [{ ...expected.columns[0], type: 'timestamp' }, expected.columns[1]] }, expected), /differs/);
});
test('only the reviewed room-image routine comment variants are normalized', async () => {
  const baseline = await loadBaseline();
  const expected = baseline.catalog.routines.find((row) => row.name === 'room_images_lock_parent_before_insert_fn');
  const commentOnly = expected.definition.replace('Fail fast if another transaction is inserting into this Room. A waiting\n    -- INSERT would retain its original statement snapshot after the row lock\n    -- is released and could miss the committed association in its count check.', 'Fail fast rather than wait for a parent row lock: a blocked INSERT keeps\n    -- its original statement snapshot and may miss the competing committed row.').replace('Updating updated_at both records the gallery mutation and makes a\n    -- transaction using a stale REPEATABLE READ snapshot fail serialization.', 'Update the parent version so a stale REPEATABLE READ transaction fails\n    -- with a serialization error instead of checking an old gallery snapshot.');
  assert.equal(catalogsMatch({ routines: [{ ...expected, definition: commentOnly }] }, { routines: [expected] }), true);
  assert.equal(catalogsMatch({ routines: [{ ...expected, definition: commentOnly.replace('RETURN NEW;', 'RETURN OLD;') }] }, { routines: [expected] }), false);
});
test('setup error classes have distinct guarded exit codes', () => {
  assert.equal(setupExitCode(classifySetupError({ code: '3D000' })), 2);
  assert.equal(setupExitCode(classifySetupError(new Error('database "missing" does not exist'))), 2);
  assert.equal(setupExitCode(classifySetupError({ code: '28P01' })), 3);
  assert.equal(setupExitCode(classifySetupError({ code: 'ECONNREFUSED' })), 4);
  assert.equal(setupExitCode(classifySetupError(new Error('Schema differs from the reviewed V1.8 catalog'))), 5);
});
test('legacy migration exits nonzero without reading connection configuration', () => {
  const entry = fileURLToPath(new URL('./database-v18.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [entry, 'block-legacy-migrate'], { encoding: 'utf8', env: { ...process.env, GOCTRO_SETUP_DATABASE_URL: 'not-used' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /db:migrate bị chặn:.*LEGACY\/demo/);
  assert.match(result.stderr, /db:bootstrap/);
  assert.doesNotMatch(result.stderr, /not-used/);
});
test('Compose and npm commands use the current V1.11 setup path and separate PG18 volume', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const compose = await readFile(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /image: postgres:18\.6/);
  assert.match(compose, /postgres18_v18_data:\/var\/lib\/postgresql\s/);
  assert.doesNotMatch(compose, /postgres_data:|postgres:17/);
  for (const manifest of ['package.json', 'backend/package.json']) {
    const scripts = JSON.parse(await readFile(path.join(root, manifest), 'utf8')).scripts;
    assert.match(scripts['db:seed'], /database-v111\.mjs seed$/);
    assert.match(scripts['db:migrate'], /database-v111\.mjs migrate-v110$/);
    assert.match(scripts['db:migrate:v19'], /database-v111\.mjs migrate-v19$/);
    assert.match(scripts['db:generate'], /schema\.prisma|workspace=@goctro\/backend/);
  }
  const scripts = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.match(scripts['db:state'], /database-v111\.mjs state$/);
  assert.match(scripts['db:inspect'], /database-v111\.mjs inspect$/);
  const setup = await readFile(path.join(root, 'scripts/setup-interactive.ps1'), 'utf8');
  assert.match(setup, /database-v111\.mjs/);
  assert.match(setup, /Migration V1\.10→V1\.11/);
  assert.match(setup, /migrate-v110-booking-branch/);
});

test('Windows setup menu exits without installing packages or writing config', { skip: process.platform !== 'win32' }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'goctro-v18-batch-'));
  try {
    for (const directory of ['bin', 'backend', 'frontend', 'scripts']) await mkdir(path.join(temporary, directory));
    await cp(path.join(root, 'setup.bat'), path.join(temporary, 'setup.bat'));
    await cp(path.join(root, 'scripts/setup-interactive.ps1'), path.join(temporary, 'scripts/setup-interactive.ps1'));
    for (const filename of ['.env.example', 'backend/.env.example', 'frontend/.env.example']) {
      await cp(path.join(root, filename), path.join(temporary, filename));
    }
    await writeFile(path.join(temporary, 'package.json'), '{}');
    await writeFile(path.join(temporary, 'bin/npm.cmd'), '@echo off\r\nif "%~1"=="--version" (\r\n echo 11.6.0\r\n exit /b 0\r\n)\r\necho %*>>npm-steps.log\r\nexit /b 0\r\n');
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'Path';
    const env = { ...process.env, [key]: `${path.join(temporary, 'bin')}${path.delimiter}${process.env[key] || ''}` };
    const run = (input) => spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'setup.bat'], { cwd: temporary, env, input, encoding: 'utf8', timeout: 20000 });
    const first = run('3\r\n\r\n');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Cài đặt lần đầu/);
    await assert.rejects(access(path.join(temporary, 'npm-steps.log')));
    await assert.rejects(access(path.join(temporary, 'backend/.env')));
    assert.notEqual(run('invalid\r\n\r\n').status, 0);
  } finally { await removeTemporary(temporary); }
});

test('failed npm ci records no success stamp and blocks database/provision/startup', {skip: process.platform !== 'win32'}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(),'goctro-v18-install-failure-'));
  try {
    for(const dir of ['bin','scripts','config']) await mkdir(path.join(temporary,dir));
    for(const file of ['setup.bat','scripts/setup-interactive.ps1','scripts/setup-cache.mjs']) await cp(path.join(root,file),path.join(temporary,file));
    await writeFile(path.join(temporary,'package.json'),'{}');
    await writeFile(path.join(temporary,'scripts/dev-stop.ps1'),"Write-Host 'No fixture processes to stop.'");
    const config='NODE_ENV=development\nDATABASE_URL=postgresql://v18_smoke:fixture-only@127.0.0.1:55448/goctro_setup_test_failed\nSESSION_SECRET=fixture-local-secret-32-characters-only\n';
    await writeFile(path.join(temporary,'config/backend.env'),config);
    await writeFile(path.join(temporary,'bin/npm.cmd'),'@echo off\r\nif "%~1"=="--version" (echo 11.6.0& exit /b 0)\r\nif "%~1"=="ci" exit /b 17\r\nexit /b 0\r\n');
    const key=Object.keys(process.env).find(k=>k.toLowerCase()==='path')||'Path';
    const env={...process.env,NODE_ENV:'development',GOCTRO_SETUP_CONFIG_DIR:path.join(temporary,'config'),[key]:path.join(temporary,'bin')+path.delimiter+process.env[key]};
    const r=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c','setup.bat'],{cwd:temporary,env,input:'2\r\ny\r\n\r\n',encoding:'utf8',timeout:30000});
    assert.equal(r.status,1,r.stdout+r.stderr); assert.match(r.stdout,/npm ci thất bại/);
    assert.doesNotMatch(r.stdout,/Database state:|DEMO_STATE=|Generate Prisma|Khởi động ứng dụng/);
    await assert.rejects(access(path.join(temporary,'config/runtime/dependencies.sha256')));
    assert.equal(await readFile(path.join(temporary,'config/backend.env'),'utf8'),config);
  } finally {await removeTemporary(temporary);}
});

test('process ownership stops at app workspace and never selects an ancestor harness', {skip:process.platform !== 'win32'}, () => {
  const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./process-ownership.test.ps1',import.meta.url))],{encoding:'utf8',timeout:20000});
  assert.equal(r.status,0,r.stdout+r.stderr);
});

test('fixed first-time defaults, missing-password input and existing config preservation (isolated prompt fixture)', {skip:process.platform !== 'win32'}, async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const temporary=await mkdtemp(path.join(os.tmpdir(),'goctro-v18-fixed-defaults-'));
  try {
    for(const dir of ['scripts','backend','frontend','bin']) await mkdir(path.join(temporary,dir));
    await cp(path.join(root,'scripts/setup-interactive.ps1'),path.join(temporary,'scripts/setup-interactive.ps1'));
    for(const file of ['.env.example','backend/.env.example','frontend/.env.example']) await cp(path.join(root,file),path.join(temporary,file));
    await writeFile(path.join(temporary,'bin/npm.cmd'),'@echo off\r\necho 11.6.0\r\n');
    // Prompt substitution lives ONLY in this temporary harness, never in production tooling.
    await writeFile(path.join(temporary,'run.ps1'),`\uFEFFfunction Read-Host { param([string]$Prompt,[switch]$AsSecureString)
      if ($AsSecureString) { Write-Host 'FIXTURE_SECRET_PROMPT'; $s = [Security.SecureString]::new(); 'fixture:p@ss$%#word'.ToCharArray() | ForEach-Object { $s.AppendChar($_) }; return $s }
      if ($Prompt -like 'Chọn 1, 2*') { return $env:FIXTURE_MENU }
      if ($Prompt -like 'Xác nhận target*') { return 'n' }
      throw 'Unexpected prompt: '+$Prompt
    }
    & "$PSScriptRoot/scripts/setup-interactive.ps1"
    exit $LASTEXITCODE`);
    const key=Object.keys(process.env).find(k=>k.toLowerCase()==='path')||'Path';
    const env={...process.env,NODE_ENV:'development',GOCTRO_SETUP_CONFIG_DIR:'',GOCTRO_SETUP_REHEARSAL_DEFAULT:'',[key]:path.join(temporary,'bin')+path.delimiter+process.env[key]};
    const run=mode=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(temporary,'run.ps1')],{cwd:temporary,env:{...env,FIXTURE_MENU:mode},encoding:'utf8',timeout:20000});
    const invalidSeam=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(temporary,'run.ps1')],{cwd:temporary,env:{...env,FIXTURE_MENU:'1',GOCTRO_SETUP_REHEARSAL_DEFAULT:'1'},encoding:'utf8',timeout:20000});
    assert.equal(invalidSeam.status,1); assert.match(invalidSeam.stdout,/chỉ được dùng với cấu hình disposable riêng/);
    await assert.rejects(access(path.join(temporary,'backend/.env')));
    await mkdir(path.join(temporary,'config'));
    await writeFile(path.join(temporary,'config/backend.env'),'NODE_ENV=development\nDATABASE_URL=postgresql://postgres:fixture-only@localhost:5432/Goctro_dev_v18\n');
    const unsafeSeam=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(temporary,'run.ps1')],{cwd:temporary,env:{...env,FIXTURE_MENU:'1',GOCTRO_SETUP_CONFIG_DIR:path.join(temporary,'config'),GOCTRO_SETUP_REHEARSAL_DEFAULT:'1'},encoding:'utf8',timeout:20000});
    assert.equal(unsafeSeam.status,1); assert.match(unsafeSeam.stdout,/Cấu hình kiểm thử phải dùng role v18_smoke/);
    assert.doesNotMatch(unsafeSeam.stdout,/Database state:|Xác nhận target/);
    const missing=run('2'); assert.equal(missing.status,1); assert.match(missing.stdout,/Chưa hoàn tất cài đặt/);
    const fresh=run('1'); assert.equal(fresh.status,1,fresh.stdout+fresh.stderr);
    assert.equal((fresh.stdout.match(/FIXTURE_SECRET_PROMPT/g)||[]).length,1);
    assert.match(fresh.stdout,/host=localhost; cổng=5432; user=postgres; database=Goctro_dev_v18/);
    assert.match(fresh.stdout,/Chưa xác nhận database/,fresh.stdout+fresh.stderr);
    const file=path.join(temporary,'backend/.env');
    const created=await readFile(file,'utf8');
    const url=new URL(created.match(/^DATABASE_URL=(.*)$/m)[1].trim());
    assert.equal(url.hostname,'localhost'); assert.equal(url.port,'5432'); assert.equal(url.username,'postgres'); assert.equal(url.pathname,'/Goctro_dev_v18');
    assert.equal(decodeURIComponent(url.password),'fixture:p@ss$%#word');
    const mismatch=created.replace('/Goctro_dev_v18','/Goctro_test3'); await writeFile(file,mismatch);
    const other=run('1'); assert.match(other.stdout,/Đã có cấu hình khác/); assert.doesNotMatch(other.stdout,/FIXTURE_SECRET_PROMPT/);
    assert.equal(await readFile(file,'utf8'),mismatch);
    const update=run('2'); assert.doesNotMatch(update.stdout,/FIXTURE_SECRET_PROMPT|Đã có cấu hình khác/); assert.match(update.stdout,/database=Goctro_test3/);
    assert.equal(await readFile(file,'utf8'),mismatch);
    await writeFile(file,created.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL=postgresql://postgres@localhost:5432/Goctro_dev_v18?schema=public'));
    const fill=run('1'); assert.equal(fill.status,1,fill.stdout+fill.stderr); assert.match(fill.stdout,/FIXTURE_SECRET_PROMPT/);
    const filled=await readFile(file,'utf8');
    assert.equal(decodeURIComponent(new URL(filled.match(/^DATABASE_URL=(.*)$/m)[1].trim()).password),'fixture:p@ss$%#word');
    assert.equal(filled.replace(/^DATABASE_URL=.*$/m,''),created.replace(/^DATABASE_URL=.*$/m,''));
    assert.doesNotMatch(fresh.stdout+fill.stdout,/Host PostgreSQL local|Cổng PostgreSQL \(|Tên database dev|User\/role PostgreSQL|Đổi cấu hình/);
  } finally {await removeTemporary(temporary);}
});
