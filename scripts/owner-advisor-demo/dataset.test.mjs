import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {dataset,scopeDataset} from './dataset.mjs';
import {answer} from './engine.mjs';
import {createOwnerServer} from './server.mjs';
const identity={ownerId:'1',accountId:'1',role:'admin'};
test('100 unique rooms, 5 properties, 160 linked invoices; empty rooms have no debt',()=>{
 assert.equal(dataset.rooms.length,100);assert.equal(new Set(dataset.rooms.map(r=>r.id)).size,100);assert.equal(new Set(dataset.rooms.map(r=>r.code)).size,100);assert.equal(new Set(dataset.rooms.map(r=>r.propertyId)).size,5);
 assert.equal(dataset.invoices.length,160);assert.equal(new Set(dataset.invoices.map(r=>r.id)).size,160);
 for(const invoice of dataset.invoices){const room=dataset.rooms.find(r=>r.id===invoice.roomId);assert.equal(room.status,'occupied');assert.equal(invoice.ownerId,'1');assert.equal(invoice.propertyId,room.propertyId);assert.equal(invoice.room,room.code);}
 assert.equal(dataset.rooms.filter(r=>r.status==='available').length,10);assert.equal(dataset.rooms.filter(r=>r.status==='inactive').length,10);
});
test('saved amounts, tier quantities, meter continuity and five-day due dates are consistent',()=>{
 for(const invoice of dataset.invoices){
  if(invoice.status==='draft'){assert.equal(invoice.total,null);assert.equal(invoice.finalizedAt,null);assert.ok(invoice.missing.length);continue;}
  assert.equal(invoice.total,invoice.items.reduce((n,x)=>n+x.amount,0));assert.equal((Date.parse(invoice.dueDate)-Date.parse(invoice.finalizedAt))/86400000,5);
  for(const item of invoice.items.filter(x=>x.segments)){assert.equal(item.closing-item.opening,item.segments.reduce((n,x)=>n+x.quantity,0));assert.equal(item.amount,item.segments.reduce((n,x)=>n+x.quantity*x.rate,0));for(const segment of item.segments)assert.equal(segment.amount,segment.quantity*segment.rate);
   if(invoice.period==='2026-10'){const previous=dataset.invoices.find(x=>x.roomId===invoice.roomId&&x.period==='2026-09').items.find(x=>x.kind===item.kind);assert.equal(item.opening,previous.closing);}
  }
 }
 const {session,invoices}=scopeDataset(identity);const r=answer({task:'unpaid',period:'2026-10',room:''},session,invoices);
 assert.equal(r.cards.length,45);for(const status of ['Quá hạn','Đến hạn hôm nay','Chưa đến hạn'])assert.equal(r.cards.filter(r=>r.status===status).length,15);
 assert.equal(answer({task:'missing',period:'2026-10',room:''},session,invoices).cards.length,15);
 assert.equal(answer({task:'unpaid',period:'2026-10',room:'K1-P17'},session,invoices).cards.length,0);
});
test('dataset scope denies another owner, another account and Resident',()=>{
 for(const who of [{...identity,ownerId:'2'},{...identity,accountId:'4'},{...identity,role:'resident'}]){const scoped=scopeDataset(who);assert.deepEqual(scoped.rooms,[]);assert.deepEqual(scoped.invoices,[]);}
});
test('HTTP status and answers use authenticated dataset scope, never shared fixtures',async()=>{
 const server=createOwnerServer({authorize:async req=>req.headers.cookie==='test=owner1'?identity:{ownerId:'2',accountId:'4',role:'admin'}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const [cookie,count,cards] of [['test=owner1',100,45],['test=owner2',0,0]]){
   const status=await (await fetch(url+'/demo/status',{headers:{Cookie:cookie}})).json();assert.equal(status.roomCount,count);assert.equal(status.rooms.length,count);
   const response=await fetch(url+'/demo/answer',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,task:'unpaid',period:'2026-10',room:''})});assert.equal(response.status,200);assert.equal((await response.json()).cards.length,cards);
  }
 }finally{server.close();server.closeAllConnections();await once(server,'close');}
});
