export type OwnerCatalog={tasks:Record<string,string>;rooms:string[];periods:string[];asOf:string};
export type OwnerIntent={task:string;period:string;room:string|null};
export function namesDifferentOwnerTask(question:string,currentTask:string){
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const cues:Record<string,string[]>={
  unpaid:['chua dong tien','chua thanh toan','qua han','no tien'],
  utilities:['tien dien','tien nuoc','dien nuoc','gia dien','gia nuoc'],
  missing:['thieu du lieu','thieu chi so','lap hoa don','chua lap hoa don'],
  requests:['khieu nai','tien ich','yeu cau tu nguoi thue','phan anh','su co'],
 };
 return Object.entries(cues).some(([task,phrases])=>task!==currentTask&&phrases.some(phrase=>text.includes(phrase)));
}
export function parseOwnerClarificationReply(question:string,kind:'period'|'room',catalog:OwnerCatalog):{resolved:boolean;value:string|null}{
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 if(kind==='period'){
  const candidate=proposeOwnerScope(question,'',catalog).period;
  if(candidate)return {resolved:true,value:candidate};
  return {resolved:false,value:null};
 }
 if(/\b(tat ca|toan bo|cac phong|moi phong)\b/.test(text)||/tat ca phong|toan bo phong|cac phong/.test(text))return {resolved:true,value:''};
 const codes:string[]=text.match(/\bk\d+-p\d+\b/g)||[];
 const matched=catalog.rooms.filter(label=>{
  const code=label.match(/ \/ (.+) \[\d+\]$/)?.[1];
  const candidates=[code,...codes].filter((value):value is string=>Boolean(value));
  return candidates.some(value=>new RegExp('(?:^|[^a-z0-9])'+value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(text));
 });
 const unique=[...new Set(matched)];
 return unique.length===1?{resolved:true,value:unique[0]}:{resolved:false,value:null};
}
export function proposeOwnerScope(question:string,task:string,catalog:OwnerCatalog):OwnerIntent{
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 let period='';
 const iso=text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/),month=text.match(/thang\s+(\d{1,2})(?:\s*[/.-]\s*(20\d{2}))?/);
 if(iso)period=`${iso[1]}-${iso[2]}`;
 else if(month)period=`${month[2]||catalog.asOf.slice(0,4)}-${month[1].padStart(2,'0')}`;
 else if(/thang nay|ky nay/.test(text))period=catalog.asOf.slice(0,7);
 else if(/thang truoc|ky truoc/.test(text)){const d=new Date(catalog.asOf+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);period=d.toISOString().slice(0,7);}
 if(!catalog.periods.includes(period))period='';
 if((text.match(/thang\s+\d{1,2}/g)||[]).length>1||/thang\s+\d+\s*(?:va|den|[-–])\s*\d+/.test(text))period='';
 const codes:string[]=text.match(/\bk\d+-p\d+\b/g)||[];
 const liveMatches=catalog.rooms.filter(r=>{
  const code=r.match(/ \/ (.+) \[\d+\]$/)?.[1];
  return code?new RegExp('(?:^|[^a-z0-9])'+code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(text):false;
 });
 const matched=catalog.rooms.filter(r=>codes.includes(r.toLowerCase()));
 const named=/phong\s+(?:[a-z]*\d|[a-z]\s*\d)/.test(text);
 const room=liveMatches.length===1?liveMatches[0]:liveMatches.length>1?null:matched.length===1&&codes.length===1?matched[0]:codes.length||named?null:'';
 return {task,period,room};
}
export function ownerConfirmation(intent:OwnerIntent,catalog:OwnerCatalog){
 return `Có phải bạn muốn xem ${catalog.tasks[intent.task]?.toLowerCase()}, ${intent.task==='requests'?'gửi trong tháng':'kỳ'} ${intent.period}, ${intent.room?`phòng ${intent.room}`:'tất cả phòng thuộc tài khoản của bạn'} không?`;
}
