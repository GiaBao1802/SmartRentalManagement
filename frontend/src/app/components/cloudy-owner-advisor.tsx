"use client";
import {useEffect,useRef,useState} from 'react';
import {proposeOwnerScope,ownerConfirmation,parseOwnerClarificationReply,namesDifferentOwnerTask} from '../../lib/owner-chat-intent';
import {OWNER_ADVISOR_ENDPOINT} from '../../lib/owner-advisor-endpoint';
import {CloudyOwnerRequests,type OwnerRequest} from './cloudy-owner-requests';
import {propertyServiceApi} from '../../lib/api/propertyServiceApi';
type Catalog={source?:string;tasks:Record<string,string>;rooms:string[];periods:string[];properties?:{property_id:string;name:string;province:string}[];asOf:string};
type Result={summary:string;requests?:OwnerRequest[];cards:{id:string;room:string;property:string;status:string;total:number|null;details:string[];href?:string;amountLabel?:string}[]};
type ServiceDraft={propertyId:string;name:string;unit:string;price:string;effectiveFrom:string};
const emptyServiceDraft=():ServiceDraft=>({propertyId:'',name:'',unit:'',price:'',effectiveFrom:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
const requestsServiceCreation=(value:string)=>/\b(tao|them|dang ky|bo sung|mo)\b/.test(normalized(value))&&/\b(tien ich|dich vu|wifi|internet|rac|ve sinh)\b/.test(normalized(value));
const serviceCode=(value:string)=>normalized(value).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'DICH-VU-MOI';
const servicePrice=(value:string)=>{const digits=value.replace(/\D/g,'');return digits?String(Number(digits)):'';};
export function CloudyOwnerAdvisor(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[question,setQuestion]=useState(''),[task,setTask]=useState(''),[period,setPeriod]=useState(''),[room,setRoom]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('Đang tải phòng của tài khoản…'),[result,setResult]=useState<Result|null>(null);
 const chatEnd=useRef<HTMLDivElement|null>(null);
 const [messages,setMessages]=useState<{role:string;text:string}[]>([]),[proposed,setProposed]=useState(false),[roomUnknown,setRoomUnknown]=useState(false);
 const [serviceStep,setServiceStep]=useState<'property'|'name'|'unit'|'price'|'date'|'confirm'|null>(null),[serviceDraft,setServiceDraft]=useState<ServiceDraft>(emptyServiceDraft),[serviceSaving,setServiceSaving]=useState(false);
 const pending=useRef<AbortController|null>(null);
 const [reload,setReload]=useState(0),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setLoadError('');setCatalog(null);setServiceStep(null);setServiceDraft(emptyServiceDraft());fetch(OWNER_ADVISOR_ENDPOINT,{signal:controller.signal,cache:'no-store',credentials:'same-origin'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Không tải được dữ liệu.');if(controller.signal.aborted)return;setCatalog(data);setNote(data.rooms.length?`${data.rooms.length} phòng từ ${data.source==='database'?'database hiện tại':'bộ mẫu'} của tài khoản. Ngày đối chiếu: ${data.asOf}.`:'Tài khoản này chưa có phòng trong dữ liệu quản lý.');}).catch(e=>{if(!controller.signal.aborted)setLoadError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>{controller.abort();pending.current?.abort();};},[reload]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({block:"nearest"});},[messages,proposed,busy]);
 function invalidate(){pending.current?.abort();pending.current=null;setBusy(false);setProposed(false);setResult(null);}
 function startServiceCreation(text:string){invalidate();setServiceDraft(emptyServiceDraft());setServiceStep('property');setQuestion('');setMessages(m=>[...m,{role:'user',text},{role:'cloudy',text:'Mình sẽ giúp tạo một tiện ích thu phí cố định cho khu trọ. Chọn khu trọ áp dụng nhé; hệ thống sẽ yêu cầu bạn xác nhận trước khi lưu.'}]);}
 function addServiceReply(text:string){
  const value=text.trim();if(!serviceStep||!catalog)return;
  setQuestion('');setMessages(m=>[...m,{role:'user',text:value}]);
  if(['huy','huy bo','bo qua','dung tao nua'].includes(normalized(value))){setServiceStep(null);setMessages(m=>[...m,{role:'cloudy',text:'Mình đã hủy yêu cầu tạo tiện ích. Chưa có dữ liệu nào được ghi.'}]);return;}
  if(serviceStep==='property'){
   const matches=(catalog.properties||[]).filter(p=>normalized(`${p.name} ${p.province}`).includes(normalized(value))||value===p.property_id);
   if(matches.length!==1){setMessages(m=>[...m,{role:'cloudy',text:'Mình chưa xác định được duy nhất khu trọ. Hãy chọn một khu trọ trong danh sách bên dưới.'}]);return;}
   setServiceDraft(d=>({...d,propertyId:matches[0].property_id}));setServiceStep('name');setMessages(m=>[...m,{role:'cloudy',text:'Tiện ích này tên là gì? Ví dụ: WiFi, vệ sinh phòng, thu gom rác.'}]);return;
  }
  if(serviceStep==='name'){
   if(value.length>150){setMessages(m=>[...m,{role:'cloudy',text:'Tên tối đa 150 ký tự. Bạn nhập tên ngắn hơn nhé.'}]);return;}
   setServiceDraft(d=>({...d,name:value}));setServiceStep('unit');setMessages(m=>[...m,{role:'cloudy',text:'Đơn vị tính là gì? Ví dụ “phòng/kỳ” cho tiện ích định kỳ, hoặc “tháng”.'}]);return;
  }
  if(serviceStep==='unit'){
   if(value.length>30){setMessages(m=>[...m,{role:'cloudy',text:'Đơn vị tối đa 30 ký tự. Bạn nhập ngắn hơn nhé.'}]);return;}
   setServiceDraft(d=>({...d,unit:value}));setServiceStep('price');setMessages(m=>[...m,{role:'cloudy',text:'Đơn giá bao nhiêu đồng cho mỗi đơn vị? Nhập số tiền VND nguyên, ví dụ 50000.'}]);return;
  }
  if(serviceStep==='price'){
   const price=servicePrice(value);if(!price||!Number.isSafeInteger(Number(price))){setMessages(m=>[...m,{role:'cloudy',text:'Mình chưa nhận ra số tiền VND hợp lệ. Bạn nhập số nguyên, ví dụ 50000.'}]);return;}
   setServiceDraft(d=>({...d,price}));setServiceStep('date');setMessages(m=>[...m,{role:'cloudy',text:`Giá áp dụng từ ngày nào? Nhập YYYY-MM-DD. Mặc định là hôm nay: ${serviceDraft.effectiveFrom}.`}]);return;
  }
  if(serviceStep==='date'){
   const date=value.toLowerCase()==='hôm nay'||normalized(value)==='hom nay'?serviceDraft.effectiveFrom:value;
   const parsedDate=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);const checkDate=parsedDate?new Date(Date.UTC(Number(parsedDate[1]),Number(parsedDate[2])-1,Number(parsedDate[3]))):null;
   if(!parsedDate||!checkDate||checkDate.toISOString().slice(0,10)!==date){setMessages(m=>[...m,{role:'cloudy',text:'Ngày chưa đúng định dạng hoặc không tồn tại. Nhập YYYY-MM-DD hoặc “hôm nay”.'}]);return;}
   setServiceDraft(d=>({...d,effectiveFrom:date}));setServiceStep('confirm');setMessages(m=>[...m,{role:'cloudy',text:'Mình đã đủ thông tin. Kiểm tra phần tóm tắt và bấm xác nhận để tạo tiện ích cùng phiên bản giá đầu tiên.'}]);
  }
 }
 async function confirmServiceCreation(){
  if(!serviceStep||serviceStep!=='confirm'||serviceSaving||!serviceDraft.propertyId)return;
  setServiceSaving(true);
  try{
   const code=serviceCode(serviceDraft.name);
   const existing=await propertyServiceApi.list(serviceDraft.propertyId);
   if(existing.items.some(item=>item.code.toUpperCase()===code))throw new Error(`Mã tiện ích ${code} đã tồn tại ở khu trọ này. Mình chưa tạo thêm để tránh trùng; hãy kiểm tra danh mục hoặc đổi tên.`);
   const created=await propertyServiceApi.create(serviceDraft.propertyId,{kind:'FIXED_SERVICE',code,name:serviceDraft.name,unit:serviceDraft.unit});
   try{
    await propertyServiceApi.publishPrice(serviceDraft.propertyId,created.pricing_item_id,'FIXED_SERVICE',{effective_from:serviceDraft.effectiveFrom,unit_price:serviceDraft.price,source_name:'Tạo qua Cloudy'});
   }catch(error){setServiceStep(null);setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích “${created.name}” nhưng chưa phát hành được giá. Tiện ích đang chưa có giá; hãy mở Dịch vụ & Tiện ích để phát hành giá, không gửi lại yêu cầu tạo.`}]);return;}
   setServiceStep(null);setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:`Đã tạo tiện ích cố định “${created.name}” (${created.code}) và phát hành giá ${new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/${created.unit}, hiệu lực từ ${serviceDraft.effectiveFrom}. Giá áp dụng theo quy tắc hóa đơn của dịch vụ cố định.`}]);
  }catch(error){setMessages(m=>[...m,{role:'cloudy',text:error instanceof Error?error.message:'Chưa tạo được tiện ích. Kiểm tra lại thông tin hoặc thử lại.'}]);}
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
    if(data.task==='clarify'||!catalog?.tasks[data.task]){setProposed(false);setMessages(m=>[...m,{role:'cloudy',text:'Mình chưa hiểu rõ. Bạn muốn xem hóa đơn chưa đóng, tiền điện nước, dữ liệu còn thiếu hay yêu cầu từ người thuê?'}]);}
    else{const scope=proposeOwnerScope(question,data.task,catalog);setTask(scope.task);setPeriod(scope.period);setRoom(scope.room??'');setRoomUnknown(scope.room===null);setProposed(true);}

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
 return <div className="cloudy-owner">
  <p id="cloudy-chat-preview-note">Cloudy hỗ trợ chủ trọ kiểm tra chưa đóng tiền, điện nước và dữ liệu còn thiếu. Nguồn: {catalog?.source==='database'?'database hiện tại, theo tài khoản đăng nhập':'đang kết nối'}.</p>
  <p role="status">{loading?'Đang tải danh sách phòng…':loadError?'Chưa tải được dữ liệu chủ trọ.':note}</p>
  {loadError&&<div role="alert"><p>{loadError}</p><button type="button" onClick={()=>{invalidate();setReload(n=>n+1);}}>Tải lại dữ liệu</button></div>}
  {catalog&&(catalog.rooms.length>0||(catalog.properties?.length||0)>0)&&<>
  <p className="cloudy-owner__bubble">Bạn muốn mình kiểm tra gì hôm nay, hay tạo tiện ích cố định mới? Mình sẽ hỏi lại để bạn xác nhận trước khi tra cứu hoặc lưu.</p>
  {messages.map((m,i)=><p key={i} className={`cloudy-owner__bubble cloudy-owner__bubble--${m.role}`}>{m.text}</p>)}
  {proposed&&<div className="cloudy-owner__bubble" aria-live="polite">
   {!period?<><p>Mình hiểu bạn muốn xem {catalog.tasks[task]?.toLowerCase()}. Bạn muốn xem tháng nào? Các tháng hiện có:</p><div className="cloudy-owner__choices">{catalog.periods.map(p=><button key={p} type="button" onClick={()=>{setPeriod(p);setMessages(m=>[...m,{role:'user',text:`Tháng ${p}`}]);}}>{p}</button>)}</div></>:
    roomUnknown?<><p>Mình chưa xác định được chính xác phòng bạn nhắc đến. Bạn muốn xem phòng nào?</p><select aria-label="Phòng cần tra cứu" value="" onChange={e=>{if(e.target.value){setRoom(e.target.value==='all'?'':e.target.value);setRoomUnknown(false);}}}><option value="">Chọn phòng</option><option value="all">Tất cả phòng của tôi</option>{catalog.rooms.map(r=><option key={r}>{r}</option>)}</select></>:
    <><p>{ownerConfirmation({task,period,room},catalog)}</p><button type="button" disabled={busy} onClick={()=>{setMessages(m=>[...m,{role:'cloudy',text:ownerConfirmation({task,period,room},catalog)},{role:'user',text:'Đúng, tra cứu'}]);void run({task,period,room,confirmed:true},'answer');}}>Đúng, tra cứu</button></>}
   <button type="button" disabled={busy} onClick={()=>{invalidate();setMessages(m=>[...m,{role:'cloudy',text:'Bạn mô tả lại giúp mình nhé. Có thể ghi rõ tháng và mã phòng.'}]);}}>Chưa đúng, sửa lại</button>
  </div>}
  {serviceStep&&<div className="cloudy-owner__bubble" aria-live="polite">
   {serviceStep==='property'&&<><p>Chọn khu trọ cho tiện ích:</p>{(catalog.properties||[]).map(property=><button key={property.property_id} type="button" disabled={serviceSaving} onClick={()=>{setServiceDraft(d=>({...d,propertyId:property.property_id}));setServiceStep('name');setMessages(m=>[...m,{role:'user',text:property.name},{role:'cloudy',text:'Tiện ích này tên là gì? Ví dụ: WiFi, vệ sinh phòng, thu gom rác.'}]);}}>{property.name} · {property.province}</button>)}</>}
   {serviceStep==='confirm'&&<><p>Tiện ích cố định · {(catalog.properties||[]).find(p=>p.property_id===serviceDraft.propertyId)?.name}</p><p>Tên: {serviceDraft.name} · mã: {serviceCode(serviceDraft.name)}</p><p>Đơn vị: {serviceDraft.unit}</p><p>Giá: {new Intl.NumberFormat('vi-VN').format(Number(serviceDraft.price))} đ/{serviceDraft.unit}</p><p>Hiệu lực từ: {serviceDraft.effectiveFrom}</p><p>Tiện ích cố định áp dụng cho các phòng đủ điều kiện ở khu trọ này. Giá sẽ được ghi vào lịch sử giá và không thể sửa/xóa sau khi phát hành.</p><button type="button" disabled={serviceSaving} onClick={()=>void confirmServiceCreation()}>{serviceSaving?'Đang tạo…':'Xác nhận tạo tiện ích'}</button><button type="button" disabled={serviceSaving} onClick={()=>{setServiceStep('property');setServiceDraft(emptyServiceDraft());setMessages(m=>[...m,{role:'cloudy',text:'Mình đã bỏ thông tin vừa nhập. Hãy chọn khu trọ để bắt đầu lại.'}]);}}>Sửa lại</button></>}
   <button type="button" disabled={serviceSaving} onClick={()=>{setServiceStep(null);setMessages(m=>[...m,{role:'cloudy',text:'Mình đã hủy yêu cầu tạo tiện ích.'}]);}}>Hủy tạo</button>
  </div>}
  {busy&&<p role="status">Cloudy đang xử lý…</p>}
  {result?.cards.map(card=><article key={card.id}><h3>{card.room} · {card.property}</h3><p>{card.status} · {card.total===null?(card.amountLabel||'Chưa chốt tiền'):new Intl.NumberFormat('vi-VN').format(card.total)+' đ'}</p><ul>{card.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul>{card.href&&<a href={card.href}>Mở màn quản lý</a>}</article>)}
  {result?.requests&&<CloudyOwnerRequests rows={result.requests} busy={busy} onDecision={decide}/>}
  {result&&!result.requests&&!result.cards.length&&<p>Không có hóa đơn phù hợp phạm vi đã chọn.</p>}
  <a href="/admin/requests">Mở yêu cầu & khiếu nại thật từ khách</a>
  <div ref={chatEnd}/>
  <form className="cloudy-owner__composer" onSubmit={e=>{e.preventDefault();submitQuestion();}}>
   <label className="sr-only" htmlFor="cloudy-owner-question">Tin nhắn cho Cloudy</label>
   <textarea id="cloudy-owner-question" value={question} maxLength={500} placeholder={serviceStep==='name'?'Tên tiện ích mới là gì?':serviceStep==='unit'?'Đơn vị tính là gì?':serviceStep==='price'?'Đơn giá VND bao nhiêu?':serviceStep==='date'?'Ngày hiệu lực YYYY-MM-DD hoặc hôm nay':serviceStep==='property'?'Chọn khu trọ ở phía trên':'Hỏi Cloudy hoặc yêu cầu tạo tiện ích: WiFi khu trọ'} onChange={e=>changeQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
   <button disabled={busy||!question.trim()}>Gửi</button>
  </form>
  </>}
 </div>;
}
