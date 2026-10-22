import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('cache invalidates on manifests, environment, mapping, missing client and runtime source/config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goctro-setup-cache-'));
  try {
    for (const dir of ['scripts','database','backend/src','frontend/src','node_modules/.prisma/client']) await mkdir(path.join(root,dir),{recursive:true});
    await cp(new URL('./setup-cache.mjs',import.meta.url),path.join(root,'scripts/setup-cache.mjs'));
    await writeFile(path.join(root,'package.json'),'{}');
    const env={...process.env,GOCTRO_SETUP_RUNTIME_DIR:path.join(root,'cache'),GOCTRO_SETUP_NPM_VERSION:'11.6.0'};
    const run=(action,kind)=>{
      const r=spawnSync(process.execPath,[path.join(root,'scripts/setup-cache.mjs'),action,kind],{env,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr); return r.stdout.trim();
    };
    assert.equal(run('check','dependencies'),'CHANGED');
    run('record','dependencies'); assert.equal(run('check','dependencies'),'CURRENT');
    run('invalidate','dependencies'); assert.equal(run('check','dependencies'),'CHANGED'); run('record','dependencies');
    await writeFile(path.join(root,'package.json'),'{"version":"2"}'); assert.equal(run('check','dependencies'),'CHANGED');
    run('record','dependencies'); env.GOCTRO_SETUP_NPM_VERSION='11.7.0'; assert.equal(run('check','dependencies'),'CHANGED');
    run('record','prisma'); assert.equal(run('check','prisma'),'CHANGED');
    await writeFile(path.join(root,'node_modules/.prisma/client/index.js'),''); assert.equal(run('check','prisma'),'CURRENT');
    await writeFile(path.join(root,'database/schema.prisma'),'changed'); assert.equal(run('check','prisma'),'CHANGED');
    run('record','runtime'); assert.equal(run('check','runtime'),'CURRENT');
    await writeFile(path.join(root,'backend/src/server.ts'),'changed'); assert.equal(run('check','runtime'),'CHANGED');
    run('record','runtime'); await writeFile(path.join(root,'backend/.env'),'local-only'); assert.equal(run('check','runtime'),'CHANGED');
  } finally {
    assert.ok(root.startsWith(path.join(os.tmpdir(),'goctro-setup-cache-')));
    await rm(root,{recursive:true,force:true});
  }
});
