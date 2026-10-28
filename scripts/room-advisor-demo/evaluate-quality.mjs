import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAdvisorFlow} from './flow.mjs';
import {datasetInventory} from './dataset.mjs';
import {recommend} from './engine.mjs';
// Fixed before inference. These are new authored cases, not generated QA pairs.
const cases=[
 {id:'bus-two',note:'Mình ở 2 người; tổng ngân sách 4,5 triệu; tới Trường A bằng xe buýt tối đa 35 phút; không về khuya; cần nấu ăn và máy lạnh; ưu tiên tiết kiệm.',expected:{budget:4500000,destination:'campus',mode:'bus',maxMinutes:35,people:2,late:false,priority:'budget',required:['cooking','ac']}},
 {id:'five-people',note:'Nhóm ở 5 người, ngân sách tổng 6 triệu, đến Khu công nghệ C bằng xe máy trong 30 phút, không về khuya, cần nấu ăn và chỗ để xe, ưu tiên diện tích rộng.',expected:{budget:6000000,destination:'tech',mode:'motorbike',maxMinutes:30,people:5,late:false,priority:'space',required:['cooking','parking']}},
 {id:'spelled-numbers',note:'Hai người ở, tổng ba triệu rưỡi mỗi tháng, tới Văn phòng B bằng xe máy trong hai mươi lăm phút, không về khuya, cần bếp, ưu tiên giá rẻ.',expected:{budget:3500000,destination:'office',mode:'motorbike',maxMinutes:25,people:2,late:false,priority:'budget',required:['cooking']}},
 {id:'shared-negation',note:'Tổng 4 triệu, ở 1 người, đến Văn phòng B bằng xe máy tối đa 20 phút, không về khuya. Không cần máy lạnh và bếp. Ưu tiên đi gần.',expected:{budget:4000000,destination:'office',mode:'motorbike',maxMinutes:20,people:1,late:false,priority:'commute',required:null}},
];
const equal=(a,b)=>JSON.stringify(Array.isArray(a)?[...a].sort():a)===JSON.stringify(Array.isArray(b)?[...b].sort():b);
function ranking(preferences,answer){
 const pool=recommend(preferences,datasetInventory(preferences),Infinity).cards;
 const key={budget:'total',commute:'minutes',space:'area'}[preferences.priority];
 const selected=answer.cards??[],best=pool.slice(0,3);
 const valid=answer.source==='ollama'&&selected.length===Math.min(3,pool.length)&&new Set(selected.map(c=>c.id)).size===selected.length&&selected.every(c=>pool.some(x=>x.id===c.id));
 // Compare primary values, allowing ties on IDs. Code ordering is only an audit oracle.
 const actual=selected.map(c=>pool.find(x=>x.id===c.id)?.[key]),optimal=best.map(c=>c[key]);
 return {eligible:pool.length,key,valid,primaryOptimal:valid&&equal(actual,optimal),orderedPrimaryOptimal:valid&&JSON.stringify(actual)===JSON.stringify(optimal),actual,optimal,
  gaps:actual.map((v,i)=>key==='area'?optimal[i]-v:v-optimal[i]),selectedIds:selected.map(c=>c.id),referenceIds:best.map(c=>c.id)};
}
const hashes=Object.fromEntries(await Promise.all(['flow.mjs','extraction.mjs','numbers.mjs','engine.mjs','dataset.mjs','evaluate-quality.mjs','../../data/room-ai/v1/rooms.json'].map(async name=>[name,createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')])));
const dir=new URL('../../.local/room-advisor/',import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(`quality-${Date.now()}.json`,dir);
const report={scope:'fresh authored extraction; primary-priority ranking with tie handling; no runtime changes or training',hashes,cases,priorRanking:[],fresh:[]};
const replayPath=process.argv.find(arg=>arg.startsWith('--replay='))?.slice(9);
let old;
try{old=JSON.parse(await readFile(replayPath??new URL('dataset-1793087921048.json',dir),'utf8'));}
catch(error){if(replayPath||error.code!=='ENOENT')throw error;report.replaySkipped='Historical local evidence not present; fresh evaluation still runs.';}
for(const c of old?.results??[]){const score=ranking(c.preferences,c.answer);report.priorRanking.push({id:c.id,...score,elapsedMs:c.answer.elapsedMs});console.log(JSON.stringify({stage:'replay-ranking',id:c.id,...score}));}
await writeFile(file,JSON.stringify(report,null,2));
let raw;const flow=createAdvisorFlow({fetchImpl:async(...args)=>{const response=await fetch(...args);raw=await response.clone().json();return response;}});
for(const c of cases){
 raw=null;const extraction=await flow.extract(c.note),actual=extraction.proposal?.criteria;
 const failures=extraction.source==='ollama'?Object.entries(c.expected).filter(([k,v])=>!equal(actual?.[k],v)).map(([field,expected])=>({field,expected,actual:actual?.[field],kind:actual?.[field]==null?'omission':expected===null?'unsupported_addition':'wrong_value'})):[];
 const row={id:c.id,extraction,raw,pass:extraction.source==='ollama'&&failures.length===0,serviceFailure:extraction.source==='ollama'?null:extraction.reason,failures};report.fresh.push(row);
 console.log(JSON.stringify({stage:'extract',id:c.id,pass:row.pass,ms:extraction.elapsedMs,failures}));await writeFile(file,JSON.stringify(report,null,2));
 // Explicit fixture-confirmed values; do not silently approve inferred or missing fields.
 if(row.pass && Object.values(c.expected).every(v=>v!==null)){
  const preferences={...c.expected,note:c.note};const pool=recommend(preferences,datasetInventory(preferences),Infinity);
  row.selection=await flow.select(pool);row.ranking=ranking(preferences,row.selection);
  console.log(JSON.stringify({stage:'select',id:c.id,ms:row.selection.elapsedMs,...row.ranking}));await writeFile(file,JSON.stringify(report,null,2));
 }
}
console.log(file.pathname);
