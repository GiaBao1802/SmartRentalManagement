import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import {loadBaseline,readCatalog,assertCatalog,unwrapTransaction} from './database-v19.mjs';

dotenv.config({path:'backend/.env',quiet:true});
if(process.argv[2]!=='--apply-verified-local')throw new Error('Explicit command required: --apply-verified-local');
const target=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='5433'||target.pathname!=='/Goctro_dev_v18')throw new Error('Only verified local Goctro_dev_v18:5433 is supported.');
const versions=['1.8','1.9','1.10','1.11','1.12','1.13'];
const baselines=await Promise.all(versions.map(v=>loadBaseline(`database/baselines/v${v}`,v)));
const migrations=['v1.9/migrations/V1_8_to_V1_9_flexible_service_modes.sql','v1.10/migrations/V1_9_to_V1_10_auth_sessions.sql','v1.11/migrations/V1_10_to_V1_11_resident_service_bookings.sql','v1.12/migrations/V1_11_to_V1_12_demo_payment.sql','v1.13/migrations/V1_12_to_V1_13_meter_submissions.sql'];
const client=new pg.Client({connectionString:target.href});await client.connect();
const tempName=`goctro_assistant_restore_${randomBytes(6).toString('hex')}`;
const backup=path.resolve(`.local/setup-backups/Goctro_dev_v18_pre_V1_13_${Date.now()}.dump`);
const bin=path.resolve('.local/postgresql18/pgsql/bin');
const env={...process.env,PGPASSWORD:decodeURIComponent(target.password)};
function command(name,args){const r=spawnSync(path.join(bin,name+'.exe'),args,{env,encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});if(r.status!==0)throw new Error(`${name} failed: ${r.stderr}`);return r.stdout;}
const connection=['-h',target.hostname,'-p',target.port,'-U',decodeURIComponent(target.username)];
async function fingerprints(c){const tables=baselines[0].catalog.relations.filter(r=>r.kind==='r').map(r=>r.name);const result={};for(const table of tables){result[table]=(await c.query(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM "${table}" t) x`)).rows[0];}return result;}
async function upgrade(c){await c.query('BEGIN');try{await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");await c.query('SELECT pg_advisory_xact_lock(1800180020)');assertCatalog(await readCatalog(c),baselines[0].catalog);for(let i=0;i<migrations.length;i++){await c.query("SELECT set_config('goctro.allow_locked_db_migration',$1,true)",['V'+versions[i+1]]);await c.query(unwrapTransaction(await readFile('database/baselines/'+migrations[i],'utf8')));assertCatalog(await readCatalog(c),baselines[i+1].catalog);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}
let copy;
try{
  assertCatalog(await readCatalog(client),baselines[0].catalog);
  await mkdir(path.dirname(backup),{recursive:true});
  command('pg_dump',[...connection,'-d','Goctro_dev_v18','-Fc','-f',backup]);
  const entries=command('pg_restore',['--list',backup]).split('\n').filter(l=>/^\d+;/.test(l)).length;
  const sha256=createHash('sha256').update(await readFile(backup)).digest('hex');
  console.log(JSON.stringify({backup,entries,sha256}));
  await client.query(`CREATE DATABASE "${tempName}"`);
  command('pg_restore',[...connection,'-d',tempName,'--exit-on-error','--no-owner',backup]);
  const copyUrl=new URL(target);copyUrl.pathname='/'+tempName;copy=new pg.Client({connectionString:copyUrl.href});await copy.connect();
  const copyBefore=await fingerprints(copy);await upgrade(copy);const copyAfter=await fingerprints(copy);
  if(JSON.stringify(copyBefore)!==JSON.stringify(copyAfter))throw new Error('Rehearsal changed existing rows.');
  console.log('Verified backup restore and complete V1.8 → V1.13 rehearsal; old rows unchanged.');
  const before=await fingerprints(client);await upgrade(client);const after=await fingerprints(client);
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Live row comparison differs; investigate concurrent writes.');
  const evidence={date:new Date().toISOString(),database:'Goctro_dev_v18',port:5433,from:'1.8',to:'1.13',backup,entries,sha256,oldTables:Object.keys(before).length,oldRowsUnchanged:true,catalog:'PASS',restoreRehearsal:'PASS'};
  await writeFile('.local/setup-backups/resident-assistant-v113-evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{await copy?.end();await client.query(`DROP DATABASE IF EXISTS "${tempName}"`);await client.end();}
