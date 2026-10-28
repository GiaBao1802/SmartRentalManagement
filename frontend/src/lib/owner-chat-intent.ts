export type OwnerCatalog={tasks:Record<string,string>;rooms:string[];periods:string[];asOf:string};
export type OwnerIntent={task:string;period:string;room:string|null};
export const ownerPeriodFreeTasks=new Set(['residents','available_rooms','vehicle_counts']);
const normalizeOwnerQuestion=(question:string)=>question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export function isOwnerAvailableRoomsQuestion(question:string){
 const text=normalizeOwnerQuestion(question);
 return /\b(phong|danh sach)\b/.test(text)&&/\b(con trong|phong trong|chua co (?:nguoi|ai) thue|chua duoc thue|chua cho thue|chua ai thue)\b/.test(text);
}
export function ownerQuestionTask(question:string):string|null{
 const text=normalizeOwnerQuestion(question);
 if(/\b(danh dau|cap nhat|chot hoa don|xoa hoa don|gui nhac|gui tin|xu ly het|xu ly luon|giai quyet het|hoan tat het)\b/.test(text))return null;
 if(isOwnerAvailableRoomsQuestion(question))return 'available_rooms';
 if(/\b(xe|phuong tien|bai xe)\b/.test(text)&&/(nhieu nhat|nhieu xe|bao nhieu xe|xe nao|phong nao.*xe)/.test(text))return 'vehicle_counts';
 if(/\b(dien|kwh|dien nang)\b/.test(text)&&/(nhieu nhat|tieu thu|xai nhieu|dung nhieu|cao nhat|tang nhieu|tang cao|top)/.test(text))return 'electricity_ranking';
 if(/\b(phong nao|khu nao)\b/.test(text)&&/\b(hay|thuong|nhieu|nhieu nhat)\b/.test(text)&&/(bao hong|bao hu|hu hong|sua chua|su co|khieu nai|phan anh|yeu cau)/.test(text))return 'frequent_requests';
 if(/\b(cu dan|nguoi o|nguoi dang o|ho so cu dan|tam tru|tam vang|luu tru)\b/.test(text)&&/(thong ke|bao nhieu|so luong|chua|dang ky|ho so|ai )/.test(text)||/\b(ai|nguoi nao)\b/.test(text)&&/(dang ky|ho so|tam tru|tam vang|cu tru)/.test(text))return 'residents';
 if(/\b(thieu|chua co|chua nhap|chua gui|bo trong)\b/.test(text)&&/\b(chi so|dien nuoc|du lieu|thong tin|hoa don|bill)\b/.test(text))return 'missing';
 if(/\b(chua dong tien|chua thanh toan|con no|no tien|qua han|tre han|chua nop tien|chua tra tien)\b/.test(text))return 'unpaid';
 if(/\b(dien|nuoc|dien nuoc|gia dien|gia nuoc)\b/.test(text)&&/\b(giai thich|tinh|don gia|bao nhieu|sao|vi sao|tang|ky|thang)\b/.test(text))return 'utilities';
 if(/\b(con viec|con vuong|can kiem tra|viec nao can|kiem tra .* trong ky|con cai gi can xem)\b/.test(text))return 'overview';
 return null;
}
export function parseOwnerRoomReminder(question:string):{roomCode:string|null;message:string}|null{
 const normalizedQuestion=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 if(!/\b(nhac(?: nho)?|canh bao|thong bao)\b/.test(normalizedQuestion)||!/\bphong\b/.test(normalizedQuestion))return null;
 const roomMatch=/\bph[oò]ng\s+([a-z0-9]+(?:-[a-z0-9]+)*)/i.exec(question);
 if(!roomMatch)return {roomCode:null,message:''};
 const code=roomMatch[1];
 const remainder=question.slice(roomMatch.index+roomMatch[0].length).replace(/^\s*(?:(?:la|là|ve|về|rang|rằng)\s+|[:,-]\s*)/i,'').trim().replace(/[.!?]+$/,'').trim();
 const normalizedRemainder=remainder.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const message=/quen khoa cua/.test(normalizedRemainder)?'Vui lòng kiểm tra và khóa cửa phòng khi ra ngoài.':remainder?`Chủ trọ nhắc: ${remainder}.`:'';
 return {roomCode:code,message};
}
export function ownerQuestionMentionsPeriod(question:string){
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 return /\b(thang|ky)\b|thang nay|ky nay|thang truoc|ky truoc|\b20\d{2}-(?:0[1-9]|1[0-2])\b/.test(text);
}
export function ownerEmptyResultMessage(task:string){
 const messages:Record<string,string>={
  unpaid:'Không có hóa đơn đã chốt nào chưa thanh toán trong kỳ và phạm vi này.',
  requests:'Không có yêu cầu tiện ích hoặc khiếu nại nào phù hợp với kỳ và phạm vi này.',
  missing:'Không có dữ liệu lập hóa đơn nào còn thiếu trong kỳ và phạm vi này.',
  utilities:'Không tìm thấy hóa đơn để giải thích tiền điện nước trong kỳ và phạm vi này.',
  overview:'Không có hóa đơn cần kiểm tra trong kỳ và phạm vi này.',
  available_rooms:'Hiện không có phòng nào còn trống trong phạm vi tài khoản của bạn.',
  vehicle_counts:'Không có xe nào đang được phân công chỗ giữ xe trong phạm vi tài khoản.',
  electricity_ranking:'Không có số điện đã chốt hợp lệ trong kỳ và phạm vi này để xếp hạng.',
  frequent_requests:'Không có yêu cầu hoặc khiếu nại trong kỳ và phạm vi này để thống kê.',
 };
 return messages[task]||'Không có dữ liệu phù hợp với kỳ và phạm vi đã chọn.';
}
export function ownerUnknownIntentMessage(question:string,catalog:Pick<OwnerCatalog,'tasks'>){
 const excerpt=question.trim().replace(/\s+/g,' ').slice(0,120);
 const understood=['Ai chưa hoàn tất đăng ký cư trú?','Phòng nào dùng điện nhiều nhất?','Phòng nào đang có nhiều xe nhất?','Phòng nào thường gửi yêu cầu hoặc báo sự cố?','Danh sách phòng còn trống','Tạo tiện ích miễn phí hoặc có phí','Gửi nhắc nhở trong ứng dụng cho cư dân theo phòng',...Object.values(catalog.tasks)];
 const features=understood.filter((value,index,all)=>all.findIndex(other=>other.toLowerCase()===value.toLowerCase())===index).join(', ');
 return `Mình chưa hiểu yêu cầu “${excerpt}”; nội dung này có thể chưa được cập nhật. Có phải bạn muốn hỏi về ${features.toLowerCase()} không? Bạn có thể viết lại rõ hơn, mình sẽ tra cứu ngay khi nhận ra đúng mục.`;
}
export function namesDifferentOwnerTask(question:string,currentTask:string){
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const cues:Record<string,string[]>={
  unpaid:['chua dong tien','chua thanh toan','qua han','no tien'],
  utilities:['tien dien','tien nuoc','dien nuoc','gia dien','gia nuoc'],
  missing:['thieu du lieu','thieu chi so','lap hoa don','chua lap hoa don'],
  requests:['khieu nai','tien ich','yeu cau tu nguoi thue','phan anh','su co'],
  residents:['thong ke cu dan','bao nhieu cu dan','so luong cu dan','cu dan dang o','nguoi dang o'],
  available_rooms:['phong trong','phong con trong','phong nao trong','phong chua co nguoi thue','phong chua cho thue','phong nao con trong'],
  vehicle_counts:['phong nao nhieu xe','phong nao co nhieu xe','nhieu xe nhat','bao nhieu xe'],
  electricity_ranking:['phong nao xai dien nhieu','phong nao dung dien nhieu','phong nao tieu thu dien','phong nao tang dien','dien nhieu nhat','tieu thu dien nhieu nhat','kwh cao nhat'],
  frequent_requests:['phong nao hay bao hong','phong nao hay bao su co','phong nao nhieu khieu nai','phong nao hay phan anh'],
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
 const matched=catalog.rooms.filter(label=>{
  const code=label.match(/ \/ (.+) \[\d+\]$/)?.[1]||(/^k\d+-p\d+$/i.test(label.trim())?label.trim():null);
  return code?new RegExp('(?:^|[^a-z0-9])'+code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(text):false;
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
 if(intent.task==='residents')return `Có phải bạn muốn xem thống kê cư dân hiện tại, ${intent.room?`trong ${intent.room}`:'trên tất cả khu trọ thuộc tài khoản của bạn'} không?`;
 if(ownerPeriodFreeTasks.has(intent.task))return `Mình sẽ tra cứu ${catalog.tasks[intent.task]?.toLowerCase()||'dữ liệu hiện tại'}${intent.room?` tại ${intent.room}`:' trong tất cả khu trọ thuộc tài khoản của bạn'}.`;
 const [year,month]=intent.period.split('-');const period=year&&month?`tháng ${Number(month)}/${year}`:`kỳ ${intent.period}`;
 return `Có phải bạn muốn xem ${catalog.tasks[intent.task]?.toLowerCase()} trong ${period}, ${intent.room?`phòng ${intent.room}`:'tất cả phòng thuộc tài khoản của bạn'} không?`;
}
