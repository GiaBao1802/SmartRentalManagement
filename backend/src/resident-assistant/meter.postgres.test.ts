import assert from "node:assert/strict";
import {test} from "node:test";
import {randomBytes} from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import {PrismaClient} from "@prisma/client";
import {MeterSubmissionRepository} from "./meter.repository.js";
// @ts-ignore repository tooling is JavaScript
import {loadBaseline,readCatalog,assertCatalog} from "../../../scripts/database-v19.mjs";

test("disposable V1.13: scope, pending, atomic approval, repeat, stale draft and finalization guards",{timeout:60000},async()=>{
  dotenv.config({path:"backend/.env",quiet:true});
  const url=new URL(process.env.DATABASE_URL!);
  const admin=new pg.Client({connectionString:url.href});await admin.connect();
  const name=`goctro_meter_test_${randomBytes(6).toString("hex")}`;
  let client:pg.Client|undefined,db:PrismaClient|undefined;
  try{
    await admin.query(`CREATE DATABASE "${name}"`);url.pathname=`/${name}`;
    client=new pg.Client({connectionString:url.href});await client.connect();
    const baseline=await loadBaseline("database/baselines/v1.13","1.13");await client.query(baseline.schemaSql);assertCatalog(await readCatalog(client),baseline.catalog);await client.query(baseline.seedSql);await client.query("COMMIT");
    db=new PrismaClient({datasources:{db:{url:url.href}}});const repository=new MeterSubmissionRepository(db);
    // Disposable fixture, independent of wall clock / existing seeded invoice periods.
    await client.query("UPDATE contracts SET start_date=CURRENT_DATE-30,end_date=CURRENT_DATE+365 WHERE contract_id=3002");
    await client.query("UPDATE room_residents SET started_at=CURRENT_DATE-30 WHERE contract_id=3002");
    const created=await client.query("INSERT INTO invoices(invoice_no,contract_id,property_id,owner_id,period_start,period_end,total_amount,status) VALUES ('METER-TEST',3002,11,1,CURRENT_DATE-19,CURRENT_DATE+10,0,'draft') RETURNING invoice_id");
    const invoiceId=BigInt(created.rows[0].invoice_id),image=Buffer.from("test-image-bytes");
    const input={invoiceId,utility:"ELECTRICITY" as const,reading:"1000.125"};
    await repository.assertReady();
    const targets=await repository.targets(1n,1003n); assert.ok(targets.some(r=>r.invoice_id===invoiceId),JSON.stringify({invoiceId:String(invoiceId),targets},(_k,v)=>typeof v==="bigint"?v.toString():v));
    await assert.rejects(repository.submit(2n,2001n,input,image),{status:404});
    await assert.rejects(repository.submit(1n,1001n,input,image),{status:404});
    await assert.rejects(repository.submit(1n,1003n,{...input,reading:"899"},image),{status:400});
    const first=await repository.submit(1n,1003n,input,image);assert.equal(first.status,"PENDING");
    assert.equal((await db.invoice.findUniqueOrThrow({where:{invoiceId}})).electricityCurrentKwh,null);
    assert.deepEqual(await repository.submit(1n,1003n,input,image),first);
    await assert.rejects(repository.image(2n,first.submission_id),{status:404});
    await assert.rejects(repository.image(1n,first.submission_id,1001n),{status:404});
    await assert.rejects(repository.decide(2n,2n,first.submission_id,"APPROVE",null),{status:404});
    const decisions=await Promise.all([repository.decide(1n,1n,first.submission_id,"APPROVE",null),repository.decide(1n,1n,first.submission_id,"APPROVE",null)]);assert.equal(decisions[0].status,"APPROVED");assert.deepEqual(decisions[0],decisions[1]);
    const invoice=await db.invoice.findUniqueOrThrow({where:{invoiceId}});assert.equal(invoice.electricityCurrentKwh?.toString(),"1000.125");assert.equal(invoice.status,"draft");assert.equal(invoice.totalAmount,0n);
    await assert.rejects(repository.decide(1n,1n,first.submission_id,"REJECT",null),{status:409});
    const water=await repository.submit(1n,1003n,{...input,utility:"WATER",reading:"50"},image);
    await db.invoice.update({where:{invoiceId},data:{waterCurrentM3:"51"}});
    await assert.rejects(repository.decide(1n,1n,water.submission_id,"APPROVE",null),{status:409});
    assert.equal((await repository.decide(1n,1n,water.submission_id,"REJECT","Ảnh cần chụp lại")).status,"REJECTED");
    const next=await repository.submit(1n,1003n,{...input,reading:"1001"},image);
    await client.query("UPDATE invoices SET status='unpaid',snapshot_kind='LEGACY_AGGREGATE',finalized_at=now(),due_date=CURRENT_DATE+5 WHERE invoice_id=$1",[invoiceId.toString()]);
    await assert.rejects(repository.decide(1n,1n,next.submission_id,"APPROVE",null),{status:409});
    assert.equal((await db.invoice.findUniqueOrThrow({where:{invoiceId}})).electricityCurrentKwh?.toString(),"1000.125");
  }finally{
    await db?.$disconnect();await client?.end();await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();
  }
});
