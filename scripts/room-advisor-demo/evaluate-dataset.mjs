import {datasetInventory} from './dataset.mjs';
import {recommend} from './engine.mjs';
import {createAdvisorFlow} from './flow.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const base={budget:4000000,destination:'office',mode:'motorbike',maxMinutes:30,people:1,late:true,required:['cooking','parking'],priority:'commute',note:''};
const cases=[{id:'night',preferences:base},{id:'broad-budget',preferences:{...base,budget:5000000,late:false,maxMinutes:60,required:[],priority:'budget'}},{id:'pets-two-people',preferences:{...base,budget:5000000,people:2,required:['pets','cooking'],priority:'space'}}];
const flow=createAdvisorFlow(),results=[];
for(const c of cases){
 const filtered=recommend(c.preferences,datasetInventory(c.preferences),Infinity),answer=await flow.select(filtered);
 const pass=answer.source==='ollama'&&answer.cards.length===Math.min(3,filtered.eligibleCount)&&answer.cards.every(card=>filtered.cards.some(x=>x.id===card.id));
 results.push({...c,eligible:filtered.eligibleCount,pass,answer});console.log(JSON.stringify({id:c.id,eligible:filtered.eligibleCount,pass,source:answer.source,calls:answer.batchCalls??1,ms:answer.elapsedMs,ids:answer.cards.map(c=>c.id)}));
}
const dir=new URL('../../.local/room-advisor/',import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(`dataset-${Date.now()}.json`,dir);await writeFile(file,JSON.stringify({scope:'synthetic selection validity, not optimal ranking or natural language accuracy',results},null,2));console.log(file.pathname);
