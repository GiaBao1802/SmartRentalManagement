import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { rooms } from './catalog.mjs';
import { recommend, validatePreferences } from './engine.mjs';
import { createOllamaProvider, validateNarration } from './provider.mjs';
import { createDemoServer } from './server.mjs';

const base = { budget:4000000,destination:'office',mode:'motorbike',maxMinutes:30,people:1,late:true,required:['cooking','parking'],priority:'commute',note:'' };
const result = () => recommend(base);
const valid = r => JSON.stringify({cards:r.cards.map(c=>({id:c.id,factIds:['travel','budget','hours']}))});
test('18 fixtures, unique identities; expenses count towards budget',() => {
  assert.equal(rooms.length,18); assert.equal(new Set(rooms.map(r=>r.id)).size,18);
  const r = result(); assert.equal(r.cards[0].id,'DEMO-07');
  assert.ok(!r.cards.some(c=>c.id==='DEMO-03' || c.id==='DEMO-11'));
  assert.equal(r.eligibleCount + Object.values(r.excluded).reduce((a,b)=>a+b,0),18);
});
test('hard conditions hold across budget / route / occupancy / amenity combinations',() => {
  for (const budget of [3000000,4000000,5000000]) for(const mode of ['bus','motorbike']) for(const people of [1,3]) {
    const p = {...base,budget,mode,people,required:['cooking','pets']};
    const r = recommend(p);
    for(const c of r.cards) {
      assert.ok(c.available && c.total<=budget && c.capacity>=people && c.late);
      assert.ok(p.required.every(f=>c.features.includes(f)));
      assert.ok(c.minutes!==null && c.minutes<=p.maxMinutes);
    }
  }
});
test('23h curfew and occupied cheap room are excluded',() => {
  assert.equal(recommend(base,[rooms[0]]).cards.length,0);
  assert.equal(recommend(base,[rooms[16]]).cards.length,0);
});
test('exact total budget boundary inclusive; one VND less excludes',() => {
  assert.equal(recommend({...base,budget:3800000},[rooms[1]]).cards.length,1);
  assert.equal(recommend({...base,budget:3799999},[rooms[1]]).cards.length,0);
});
test('unknown travel is not fabricated or treated as zero',() => {
  const r = recommend({...base,destination:'campus'},[rooms[15]]);
  assert.equal(r.cards.length,0); assert.equal(r.excluded.unknown,1);
});
test('transport changes eligibility',() => {
  assert.equal(recommend({...base,maxMinutes:20},[rooms[1]]).cards.length,1);
  assert.equal(recommend({...base,maxMinutes:20,mode:'bus'},[rooms[1]]).cards.length,0);
});
test('no match does not silently relax constraints',() => {
  assert.equal(recommend({...base,budget:1000000}).cards.length,0);
});
test('priority changes ranking without changing eligible count',() => {
  const cheap = recommend({...base,priority:'budget'});
  assert.notEqual(cheap.cards[0].id,result().cards[0].id);
  assert.equal(cheap.eligibleCount,result().eligibleCount);
  assert.deepEqual(recommend(base),recommend(base));
});
test('reject malformed input and extra client-selected data',() => {
  for(const change of [{budget:'4000000'},{budget:NaN},{maxMinutes:-1},{people:6},{late:'true'},{required:['unknown']},{destination:'__proto__'},{mode:'walk'},{note:'x'.repeat(501)},{cards:[]}]) {
    assert.throws(()=>validatePreferences({...base,...change}));
  }
});
test('validated model composition renders only known facts',() => {
  const r = result(); const cards = validateNarration(valid(r),r);
  assert.equal(cards[0].text,[r.cards[0].facts[1].text,r.cards[0].facts[0].text,r.cards[0].facts[2].text].join(' '));
});
test('reject fabricated IDs, facts, prose, reorder, omissions and duplicates',() => {
  const r = result();
  for(const mutate of [
    v=>v.cards[0].id='DEMO-03', v=>v.cards.reverse(), v=>v.cards.pop(),
    v=>v.cards[0].factIds=['budget','travel','safe'], v=>v.cards[0].factIds=['budget','budget','travel'],
    v=>v.cards[0].factIds=['hours','space','amenities'], v=>v.cards[0].text='Chắc chắn an toàn',
  ]) { const data=JSON.parse(valid(r)); mutate(data); assert.throws(()=>validateNarration(JSON.stringify(data),r)); }
});
test('provider success uses only selected trusted sentences',async () => {
  const r = result(); let sent;
  const provider = createOllamaProvider({fetchImpl:async (url,options)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/chat'); sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({done_reason:'stop',message:{content:valid(r)}})};
  }});
  const answer = await provider.explain(r);
  assert.equal(answer.source,'ollama'); assert.equal(sent.think,false);
  assert.ok(!JSON.stringify(sent).includes('personal note'));
});
test('provider outage and malformed/unfinished responses fall back',async () => {
  for(const response of [null,{ok:false},{ok:true,json:async()=>({done_reason:'length'})},{ok:true,json:async()=>({done_reason:'stop',message:{content:'{}'}})}]) {
    const provider=createOllamaProvider({fetchImpl:async()=>{if(!response)throw new Error('offline');return response;}});
    const answer=await provider.explain(result()); assert.equal(answer.source,'rules');
    assert.equal(answer.cards[0].text,result().cards[0].explanation);
  }
});
test('empty results never call model',async () => {
  const p=createOllamaProvider({fetchImpl:()=>{throw new Error('Must not call');}});
  const answer=await p.explain(recommend({...base,budget:1000000}));assert.deepEqual(answer.cards,[]);
});
test('provider timeout releases busy lock and concurrent request falls back',async () => {
  const p=createOllamaProvider({timeoutMs:20,fetchImpl:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))});
  const timer=setTimeout(()=>{},1000); // Keep the test alive for AbortSignal's unref timer.
  try {
    const first=p.explain(result()); const second=await p.explain(result());
    assert.match(second.message,/yêu cầu khác/); assert.equal((await first).source,'rules');
    assert.doesNotMatch((await p.explain(result())).message,/yêu cầu khác/);
  } finally {clearTimeout(timer);}
});
test('HTTP demo serves UI and rejects malformed, foreign-origin, forged data',async () => {
  const server=createDemoServer({provider:{explain:async r=>({source:'rules',cards:r.cards.map(c=>({id:c.id,text:c.explanation}))})}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try {
    const html=await fetch(url); assert.equal(html.status,200);assert.match(await html.text(),/giả lập/);
    assert.equal((await fetch(url+'/app.js')).status,200);
    const good=await post('/demo/recommend',base);assert.equal(good.status,200);assert.equal((await good.json()).cards[0].id,'DEMO-07');
    assert.equal((await post('/demo/recommend',{...base,budget:-1})).status,400);
    assert.equal((await post('/demo/explain',{...base,cards:[{id:'fake'}]})).status,400);
    assert.equal((await post('/demo/recommend',base,{Origin:'https://example.com'})).status,403);
    const foreignHost = await new Promise((resolve,reject) => {
      const req = request(url,{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject); req.end();
    });
    assert.equal(foreignHost,403);
    assert.equal((await post('/demo/recommend',{...base,note:'a'.repeat(9000)})).status,413);
    assert.equal((await post('/demo/explain',base)).status,200);
    assert.equal((await fetch(url+'/demo/recommend')).status,404);
    assert.equal((await fetch(url+'/package.json')).status,404);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
