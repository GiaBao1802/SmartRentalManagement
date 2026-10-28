import test from 'node:test';
import assert from 'node:assert/strict';
import {dataset,datasetInventory} from './dataset.mjs';
import {recommend} from './engine.mjs';
import {createAdvisorFlow} from './flow.mjs';
import {createDemoServer} from './server.mjs';
import {once} from 'node:events';
const base={budget:20000000,destination:'office',mode:'motorbike',maxMinutes:120,people:1,late:false,required:[],priority:'budget',note:''};
const result=(p=base)=>recommend(p,datasetInventory(p),Infinity);
test('dataset adapter uses 300 records, only available rooms and known travel',()=>{
 const r=result();assert.equal(r.inventoryCount,300);assert.equal(r.excluded.unavailable,90);assert.equal(r.excluded.invalid,0);
 assert.equal(r.eligibleCount+Object.values(r.excluded).reduce((a,b)=>a+b,0),300);
 for(const card of r.cards){const source=dataset.rooms.find(x=>x.id===card.id);assert.equal(source.availability.status,'available');assert.equal(card.minutes,source.travel_minutes.office.motorbike);}
});
test('costs use the same consumption assumptions and scale with confirmed people',()=>{
 const a=datasetInventory(base),b=datasetInventory({...base,people:2});
 for(let i=0;i<a.length;i++){
  const pricing=dataset.rooms[i].pricing;
  assert.equal(b[i].total-a[i].total,45*pricing.electricity_per_kwh_vnd+3*pricing.water_per_m3_vnd);
  assert.equal(a[i].total,a[i].rent+a[i].expenses);
 }
 const broken=structuredClone(dataset);broken.rooms[0].pricing.water_per_m3_vnd=null;
 assert.equal(recommend(base,datasetInventory(base,broken),Infinity).excluded.invalid,1);
});
test('late access excludes curfew, notification-only and unknown; pet restrictions remain visible',()=>{
 const r=result({...base,late:true,required:['pets']});assert.ok(r.cards.length);
 for(const card of r.cards){const source=dataset.rooms.find(x=>x.id===card.id);assert.equal(source.access.mode,'24h');assert.equal(source.rules.pets.allowed,true);assert.ok(card.concerns.some(x=>x.startsWith('Thú cưng:')));}
 const all=datasetInventory(base);assert.ok(all.some(c=>c.accessLabel.startsWith('Về trễ báo trước')));assert.ok(all.some(c=>c.accessLabel==='Chưa rõ giờ ra vào'));
});
test('batched model sees every eligible ID, returns only eligible rooms, compares global pool',async()=>{
 const r=result(),seen=new Set(),sizes=[];
 const flow=createAdvisorFlow({fetchImpl:async(url,options)=>{
  const payload=JSON.parse(options.body),data=JSON.parse(payload.messages[1].content);sizes.push(data.candidates.length);
  data.candidates.forEach(c=>seen.add(c.id));
  const cards=data.candidates.slice(-3).map(c=>({id:c.id,focus:'space',tradeoff:'budget'}));
  return Response.json({done_reason:'stop',message:{content:JSON.stringify({cards})}});
 }});
 const answer=await flow.select(r);assert.equal(answer.source,'ollama');assert.equal(answer.reason,'validated_batched');
 assert.equal(seen.size,r.cards.length);assert.ok(sizes.every(n=>n<=24));assert.equal(answer.cards.length,3);
 for(const c of answer.cards){assert.ok(r.cards.some(x=>x.id===c.id));assert.ok(c.tradeoff.includes(String(c.total-Math.min(...r.cards.map(x=>x.total)))));}
});
test('failed later batch falls back to global candidates, never claims complete AI evaluation',async()=>{
 const r=result();let calls=0;
 const flow=createAdvisorFlow({fetchImpl:async(url,options)=>{
  if(++calls===2)throw new Error('outage');
  const data=JSON.parse(JSON.parse(options.body).messages[1].content);
  return Response.json({done_reason:'stop',message:{content:JSON.stringify({cards:data.candidates.slice(0,3).map(c=>({id:c.id,focus:'space',tradeoff:'budget'}))})}});
 }});
 const answer=await flow.select(r);assert.equal(answer.source,'rules');assert.deepEqual(answer.cards.map(c=>c.id),r.cards.slice(0,3).map(c=>c.id));assert.equal(calls,2);
});

test('dataset HTTP uses server catalog after confirmation and accepts five occupants',async()=>{
 const server=createDemoServer({inventoryFor:datasetInventory,datasetMode:true});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(url)).text(),/note-number">300/);
  const status=await (await fetch(url+'/demo/status')).json();
  assert.deepEqual(status,{mode:'json-demo',dataset_id:'goctro-room-ai-300-v1',rooms:300,properties:60,database:false});
  const catalog=await (await fetch(url+'/demo/rooms')).json();
  assert.equal(catalog.synthetic,true);assert.equal(catalog.data.length,300);
  assert.ok(catalog.data.every(room=>room.synthetic===true));
  const preferences={...base,people:5};
  const response=await fetch(url+'/demo/candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,preferences})});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.inventoryCount,300);assert.deepEqual(body.cards,[]);
  const eligible=result(preferences);assert.ok(eligible.cards.length);assert.ok(eligible.cards.every(c=>c.capacity>=5));assert.equal(body.eligibleCount,eligible.eligibleCount);
 }finally{server.close();server.closeAllConnections();await once(server,'close');}
});

test('batch cancellation prevents later groups from calling the model',async()=>{
 let calls=0;const controller=new AbortController();
 const flow=createAdvisorFlow({fetchImpl:async(url,options)=>{
  calls++;controller.abort();const data=JSON.parse(JSON.parse(options.body).messages[1].content);
  return Response.json({done_reason:'stop',message:{content:JSON.stringify({cards:data.candidates.slice(0,3).map(c=>({id:c.id,focus:'space',tradeoff:'budget'}))})}});
 }});
 const answer=await flow.select(result(),{signal:controller.signal});assert.equal(answer.source,'rules');assert.equal(answer.reason,'cancelled');assert.equal(calls,1);
});
