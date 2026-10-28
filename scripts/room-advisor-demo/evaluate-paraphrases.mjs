import {createAdvisorFlow} from './flow.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {round2Cases} from './paraphrases-round2.mjs';
import {round3Cases} from './paraphrases-round3.mjs';
const blank={budget:null,destination:null,mode:null,maxMinutes:null,people:null,late:null,priority:null,required:null};
const round=process.argv.includes('--round=3')?3:process.argv.includes('--round=2')?2:1;
const cases=round===3?round3Cases:round===2?round2Cases:[
 {id:'unaccented',note:'Toi o 2 nguoi, tong 3,5 trieu, toi Van phong B bang xe buyt trong 40 phut, khong ve khuya, can bep, uu tien gia re.',expected:{budget:3500000,destination:'office',mode:'bus',maxMinutes:40,people:2,late:false,priority:'budget',required:['cooking']}},
 {id:'negative-after',note:'Máy lạnh không cần, nuôi mèo thì không, chỉ cần nấu ăn. Tổng 3 triệu, ở 1 người.',expected:{budget:3000000,people:1,required:['cooking']}},
 {id:'two-destinations',note:'Mình cần đến cả Trường A và Văn phòng B mỗi ngày, đi xe máy tối đa 25 phút, ngân sách tổng 4 triệu.',expected:{budget:4000000,destination:null,mode:'motorbike',maxMinutes:25}},
 {id:'per-person',note:'Bọn mình ở 2 người, mỗi người trả được 2 triệu, có mèo nên phải được nuôi thú cưng.',expected:{people:2,budget:null,required:['pets']}},
 {id:'optional',note:'Tổng 4 triệu, 1 người, tới Khu công nghệ C bằng xe máy tối đa 20 phút, ưu tiên diện tích rộng. Máy lạnh có cũng được, cần chỗ gửi xe.',expected:{budget:4000000,people:1,destination:'tech',mode:'motorbike',maxMinutes:20,priority:'space',required:['parking']}},
 {id:'changed-budget',note:'Ban đầu mình tính 3 triệu, giờ có thể 4 triệu tổng mỗi tháng. Không nuôi mèo nữa, cần nấu ăn.',expected:{budget:null,required:['cooking']}},
];
let observed;const flow=createAdvisorFlow({fetchImpl:async(...args)=>{const r=await fetch(...args);observed=await r.clone().json();return r;}});
const requested=process.argv.find(x=>x.startsWith('--case='))?.slice(7);if(requested&&!cases.some(x=>x.id===requested))throw new Error('Unknown case');
const stamp=Date.now(),sourceHashes=Object.fromEntries(await Promise.all(['extraction.mjs','numbers.mjs','flow.mjs','paraphrases-round2.mjs','paraphrases-round3.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')])));
const results=[];
for(const c of cases.filter(c=>!requested||c.id===requested)){
 observed=null;const result=await flow.extract(c.note);const expected={...blank,...c.expected};const actual=result.proposal?.criteria;
 const failures=Object.entries(expected).filter(([key,value])=>JSON.stringify(actual?.[key])!==JSON.stringify(value)).map(([field,expected])=>({field,expected,actual:actual?.[field]}));
 const pass=result.source==='ollama'&&!failures.length;
 results.push({...c,expected,result,observed,pass,failures});console.log(JSON.stringify({id:c.id,pass,elapsedMs:result.elapsedMs,failures,criteria:actual}));
}
const dir=new URL('../../.local/room-advisor/',import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(`paraphrases-${stamp}.json`,dir);await writeFile(file,JSON.stringify({model:'qwen3:1.7b',round,sourceHashes,scope:'first run unseen; after changes these become regression cases',results},null,2));console.log(file.pathname);
