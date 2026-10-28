// Numeric view only: never replaces the original text used as evidence or negation.
const units={khong:0,mot:1,hai:2,ba:3,bon:4,nam:5,lam:5,sau:6,bay:7,tam:8,chin:9};
const words='khong|mot|hai|ba|bon|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le';
function integer(text){
 const t=text.split(/\s+/);let value=0;
 if(t.length>=2&&t[1]==='tram'){
  if(!(t[0] in units)||units[t[0]]===0)return null;
  value=units[t.shift()]*100;t.shift();
  if(t[0]==='linh'||t[0]==='le'){t.shift();return t.length===1&&t[0] in units?value+units[t[0]]:null;}
 }
 if(!t.length)return value;
 if(t.length===1)return t[0]==='muoi'?value+10:t[0] in units?value+units[t[0]]:null;
 let tens;
 if(t[0]==='muoi'){tens=10;t.shift();}
 else if(t[0] in units&&units[t[0]]>=2&&t[1]==='muoi'){tens=units[t.shift()]*10;t.shift();}
 else return null;
 return t.length===0?value+tens:t.length===1&&t[0] in units?value+tens+units[t[0]]:null;
}
export function numericView(text){
 const folded=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 // Only replace whole runs, so malformed "hai ba" cannot become two valid numbers.
 let numeric=folded.replace(new RegExp(`\\b(?:${words})(?:\\s+(?:${words}))*\\b`,'g'),run=>{
  const n=integer(run);return n===null?run:String(n);
 });
 // Half a currency unit: three and a half million, not three million.
 numeric=numeric.replace(/\b(\d+)\s*(trieu|tr|nghin|ngan|k)\s+ruoi\b/g,(_,n,u)=>`${Number(n)+0.5} ${u}`);
 // Adjacent explicit units form one amount. Do not cross punctuation, "or",
 // or accept >=1000 thousands as a fractional million component.
 numeric=numeric.replace(/(?<![\d.,])\b(\d+)\s*(?:trieu|tr)\s+(\d+)\s*(?:nghin|ngan|k)\b/g,(whole,millions,thousands)=>
  Number(thousands)<1000?`${Number(millions)*1000000+Number(thousands)*1000} dong`:whole);
 return numeric;
}

export function uncertainQuantity(note,unitPattern){
 // Preserve the distinction between accented "tầm" (about) and "tám" (eight).
 const view=numericView(note.replace(/tầm/gi,'khoảng').replace(/\btam\s+(?=\d)/gi,'khoang '));
 return new RegExp(`\\b(?:khoang|hon|gan|chung|vai|may|it nhat|toi thieu)\\s+\\d+(?:[.,]\\d+)?\\s*(?:${unitPattern})\\b`).test(view);
}
