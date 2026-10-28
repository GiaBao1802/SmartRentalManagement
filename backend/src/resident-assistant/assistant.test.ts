import assert from "node:assert/strict";
import {test} from "node:test";
import express from "express";
import sharp from "sharp";
import {createServer} from "node:http";
import {loadEnv} from "../config/env.js";
import {InMemorySessionStore,createOpaqueSessionToken,hashSessionToken} from "../auth/session-store.js";
import {createSessionRecord} from "../middleware/auth.js";
import {makeCsrfToken} from "../middleware/csrf.js";
import {errorHandler} from "../middleware/error-handler.js";
import {createV1Router} from "../auth/v1.router.js";
import {meterInput} from "./meter.repository.js";
import {normalizeMeterImage,ocrCandidate} from "./assistant.routes.js";

test("meter input rejects client scope, negative/excess precision and arbitrary image URLs",async()=>{
  const input={invoice_id:"1",utility:"WATER",reading:"10.125",image:""};
  assert.equal(meterInput(input).reading,"10.125");
  for(const reading of ["-1","1.1234","1e3","NaN","1000000000"]){assert.throws(()=>meterInput({...input,reading}));}
  assert.throws(()=>meterInput({...input,owner_id:"2"}));
  await assert.rejects(normalizeMeterImage("https://example.com/a.jpg"));
  await assert.rejects(normalizeMeterImage("data:image/jpeg;base64,YmFk"));
});
test("OCR only suggests one unambiguous numeric candidate; normalized image is JPEG",async()=>{
  assert.equal(ocrCandidate("12345.678 kWh"),"12345.678");
  assert.equal(ocrCandidate("meter 2026 12345.678"),null);
  assert.equal(ocrCandidate("unreadable"),null);
  const png=await sharp({create:{width:30,height:30,channels:3,background:"white"}}).png().toBuffer();
  const normalized=await normalizeMeterImage(`data:image/png;base64,${png.toString("base64")}`);
  assert.equal((await sharp(normalized).metadata()).format,"jpeg");
});
test("HTTP auth, CSRF, role, session revocation and server-derived scope",async()=>{
  const config=loadEnv({NODE_ENV:"test",DATABASE_URL:"postgresql://unused/unused",FRONTEND_ORIGIN:"http://localhost:3000",SESSION_SECRET:"resident-assistant-test-secret-long-enough"});
  const sessions=new InMemorySessionStore();
  const records:any[]=[{accountId:1n,role:"admin",status:"active",ownerId:10n,residentId:null,owner:{ownerId:10n,displayName:"A"},resident:null,email:"a@test.invalid",phone:null},{accountId:2n,role:"resident",status:"active",ownerId:null,residentId:20n,owner:null,resident:{residentId:20n,ownerId:10n,fullName:"R"},email:"r@test.invalid",phone:null}];
  const calls:any[]=[];
  const repository:any={assertReady:async()=>{},targets:async(...args:any[])=>{calls.push(args);return[];},list:async(...args:any[])=>{calls.push(args);return[];}};
  const authRepository={findCandidates:async()=>[],findCurrentAccount:async(id:bigint)=>records.find(r=>r.accountId===id)??null};
  const app=express();app.use(express.json());app.use("/api/v1",createV1Router({config,sessions,repository:authRepository,meterSubmissionRepository:repository}));app.use(errorHandler);
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  async function headers(accountId:bigint){const token=createOpaqueSessionToken(),csrf=makeCsrfToken(config.sessionSecret);const hash=hashSessionToken(token,config.sessionSecret);await sessions.set(createSessionRecord(accountId,hash,config));return{hash,headers:{Cookie:`gt_session=${token}; gt_csrf=${csrf}`,Origin:config.frontendOrigin,"X-CSRF-Token":csrf,"Content-Type":"application/json"}};}
  try{
    const a=await headers(1n),r=await headers(2n);
    assert.equal((await fetch(`${base}/me/meter-targets`)).status,401);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:a.headers})).status,403);
    assert.equal((await fetch(`${base}/meter-submissions`,{headers:r.headers})).status,403);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:r.headers})).status,200);
    assert.deepEqual(calls.pop(),[10n,20n]);
    assert.equal((await fetch(`${base}/meter-submissions`,{headers:a.headers})).status,200);
    assert.deepEqual(calls.pop(),[10n]);
    assert.equal((await fetch(`${base}/me/meter-submissions`,{method:"POST",headers:{Cookie:r.headers.Cookie,"Content-Type":"application/json"},body:"{}"})).status,403);
    assert.equal((await fetch(`${base}/me/meter-submissions`,{method:"POST",headers:r.headers,body:JSON.stringify({owner_id:"999"})})).status,400);
    for(const path of ["/me/assistant/chat","/me/meter-ocr","/me/meter-submissions"]){assert.equal((await fetch(base+path,{method:"POST",headers:a.headers,body:"{}"})).status,403);}
    await sessions.revoke(r.hash);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:r.headers})).status,401);
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
