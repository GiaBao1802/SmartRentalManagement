import seed from '../../../data/owner-ai/v1/requests.json';
import {AccessError} from '../../../scripts/owner-advisor-demo/auth.mjs';
export const requestActions:Record<string,string>={approve:'Duyệt mô phỏng',reject:'Từ chối mô phỏng',receive:'Tiếp nhận mô phỏng',resolve:'Đã giải quyết mô phỏng',reopen:'Mở lại mô phỏng'};
type History={action:string;reason:string;at:string;accountId:string};
type Row=Omit<typeof seed[number],'history'> & {history:History[]};
const transitions:Record<string,Record<string,string>>={
 'service:pending':{approve:'approved',reject:'rejected'},
 'complaint:pending':{receive:'in_progress',reject:'rejected'},
 'complaint:in_progress':{resolve:'resolved'},
 'complaint:resolved':{reopen:'in_progress'},
 'complaint:rejected':{reopen:'in_progress'},
};
export function createRequestDemo(){
 const rows:Row[]=structuredClone(seed);
 return {
  list(ownerId:string,accountId:string,period:string,room:string){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||typeof room!=='string'||room.length>20)throw new AccessError(400,'Chọn tháng và phòng hợp lệ.');
   return rows.filter(r=>r.ownerId===ownerId&&r.accountId===accountId&&r.createdAt.startsWith(period)&&(!room||room===r.room)).map(r=>({...structuredClone(r),actions:Object.keys(transitions[`${r.kind}:${r.status}`]||{}),actionLabels:requestActions}));
  },
  decide(ownerId:string,accountId:string,input:{requestId:string;action:string;revision:number;reason:string;confirmed:boolean}){
   if(input.confirmed!==true||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||!Number.isInteger(input.revision))throw new AccessError(400,'Cần xác nhận và nhập lý do từ 1–1000 ký tự.');
   const row=rows.find(r=>r.id===input.requestId&&r.ownerId===ownerId&&r.accountId===accountId);
   if(!row)throw new AccessError(404,'Không tìm thấy yêu cầu.');
   if(row.revision!==input.revision)throw new AccessError(409,'Yêu cầu đã thay đổi. Hãy tải lại danh sách.');
   const status=transitions[`${row.kind}:${row.status}`]?.[input.action];
   if(!status)throw new AccessError(409,'Thao tác không phù hợp trạng thái hiện tại.');
   row.status=status;row.revision++;row.history.push({action:input.action,reason:input.reason.trim(),at:new Date().toISOString(),accountId});
   return {synthetic:true,message:'Đã cập nhật mô phỏng. Không tạo phí, gửi tin hoặc thay đổi dữ liệu thật. Trạng thái mẫu mất khi máy chủ khởi động lại.'};
  },
 };
}
const state=globalThis as typeof globalThis & {ownerRequestDemo?:ReturnType<typeof createRequestDemo>};
export const ownerRequestDemo=state.ownerRequestDemo??=createRequestDemo();
