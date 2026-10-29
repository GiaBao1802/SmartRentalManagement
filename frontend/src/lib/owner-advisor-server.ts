import {requireOwner,AccessError} from '../../../scripts/owner-advisor-demo/auth.mjs';
import {answer,interpret,tasks} from '../../../scripts/owner-advisor-demo/engine.mjs';
import manifest from '../../../data/owner-ai/v1/manifest.json';
import rooms from '../../../data/owner-ai/v1/rooms.json';
import invoices from '../../../data/owner-ai/v1/invoices.json';
import {createLiveAdvisor} from './owner-advisor-live';
import {ownerRequestDemo} from './owner-request-demo';
import {ownerQuestionTask} from './owner-chat-intent';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleOwnerAdvisor(request:Request,{mode=process.env.NODE_ENV,fetchImpl=fetch,interpretImpl=interpret,source='database'}={}) {
 if(mode!=='development')return json({error:'Tính năng thử nghiệm chưa bật.'},404);
 const url=new URL(request.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||request.headers.get('host')!==url.host||(request.method==='POST'&&request.headers.get('origin')!==url.origin))return json({error:'Nguồn truy cập không hợp lệ.'},403);
 try{
  const identity=await requireOwner({headers:{cookie:request.headers.get('cookie')||''}},{fetchImpl,apiBase:process.env.OWNER_ADVISOR_API_BASE||process.env.NEXT_PUBLIC_API_BASE_URL||'http://localhost:4000/api/v1'});
  const live=source==='database'?createLiveAdvisor(request.headers.get('cookie')||'',fetchImpl,request.signal):null;
  if(request.method==='GET'&&live)return json(await live.catalog());
  const allowed=identity.ownerId===manifest.ownerId&&identity.accountId===manifest.accountId;
  const rows=allowed?invoices.filter(r=>r.ownerId===identity.ownerId):[];
  if(request.method==='GET')return json({synthetic:true,asOf:manifest.asOf,tasks:{...tasks,requests:'Xử lý yêu cầu từ người thuê (mô phỏng)'},rooms:allowed?rooms.map(r=>r.code):[],periods:[...new Set(rows.map(r=>r.period))].sort().reverse()});
  if(request.method!=='POST')return json({error:'Không hỗ trợ thao tác này.'},405);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'Cần JSON.'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'Thiếu dữ liệu.'},400);
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json({error:'Nội dung quá dài.'},413);}chunks.push(value);}
  const body=JSON.parse(Buffer.concat(chunks).toString());
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Dữ liệu không hợp lệ.'},400);
  if(Object.keys(body).join()==='question'){
   if(source==='database'&&typeof body.question==='string'&&body.question.length<=500){const routed=ownerQuestionTask(body.question);if(routed)return json({task:routed,source:'request_router',reviewRequired:false,message:'Mình sẽ kiểm tra dữ liệu đúng phạm vi tài khoản của bạn.'});}
  if(typeof body.question==='string'&&body.question.length<=500&&/khieu nai|tien ich|yeu cau|phan anh|su co|bao hu|bao hong|hu hong/.test(body.question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase()))return json({task:'requests',source:'request_router',reviewRequired:false,message:'Mình sẽ tra cứu yêu cầu trong phạm vi tài khoản của bạn. Mọi quyết định xử lý vẫn cần bạn chọn và xác nhận riêng.'});
   const plain=typeof body.question==='string'?body.question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase():'';
   if(source==='database'&&typeof body.question==='string'&&body.question.length<=500&&/thong ke|bao nhieu|so luong/.test(plain)&&/cu dan|nguoi o|nguoi dang o/.test(plain))return json({task:'residents',source:'request_router',reviewRequired:false,message:'Mình sẽ tra cứu thống kê hiện tại trong phạm vi tài khoản của bạn.'});
   return json(await interpretImpl(body.question,{signal:request.signal}));
  }
  if(live&&Object.hasOwn(body,'action'))return json({error:'Mở màn quản lý để xác nhận xử lý yêu cầu thật.'},400);
  if(Object.keys(body).sort().join()==='action,confirmed,reason,requestId,revision')return json(ownerRequestDemo.decide(identity.ownerId,identity.accountId,body));
  const keys=Object.keys(body).sort().join();
  const readOnlyTasks=['unpaid','paid','utilities','missing','overview','requests','feedback_messages','residents','available_rooms','vehicle_counts','electricity_ranking','frequent_requests'];
  const directRead=readOnlyTasks.includes(body.task)&&keys==='period,room,task'||body.task==='transaction_lookup'&&keys==='period,room,task,transactionCode'&&typeof body.transactionCode==='string';
  const confirmedRead=keys==='confirmed,period,room,task'&&body.confirmed===true;
  if(!directRead&&!confirmedRead)return json({error:'Phạm vi tra cứu không hợp lệ hoặc thiếu xác nhận.'},400);
  const query={task:body.task,period:body.period,room:body.room,...(body.task==='transaction_lookup'?{transactionCode:body.transactionCode}: {})};
  if(live)return json(await live.answer(query));
  if(query.task==='requests')return json({synthetic:true,summary:'Yêu cầu giả lập. Thao tác chỉ lưu trong bộ nhớ máy chủ, mất khi khởi động lại. Không tạo phí hoặc thay đổi yêu cầu thật.',requests:ownerRequestDemo.list(identity.ownerId,identity.accountId,query.period,query.room),cards:[]});
  return json(answer(query,{...identity,asOf:manifest.asOf,synthetic:true},rows));
 }catch(error){return json({error:error instanceof AccessError?error.message:'Không xử lý được yêu cầu. Kiểm tra AI local và dữ liệu nhập.'},error instanceof AccessError?error.status:400);}
}
