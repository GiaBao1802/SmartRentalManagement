import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import express from 'express';
import {createServer,type Server} from 'node:http';
import {PrismaClient} from '@prisma/client';
import {PrismaAuthRepository} from '../auth/account-repository.js';
import {InMemorySessionStore,createOpaqueSessionToken,hashSessionToken} from '../auth/session-store.js';
import {createSessionRecord} from '../middleware/auth.js';
import {makeCsrfToken} from '../middleware/csrf.js';
import {errorHandler} from '../middleware/error-handler.js';
import {loadEnv} from '../config/env.js';
import {createV1Router} from '../auth/v1.router.js';
import {RoomRequestRepository,requestInput} from './room-request.repository.js';
// @ts-ignore existing JavaScript database tooling
import {loadBaseline,readCatalog,assertCatalog} from '../../../scripts/database-v19.mjs';

test('request validation accepts only explicit supported equipment and rejects client scope',()=>{
  const b={occupancy_id:'1',request_key:randomUUID(),equipment_code:'FRIDGE',content:'Tôi muốn thêm tủ lạnh'};
  assert.equal(requestInput(b).equipmentCode,'FRIDGE');
  for(const extra of [{equipment_code:'DROP TABLE rooms'},{owner_id:'2'},{room_id:'301'},{request_key:'x'},{content:'x'}])assert.throws(()=>requestInput({...b,...extra}));
});
test('V1.14 real PostgreSQL and HTTP room request workflow',{timeout:60000},async t=>{
  dotenv.config({path:'backend/.env',quiet:true});const url=new URL(process.env.DATABASE_URL!);
  const admin=new pg.Client({connectionString:url.href});await admin.connect();
  const name=`goctro_requests_test_${randomBytes(6).toString('hex')}`;
  let client:pg.Client|undefined,db:PrismaClient|undefined,server:Server|undefined;
  try{
    await admin.query(`CREATE DATABASE "${name}"`);url.pathname='/'+name;
    client=new pg.Client({connectionString:url.href});await client.connect();const b=await loadBaseline('database/baselines/v1.14','1.14');await client.query(b.schemaSql);assertCatalog(await readCatalog(client),b.catalog);await client.query(b.seedSql);await client.query('COMMIT');
    await client.query("UPDATE rooms SET room_code='301' WHERE room_id=101");
    await client.query("UPDATE contracts SET start_date=CURRENT_DATE-30,end_date=CURRENT_DATE+365 WHERE contract_id=3001");
    await client.query("UPDATE room_residents SET started_at=CURRENT_DATE-30 WHERE contract_id=3001");
    db=new PrismaClient({datasources:{db:{url:url.href}}});const repo=new RoomRequestRepository(db);
    const config=loadEnv({NODE_ENV:'test',DATABASE_URL:url.href,FRONTEND_ORIGIN:'http://localhost:3000',SESSION_SECRET:'room-request-tests-secret-with-enough-bytes'}),sessions=new InMemorySessionStore();
    const app=express();app.use(express.json());app.use('/api/v1',createV1Router({config,sessions,repository:new PrismaAuthRepository(db),roomRequestRepository:repo}));app.use(errorHandler);server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
    async function session(accountId:bigint){const token=createOpaqueSessionToken(),csrf=makeCsrfToken(config.sessionSecret);await sessions.set(createSessionRecord(accountId,hashSessionToken(token,config.sessionSecret),config));return{Cookie:`gt_session=${token}; gt_csrf=${csrf}`,Origin:config.frontendOrigin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};}
    const resident=await session(2n),owner=await session(1n),other=await session(4n);
    async function call(path:string,headers:Record<string,string>,body?:unknown){const response=await fetch(base+path,{headers,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any};}
    let requestId='';const payload={occupancy_id:'1',request_key:randomUUID(),equipment_code:'FRIDGE',content:'Phòng 301 muốn thêm tủ lạnh'};
    await t.test('anonymous/admin denied resident tools; resident denied owner queue and approval; CSRF enforced',async()=>{
      assert.equal((await call('/me/room-request-targets',{})).status,401);
      assert.equal((await call('/me/room-request-targets',owner)).status,403);
      assert.equal((await call('/room-requests',resident)).status,403);
      assert.equal((await call('/room-requests/1/decision',resident,{decision:'APPROVE',reason:'x'})).status,403);
      assert.equal((await call('/me/room-requests',{Cookie:resident.Cookie,'Content-Type':'application/json'},payload)).status,403);
    });
    await t.test('eligible own rooms only; foreign occupancy denied',async()=>{
      const targets=await call('/me/room-request-targets',resident);assert.equal(targets.status,200);assert.ok(targets.body.data.rooms.every((r:any)=>r.room_id==='101'));
      assert.equal((await call('/me/room-requests',resident,{...payload,occupancy_id:'4'})).status,404);
      assert.equal((await call('/me/room-requests',resident,{...payload,owner_id:'2'})).status,400);
    });
    await t.test('submit/retry produces one pending complaint and no room changes',async()=>{
      const r=await call('/me/room-requests',resident,payload);assert.equal(r.status,201);requestId=r.body.data.complaint_id;
      const again=await call('/me/room-requests',resident,payload);assert.equal(again.body.data.complaint_id,requestId);
      assert.deepEqual(await repo.equipment(1n,101n),[]);
      assert.equal((await call('/me/room-requests',resident,{...payload,content:'Nội dung khác'})).status,409);
      assert.equal((await call('/me/room-requests',resident,{...payload,request_key:randomUUID()})).status,409);
    });
    await t.test('cross-owner review denied and same-owner room unaffected until confirmation',async()=>{
      assert.equal((await call(`/room-requests/${requestId}/decision`,other,{decision:'APPROVE',reason:'Đã lắp'})).status,404);
      assert.ok(!(await repo.list(2n)).some(r=>String(r.complaint_id)===requestId));
      assert.equal((await call(`/room-requests/${requestId}/decision`,owner,{decision:'START',reason:'Đang chuẩn bị'})).status,200);
      assert.deepEqual(await repo.equipment(1n,101n),[]);
    });
    await t.test('concurrent repeat approval updates exactly room 301 once, keeps history and notifies resident',async()=>{
      const body={decision:'APPROVE',reason:'Đã bổ sung tủ lạnh cho phòng 301'};
      const results=await Promise.all([call(`/room-requests/${requestId}/decision`,owner,body),call(`/room-requests/${requestId}/decision`,owner,body)]);assert.ok(results.every(r=>r.status===200));
      const eq=await repo.equipment(1n,101n);assert.equal(eq.length,1);assert.equal(eq[0].code,'FRIDGE');assert.deepEqual(await repo.equipment(1n,102n),[]);
      assert.equal(await db!.complaintHistory.count({where:{complaintId:BigInt(requestId),toStatus:'resolved'}}),1);
      assert.equal((await call(`/room-requests/${requestId}/decision`,owner,{decision:'REJECT',reason:'Đổi ý'})).status,409);
      assert.equal((await call('/me/room-requests',resident,{...payload,request_key:randomUUID()})).status,409);
      assert.ok(await db!.notification.count({where:{accountId:2n,title:'Chủ trọ đã xử lý yêu cầu'}})>0);
    });
    await t.test('reject preserves inventory; general complaint resolution never changes equipment',async()=>{
      for(const equipmentCode of ['BED',null]){
        const r=await repo.create(1n,1001n,2n,requestInput({...payload,request_key:randomUUID(),equipment_code:equipmentCode,content:'Yêu cầu kiểm tra phòng'}));
        await repo.decide(1n,1n,r.complaint_id,equipmentCode?'REJECT':'APPROVE','Đã kiểm tra');
        assert.equal((await repo.equipment(1n,101n)).length,1);
      }
    });
    await t.test('stale occupancy approval rolls back without equipment or resolved history',async()=>{
      const r=await repo.create(1n,1001n,2n,requestInput({...payload,request_key:randomUUID(),equipment_code:'DESK'}));
      await client!.query("UPDATE room_residents SET status='ended',ended_at=CURRENT_DATE WHERE occupancy_id=1");
      await assert.rejects(repo.decide(1n,1n,r.complaint_id,'APPROVE','Đã bổ sung'),{status:409});
      assert.equal((await repo.equipment(1n,101n)).length,1);assert.equal((await db!.complaint.findUniqueOrThrow({where:{complaintId:r.complaint_id}})).status,'pending');
      await repo.decide(1n,1n,r.complaint_id,'REJECT','Khách đã chuyển phòng');
    });
    await t.test('database trigger rejects mismatched source equipment/room',async()=>{
      await assert.rejects(client!.query('INSERT INTO room_equipment(room_id,property_id,owner_id,equipment_code,source_complaint_id,confirmed_by_account_id) VALUES(102,11,1,\'DESK\',$1,1)',[requestId]),{code:'23514'});
    });
  }finally{
    if(server)await new Promise<void>((r,j)=>server!.close(e=>e?j(e):r()));await db?.$disconnect();await client?.end();await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();
  }
});
