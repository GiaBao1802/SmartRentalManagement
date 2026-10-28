import {AccessError} from '../../../scripts/owner-advisor-demo/auth.mjs';
import type {InvoiceResource,InvoiceDetailResponse,BillingWorkspaceRow} from './api/invoiceApi';
import type {Property} from './api/propertyApi';
import type {Room} from './api/roomApi';
import type {AdminServiceBooking} from './api/propertyServiceApi';
const money=(value:string)=>new Intl.NumberFormat('vi-VN').format(Number(value))+' đ';
const tasks={unpaid:'Hóa đơn chưa thanh toán',utilities:'Giải thích tiền điện nước',missing:'Thiếu dữ liệu lập hóa đơn',overview:'Việc cần kiểm tra trong kỳ',requests:'Yêu cầu tiện ích và khiếu nại'};
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
  const rooms:{id:string;key:string}[]=[];
  for(const p of properties){for(const r of await pages<Room>(`/properties/${p.property_id}/rooms`))rooms.push({id:r.room_id,key:`${p.name} / ${r.room_code} [${r.room_id}]`});}
  return {properties,rooms};
 }
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {
  async catalog(){
   const {rooms,properties}=await inventory();const invoices=await pages<InvoiceResource>('/invoices');
   const complaints=(await get<{data:Complaint[]}>('/room-requests')).data;
   const bookingMonths:string[]=[];for(const p of properties){const data=(await get<{data:AdminServiceBooking[]}>(`/properties/${p.property_id}/service-bookings?status=PENDING`)).data;bookingMonths.push(...data.map(b=>b.service_date.slice(0,7)));}
   return {source:'database',synthetic:false,asOf:today(),tasks,properties:properties.map(({property_id,name,province})=>({property_id,name,province})),rooms:rooms.map(r=>r.key),periods:[...new Set([today().slice(0,7),...invoices.map(i=>i.period_end.slice(0,7)),...complaints.map(c=>c.created_at.slice(0,7)),...bookingMonths])].sort().reverse()};
  },
  async answer(input:{task:string;period:string;room:string}){
   if(!Object.hasOwn(tasks,input.task)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)||typeof input.room!=='string'||input.room.length>500)throw new AccessError(400,'Phạm vi tra cứu không hợp lệ.');
   const {rooms,properties}=await inventory();const selected=rooms.find(r=>r.key===input.room);
   if(input.room&&!selected)throw new AccessError(404,'Không tìm thấy phòng trong tài khoản.');
   const cards:{id:string;room:string;property:string;status:string;total:number|null;details:string[];href?:string;amountLabel?:string}[]=[];
   let summary='';
   if(input.task==='requests'){
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
    const outstanding=scoped.filter(i=>i.status==='unpaid'&&i.finalized_at);
    const chosen=input.task==='unpaid'?outstanding:input.task==='overview'?scoped.filter(i=>i.status!=='paid'):scoped;
    for(const i of chosen){
     const details=[`Kỳ thực tế: ${i.period_start} → ${i.period_end}.`,...(i.due_date?[`Hạn thanh toán: ${i.due_date}.`]:[])];
     if(input.task==='utilities'&&i.finalized_at){
      const d=(await get<{data:InvoiceDetailResponse}>(`/invoices/${i.invoice_id}`)).data;
      details.push(`Điện: ${d.electricity_previous_kwh??'?'} → ${d.electricity_current_kwh??'?'} kWh; thành tiền đã lưu ${money(d.electricity_amount)}.`,`Nước: ${d.water_previous_m3??'?'} → ${d.water_current_m3??'?'} m³; thành tiền đã lưu ${money(d.water_amount)}.`);
      if(d.itemization_available){for(const item of d.invoice_items.filter(x=>['ELECTRICITY','WATER'].includes(x.category))){details.push(`${item.label}: ${item.quantity} ${item.unit}, ${money(item.amount)}.`);for(const tier of item.electricity_tiers||[])details.push(`Bậc ${tier.tier_no}: ${tier.quantity} kWh × ${money(tier.unit_price)}; đã lưu ${money(tier.amount)}.`);}}
      else details.push('Hóa đơn cũ chỉ có tổng hợp; không dựng thêm bậc giá.');
     }
     if(!i.finalized_at)details.push('Bản nháp chưa phải khoản phải thu. Xem Vận hành hóa đơn để bổ sung dữ liệu.');
     cards.push({id:i.invoice_id,room:i.contract?.room_code||'Không có mã phòng',property:i.contract?.property?.name||'Khu trọ',status:i.status==='draft'?'Bản nháp':i.status==='paid'?'Đã thanh toán':i.is_overdue?'Quá hạn':'Chưa thanh toán',total:i.finalized_at?Number(i.total_amount):null,details,href:`/admin/invoices/${i.invoice_id}`});
    }
    summary=`${cards.length} hóa đơn phù hợp; ${outstanding.length} đã chốt chưa thanh toán, ${outstanding.filter(i=>i.is_overdue).length} quá hạn. Lọc tháng theo ngày kết thúc kỳ; số tiền lấy từ backend.`;
   }
   return {synthetic:false,source:'database',summary,cards};
  },
 };
}
