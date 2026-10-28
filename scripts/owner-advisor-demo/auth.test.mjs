import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {requireOwner} from './auth.mjs';
import {createOwnerServer} from './server.mjs';
const admin={account:{account_id:'1',role:'admin',status:'active'},profile:{owner_id:'2'}};
test('auth forwards only session to fixed local API and derives owner from response',async()=>{
 const result=await requireOwner({headers:{cookie:'other=private; gt_session=sample-token; gt_csrf=secret',role:'admin'}},{fetchImpl:async(url,options)=>{
  assert.equal(String(url),'http://localhost:4000/api/v1/auth/me');assert.deepEqual(options.headers,{Cookie:'gt_session=sample-token'});assert.equal(options.redirect,'error');return Response.json({data:admin});
 }});assert.deepEqual(result,{ownerId:'2',accountId:'1',role:'admin'});
});
test('missing/duplicate cookie, resident, locked, malformed identity and backend failures fail closed',async()=>{
 for(const cookie of ['', 'gt_session=a; gt_session=b'])await assert.rejects(requireOwner({headers:{cookie,role:'admin'}},{fetchImpl:()=>assert.fail('must not call backend')}),{status:401});
 for(const data of [{...admin,account:{...admin.account,role:'resident'}},{...admin,account:{...admin.account,status:'locked'}},{...admin,profile:{}},{}])await assert.rejects(requireOwner({headers:{cookie:'gt_session=test'}},{fetchImpl:async()=>Response.json({data})}),{status:403});
 for(const status of [401,403,500])await assert.rejects(requireOwner({headers:{cookie:'gt_session=test'}},{fetchImpl:async()=>new Response('',{status})}),{status:status===500?503:status});
 await assert.rejects(requireOwner({headers:{cookie:'gt_session=test'}},{fetchImpl:async()=>{throw new Error('secret internal error');}}),{status:503});
 await assert.rejects(requireOwner({headers:{cookie:'gt_session=test'}},{apiBase:'https://foreign.test/api/v1',fetchImpl:()=>assert.fail('must not forward session')}),{status:503});
});
test('all UI/API routes require owner; revoked session is checked again; health has no billing data',async()=>{
 let revoked=false,modelCalls=0;
 const server=createOwnerServer({authorize:req=>requireOwner(req,{fetchImpl:async(_url,options)=>{
  if(revoked)return new Response('',{status:401});
  return Response.json({data:options.headers.Cookie==='gt_session=resident'?{...admin,account:{...admin.account,role:'resident'}}:admin});
 }}),interpretImpl:async()=>{modelCalls++;return {task:'unpaid'};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.deepEqual(await (await fetch(base+'/health')).json(),{mode:'owner-advisor-demo',authRequired:true});
  for(const cookie of ['', 'gt_session=resident'])for(const path of ['/','/app.js','/style.css','/demo/status','/demo/interpret','/demo/answer']){
   const response=await fetch(base+path,{method:path==='/demo/interpret'||path==='/demo/answer'?'POST':'GET',headers:{Cookie:cookie,role:'admin','x-owner-id':'2'}});
   assert.equal(response.status,cookie?403:401,path);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(modelCalls,0);
  assert.equal((await fetch(base+'/',{headers:{Cookie:'gt_session=admin'}})).status,200);
  assert.equal((await fetch(base+'/demo/answer',{method:'POST',headers:{Cookie:'gt_session=admin','Content-Type':'application/json'},body:JSON.stringify({task:'unpaid',period:'2026-10',room:'',confirmed:true})})).status,200);
  revoked=true;
  assert.equal((await fetch(base+'/demo/status',{headers:{Cookie:'gt_session=admin'}})).status,401);
 }finally{server.close();server.closeAllConnections();await once(server,'close');}
});
