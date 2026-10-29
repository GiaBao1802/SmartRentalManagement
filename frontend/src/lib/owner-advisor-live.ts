import {AccessError} from '../../../scripts/owner-advisor-demo/auth.mjs';
import type {InvoiceResource,InvoiceDetailResponse,BillingWorkspaceRow} from './api/invoiceApi';
import type {Property} from './api/propertyApi';
import type {Room} from './api/roomApi';
import type {AdminServiceBooking} from './api/propertyServiceApi';
import type {Resident} from './api/residentApi';
import type {ParkingAssignment} from './api/parkingApi';
import {invoiceDisplayStatus,invoiceDueStateLabel} from './invoice-status';
const money=(value:string|number)=>new Intl.NumberFormat('vi-VN').format(Number(value))+' đ';
const tasks={unpaid:'Hóa đơn chưa thanh toán',paid:'Hóa đơn đã thanh toán',transaction_lookup:'Tìm hóa đơn theo mã giao dịch',resident_identity_help:'Quyền xem thông tin cư dân',utilities:'Giải thích tiền điện nước',missing:'Thiếu dữ liệu lập hóa đơn',overview:'Việc cần kiểm tra trong kỳ',requests:'Yêu cầu tiện ích và khiếu nại',feedback_messages:'Thống kê phản hồi từ khách',residents:'Thống kê cư dân',available_rooms:'Danh sách phòng còn trống',vehicle_counts:'Thống kê xe đang gửi',electricity_ranking:'Xếp hạng phòng dùng điện',frequent_requests:'Phòng có nhiều yêu cầu / sự cố'};
type Complaint={complaint_id:string;room_id:string|null;room_code:string|null;property_name:string;category:string;content:string;status:string;created_at:string};
export function createLiveAdvisor(cookie:string,fetchImpl:typeof fetch=fetch,signal?:AbortSignal){
 const base=process.env.OWNER_ADVISOR_API_BASE||process.env.NEXT_PUBLIC_API_BASE_URL||'http://localhost:4000/api/v1';
 const root=new URL(base);
 if(root.protocol!=='http:'||!['localhost','127.0.0.1'].includes(root.hostname)||root.username||root.password)throw new AccessError(503,'Backend local không hợp lệ.');
 const sessionCookie=cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('gt_session='))||'';
 async function get<T>(path:string):Promise<T>{
  const response=await fetchImpl(base.replace(/\/$/,'')+path,{headers:{Cookie:sessionCookie},cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok)throw new AccessError([401,403].includes(response.status)?response.status:503,'Không đọc được dữ liệu quản lý. Vui lòng kiểm tra phiên đăng nhập và backend.');
  return response.json();
 }
 async function pages<T>(path:string,size=100):Promise<T[]>{
  const all:T[]=[];
  for(let page=1;page<=1000;page++){
   const r=await get<{data:T[];meta:{total_pages:number}}>(`${path}${path.includes('?')?'&':'?'}page=${page}&page_size=${size}`);
   if(!Array.isArray(r.data)||!Number.isInteger(r.meta?.total_pages))throw new AccessError(503,'Phân trang backend không hợp lệ.');
   all.push(...r.data);if(page>=r.meta.total_pages)return all;
  }
  throw new AccessError(503,'Dữ liệu vượt giới hạn đọc. Không hiển thị tổng thiếu.');
 }
 async function inventory(){
  const properties=await pages<Property>('/properties');
  const rooms:{id:string;key:string;propertyId:string;propertyName:string;roomCode:string;status:Room['status'];areaM2:string;rent:string}[]=[];
  for(const p of properties){for(const r of await pages<Room>(`/properties/${p.property_id}/rooms`))rooms.push({id:r.room_id,key:`${p.name} / ${r.room_code} [${r.room_id}]`,propertyId:p.property_id,propertyName:p.name,roomCode:r.room_code,status:r.status,areaM2:r.area_m2,rent:r.default_rent});}
  return {properties,rooms};
 }
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {
  async catalog(){
   const {rooms,properties}=await inventory();const invoices=await pages<InvoiceResource>('/invoices');
   const complaints=(await get<{data:Complaint[]}>('/room-requests')).data;
   const bookingMonths:string[]=[];for(const p of properties){const data=(await get<{data:AdminServiceBooking[]}>(`/properties/${p.property_id}/service-bookings?status=PENDING`)).data;bookingMonths.push(...data.map(b=>b.service_date.slice(0,7)));}
   return {source:'database',synthetic:false,asOf:today(),tasks,properties:properties.map(({property_id,name,province})=>({property_id,name,province})),rooms:rooms.map(r=>r.key),room_targets:rooms.map(({id,propertyId,propertyName,roomCode})=>({room_id:id,property_id:propertyId,property_name:propertyName,room_code:roomCode})),periods:[...new Set([today().slice(0,7),...invoices.map(i=>i.period_end.slice(0,7)),...complaints.map(c=>c.created_at.slice(0,7)),...bookingMonths])].sort().reverse()};
  },
  async answer(input:{task:string;period:string;room:string;transactionCode?:string}){
   if(!Object.hasOwn(tasks,input.task)||(!['residents','available_rooms','vehicle_counts','transaction_lookup'].includes(input.task)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period))||typeof input.room!=='string'||input.room.length>500)throw new AccessError(400,'Phạm vi tra cứu không hợp lệ.');
   const {rooms,properties}=await inventory();const selected=rooms.find(r=>r.key===input.room);
   if(input.room&&!selected)throw new AccessError(404,'Không tìm thấy phòng trong tài khoản.');
   const cards:{id:string;room:string;property:string;status:string;total:number|null;details:string[];href?:string;amountLabel?:string}[]=[];
   let summary='';
   if(input.task==='transaction_lookup'){
    if(!/^DEMO-\d{10,}-[A-F0-9]{8}$/.test(input.transactionCode||''))throw new AccessError(400,'Mã giao dịch không hợp lệ.');
    const code=input.transactionCode!.toUpperCase();
    const notifications=await pages<{title:string;body:string;created_at:string}>('/notifications?type=invoice_demo_payment');
    const matchingNotifications=notifications.filter(notification=>notification.body.toUpperCase().includes(code));
    const paidInvoices=await pages<InvoiceResource>('/invoices?status=paid');
    const found=matchingNotifications.flatMap(notification=>paidInvoices.filter(invoice=>invoice.status==='paid'&&notification.body.includes(invoice.invoice_no)).map(invoice=>({invoice,notification})));
    for(const {invoice,notification} of found){
     const room=rooms.find(item=>item.id===invoice.contract?.room_id);
     cards.push({id:invoice.invoice_id,room:room?.roomCode||invoice.contract?.room_code||'Không có mã phòng',property:room?.propertyName||invoice.contract?.property?.name||'Khu trọ',status:'Đã thanh toán · Demo',total:Number(invoice.total_amount),details:[`Mã hóa đơn: ${invoice.invoice_no}.`,`Mã giao dịch: ${code}.`,`Thanh toán mô phỏng lúc ${new Date(notification.created_at).toLocaleString('vi-VN')}; không có tiền thật được chuyển.`],href:`/admin/invoices/${invoice.invoice_id}`});
    }
    summary=found.length?`Tìm thấy ${found.length} hóa đơn đã thanh toán có mã giao dịch ${code}. Đây là giao dịch mô phỏng.`:`Không tìm thấy hóa đơn trong tài khoản có mã giao dịch ${code}.`;
   }else if(input.task==='available_rooms'){
    const available=rooms.filter(r=>r.status==='available'&&(!selected||r.id===selected.id));
    for(const r of available)cards.push({id:r.id,room:r.roomCode,property:r.propertyName,status:'Còn trống',total:null,amountLabel:'Phòng có thể cho thuê',details:[`Diện tích: ${r.areaM2} m².`,`Giá thuê mặc định: ${money(r.rent)}/tháng.`],href:`/admin/properties/${r.propertyId}/rooms`});
    summary=selected?`${selected.key} ${available.length?'đang còn trống':'hiện không còn trống'}. Trạng thái được lấy từ dữ liệu phòng hiện tại.`:`Có ${available.length} phòng đang còn trống trên ${properties.length} khu trọ thuộc tài khoản. Danh sách chỉ gồm phòng có trạng thái hiện tại là còn trống; giá thuê là giá mặc định của phòng.`;
   }else if(input.task==='vehicle_counts'){
    const counts=new Map<string,{room:typeof rooms[number];vehicles:Set<string>}>();
    for(const p of properties){const response=await get<{data:ParkingAssignment[]}>(`/properties/${p.property_id}/parking-assignments`);
     for(const assignment of response.data){if(assignment.status!=='active'||(selected&&assignment.room_id!==selected.id))continue;
      const room=rooms.find(r=>r.id===assignment.room_id);if(!room)continue;
      const entry=counts.get(room.id)||{room,vehicles:new Set<string>()};entry.vehicles.add(assignment.vehicle_id);counts.set(room.id,entry);
     }
    }
    const ranked=[...counts.values()].sort((a,b)=>b.vehicles.size-a.vehicles.size||a.room.propertyName.localeCompare(b.room.propertyName)||a.room.roomCode.localeCompare(b.room.roomCode));
    for(const entry of ranked)cards.push({id:entry.room.id,room:entry.room.roomCode,property:entry.room.propertyName,status:`${entry.vehicles.size} xe đang được phân công`,total:null,amountLabel:'Xe đang gửi',details:['Chỉ tính xe có phân công chỗ giữ xe đang hoạt động.'] ,href:`/admin/properties/${entry.room.propertyId}/parking`});
    summary=selected?`${selected.key} có ${counts.get(selected.id)?.vehicles.size||0} xe được phân công chỗ giữ xe đang hoạt động.`:`Đã xếp ${ranked.length} phòng theo số xe có phân công chỗ giữ xe đang hoạt động. Phòng không có phân công hiện hành không xuất hiện.`;
   }else if(input.task==='electricity_ranking'){
    const invoices=await pages<InvoiceResource>('/invoices');const periodInvoices=invoices.filter(i=>i.period_end.slice(0,7)===input.period&&i.finalized_at&&i.contract?.room_id&&(!selected||i.contract.room_id===selected.id));
    const usage=new Map<string,{room:typeof rooms[number];kwh:number;periods:number}>();
    for(const invoice of periodInvoices){const detail=(await get<{data:InvoiceDetailResponse}>(`/invoices/${invoice.invoice_id}`)).data;
     const previous=detail.electricity_previous_kwh,current=detail.electricity_current_kwh;if(previous==null||current==null||previous.trim()===''||current.trim()==='')continue;
     const beginning=Number(previous),ending=Number(current);if(!Number.isFinite(beginning)||!Number.isFinite(ending)||ending<beginning)continue;
     const room=rooms.find(r=>r.id===invoice.contract!.room_id);if(!room)continue;const entry=usage.get(room.id)||{room,kwh:0,periods:0};entry.kwh+=ending-beginning;entry.periods++;usage.set(room.id,entry);
    }
    const ranked=[...usage.values()].sort((a,b)=>b.kwh-a.kwh||a.room.propertyName.localeCompare(b.room.propertyName)||a.room.roomCode.localeCompare(b.room.roomCode));
    for(const entry of ranked)cards.push({id:entry.room.id,room:entry.room.roomCode,property:entry.room.propertyName,status:`${entry.kwh.toLocaleString('vi-VN')} kWh`,total:null,amountLabel:'Điện năng đã ghi nhận',details:[`Dựa trên ${entry.periods} hóa đơn đã chốt trong tháng ${input.period.slice(5)}/${input.period.slice(0,4)}.`],href:'/admin/invoices'});
    summary=ranked.length?`Xếp hạng theo tổng kWh đã ghi nhận trong các hóa đơn đã chốt, kỳ kết thúc vào tháng ${input.period.slice(5)}/${input.period.slice(0,4)}. Có ${ranked.length} phòng đủ số liệu hợp lệ; bỏ qua bản nháp và số đo thiếu/không hợp lệ.`:`Không có số điện đã chốt hợp lệ trong kỳ ${input.period} và phạm vi này để xếp hạng.`;
   }else if(input.task==='frequent_requests'){
    const complaints=(await get<{data:Complaint[]}>('/room-requests')).data;const counts=new Map<string,{roomCode:string;property:string;count:number;open:number}>();
    for(const complaint of complaints.filter(r=>r.created_at.slice(0,7)===input.period&&(!selected||r.room_id===selected.id)&&r.room_id)){
     const room=rooms.find(item=>item.id===complaint.room_id);if(!room)continue;const entry=counts.get(room.id)||{roomCode:room.roomCode,property:room.propertyName,count:0,open:0};entry.count++;if(['pending','in_progress'].includes(complaint.status))entry.open++;counts.set(room.id,entry);
    }
    const ranked=[...counts.entries()].sort((a,b)=>b[1].count-a[1].count||a[1].property.localeCompare(b[1].property)||a[1].roomCode.localeCompare(b[1].roomCode));
    for(const [id,entry] of ranked)cards.push({id,room:entry.roomCode,property:entry.property,status:`${entry.count} yêu cầu / khiếu nại`,total:null,amountLabel:'Theo tháng gửi',details:[`${entry.open} yêu cầu đang chờ hoặc đang xử lý.`],href:'/admin/requests'});
    summary=`Xếp theo khiếu nại/yêu cầu phòng gửi trong tháng ${input.period.slice(5)}/${input.period.slice(0,4)}. Nguồn danh sách hiện trả tối đa 100 yêu cầu gần nhất; ${complaints.length===100?'kết quả có thể chưa bao quát toàn bộ lịch sử.':'kết quả chỉ phản ánh dữ liệu API hiện có.'}`;
   }else if(input.task==='residents'){
    const profiles=await pages<Resident>('/residents');
    const scoped=selected?profiles.filter(r=>r.room_residents?.some(o=>o.status==='active'&&o.room_id===selected.id)):profiles;
    const living=scoped.filter(r=>r.residence_status==='living');
    const left=selected?0:scoped.filter(r=>r.residence_status==='left').length;
    const registrationPending=living.filter(r=>r.residence_registration_status==='not_completed').length;
    const temporaryResidents=living.filter(r=>r.residence_registration_status==='temporary_resident').length;
    const temporaryAbsences=living.filter(r=>r.residence_registration_status==='temporary_absence').length;
    const details=selected?`${living.length} cư dân đang ở; ${registrationPending} người chưa hoàn tất đăng ký tạm trú/tạm vắng.`:`${living.length} cư dân đang ở, ${left} hồ sơ đã rời đi; trong số đang ở có ${registrationPending} người chưa hoàn tất đăng ký, ${temporaryResidents} người đã đăng ký tạm trú và ${temporaryAbsences} người đăng ký tạm vắng.`;
    summary=`${selected?`${selected.key}: `:'Toàn tài khoản: '}${details} Cloudy chỉ tổng hợp số lượng trong chat; mở Hồ sơ cư dân để xem từng người.`;
    cards.push({id:'resident-summary',room:selected?.roomCode||'Toàn khu',property:selected?.propertyName||`${properties.length} khu trọ`,status:'Tổng hợp cư trú',total:null,amountLabel:'Thống kê',details:[details,'Danh tính từng cư dân không hiển thị trong hội thoại.'],href:'/admin/tenants'});
   }else if(input.task==='feedback_messages'){
    const complaints=(await get<{data:Complaint[]}>('/room-requests')).data;
    const matches=complaints.filter(r=>r.created_at.slice(0,7)===input.period&&(!selected||r.room_id===selected.id));
    for(const r of matches)cards.push({id:`feedback-${r.complaint_id}`,room:r.room_code||'Theo khu trọ',property:r.property_name,status:({pending:'Chờ xử lý',in_progress:'Đang xử lý',resolved:'Đã giải quyết',rejected:'Đã từ chối'} as Record<string,string>)[r.status]||r.status,total:null,amountLabel:'Phản hồi từ khách',details:[r.category,r.content],href:'/admin/requests'});
    const coverage=complaints.length===100?'Đã đạt giới hạn 100 phản hồi gần nhất nên tổng có thể chưa bao quát toàn bộ lịch sử.':'Số lượng tính trên danh sách phản hồi mà API hiện trả về.';
    summary=`Có ${matches.length} phản hồi từ khách trong tháng ${input.period.slice(5)}/${input.period.slice(0,4)}${selected?` tại ${selected.key}`:' trong các khu trọ thuộc tài khoản'}. ${coverage}`;
   }else if(input.task==='requests'){
    const complaints=(await get<{data:Complaint[]}>('/room-requests')).data;
    for(const r of complaints.filter(r=>r.created_at.slice(0,7)===input.period&&(!selected||r.room_id===selected.id)))cards.push({id:`complaint-${r.complaint_id}`,room:r.room_code||'Theo khu trọ',property:r.property_name,status:({pending:'Chờ xử lý',in_progress:'Đang xử lý',resolved:'Đã giải quyết',rejected:'Đã từ chối'} as Record<string,string>)[r.status]||r.status,total:null,amountLabel:'Yêu cầu / khiếu nại',details:[r.category,r.content],href:'/admin/requests'});
    for(const p of properties){const bookings=(await get<{data:AdminServiceBooking[]}>(`/properties/${p.property_id}/service-bookings?status=PENDING`)).data;
     for(const b of bookings.filter(b=>b.service_date.slice(0,7)===input.period&&(!selected||rooms.find(r=>r.id===selected.id)?.key===`${p.name} / ${b.room_code} [${selected.id}]`)))cards.push({id:`booking-${b.booking_id}`,room:b.room_code||'Theo khu trọ',property:p.name,status:'Chờ duyệt tiện ích',total:null,amountLabel:'Chưa tạo khoản thu',details:[b.service_name,`${b.service_date} ${b.start_time}–${b.end_time}`],href:'/admin/services/flexible'});
    }
    summary=`${cards.length} yêu cầu trong phạm vi trả về. Khiếu nại theo tháng gửi (API tối đa 100 gần nhất); tiện ích đang chờ theo tháng sử dụng. Mở màn quản lý để xử lý.`;
   }else if(input.task==='missing'){
    const rows=await pages<BillingWorkspaceRow>('/billing/workspace'+(selected?`?room_id=${selected.id}`:''),50);
    for(const r of rows.filter(r=>r.period.period_end.slice(0,7)===input.period&&r.missing_or_invalid.length))cards.push({id:r.contract_id+':'+r.period.period_end,room:r.room.room_code,property:r.property.name,status:r.state.label,total:null,amountLabel:'Chưa đủ dữ liệu',details:r.missing_or_invalid.map(m=>m.message),href:'/admin/billing'});
    summary=`${cards.length} kỳ hợp đồng còn thiếu dữ liệu theo kiểm tra của backend.`;
   }else{
    const invoices=await pages<InvoiceResource>('/invoices'+(selected?`?room_id=${selected.id}`:''));
    const scoped=invoices.filter(i=>i.period_end.slice(0,7)===input.period);
    const allOutstanding=invoices.filter(i=>i.status==='unpaid'&&i.finalized_at);
    const outstanding=scoped.filter(i=>i.status==='unpaid'&&i.finalized_at);
    const chosen=input.task==='unpaid'?outstanding:input.task==='paid'?scoped.filter(i=>i.status==='paid'&&i.finalized_at):input.task==='overview'?scoped.filter(i=>i.status!=='paid'):scoped;
    for(const i of chosen){
     const dueDateText=i.due_date?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${i.due_date}T00:00:00+07:00`)):'chưa có';
     const details=[`Kỳ thực tế: ${i.period_start} → ${i.period_end}.`,`Hạn thanh toán: ${dueDateText}.`];
     if(input.task==='utilities'&&i.finalized_at){
      const d=(await get<{data:InvoiceDetailResponse}>(`/invoices/${i.invoice_id}`)).data;
      details.push(`Điện: ${d.electricity_previous_kwh??'?'} → ${d.electricity_current_kwh??'?'} kWh; thành tiền đã lưu ${money(d.electricity_amount)}.`,`Nước: ${d.water_previous_m3??'?'} → ${d.water_current_m3??'?'} m³; thành tiền đã lưu ${money(d.water_amount)}.`);
      if(d.itemization_available){for(const item of d.invoice_items.filter(x=>['ELECTRICITY','WATER'].includes(x.category))){details.push(`${item.label}: ${item.quantity} ${item.unit}, ${money(item.amount)}.`);for(const tier of item.electricity_tiers||[])details.push(`Bậc ${tier.tier_no}: ${tier.quantity} kWh × ${money(tier.unit_price)}; đã lưu ${money(tier.amount)}.`);}}
      else details.push('Hóa đơn cũ chỉ có tổng hợp; không dựng thêm bậc giá.');
     }
     if(!i.finalized_at)details.push('Bản nháp chưa phải khoản phải thu. Xem Vận hành hóa đơn để bổ sung dữ liệu.');
     cards.push({id:i.invoice_id,room:i.contract?.room_code||'Không có mã phòng',property:i.contract?.property?.name||'Khu trọ',status:invoiceDisplayStatus(i.status,i.is_overdue,i.due_date,today()),total:i.finalized_at?Number(i.total_amount):null,details,href:`/admin/invoices/${i.invoice_id}`});
    }
    if(input.task==='unpaid'){
     const countDue=(label:string)=>outstanding.filter(i=>invoiceDueStateLabel(i.status,i.is_overdue,i.due_date,today())===label).length;
      const overdue=countDue('Quá hạn'),dueToday=countDue('Đến hạn hôm nay'),inTime=countDue('Còn hạn');
      const needsReview=countDue('Cần kiểm tra hạn')+countDue('Thiếu hạn thanh toán');
      const dueSummary=`${overdue} quá hạn, ${dueToday} đến hạn hôm nay, ${inTime} còn hạn${needsReview?`, ${needsReview} cần kiểm tra hạn`:''}`;
      const total=outstanding.reduce((sum,i)=>sum+Number(i.total_amount),0);
      const periodLabel=`${input.period.slice(5)}/${input.period.slice(0,4)}`;
      const otherPeriods=[...new Set(allOutstanding.map(i=>i.period_end.slice(0,7)).filter(period=>period!==input.period))].sort().reverse();
      const otherPeriodHint=!outstanding.length&&otherPeriods.length
       ?` Ở các kỳ khác có hóa đơn chưa thanh toán kết thúc vào tháng ${otherPeriods.slice(0,5).map(period=>`${period.slice(5)}/${period.slice(0,4)}`).join(', ')}. Bạn có thể nhắn “xem tháng ${otherPeriods[0].slice(5)}/${otherPeriods[0].slice(0,4)}” để tra cứu kỳ đó.`
       :'';
      summary=`${outstanding.length} hóa đơn đã chốt, chưa thanh toán trong tháng ${periodLabel} · tổng ${money(total)}. Trong đó: ${dueSummary}. Bản nháp và hóa đơn đã thanh toán không nằm trong danh sách. “Chưa thanh toán” là trạng thái hóa đơn; nhãn hạn thanh toán mô tả riêng ngày đến hạn. Tháng được xác định theo ngày kết thúc kỳ.${otherPeriodHint}`;
    }else if(input.task==='paid')summary=`${cards.length} hóa đơn đã thanh toán trong tháng ${input.period.slice(5)}/${input.period.slice(0,4)}. Chỉ tính hóa đơn đã chốt, lọc theo ngày kết thúc kỳ; số tiền lấy từ backend.`;
    else summary=`${cards.length} hóa đơn phù hợp; ${outstanding.length} đã chốt chưa thanh toán, ${outstanding.filter(i=>i.is_overdue).length} quá hạn. Lọc tháng theo ngày kết thúc kỳ; số tiền lấy từ backend.`;
   }
   return {synthetic:false,source:'database',summary,cards};
  },
 };
}
