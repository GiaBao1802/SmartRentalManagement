export type OwnerCatalog={tasks:Record<string,string>;rooms:string[];periods:string[];asOf:string};
export type OwnerIntent={task:string;period:string;room:string|null};
export type OwnerResidentRequest={kind:'create'|'search';name:string|null};
export const ownerPeriodFreeTasks=new Set(['residents','resident_ranking','resident_registration_by_room','resident_profile_lookup','available_rooms','vehicle_counts','vehicle_total','property_total','open_requests','actionable_requests','amenity_requests','common_area_requests','transaction_lookup']);
const normalizeOwnerQuestion=(question:string)=>question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export function isOwnerAffirmativeReply(value:string){
 const text=normalizeOwnerQuestion(value).replace(/[.!?,…]+$/g,'').trim().replace(/\s+/g,' ');
 return /^(?:ok(?:ay|i)?|u|uh|duoc|duoc roi|dung|dung roi|dong y|tiep tuc|tiep di|lam tiep|lam di|xac nhan)$/.test(text);
}
const ownerSensitiveDataFieldPattern=/\b(sdt|so dien thoai|dien thoai|cccd|cmnd|can cuoc|so dinh danh|giay to tuy than|thong tin nhay cam|du lieu nhay cam|thong tin ca nhan|du lieu ca nhan|thong tin rieng tu|ngay sinh|dia chi rieng|dia chi nha|dia chi cu dan|tai khoan ngan hang|so tai khoan|ho chieu|email ca nhan|mat khau|ma xac thuc|ma otp|token truy cap|ho so suc khoe|thong tin suc khoe)\b/;
const ownerSensitiveDataActionPattern=/\b(them|tao|bo sung|nhap|ghi|luu|cap nhat|sua|doi|thu thap|thu|xuat|in|cong khai|chia se)\b/;
const ownerBulkSensitiveDataPattern=/\b(tat ca|toan bo|danh sach|liet ke|hang loat)\b.*\b(cu dan|nguoi thue|khach thue)\b|\b(cu dan|nguoi thue|khach thue)\b.*\b(tat ca|toan bo|danh sach|liet ke|hang loat)\b/;
const ownerSensitiveLookupFieldPattern=/\b(sdt|so dien thoai|dien thoai|cccd|cmnd|can cuoc|so dinh danh|giay to tuy than|thong tin ca nhan|du lieu ca nhan|ngay sinh|email ca nhan|email|gioi tinh|ho so cu dan|thong tin cu dan)\b/;
export const ownerSensitiveDataRefusalMessage='Vì bảo vệ dữ liệu cá nhân, Cloudy không thể liệt kê hàng loạt hồ sơ hoặc thêm, sửa, thu thập, xuất hay chia sẻ dữ liệu cư dân qua chat. Bạn hãy dùng biểu mẫu Quản lý cư dân cho các thay đổi. Cloudy chỉ tra cứu hồ sơ cụ thể trong phạm vi tài khoản chủ trọ đang đăng nhập.';
export function isOwnerSensitiveDataRequest(question:string){
 const text=normalizeOwnerQuestion(question);
 const hasSpecificPerson=Boolean(ownerResidentProfileName(question)||parseOwnerResidentRequest(question)?.name);
 const hasSpecificRoom=/\bphong\s+[a-z0-9-]+\b/.test(text);
 return ownerSensitiveDataFieldPattern.test(text)&&(ownerSensitiveDataActionPattern.test(text)||!isOwnerResidentProfileLookup(question)||(ownerBulkSensitiveDataPattern.test(text)&&!hasSpecificPerson&&!hasSpecificRoom));
}
export function isOwnerResidentProfileLookup(question:string){
 const text=normalizeOwnerQuestion(question);
 if(/\b(thong ke|bao nhieu|so luong|dem|xep hang|nhieu nhat|chua dang ky|chua hoan tat)\b/.test(text))return false;
 if(/\b(ai|nguoi nao)\b/.test(text)&&/\b(dang thue|dang o|thue phong|o phong)\b/.test(text)&&/\bphong\b/.test(text))return true;
 const residentReference=/\b(cu dan|nguoi thue|khach thue|ho so cu dan)\b/.test(text)||Boolean(ownerResidentProfileName(question));
 const profileAction=/\b(tim|tra cuu|xem|cho toi|cung cap|la gi|bao nhieu|hien thi|thong tin|ho so|lay)\b/.test(text);
 return residentReference&&ownerSensitiveLookupFieldPattern.test(text)&&profileAction;
}
export function ownerResidentProfileName(question:string):string|null{
 if(ownerBulkSensitiveDataPattern.test(normalizeOwnerQuestion(question)))return null;
 const patterns=[
  /(?:cư dân|người thuê|khách thuê)\s+(?:có tên\s+|tên\s+)?(.+?)(?=\s+(?:có|ở|tại|phòng|số điện thoại|sđt|cccd|cmnd|email|ngày sinh|thông tin|đang|là)\b|[,.!?]|$)/iu,
  /(?:của|tên)\s+(.+?)(?=\s+(?:cư dân|người thuê|khách thuê|ở|tại|phòng|số điện thoại|sđt|cccd|cmnd|email|ngày sinh|thông tin)\b|[,.!?]|$)/iu,
  /(?:hồ sơ|thông tin)\s+(.+?)(?=\s+(?:cư dân|người thuê|khách thuê|ở|tại|phòng|số điện thoại|sđt|cccd|cmnd|email|ngày sinh)\b|[,.!?]|$)/iu,
  /(?:tìm|tra cứu|xem hồ sơ)\s+(?:cư dân|người thuê|khách thuê)\s+(.+?)(?:[,.!?]|$)/iu,
 ];
 for(const pattern of patterns){const value=question.match(pattern)?.[1]?.trim().replace(/[.!?,;:]+$/,'');if(value&&value.length<=120&&!['cu dan','nguoi thue','khach thue','ho so','thong tin','ho so cu dan','thong tin cu dan'].includes(normalizeOwnerQuestion(value)))return value;}
 return null;
}
export function parseOwnerResidentRequest(question:string):OwnerResidentRequest|null{
 const text=normalizeOwnerQuestion(question);
 if(!/\b(cu dan|nguoi thue|khach thue|ho so cu dan)\b/.test(text))return null;
 const kind=/\b(them|tao|bo sung|lap ho so)\b/.test(text)?'create':null;
 const search=/(?:^|\s)(tim|tra cuu|xem ho so)\b/.test(text);
 if(!kind&&(!search||/\b(thong ke|bao nhieu|so luong|chua|dang ky|tam tru|tam vang|luu tru|dang o)\b/.test(text)))return null;
 const nameMatch=question.match(/\bt[eê]n\s+(.+?)(?=\s+(?:vào|cho|ở|tại|phòng|khu trọ|số điện thoại|sđt|cccd)(?:\s|$)|[,.!?]|$)/iu)
  ||(!kind?question.match(/(?:^|\s)(?:tìm|tra cứu|xem hồ sơ)\s+(?:cư dân|người thuê|khách thuê)\s+(.+?)(?:[,.!?]|$)/iu):null);
 const name=nameMatch?.[1]?.trim().replace(/[.!?,;:]+$/,'').slice(0,120)||null;
 return {kind:kind||'search',name};
}
export function isOwnerAvailableRoomsQuestion(question:string){
 const text=normalizeOwnerQuestion(question);
 return /\b(phong|danh sach)\b/.test(text)&&/\b(con trong|dang trong|trong de cho thue|phong trong|con phong cho thue|chua co (?:nguoi|ai) thue|chua duoc thue|chua cho thue|chua ai thue)\b/.test(text);
}
export function ownerQuestionTask(question:string):string|null{
 const text=normalizeOwnerQuestion(question);
 if(isOwnerSensitiveDataRequest(question))return 'sensitive_data_refusal';
 if(/\b(truoc khi chot hoa don|chot hoa don can kiem tra|viec can kiem tra trong ky hoa don|can kiem tra gi truoc khi chot)\b/.test(text))return 'overview';
 if(/\b(danh dau|cap nhat|chot hoa don|xoa hoa don|gui nhac|gui tin|xu ly het|xu ly luon|giai quyet het|hoan tat het)\b/.test(text))return null;
 if(/\bDEMO-\d{10,}-[A-F0-9]{8}\b/i.test(question))return 'transaction_lookup';
 if(isOwnerResidentProfileLookup(question))return 'resident_profile_lookup';
 if(parseOwnerResidentRequest(question)?.kind==='search')return 'resident_profile_lookup';
 if(/\b(ten|danh tinh|so dien thoai|cccd|cmnd)\b/.test(text)&&/\b(cu dan|nguoi thue|khach thue)\b/.test(text))return 'resident_profile_lookup';
 if(/\b(ai|nguoi nao)\b/.test(text)&&/\b(dang thue|dang o|thue phong|o phong)\b/.test(text)&&/\bphong\b/.test(text))return 'resident_profile_lookup';
 if(isOwnerAvailableRoomsQuestion(question))return 'available_rooms';
 if(/\b(khach|cu dan|nguoi thue|khach thue)\b/.test(text)&&/\b(yeu cau|de nghi|phan anh|bao)\b/.test(text)&&/\b(tien ich|thiet bi|bo sung|do dung)\b/.test(text))return 'amenity_requests';
 if(/\b(yeu cau|khieu nai|phan anh|gop y)\b/.test(text)&&/\b(khu vuc chung|khong gian chung|hanh lang|san chung|cong chung|cau thang|khu de xe chung)\b/.test(text))return 'common_area_requests';
 if(/\b(hoa don|bill)\b/.test(text)&&/\b(da chot chua|chot chua|duoc chot chua|hoan tat chua|trang thai hoa don)\b/.test(text))return 'invoices';
 if(/\b(yeu cau nao|yeu cau gi|liet ke|danh sach|cac yeu cau)\b/.test(text)&&/\b(can xu ly|cho xu ly|dang xu ly|chua xu ly|chua giai quyet|dang mo)\b/.test(text)&&/\b(yeu cau|khieu nai|phan anh)\b/.test(text))return 'actionable_requests';
 if(/\b(yeu cau|khieu nai|phan anh)\b/.test(text)&&/\b(bao nhieu|so luong|dem)\b/.test(text)&&/\b(dang cho|cho xu ly|dang xu ly|chua xu ly|chua giai quyet|dang mo)\b/.test(text))return 'open_requests';
 if(/\b(bao nhieu|so luong|dem)\b/.test(text)&&/\b(khu tro|nha tro|toa nha|co so)\b/.test(text))return 'property_total';
 if(/\b(tong|tong cong|toan bo|tat ca)\b/.test(text)&&/\b(xe|phuong tien)\b/.test(text)&&/\b(bao nhieu|so luong|dem|tong)\b/.test(text))return 'vehicle_total';
 if(/\b(phong nao|phong)\b/.test(text)&&/\b(cu dan|nguoi o|nguoi thue)\b/.test(text)&&/\b(chua dang ky|chua khai bao|chua hoan tat|chua lam|thieu dang ky)\b/.test(text))return 'resident_registration_by_room';
 if(/\b(phong nao|phong)\b/.test(text)&&/\b(cu dan|nguoi o|nguoi thue)\b/.test(text)&&/\b(nhieu nhat|nhieu cu dan|dong dan nhat|xep hang)\b/.test(text))return 'resident_ranking';
 if(/\b(nuoc|m3|met khoi)\b/.test(text)&&/\b(nhieu nhat|tieu thu|xai nhieu|dung nhieu|cao nhat|top|xep hang)\b/.test(text))return 'water_ranking';
 if(/\b(dien|kwh|dien nang)\b/.test(text)&&/(it nhat|thap nhat|dung it|tieu thu it|it dien)/.test(text))return 'electricity_lowest';
 if(/\b(xe|phuong tien|bai xe)\b/.test(text)&&/(theo tung phong|tung phong|thong ke.*xe|xe gui theo phong|nhieu nhat|nhieu xe|bao nhieu xe|may xe|xe nao|phong nao.*xe)/.test(text))return 'vehicle_counts';
 if(/\b(dien|kwh|dien nang)\b/.test(text)&&/(nhieu nhat|tieu thu|xai nhieu|dung nhieu|cao nhat|tang nhieu|tang cao|top)/.test(text))return 'electricity_ranking';
 if(/\b(phong nao|khu nao)\b/.test(text)&&/\b(hay|thuong|nhieu|nhieu nhat)\b/.test(text)&&/(bao hong|bao hu|hu hong|sua chua|su co|khieu nai|phan anh|yeu cau)/.test(text))return 'frequent_requests';
 if(/\b(bao nhieu|so luong|dem)\b/.test(text)&&/(tin nhan|phan hoi|gop y|y kien)/.test(text)&&/(khach|cu dan|nguoi thue|khach thue)/.test(text))return 'feedback_messages';
 if(/\b(cu dan|nguoi o|nguoi dang o|ho so cu dan|tam tru|tam vang|luu tru)\b/.test(text)&&/(thong ke|bao nhieu|so luong|chua|dang ky|ho so|ai )/.test(text)||/\b(ai|nguoi nao)\b/.test(text)&&/(dang ky|ho so|tam tru|tam vang|cu tru)/.test(text))return 'residents';
 if(/\b(thieu|chua co|chua nhap|chua gui|bo trong)\b/.test(text)&&(/\b(chi so|du lieu|thong tin|hoa don|bill)\b/.test(text)||/\bdien\s*[/-]?\s*nuoc\b/.test(text)))return 'missing';
 if(/\b(chua dong tien|chua thanh toan|con no|no tien|qua han|tre han|chua nop tien|chua tra tien|phai dong bao nhieu|con phai dong|can dong bao nhieu|con phai nop|can thanh toan bao nhieu)\b/.test(text))return 'unpaid';
 if(/\b(danh sach|liet ke|phong nao|cac phong)\b/.test(text)&&/\b(da thanh toan|thanh toan roi|da tra tien|da nop tien|da dong tien)\b/.test(text)||/\b(da thanh toan|thanh toan roi|da tra tien|da nop tien|da dong tien)\b/.test(text))return 'paid';
 if(/\b(dien|nuoc|dien nuoc|gia dien|gia nuoc)\b/.test(text)&&/\b(giai thich|tinh|don gia|bao nhieu|sao|vi sao|tang|ky|thang)\b/.test(text))return 'utilities';
 if(/\b(hop dong|contract)\b/.test(text))return 'contract_management';
 if(/\b(hoa don|bill)\b/.test(text))return 'invoices';
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
export function shouldContinueUnpaidInvoiceScope(question:string,currentTask:string,nextTask:string){
 const text=normalizeOwnerQuestion(question);
 return currentTask==='unpaid'&&nextTask==='paid'&&!ownerQuestionMentionsPeriod(question)&&!/\b(phong|tat ca|toan bo|k\d+-p\d+)\b/.test(text);
}
export function ownerTransactionCode(question:string){return question.match(/\bDEMO-\d{10,}-[A-F0-9]{8}\b/i)?.[0].toUpperCase()||null;}
export function ownerEmptyResultMessage(task:string,period=''){
 const unpaidEmpty=task==='unpaid'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
  ?`Không có hóa đơn đã chốt nào chưa thanh toán trong tháng ${period.slice(5)}/${period.slice(0,4)} (theo ngày kết thúc kỳ) và phạm vi này.`
  :null;
 const messages:Record<string,string>={
  unpaid:'Không có hóa đơn đã chốt nào chưa thanh toán trong kỳ và phạm vi này.',
  paid:'Không có hóa đơn đã thanh toán nào trong kỳ và phạm vi này.',
  invoices:/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
   ?`Không có hóa đơn nào trong tháng ${period.slice(5)}/${period.slice(0,4)} theo ngày kết thúc kỳ và phạm vi này.`
   :'Không có hóa đơn nào trong kỳ và phạm vi này.',
  transaction_lookup:'Không tìm thấy hóa đơn trong tài khoản có mã giao dịch này.',
  requests:'Không có yêu cầu tiện ích hoặc khiếu nại nào phù hợp với kỳ và phạm vi này.',
  missing:'Không có dữ liệu lập hóa đơn nào còn thiếu trong kỳ và phạm vi này.',
  utilities:'Không tìm thấy hóa đơn để giải thích tiền điện nước trong kỳ và phạm vi này.',
  overview:'Không có hóa đơn cần kiểm tra theo trạng thái và lý do do backend cung cấp trong phạm vi này.',
  available_rooms:'Hiện không có phòng nào còn trống trong phạm vi tài khoản của bạn.',
  vehicle_counts:'Không có xe nào đang được phân công chỗ giữ xe trong phạm vi tài khoản.',
  vehicle_total:'Không có xe nào đang được phân công chỗ giữ xe trong phạm vi tài khoản.',
  property_total:'Không có khu trọ nào thuộc tài khoản này.',
  electricity_ranking:'Không có số điện đã chốt hợp lệ trong kỳ và phạm vi này để xếp hạng.',
  electricity_lowest:'Không có số điện đã chốt hợp lệ trong kỳ và phạm vi này để xếp hạng.',
  water_ranking:'Không có số nước đã chốt hợp lệ trong kỳ và phạm vi này để xếp hạng.',
  frequent_requests:'Không có yêu cầu hoặc khiếu nại trong kỳ và phạm vi này để thống kê.',
  open_requests:'Hiện không có yêu cầu hoặc khiếu nại phòng nào đang chờ xử lý hoặc đang được xử lý.',
  actionable_requests:'Không có yêu cầu phòng nào đang chờ hoặc đang xử lý trong kỳ và phạm vi này.',
  amenity_requests:'Không thấy yêu cầu đang mở nào về bổ sung tiện ích hoặc thiết bị trong phạm vi này.',
  common_area_requests:'Không thấy phản ánh nào về khu vực chung trong phạm vi này.',
  resident_ranking:'Không có số liệu cư dân đang ở theo phòng trong phạm vi này.',
  resident_registration_by_room:'Không có phòng nào có cư dân đang ở chưa hoàn tất đăng ký trong phạm vi này.',
  feedback_messages:'Không có phản hồi từ khách trong kỳ và phạm vi này.',
 };
 return unpaidEmpty||messages[task]||'Không có dữ liệu phù hợp với kỳ và phạm vi đã chọn.';
}
export function ownerUnknownIntentMessage(question:string,catalog:Pick<OwnerCatalog,'tasks'>){
 const excerpt=question.trim().replace(/\s+/g,' ').slice(0,120);
 const understood=['Ai chưa hoàn tất đăng ký cư trú?','Phòng nào dùng điện nhiều nhất?','Phòng nào đang có nhiều xe nhất?','Phòng nào thường gửi yêu cầu hoặc báo sự cố?','Có bao nhiêu phản hồi từ khách?','Tìm hóa đơn theo mã giao dịch DEMO-…','Danh sách phòng còn trống','Tạo tiện ích miễn phí hoặc có phí','Gửi nhắc nhở trong ứng dụng cho cư dân theo phòng',...Object.values(catalog.tasks)];
 const features=understood.filter((value,index,all)=>all.findIndex(other=>other.toLowerCase()===value.toLowerCase())===index).join(', ');
 return `Mình chưa hiểu yêu cầu “${excerpt}”; nội dung này có thể chưa được cập nhật. Có phải bạn muốn hỏi về ${features.toLowerCase()} không? Bạn có thể viết lại rõ hơn, mình sẽ tra cứu ngay khi nhận ra đúng mục.`;
}
export function namesDifferentOwnerTask(question:string,currentTask:string){
 const text=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const cues:Record<string,string[]>={
  unpaid:['chua dong tien','chua thanh toan','qua han','no tien'],
  paid:['da thanh toan','thanh toan roi','da tra tien','da nop tien','da dong tien'],
  utilities:['tien dien','tien nuoc','dien nuoc','gia dien','gia nuoc'],
  missing:['thieu du lieu','thieu chi so','lap hoa don','chua lap hoa don'],
  requests:['khieu nai','tien ich','yeu cau tu nguoi thue','phan anh','su co'],
  residents:['thong ke cu dan','bao nhieu cu dan','so luong cu dan','cu dan dang o','nguoi dang o'],
  resident_ranking:['phong nao co nhieu cu dan','phong nao nhieu cu dan','nhieu cu dan nhat','phong nao dong dan'],
  resident_registration_by_room:['phong nao con cu dan chua dang ky','phong nao chua dang ky tam tru','cu dan chua khai bao theo phong'],
  available_rooms:['phong trong','phong con trong','phong nao trong','phong nao dang trong','phong trong de cho thue','phong nao cho thue','phong chua co nguoi thue','phong chua cho thue','phong nao con trong'],
  vehicle_counts:['phong nao nhieu xe','phong nao co nhieu xe','nhieu xe nhat','bao nhieu xe'],
  vehicle_total:['tong cong co bao nhieu xe','tong so xe','tong cong bao nhieu xe','tat ca xe'],
  property_total:['dang quan ly bao nhieu khu tro','bao nhieu khu tro dang quan ly','so khu tro dang quan ly'],
  open_requests:['bao nhieu yeu cau dang cho xu ly','yeu cau dang cho hoac dang xu ly','so yeu cau dang mo'],
  actionable_requests:['yeu cau nao thang 10 can xu ly','yeu cau nao can xu ly','cac yeu cau can xu ly'],
  amenity_requests:['khach dang yeu cau bo sung tien ich','khach yeu cau them tien ich','khach de nghi bo sung thiet bi'],
  common_area_requests:['liet ke phan anh ve khu vuc chung','phan anh khu vuc chung','khieu nai khu vuc chung'],
  electricity_lowest:['phong nao dung dien it nhat','phong nao tieu thu dien it nhat','dien thap nhat'],
  invoices:['hoa don da chot chua','hoa don a02 thang 9 da chot chua','liet ke phong da thanh toan thang 9'],
  overview:['truoc khi chot hoa don can kiem tra gi','viec can kiem tra trong ky hoa don'],
  electricity_ranking:['phong nao xai dien nhieu','phong nao dung dien nhieu','phong nao tieu thu dien','phong nao tang dien','dien nhieu nhat','tieu thu dien nhieu nhat','kwh cao nhat'],
  water_ranking:['phong nao dung nuoc nhieu','phong nao tieu thu nuoc','xep hang luong nuoc','nuoc tieu thu nhieu nhat','m3 cao nhat'],
  frequent_requests:['phong nao hay bao hong','phong nao hay bao su co','phong nao nhieu khieu nai','phong nao hay phan anh'],
  feedback_messages:['bao nhieu tin nhan phan hoi tu khach','co bao nhieu tin nhan phan hoi tu khach','so luong phan hoi cua khach','bao nhieu gop y tu cu dan'],
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
