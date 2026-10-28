"use client";
import {useEffect,useRef,useState} from 'react';
import {proposeOwnerScope,ownerConfirmation,parseOwnerClarificationReply,namesDifferentOwnerTask,ownerUnknownIntentMessage} from '../../lib/owner-chat-intent';
import {OWNER_ADVISOR_ENDPOINT} from '../../lib/owner-advisor-endpoint';
import {CloudyOwnerRequests,type OwnerRequest} from './cloudy-owner-requests';
import {propertyServiceApi,type FlexibleServiceConfigurationInput} from '../../lib/api/propertyServiceApi';
type Catalog={source?:string;tasks:Record<string,string>;rooms:string[];periods:string[];properties?:{property_id:string;name:string;province:string}[];asOf:string};
type Result={summary:string;requests?:OwnerRequest[];cards:{id:string;room:string;property:string;status:string;total:number|null;details:string[];href?:string;amountLabel?:string}[]};
type ServiceDraft={kind:'free'|'paid'|'flexible'|null;propertyId:string;name:string;unit:string;price:string;effectiveFrom:string;location:string;serviceMode:'BOOKING'|'SUBSCRIPTION'|null;weekdays:number[];opensAt:string;closesAt:string;slotDurationMinutes:string;capacityPerSlot:string;packageDurationCount:string;packageDurationUnit:'MONTH'|'YEAR'};
const emptyServiceDraft=():ServiceDraft=>({kind:null,propertyId:'',name:'',unit:'',price:'',location:'',effectiveFrom:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),serviceMode:null,weekdays:[],opensAt:'',closesAt:'',slotDurationMinutes:'60',capacityPerSlot:'1',packageDurationCount:'1',packageDurationUnit:'MONTH'});
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
const requestsServiceCreation=(value:string)=>/\b(tao|them|dang ky|bo sung|mo)\b/.test(normalized(value))&&/\b(tien ich|dich vu|wifi|internet|rac|ve sinh)\b/.test(normalized(value));
const serviceCode=(value:string)=>normalized(value).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'DICH-VU-MOI';
export function CloudyOwnerAdvisor(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[question,setQuestion]=useState(''),[task,setTask]=useState(''),[period,setPeriod]=useState(''),[room,setRoom]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('Đang tải phòng của tài khoản…'),[result,setResult]=useState<Result|null>(null);
 const chatEnd=useRef<HTMLDivElement|null>(null);
 const [messages,setMessages]=useState<{role:string;text:string}[]>([]),[proposed,setProposed]=useState(false),[roomUnknown,setRoomUnknown]=useState(false);
 const [serviceStep,setServiceStep]=useState<'type'|'property'|'name'|'location'|'unit'|'mode'|'weekdays'|'hours'|'slotDuration'|'capacity'|'packageDuration'|'price'|'date'|'confirm'|null>(null),[serviceDraft,setServiceDraft]=useState<ServiceDraft>(emptyServiceDraft),[serviceSaving,setServiceSaving]=useState(false),[serviceFormError,setServiceFormError]=useState('');
 const pending=useRef<AbortController|null>(null);
 const [reload,setReload]=useState(0),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setLoadError('');setCatalog(null);setServiceStep(null);setServiceDraft(emptyServiceDraft());fetch(OWNER_ADVISOR_ENDPOINT,{signal:controller.signal,cache:'no-store',credentials:'same-origin'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Không tải được dữ liệu.');if(controller.signal.aborted)return;setCatalog(data);setNote(data.rooms.length?`${data.rooms.length} phòng từ ${data.source==='database'?'database hiện tại':'bộ mẫu'} của tài khoản. Ngày đối chiếu: ${data.asOf}.`:'Tài khoản này chưa có phòng trong dữ liệu quản lý.');}).catch(e=>{if(!controller.signal.aborted)setLoadError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>{controller.abort();pending.current?.abort();};},[reload]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({block:"nearest"});},[messages,proposed,busy]);
 function invalidate(){pending.current?.abort();pending.current=null;setBusy(false);setProposed(false);setResult(null);}
 function askServiceStep(step:NonNullable<typeof serviceStep>,text:string){setServiceStep(step);setServiceFormError('');setMessages(m=>[...m,{role:'cloudy',text}]);}
 function startServiceCreation(text:string){invalidate();setServiceDraft(emptyServiceDraft());setServiceFormError('');setServiceStep('type');setQuestion('');setMessages(m=>[...m,{role:'user',text},{role:'cloudy',text:'Bạn muốn tạo loại nào?'}]);}
 function addServiceReply(raw:string){
  const value=raw.trim(),v=normalized(value);if(!serviceStep||!catalog)return;
  setQuestion('');setMessages(m=>[...m,{role:'user',text:value}]);
  if(['huy','huy tao','huy bo','bo qua'].includes(v)){setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:'Đã hủy. Chưa lưu thay đổi.'}]);return;}
  if(serviceStep==='type'){
   const kind=v.includes('mien phi')||v==='free'?'free':v.includes('co dinh')||v==='paid'?'paid':v.includes('phat sinh')||v.includes('dat lich')||v==='flexible'?'flexible':null;
   if(!kind){setMessages(m=>[...m,{role:'cloudy',text:'Chọn một loại bên dưới nhé.'}]);return;}
   setServiceDraft(d=>({...d,kind}));askServiceStep('property','Chọn khu trọ áp dụng.');return;
  }
  if(serviceStep==='property'){
   const property=(catalog.properties||[]).find(p=>p.property_id===value||normalized(`${p.name} ${p.province}`)===v||normalized(p.name)===v);
   if(!property){setMessages(m=>[...m,{role:'cloudy',text:'Chọn đúng khu trọ trong danh sách nhé.'}]);return;}
   setServiceDraft(d=>({...d,propertyId:property.property_id}));askServiceStep('name','Tên tiện ích/dịch vụ là gì?');return;
  }
  if(serviceStep==='name'){
   if(!value||value.length>150){setMessages(m=>[...m,{role:'cloudy',text:'Tên cần từ 1 đến 150 ký tự. Nhập lại nhé.'}]);return;}
   const kind=serviceDraft.kind;setServiceDraft(d=>({...d,name:value}));
   if(kind==='free')askServiceStep('location','Tiện ích ở vị trí nào? Có thể ghi “toàn khu”.');
   else if(kind==='paid')askServiceStep('unit','Đơn vị tính là gì? Ví dụ: tháng hoặc phòng/kỳ.');
   else askServiceStep('mode','Dịch vụ dùng theo lượt đặt lịch hay theo gói?');return;
  }
  if(serviceStep==='location'){
   if(value.length>200){setMessages(m=>[...m,{role:'cloudy',text:'Vị trí tối đa 200 ký tự. Nhập lại nhé.'}]);return;}
   setServiceDraft(d=>({...d,location:value}));askServiceStep('confirm','Đã đủ thông tin. Bạn xem phần tóm tắt bên dưới rồi xác nhận lưu nhé.');return;
  }
  if(serviceStep==='unit'){
   if(!value||value.length>30){setMessages(m=>[...m,{role:'cloudy',text:'Đơn vị tính tối đa 30 ký tự. Nhập lại nhé.'}]);return;}
   setServiceDraft(d=>({...d,unit:value}));askServiceStep('price','Giá mỗi đơn vị là bao nhiêu VND? Nhập số nguyên.');return;
  }
  if(serviceStep==='mode'){
   const mode=v.includes('goi')||v==='subscription'?'SUBSCRIPTION':v.includes('luot')||v.includes('dat lich')||v==='booking'?'BOOKING':null;
   if(!mode){setMessages(m=>[...m,{role:'cloudy',text:'Chọn đặt lịch từng lượt hoặc gói sử dụng.'}]);return;}
   setServiceDraft(d=>({...d,serviceMode:mode}));askServiceStep('weekdays','Ngày nào mở cửa? Nhập các thứ, ví dụ: thứ 2, thứ 4, thứ 6 hoặc “cả tuần”.');return;
  }
  if(serviceStep==='weekdays'){
   const days=new Set<number>();if(v.includes('ca tuan'))[1,2,3,4,5,6,7].forEach(d=>days.add(d));else for(const [word,day] of [['2',1],['hai',1],['3',2],['ba',2],['4',3],['tu',3],['5',4],['nam',4],['6',5],['sau',5],['7',6],['bay',6],['chu nhat',7]] as const){if(new RegExp(`(?:thu\\s*${word}|\\b${word}\\b)`).test(v))days.add(day);}
   if(!days.size){setMessages(m=>[...m,{role:'cloudy',text:'Mình chưa nhận ra ngày mở cửa. Nhập các thứ hoặc “cả tuần” nhé.'}]);return;}
   setServiceDraft(d=>({...d,weekdays:[...days].sort((a,b)=>a-b)}));askServiceStep('hours','Giờ mở và đóng cửa? Nhập dạng 08:00-20:00.');return;
  }
  if(serviceStep==='hours'){
   const match=/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(value),validTime=(t:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
   if(!match||!validTime(match[1])||!validTime(match[2])||match[2]<=match[1]){setMessages(m=>[...m,{role:'cloudy',text:'Giờ chưa hợp lệ. Ví dụ: 08:00-20:00.'}]);return;}
   setServiceDraft(d=>({...d,opensAt:match[1],closesAt:match[2]}));askServiceStep(serviceDraft.serviceMode==='BOOKING'?'slotDuration':'packageDuration',serviceDraft.serviceMode==='BOOKING'?'Mỗi lượt kéo dài bao nhiêu phút?':'Gói kéo dài bao lâu? Nhập số tháng hoặc năm, ví dụ 1 tháng.');return;
  }
  if(serviceStep==='slotDuration'){
   const n=Number(v.replace(/\s*phut$/,''));if(!Number.isInteger(n)||n<1||n>1440){setMessages(m=>[...m,{role:'cloudy',text:'Thời lượng phải từ 1 đến 1440 phút. Nhập lại nhé.'}]);return;}
   setServiceDraft(d=>({...d,slotDurationMinutes:String(n)}));askServiceStep('capacity','Mỗi khung giờ nhận tối đa bao nhiêu người?');return;
  }
  if(serviceStep==='capacity'){
   const n=Number(v);if(!Number.isInteger(n)||n<1){setMessages(m=>[...m,{role:'cloudy',text:'Sức chứa phải là số nguyên từ 1 trở lên.'}]);return;}
   setServiceDraft(d=>({...d,capacityPerSlot:String(n)}));askServiceStep('price','Giá mỗi lượt là bao nhiêu VND? Nhập số nguyên.');return;
  }
  if(serviceStep==='packageDuration'){
   const match=/^(\d+)\s*(thang|nam)$/.exec(v);if(!match||Number(match[1])<1){setMessages(m=>[...m,{role:'cloudy',text:'Nhập thời hạn như “1 tháng” hoặc “1 năm”.'}]);return;}
   setServiceDraft(d=>({...d,packageDurationCount:match[1],packageDurationUnit:match[2]==='nam'?'YEAR':'MONTH'}));askServiceStep('price','Giá mỗi gói là bao nhiêu VND? Nhập số nguyên.');return;
  }
  if(serviceStep==='price'){
   const digits=value.replace(/[.,\sđ₫]/gi,'');if(!/^\d+$/.test(digits)||!Number.isSafeInteger(Number(digits))){setMessages(m=>[...m,{role:'cloudy',text:'Nhập giá VND bằng số nguyên, ví dụ 50000.'}]);return;}
   setServiceDraft(d=>({...d,price:digits}));askServiceStep('date',`Giá hiệu lực từ ngày nào? Nhập YYYY-MM-DD hoặc “hôm nay” (${serviceDraft.effectiveFrom}).`);return;
  }
  if(serviceStep==='date'){
   const date=(v==='hom nay'?serviceDraft.effectiveFrom:value),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),parsed=m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))):null;
   if(!parsed||parsed.toISOString().slice(0,10)!==date){setMessages(m=>[...m,{role:'cloudy',text:'Ngày không hợp lệ. Nhập YYYY-MM-DD hoặc “hôm nay”.'}]);return;}
   setServiceDraft(d=>({...d,effectiveFrom:date}));askServiceStep('confirm','Thông tin đã đủ. Kiểm tra tóm tắt và xác nhận để lưu.');return;
  }
 }
 async function confirmServiceCreation(){
  if(!serviceStep||serviceStep!=='confirm'||serviceSaving||!serviceDraft.propertyId)return;
  if(serviceDraft.kind==='flexible'&&!serviceDraft.serviceMode)return;
  setServiceSaving(true);
  try{
   if(serviceDraft.kind==='free'){
    const existing=await propertyServiceApi.listFacilities(serviceDraft.propertyId);
    if(existing.items.some(item=>normalized(item.name)===normalized(serviceDraft.name)))throw new Error('Tên tiện ích miễn phí này đã có ở khu trọ. Mình chưa tạo trùng; hãy kiểm tra danh mục hoặc đổi tên.');
    const facility=await propertyServiceApi.createFacility(serviceDraft.propertyId,{name:serviceDraft.name,location:serviceDraft.location});
    setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:`Đã thêm tiện ích chung miễn phí “${facility.name}” tại ${facility.location||'khu trọ'}. Không tạo khoản thu hay hóa đơn.`}]);return;
   }
   const code=serviceCode(serviceDraft.name);
   const existing=await propertyServiceApi.list(serviceDraft.propertyId);
   if(existing.items.some(item=>item.code.toUpperCase()===code))throw new Error(`Mã tiện ích ${code} đã tồn tại ở khu trọ này. Mình chưa tạo thêm để tránh trùng; hãy kiểm tra danh mục hoặc đổi tên.`);
   if(serviceDraft.kind==='flexible'){
    const configuration:FlexibleServiceConfigurationInput=serviceDraft.serviceMode==='BOOKING'?{service_mode:'BOOKING',available_weekdays:serviceDraft.weekdays,opens_at:serviceDraft.opensAt,closes_at:serviceDraft.closesAt,booking:{slot_duration_minutes:Number(serviceDraft.slotDurationMinutes),capacity_per_slot:Number(serviceDraft.capacityPerSlot)}}:{service_mode:'SUBSCRIPTION',available_weekdays:serviceDraft.weekdays,opens_at:serviceDraft.opensAt,closes_at:serviceDraft.closesAt,subscription:{duration_count:Number(serviceDraft.packageDurationCount),duration_unit:serviceDraft.packageDurationUnit}};
    const created=await propertyServiceApi.create(serviceDraft.propertyId,{kind:'FLEXIBLE_SERVICE',code,name:serviceDraft.name,service_configuration:configuration});
    try{await propertyServiceApi.publishPrice(serviceDraft.propertyId,created.pricing_item_id,'FLEXIBLE_SERVICE',{effective_from:serviceDraft.effectiveFrom,unit_price:serviceDraft.price,source_name:'Tạo qua Cloudy'});}catch{setServiceStep(null);setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích phát sinh “${created.name}” nhưng chưa phát hành được giá. Tiện ích đang chưa có giá; hãy mở Dịch vụ & Tiện ích để phát hành giá, không gửi lại yêu cầu tạo.`}]);return;}
    setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích phát sinh “${created.name}” (${created.code}), kiểu ${serviceDraft.serviceMode==='BOOKING'?'đặt lịch':'gói sử dụng'} · ${serviceDraft.weekdays.length} ngày/tuần · ${serviceDraft.opensAt}–${serviceDraft.closesAt}; giá ${new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/${created.unit}, hiệu lực từ ${serviceDraft.effectiveFrom}.`}]);return;
   }
   const created=await propertyServiceApi.create(serviceDraft.propertyId,{kind:'FIXED_SERVICE',code,name:serviceDraft.name,unit:serviceDraft.unit});
   try{
    await propertyServiceApi.publishPrice(serviceDraft.propertyId,created.pricing_item_id,'FIXED_SERVICE',{effective_from:serviceDraft.effectiveFrom,unit_price:serviceDraft.price,source_name:'Tạo qua Cloudy'});
   }catch(error){setServiceStep(null);setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích “${created.name}” nhưng chưa phát hành được giá. Tiện ích đang chưa có giá; hãy mở Dịch vụ & Tiện ích để phát hành giá, không gửi lại yêu cầu tạo.`}]);return;}
   setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích cố định “${created.name}” (${created.code}) và phát hành giá ${new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/${created.unit}, hiệu lực từ ${serviceDraft.effectiveFrom}. Giá áp dụng theo quy tắc hóa đơn của dịch vụ cố định.`}]);
  }catch(error){setServiceFormError(error instanceof Error?error.message:'Chưa tạo được tiện ích. Kiểm tra lại thông tin hoặc thử lại.');}
  finally{setServiceSaving(false);}
 }
 async function decide(body:object){
  const controller=new AbortController();pending.current=controller;setBusy(true);
  try{
   const response=await fetch(OWNER_ADVISOR_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);
   const refreshed=await fetch(OWNER_ADVISOR_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'requests',period,room,confirmed:true}),signal:controller.signal});const list=await refreshed.json();if(!refreshed.ok)throw new Error(list.error);
   if(pending.current!==controller)return false;setResult(list);setMessages(m=>[...m,{role:'cloudy',text:data.message}]);return true;
  }catch(error){if(!controller.signal.aborted)setNote(error instanceof Error?error.message:'Không xử lý được yêu cầu.');return false;}finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
 }
 async function run(body:object,kind:'interpret'|'answer'){
  pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setResult(null);
  try{const r=await fetch(OWNER_ADVISOR_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'same-origin'});const data=await r.json();if(!r.ok)throw new Error(data.error);if(pending.current!==controller)return;
   if(kind==='interpret'){setQuestion('');
    if(data.task==='clarify'||!catalog?.tasks[data.task]){setProposed(false);setMessages(m=>[...m,{role:'cloudy',text:ownerUnknownIntentMessage(question,catalog||{tasks:{},rooms:[],periods:[],asOf:''})}]);}
    else{const scope=proposeOwnerScope(question,data.task,catalog);setTask(scope.task);setPeriod(scope.period||(data.task==='residents'?catalog.asOf.slice(0,7):''));setRoom(scope.room??'');setRoomUnknown(scope.room===null);setProposed(true);}

   }else{setProposed(false);setResult(data);setMessages(m=>[...m,{role:'cloudy',text:data.summary}]);setNote('');}
  }catch(e){if(!controller.signal.aborted)setMessages(m=>[...m,{role:'cloudy',text:e instanceof Error?e.message:'Có lỗi khi tải dữ liệu. Bạn thử gửi lại nhé.'}]);}finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
 }
 function submitQuestion(){
  const text=question.trim();if(!text||busy||!catalog)return;
  if(serviceStep){addServiceReply(text);return;}
  if(requestsServiceCreation(text)){startServiceCreation(text);return;}
  if(proposed&&catalog&&namesDifferentOwnerTask(text,task)){
   invalidate();setMessages(m=>[...m,{role:'user',text}]);void run({question:text},'interpret');return;
  }
  if(proposed&&(!period||roomUnknown)){
   setQuestion('');setResult(null);setMessages(m=>[...m,{role:'user',text}]);
   const kind:'period'|'room'=period?'room':'period';
   const parsed=parseOwnerClarificationReply(text,kind,catalog);
   if(parsed.resolved&&parsed.value!==null){
    if(kind==='period')setPeriod(parsed.value);else{setRoom(parsed.value);setRoomUnknown(false);}
   }else if(kind==='period')setMessages(m=>[...m,{role:'cloudy',text:`Mình chưa nhận ra tháng cần xem. Bạn có thể nhập hoặc chọn: ${catalog.periods.join(', ')}.`}]);
   else setMessages(m=>[...m,{role:'cloudy',text:'Mình chưa tìm thấy đúng mã phòng. Bạn nhập mã phòng, hoặc ghi “tất cả phòng”.'}]);
   return;
  }
  if(proposed){
   const parsedPeriod=parseOwnerClarificationReply(text,'period',catalog!);
   const mentionsPeriod=/\b(thang|ky)\b|\b20\d{2}-(?:0[1-9]|1[0-2])\b/.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
   const parsedRoom=parseOwnerClarificationReply(text,'room',catalog!);
   const mentionsRoom=/\bphong\b|\btat ca\b|\btoan bo\b|\bmoi phong\b|\bk\d+-p\d+\b/i.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d'));
   const nextPeriod=mentionsPeriod&&parsedPeriod.resolved?parsedPeriod.value!:period;
   const nextRoom=mentionsRoom&&parsedRoom.resolved?parsedRoom.value!:room;
   if(nextPeriod!==period||nextRoom!==room){setQuestion('');setPeriod(nextPeriod);setRoom(nextRoom);setRoomUnknown(false);setResult(null);setMessages(m=>[...m,{role:'user',text},{role:'cloudy',text:ownerConfirmation({task,period:nextPeriod,room:nextRoom},catalog!)}]);return;}
  }
  invalidate();setMessages(m=>[...m,{role:'user',text}]);void run({question:text},'interpret');
 }
 function changeQuestion(value:string){
  if(proposed){pending.current?.abort();pending.current=null;setResult(null);setBusy(false);}
  else invalidate();
  setQuestion(value);
 }
 const serviceFlowSteps=serviceDraft.kind==='free'?['type','property','name','location','confirm']:serviceDraft.kind==='paid'?['type','property','name','unit','price','date','confirm']:serviceDraft.serviceMode==='SUBSCRIPTION'?['type','property','name','mode','weekdays','hours','packageDuration','price','date','confirm']:['type','property','name','mode','weekdays','hours','slotDuration','capacity','price','date','confirm'];
 const serviceProgress=serviceStep?(serviceDraft.kind?`${serviceFlowSteps.indexOf(serviceStep)+1}/${serviceFlowSteps.length}`:'1'):'';
 return <div className="cloudy-owner">
  <p id="cloudy-chat-preview-note">Cloudy hỗ trợ chủ trọ kiểm tra cư dân, hóa đơn, điện nước, dữ liệu còn thiếu và yêu cầu từ người thuê. Nguồn: {catalog?.source==='database'?'database hiện tại, theo tài khoản đăng nhập':'đang kết nối'}.</p>
  <p role="status">{loading?'Đang tải danh sách phòng…':loadError?'Chưa tải được dữ liệu chủ trọ.':note}</p>
  {loadError&&<div role="alert"><p>{loadError}</p><button type="button" onClick={()=>{invalidate();setReload(n=>n+1);}}>Tải lại dữ liệu</button></div>}
  {catalog&&(catalog.rooms.length>0||(catalog.properties?.length||0)>0)&&<>
  <p className="cloudy-owner__bubble">Bạn muốn mình kiểm tra gì hôm nay, hay tạo tiện ích cố định hoặc phát sinh? Mình sẽ hỏi lại để bạn xác nhận trước khi tra cứu hoặc lưu.</p>
  {messages.map((m,i)=><p key={i} className={`cloudy-owner__bubble cloudy-owner__bubble--${m.role}`}>{m.text}</p>)}
  {proposed&&<div className="cloudy-owner__bubble" aria-live="polite">
   {!period?<><p>Mình hiểu bạn muốn xem {catalog.tasks[task]?.toLowerCase()}. Bạn muốn xem tháng nào? Các tháng hiện có:</p><div className="cloudy-owner__choices">{catalog.periods.map(p=><button key={p} type="button" onClick={()=>{setPeriod(p);setMessages(m=>[...m,{role:'user',text:`Tháng ${p}`}]);}}>{p}</button>)}</div></>:
    roomUnknown?<><p>Mình chưa xác định được chính xác phòng bạn nhắc đến. Bạn muốn xem phòng nào?</p><select aria-label="Phòng cần tra cứu" value="" onChange={e=>{if(e.target.value){setRoom(e.target.value==='all'?'':e.target.value);setRoomUnknown(false);}}}><option value="">Chọn phòng</option><option value="all">Tất cả phòng của tôi</option>{catalog.rooms.map(r=><option key={r}>{r}</option>)}</select></>:
    <><p>{ownerConfirmation({task,period,room},catalog)}</p><button type="button" disabled={busy} onClick={()=>{setMessages(m=>[...m,{role:'cloudy',text:ownerConfirmation({task,period,room},catalog)},{role:'user',text:'Đúng, tra cứu'}]);void run({task,period,room,confirmed:true},'answer');}}>Đúng, tra cứu</button></>}
   <button type="button" disabled={busy} onClick={()=>{invalidate();setMessages(m=>[...m,{role:'cloudy',text:'Bạn mô tả lại giúp mình nhé. Có thể ghi rõ tháng và mã phòng.'}]);}}>Chưa đúng, sửa lại</button>
  </div>}
  {serviceStep&&<section className="cloudy-owner__bubble" aria-label="Tiến trình tạo dịch vụ">
   <small>Bước {serviceProgress} · {serviceStep==='confirm'?'xác nhận':'đang tạo'}</small>
   {serviceStep==='type'&&<div className="cloudy-owner__choices"><button type="button" onClick={()=>addServiceReply('Tiện ích miễn phí')}>Tiện ích miễn phí</button><button type="button" onClick={()=>addServiceReply('Dịch vụ cố định')}>Dịch vụ cố định</button><button type="button" onClick={()=>addServiceReply('Tiện ích phát sinh')}>Tiện ích phát sinh</button></div>}
   {serviceStep==='property'&&<div className="cloudy-owner__choices">{(catalog.properties||[]).map(p=><button key={p.property_id} type="button" onClick={()=>addServiceReply(p.property_id)}>{p.name} · {p.province}</button>)}</div>}
   {serviceStep==='mode'&&<div className="cloudy-owner__choices"><button type="button" onClick={()=>addServiceReply('Đặt lịch từng lượt')}>Đặt lịch từng lượt</button><button type="button" onClick={()=>addServiceReply('Gói sử dụng')}>Gói sử dụng</button></div>}
   {serviceStep==='confirm'&&<>
    <h3>Xác nhận lưu</h3>
    <p>{serviceDraft.kind==='free'?'Tiện ích miễn phí':serviceDraft.kind==='paid'?'Dịch vụ cố định':`Tiện ích phát sinh · ${serviceDraft.serviceMode==='BOOKING'?'đặt lịch':'gói'}`} · {(catalog.properties||[]).find(p=>p.property_id===serviceDraft.propertyId)?.name}</p>
    <p>{serviceDraft.name} ({serviceCode(serviceDraft.name)})</p>
    {serviceDraft.kind==='free'&&<p>{serviceDraft.location||'Toàn khu'} · không thu phí.</p>}
    {serviceDraft.kind==='paid'&&<p>{new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/{serviceDraft.unit} · từ {serviceDraft.effectiveFrom}</p>}
    {serviceDraft.kind==='flexible'&&<><p>{serviceDraft.weekdays.map(day=>['','T2','T3','T4','T5','T6','T7','CN'][day]).join(', ')} · {serviceDraft.opensAt}–{serviceDraft.closesAt}</p><p>{serviceDraft.serviceMode==='BOOKING'?`${serviceDraft.slotDurationMinutes} phút/lượt · tối đa ${serviceDraft.capacityPerSlot} người`: `Gói ${serviceDraft.packageDurationCount} ${serviceDraft.packageDurationUnit==='MONTH'?'tháng':'năm'}`} · {new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/{serviceDraft.serviceMode==='BOOKING'?'lượt':'gói'} · từ {serviceDraft.effectiveFrom}</p></>}
    {serviceFormError&&<p role="alert">{serviceFormError}</p>}
    <button type="button" disabled={serviceSaving} onClick={()=>void confirmServiceCreation()}>{serviceSaving?'Đang lưu…':'Xác nhận lưu'}</button>
    <button type="button" disabled={serviceSaving} onClick={()=>{setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:'Đã hủy. Chưa lưu thay đổi.'}]);}}>Hủy</button>
   </>}
    {serviceStep!=='confirm'&&<button type="button" onClick={()=>{setServiceStep(null);setServiceDraft(emptyServiceDraft());setQuestion('');setMessages(m=>[...m,{role:'cloudy',text:'Đã hủy. Chưa lưu thay đổi.'}]);}}>Hủy tạo</button>}
  </section>}
  {busy&&<p role="status">Cloudy đang xử lý…</p>}
  {result?.cards.map(card=><article key={card.id}><h3>{card.room} · {card.property}</h3><p>{card.status} · {card.total===null?(card.amountLabel||'Chưa chốt tiền'):new Intl.NumberFormat('vi-VN').format(card.total)+' đ'}</p><ul>{card.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul>{card.href&&<a href={card.href}>Mở màn quản lý</a>}</article>)}
  {result?.requests&&<CloudyOwnerRequests rows={result.requests} busy={busy} onDecision={decide}/>}
  {result&&!result.requests&&!result.cards.length&&<p>{task==='residents'?'Cloudy đã tổng hợp thống kê cư dân ở tin nhắn phía trên.':'Không có hóa đơn phù hợp phạm vi đã chọn.'}</p>}
  <a href="/admin/requests">Mở yêu cầu & khiếu nại thật từ khách</a>
  <div ref={chatEnd}/>
  {(!serviceStep||['name','location','unit','weekdays','hours','slotDuration','capacity','packageDuration','price','date'].includes(serviceStep))&&<form className="cloudy-owner__composer" onSubmit={e=>{e.preventDefault();submitQuestion();}}>
   <label className="sr-only" htmlFor="cloudy-owner-question">Tin nhắn cho Cloudy</label>
   <textarea id="cloudy-owner-question" value={question} maxLength={500} placeholder={serviceStep?'Nhập câu trả lời ngắn…':'Hỏi Cloudy hoặc yêu cầu tạo tiện ích: WiFi khu trọ'} onChange={e=>changeQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
   <button disabled={busy||!question.trim()||serviceSaving}>Gửi</button>
  </form>}
  </>}
 </div>;
}
