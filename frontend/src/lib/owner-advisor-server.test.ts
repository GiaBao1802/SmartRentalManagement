import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOwnerAdvisor} from './owner-advisor-server';
import {OWNER_ADVISOR_ENDPOINT} from './owner-advisor-endpoint';
import {readFileSync,existsSync} from 'node:fs';
import {createRequestDemo} from './owner-request-demo';
const url='http://localhost:3000'+OWNER_ADVISOR_ENDPOINT;
const request=(cookie='',body?:object,origin='http://localhost:3000')=>new Request(url,{method:body?'POST':'GET',headers:{Host:'localhost:3000',Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const mockAuth:typeof fetch=async(_url,options)=>{
 const cookie=(options?.headers as Record<string,string>).Cookie;
 if(cookie==='gt_session=revoked')return new Response('',{status:401});
 const other=cookie==='gt_session=other';
 return Response.json({data:{account:{account_id:other?'4':'1',role:cookie==='gt_session=resident'?'resident':'admin',status:'active'},profile:{owner_id:other?'2':'1'}}});
};
const options={mode:'development' as const,fetchImpl:mockAuth,source:'fixture'};
test('Cloudy endpoint matches actual backend session-cookie Path',()=>{
 const source=readFileSync(new URL('../../../backend/src/auth/auth.routes.ts',import.meta.url),'utf8');
 const path=source.match(/Path=(\/api\/v1)/)?.[1];assert.ok(path);assert.ok(OWNER_ADVISOR_ENDPOINT.startsWith(path+'/'));
 assert.ok(existsSync(new URL('../app'+OWNER_ADVISOR_ENDPOINT+'/route.ts',import.meta.url)));
 assert.equal('/api/cloudy/owner'.startsWith(path+'/'),false);
});
test('owner route requires real auth verification and stays off in production',async()=>{
 assert.equal((await handleOwnerAdvisor(request(),options)).status,401);
 assert.equal((await handleOwnerAdvisor(request('gt_session=resident'),options)).status,403);
 assert.equal((await handleOwnerAdvisor(request('gt_session=revoked'),options)).status,401);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin'),{...options,mode:'production'})).status,404);
});
test('request demo scopes owner/account and records valid transitions with revision checks',()=>{
 const store=createRequestDemo();assert.equal(store.list('1','1','2026-10','').length,20);assert.deepEqual(store.list('2','4','2026-10',''),[]);assert.deepEqual(store.list('1','4','2026-10',''),[]);
 const service=store.list('1','1','2026-10','')[0];
 const input={requestId:service.id,action:'approve',revision:0,reason:'Đồng ý thử nghiệm',confirmed:true};
 assert.throws(()=>store.decide('2','4',input),{status:404});assert.throws(()=>store.decide('1','1',{...input,confirmed:false}),{status:400});assert.throws(()=>store.decide('1','1',{...input,reason:' '}),{status:400});
 store.decide('1','1',input);assert.throws(()=>store.decide('1','1',input),{status:409});
 const updated=store.list('1','1','2026-10','')[0];assert.equal(updated.status,'approved');assert.equal(updated.history.length,1);assert.deepEqual(updated.actions,[]);
 const complaint=store.list('1','1','2026-10','')[1];
 assert.throws(()=>store.decide('1','1',{...input,requestId:complaint.id,action:'resolve'}),{status:409});
 for(const [revision,action] of ['receive','resolve','reopen'].entries())store.decide('1','1',{...input,requestId:complaint.id,revision,action});
 assert.equal(store.list('1','1','2026-10','')[1].history.length,3);
 assert.equal(createRequestDemo().list('1','1','2026-10','')[0].status,'pending');
});
test('request HTTP list/decision cannot bypass confirmation or inject owner; routing never executes a decision',async()=>{
 const body={task:'requests',period:'2026-10',room:'',confirmed:true};
 const list=await (await handleOwnerAdvisor(request('gt_session=admin',body),options)).json();assert.equal(list.requests.length,20);
 const other=await (await handleOwnerAdvisor(request('gt_session=other',body),options)).json();assert.equal(other.requests.length,0);
 const proposal=await (await handleOwnerAdvisor(request('gt_session=admin',{question:'Duyệt yêu cầu tiện ích'}),options)).json();assert.equal(proposal.task,'requests');assert.equal(proposal.reviewRequired,true);
 const action={requestId:'SYN-REQ-003',action:'reject',revision:0,reason:'Thử nghiệm',confirmed:true};
 assert.equal((await handleOwnerAdvisor(request('gt_session=other',action),options)).status,404);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin',{...action,ownerId:'1'}),options)).status,400);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin',action),options)).status,200);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin',action),options)).status,409);
});
test('integrated Cloudy returns 100 rooms and scoped invoices only for assigned owner',async()=>{
 for(const [cookie,count] of [['gt_session=admin',100],['gt_session=other',0]] as const){
  const response=await handleOwnerAdvisor(request(cookie),options);assert.equal(response.status,200);const data=await response.json();assert.equal(data.rooms.length,count);assert.equal(response.headers.get('cache-control'),'no-store');
  const result=await (await handleOwnerAdvisor(request(cookie,{task:'unpaid',period:'2026-10',room:'',confirmed:true}),options)).json();assert.equal(result.cards.length,count?45:0);
 }
});
test('interpretation proposes task; confirmed read rejects forged scope and foreign origin',async()=>{
 const interpreted=await handleOwnerAdvisor(request('gt_session=admin',{question:'chưa đóng tiền'}),{...options,interpretImpl:async()=>({task:'unpaid',reviewRequired:true,model:'qwen3:1.7b',message:'Xác nhận phạm vi'})});
 assert.equal((await interpreted.json()).task,'unpaid');
 const query={task:'unpaid',period:'2026-10',room:'',confirmed:true};
 for(const body of [{...query,confirmed:false},{...query,ownerId:'1'},{...query,role:'admin'}])assert.equal((await handleOwnerAdvisor(request('gt_session=admin',body),options)).status,400);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin',query,'https://foreign.test'),options)).status,403);
 assert.equal((await handleOwnerAdvisor(request('gt_session=admin',{question:'x'.repeat(5000)}),options)).status,413);
});
