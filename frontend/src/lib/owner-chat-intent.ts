export type OwnerCatalog={tasks:Record<string,string>;rooms:string[];periods:string[];asOf:string};
export type OwnerIntent={task:string;period:string;room:string|null};
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
