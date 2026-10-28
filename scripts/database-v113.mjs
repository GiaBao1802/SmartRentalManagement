import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import {loadBaseline,readCatalog,assertCatalog,unwrapTransaction} from './database-v19.mjs';

// Rehearsal never modifies the configured database. All writes target a unique disposable DB.
export async function rehearse() {
  dotenv.config({path:'backend/.env',quiet:true});
  const url=new URL(process.env.DATABASE_URL);
  const admin=new pg.Client({connectionString:url.href});await admin.connect();
  const name=`goctro_meter_rehearsal_${randomBytes(6).toString('hex')}`;
  const directory='database/baselines/v1.13';
  const manifest=JSON.parse(await readFile(`${directory}/PROVENANCE.json`,'utf8').catch(()=>'{"status":"NEW"}'));
  if(manifest.status==='PROMOTED_LOCAL'){
    await admin.end();
    throw new Error('V1.13 is promoted and immutable. Use meter.postgres.test.ts for clean-install regression; do not regenerate the baseline.');
  }
  const old=await loadBaseline('database/baselines/v1.12','1.12');
  const migration=unwrapTransaction(await readFile(`${directory}/migrations/V1_12_to_V1_13_meter_submissions.sql`,'utf8'));
  let client;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname=`/${name}`;client=new pg.Client({connectionString:url.href});await client.connect();
    await client.query(old.schemaSql);
    assertCatalog(await readCatalog(client),old.catalog);
    await client.query('BEGIN');await client.query(migration);await client.query('COMMIT');
    const expected=await readCatalog(client);
    await client.query(old.seedSql);await client.query("COMMIT");
    // Save candidate artifacts only after the predecessor upgrade and seed validate.
    await mkdir(directory,{recursive:true});
    await writeFile(`${directory}/schema.sql`,`BEGIN;\n${old.schemaSql}\n${migration}\nCOMMIT;\n`);
    await copyFile('database/baselines/v1.12/seed.sql',`${directory}/seed.sql`);
    await writeFile(`${directory}/expected-catalog.json`,JSON.stringify(expected,null,2)+'\n');
    const sha256={};for(const f of ['schema.sql','seed.sql','expected-catalog.json','migrations/V1_12_to_V1_13_meter_submissions.sql'])sha256[f]=createHash('sha256').update(await readFile(`${directory}/${f}`)).digest('hex');
    await writeFile(`${directory}/PROVENANCE.json`,JSON.stringify({version:'1.13',predecessor:'database/baselines/v1.12',status:'REHEARSED_NOT_APPLIED',sha256},null,2)+'\n');
    console.log(`V1.12 → V1.13 rehearsal PASS; disposable database ${name}; application database unchanged.`);
  } finally {
    if(client)await client.end();
    // name is generated above and cannot be supplied by a caller.
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();
  }
}
if(process.argv[1]?.endsWith('database-v113.mjs')){
  if(process.argv[2]!=='rehearse')throw new Error('Only supported command: node scripts/database-v113.mjs rehearse');
  await rehearse();
}
