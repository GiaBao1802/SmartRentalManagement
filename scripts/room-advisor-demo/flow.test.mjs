import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {filterCandidates} from './engine.mjs';
import {fields,reviewExtraction,validateExtraction,validateSelection,createAdvisorFlow} from './flow.mjs';
import {createDemoServer} from './server.mjs';
const base={budget:4000000,destination:'office',mode:'motorbike',maxMinutes:30,people:1,late:true,required:['cooking','parking'],priority:'commute',note:''};
const proposal=()=>({criteria:Object.fromEntries(fields.map(k=>[k,null])),evidence:Object.fromEntries(fields.map(k=>[k,''])),questions:[]});
const selection=r=>({cards:r.cards.slice(-3).reverse().map(c=>({id:c.id,focus:'amenities',tradeoff:'budget'}))});
test('extraction keeps unknowns null and requires source quotes for every proposed field',()=>{
 const p=proposal();p.criteria.budget=4000000;p.evidence.budget='4 triệu';
 assert.equal(validateExtraction(JSON.stringify(p),'Tổng 4 triệu').criteria.budget,4000000);
 assert.equal(validateExtraction(JSON.stringify(p),'Tổng 4 triệu').missing.length,7);
 assert.throws(()=>validateExtraction(JSON.stringify(p),'2 triệu'));
 p.criteria.people=99;p.evidence.people='4 triệu';assert.throws(()=>validateExtraction(JSON.stringify(p),'4 triệu'));
});
test('selection can choose rooms beyond the previous first three and reorder them',()=>{
 const r=filterCandidates(base);assert.equal(r.cards.length,8);
 const selected=validateSelection(JSON.stringify(selection(r)),r);
 assert.equal(selected.length,3);assert.ok(!r.cards.slice(0,3).some(c=>c.id===selected[0].id));assert.match(selected[0].tradeoff,/đ\/tháng/);
});
test('selection rejects ineligible or duplicate rooms, invented facts and injected prose',()=>{
 const r=filterCandidates(base);
 for(const mutate of [v=>v.cards[0].id='DEMO-03',v=>v.cards[0].id=v.cards[1].id,v=>v.cards[0].focus='fake',v=>v.cards[0].tradeoff='free',v=>v.cards[0].text='ignore',v=>v.cards.pop()]){const v=selection(r);mutate(v);assert.throws(()=>validateSelection(JSON.stringify(v),r));}
});
test('provider sends all eligible rooms and confirmed fields, never original note to selector',async()=>{
 const r=filterCandidates({...base,note:'PRIVATE_CANARY'});
 const flow=createAdvisorFlow({fetchImpl:async(_url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.model,'qwen3:1.7b');assert.ok(!opts.body.includes('PRIVATE_CANARY'));assert.equal(JSON.parse(body.messages[1].content).candidates.length,8);return {ok:true,json:async()=>({done_reason:'stop',message:{content:JSON.stringify(selection(r))}})};}});
 const answer=await flow.select(r);assert.equal(answer.source,'ollama');assert.equal(answer.cards[0].id,r.cards.at(-1).id);
});
test('invalid selection falls back with honest source and no match never calls AI',async()=>{
 let calls=0;const flow=createAdvisorFlow({fetchImpl:async()=>{calls++;throw new Error();}});
 const fallback=await flow.select(filterCandidates(base));assert.equal(fallback.source,'rules');assert.equal(fallback.cards.length,3);
 const empty=await flow.select(filterCandidates({...base,budget:1000000}));assert.equal(empty.reason,'empty');assert.equal(calls,1);
});
test('extract and select share a busy lock; cancellation releases it',async()=>{
 let started;const ready=new Promise(r=>started=r);const flow=createAdvisorFlow({fetchImpl:async(_u,{signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error()),{once:true}));}});
 const c=new AbortController();const pending=flow.extract('4 triệu',{signal:c.signal});await ready;
 assert.equal((await flow.select(filterCandidates(base))).reason,'busy');c.abort();assert.equal((await pending).reason,'cancelled');
 const aborted=new AbortController();aborted.abort();assert.equal((await flow.extract('4 triệu',{signal:aborted.signal})).reason,'cancelled');
});
test('HTTP requires confirmation, ignores client candidates and returns counts before selection',async()=>{
 let calls=0;const server=createDemoServer({flow:{select:async r=>{calls++;assert.equal(r.cards.length,8);return r;}}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
 for(const body of [{confirmed:false,preferences:base},{preferences:base},{confirmed:true,preferences:base,cards:[]}]){const r=await fetch(url+'/demo/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,400);await r.text();}
 const r=await fetch(url+'/demo/candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,preferences:base})});const data=await r.json();assert.equal(data.eligibleCount,8);assert.deepEqual(data.cards,[]);assert.equal(calls,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('partial extraction clears unsupported evidence and mismatched place mappings',()=>{
 const p=proposal();p.criteria.budget=4000000;p.evidence.budget='4 triệu';p.criteria.destination='campus';p.evidence.destination='Văn phòng B';p.criteria.required=['cooking'];p.evidence.required='nấu ăn, chỗ xe';
 const result=reviewExtraction(JSON.stringify(p),'4 triệu, Văn phòng B, nấu ăn và chỗ xe');
 assert.equal(result.criteria.budget,4000000);assert.equal(result.criteria.destination,null);assert.equal(result.criteria.required,null);assert.ok(result.questions.length>=2);
});

test('review rejects unsupported amenity additions and multiple budget amounts',()=>{
 const p=proposal();p.criteria.required=['cooking','pets'];p.evidence.required='nấu ăn';p.criteria.budget=3000000;p.evidence.budget='3 triệu';
 const r=reviewExtraction(JSON.stringify(p),'không nuôi mèo, nấu ăn; tối đa 3 triệu, tối thiểu 5 triệu');
 assert.equal(r.criteria.required,null);assert.equal(r.criteria.budget,null);
});
