import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('app.js',import.meta.url),'utf8');
const base={budget:4000000,destination:'office',mode:'motorbike',maxMinutes:30,people:1,late:true,required:['cooking','parking'],priority:'commute',note:''};
function setup(fetchImpl){
 const nodes=new Map();const node=id=>{if(!nodes.has(id)){const handlers=new Map();nodes.set(id,{id,checked:false,value:'',textContent:'',innerHTML:'',disabled:false,addEventListener:(n,f)=>handlers.set(n,f),dispatch:(n,e={})=>handlers.get(n)?.({preventDefault(){},...e}),replaceChildren(){this.innerHTML='';}});}return nodes.get(id);};
 const form=node('preferences');form.values={...base};form.elements={namedItem:node};form.querySelectorAll=()=>['cooking','parking','pets','ac'].map(k=>{const n=node(k);n.value=k;return n;});
 vm.runInNewContext(source,{document:{getElementById:node,querySelectorAll:()=>[]},FormData:class{constructor(f){this.v=f.values;}get(k){return String(this.v[k]);}has(k){return Boolean(this.v[k]);}getAll(k){return this.v[k];}},fetch:fetchImpl,Intl,AbortController,AbortSignal});
 return {node,form,submit:()=>form.dispatch('submit'),input:()=>form.dispatch('input',{target:node('budget')}),extract:()=>node('extract').dispatch('click')};
}
const response=v=>({ok:true,json:async()=>v});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('confirmation is required before any filtering or AI selection',async()=>{let calls=0;const ui=setup(async()=>{calls++;});await ui.submit();assert.equal(calls,0);assert.match(ui.node('status').textContent,/xác nhận/);});
test('filter stage shows count but no preselected rooms before AI responds',async()=>{
 const delayed=deferred();let started;const ready=new Promise(r=>started=r);
 const ui=setup(async path=>{if(path==='/demo/candidates')return response({eligibleCount:8,inventoryCount:18,cards:[]});started();return delayed.promise;});
 ui.node('confirmed').checked=true;const pending=ui.submit();await ready;
 assert.equal(ui.node('cards').innerHTML,'');assert.match(ui.node('status').textContent,/8 phòng/);
 ui.input();delayed.resolve(response({message:'STALE',cards:[]}));await pending;
 assert.equal(ui.node('confirmed').checked,false);assert.ok(!ui.node('status').textContent.includes('STALE'));
});
test('editing criteria cancels pending extraction and discards stale proposal',async()=>{
 const delayed=deferred();let signal;
 const ui=setup(async(_p,o)=>{signal=o.signal;return delayed.promise;});ui.node('note').value='4 triệu';
 const pending=ui.extract();ui.input();assert.ok(signal.aborted);
 delayed.resolve(response({source:'ollama',proposal:{criteria:{budget:9000000},missing:[],evidence:{budget:'4 triệu'},questions:[]}}));await pending;
 assert.notEqual(ui.node('budget').value,'9000000');assert.equal(ui.node('confirmed').checked,false);
});
test('AI request network failure cannot label old cards as new results',async()=>{
 const ui=setup(async path=>{if(path==='/demo/candidates')return response({eligibleCount:8,inventoryCount:18,cards:[]});throw new Error('offline');});
 ui.node('cards').innerHTML='OLD';ui.node('confirmed').checked=true;await ui.submit();
 assert.equal(ui.node('cards').innerHTML,'');assert.match(ui.node('ai-source').textContent,/Chưa có/);assert.equal(ui.node('find').disabled,false);
});

test('partial extraction clears stale criteria and amenities before confirmation',async()=>{
 const ui=setup(async()=>response({source:'ollama',proposal:{criteria:{budget:null,destination:null,mode:null,maxMinutes:null,people:2,late:null,required:['cooking'],priority:null},evidence:{people:'2 người',required:'nấu ăn'},missing:['budget','destination','mode','maxMinutes','late','priority'],questions:[]}}));
 ui.node('note').value='2 người, nấu ăn';ui.node('budget').value='4000000';ui.node('pets').checked=true;ui.node('late').checked=true;ui.node('confirmed').checked=true;
 await ui.extract();assert.equal(ui.node('budget').value,'');assert.equal(ui.node('destination').value,'');assert.equal(ui.node('pets').checked,false);assert.equal(ui.node('cooking').checked,true);assert.equal(ui.node('late').checked,false);assert.equal(ui.node('confirmed').checked,false);assert.equal(ui.node('people').value,'2');
});
