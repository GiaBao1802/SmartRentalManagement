import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {answer,interpret} from './engine.mjs';import {context,invoices} from './data.mjs';import {createOwnerServer} from './server.mjs';
const query={task:'unpaid',period:'2026-10',room:''};
test('unpaid excludes drafts, paid and other owner; due today is not overdue',()=>{
 const r=answer(query);assert.deepEqual(r.cards.map(x=>x.id),['DEMO-I01','DEMO-I02','DEMO-I05']);assert.match(r.summary,/10.215.000/);assert.equal(r.cards[0].status,'Quá hạn');assert.equal(r.cards[1].status,'Đến hạn hôm nay');assert.equal(r.cards[2].status,'Chưa đến hạn');
});
test('scope cannot be supplied by client and resident is denied',()=>{
 assert.throws(()=>answer({...query,ownerId:'DEMO-OWNER-B'}));assert.throws(()=>answer(query,{...context,role:'resident'}));assert.equal(answer({...query,period:'2026-09'}).cards.length,0);assert.equal(answer({...query,room:'A02'}).cards.length,1);
});
test('utility breakdown uses saved tier lines and never prices missing draft readings',()=>{
 const r=answer({...query,task:'utilities',room:'A01'});assert.ok(r.cards[0].details.some(x=>x.includes('1120 − 1000 = 120')));assert.ok(r.cards[0].details.some(x=>x.includes('285.000')));
 const draft=answer({...query,task:'utilities',room:'A04'}).cards[0];assert.equal(draft.total,null);assert.ok(draft.details.some(x=>x.includes('không suy đoán')));
});
test('synthetic finalized amounts match saved lines and immutable snapshot arithmetic',()=>{
 for(const row of invoices.filter(x=>x.finalizedAt)){assert.equal(row.total,row.items.reduce((n,x)=>n+x.amount,0));for(const item of row.items.filter(x=>x.segments)){assert.equal(item.closing-item.opening,item.segments.reduce((n,x)=>n+x.quantity,0));assert.equal(item.amount,item.segments.reduce((n,x)=>n+x.amount,0));for(const segment of item.segments)assert.equal(segment.amount,segment.quantity*segment.rate);}}
 const before=JSON.stringify(invoices);answer({...query,task:'overview'});assert.equal(JSON.stringify(invoices),before);
});
test('missing-data lists only actionable draft blockers',()=>{assert.deepEqual(answer({...query,task:'missing'}).cards.map(x=>x.room),['A04','A06']);});
test('fixture finalization is after period end with five-day due date',()=>{
 for(const row of invoices.filter(r=>r.finalizedAt)){assert.ok(row.finalizedAt>=row.periodEnd);assert.equal((Date.parse(row.dueDate)-Date.parse(row.finalizedAt))/86400000,5);}
});
test('model only classifies allowlisted task, cannot return SQL, amounts or scope',async()=>{
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.model,'qwen3:1.7b');assert.ok(!options.body.includes('DEMO-I01'));return Response.json({done_reason:'stop',message:{content:'{"task":"unpaid"}'}});};
 assert.equal((await interpret('Phòng nào chưa đóng tiền?',{fetchImpl})).task,'unpaid');
 for(const content of ['{"task":"delete"}','{"task":"unpaid","ownerId":"B"}'])await assert.rejects(interpret('x',{fetchImpl:async()=>Response.json({done_reason:'stop',message:{content}})}));
});
test('explicit rental search and mutation requests are routed out without model or writes',async()=>{
 for(const question of ['Tìm phòng giá rẻ','Đánh dấu A01 đã trả','Gửi nhắc tiền A01']){
 const r=await interpret(question,{fetchImpl:()=>{throw new Error('must not call');}});assert.equal(r.task,'clarify');assert.equal(r.source,'scope_guard');
 }
});
test('HTTP confirms scope, rejects foreign origin, writes, oversized and forged owner',async()=>{
 const server=createOwnerServer({authorize:async()=>({role:'admin',ownerId:'1'}),interpretImpl:async()=>({task:'unpaid'})});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
 assert.equal((await (await fetch(url+'/demo/status')).json()).mode,'owner-advisor-demo');
 assert.equal((await post('/demo/answer',{...query,confirmed:true})).status,200);
 assert.equal((await post('/demo/answer',query)).status,400);
 assert.equal((await post('/demo/answer',{...query,confirmed:true,ownerId:'other'})).status,400);
 assert.equal((await post('/demo/answer',{...query,confirmed:true},{Origin:'https://foreign.test'})).status,403);
 assert.equal((await post('/demo/pay',{})).status,404);assert.equal((await post('/demo/interpret',{question:'x'.repeat(5000)})).status,413);
 }finally{server.close();server.closeAllConnections();await once(server,'close');}
});
