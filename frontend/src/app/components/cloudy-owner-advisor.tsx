"use client";
import {useEffect,useRef,useState} from 'react';
import {proposeOwnerScope,ownerConfirmation} from '../../lib/owner-chat-intent';
import {OWNER_ADVISOR_ENDPOINT} from '../../lib/owner-advisor-endpoint';
import {CloudyOwnerRequests,type OwnerRequest} from './cloudy-owner-requests';
type Catalog={source?:string;tasks:Record<string,string>;rooms:string[];periods:string[];asOf:string};
type Result={summary:string;requests?:OwnerRequest[];cards:{id:string;room:string;property:string;status:string;total:number|null;details:string[];href?:string;amountLabel?:string}[]};
export function CloudyOwnerAdvisor(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[question,setQuestion]=useState(''),[task,setTask]=useState(''),[period,setPeriod]=useState(''),[room,setRoom]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('Đang tải phòng của tài khoản…'),[result,setResult]=useState<Result|null>(null);
 const chatEnd=useRef<HTMLDivElement|null>(null);
 const [messages,setMessages]=useState<{role:string;text:string}[]>([]),[proposed,setProposed]=useState(false),[roomUnknown,setRoomUnknown]=useState(false);
 const pending=useRef<AbortController|null>(null);
 const [reload,setReload]=useState(0),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setLoadError('');setCatalog(null);fetch(OWNER_ADVISOR_ENDPOINT,{signal:controller.signal,cache:'no-store',credentials:'same-origin'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Không tải được dữ liệu.');if(controller.signal.aborted)return;setCatalog(data);setNote(data.rooms.length?`${data.rooms.length} phòng từ ${data.source==='database'?'database hiện tại':'bộ mẫu'} của tài khoản. Ngày đối chiếu: ${data.asOf}.`:'Tài khoản này chưa có phòng trong dữ liệu quản lý.');}).catch(e=>{if(!controller.signal.aborted)setLoadError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>{controller.abort();pending.current?.abort();};},[reload]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({block:"nearest"});},[messages,proposed,busy]);
 function invalidate(){pending.current?.abort();pending.current=null;setBusy(false);setProposed(false);setResult(null);}
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
 return <div className="cloudy-owner">
  <p id="cloudy-chat-preview-note">Cloudy hỗ trợ chủ trọ kiểm tra chưa đóng tiền, điện nước và dữ liệu còn thiếu. Nguồn: {catalog?.source==='database'?'database hiện tại, theo tài khoản đăng nhập':'đang kết nối'}.</p>
  <p role="status">{loading?'Đang tải danh sách phòng…':loadError?'Chưa tải được dữ liệu chủ trọ.':note}</p>
  {loadError&&<div role="alert"><p>{loadError}</p><button type="button" onClick={()=>{invalidate();setReload(n=>n+1);}}>Tải lại dữ liệu</button></div>}
  {catalog&&catalog.rooms.length>0&&<>
  <p className="cloudy-owner__bubble">Bạn muốn mình kiểm tra gì hôm nay? Mình sẽ hỏi lại để bạn xác nhận trước khi tra cứu.</p>
  {messages.map((m,i)=><p key={i} className={`cloudy-owner__bubble cloudy-owner__bubble--${m.role}`}>{m.text}</p>)}
  {proposed&&<div className="cloudy-owner__bubble" aria-live="polite">
   {!period?<><p>Mình hiểu bạn muốn xem {catalog.tasks[task]?.toLowerCase()}. Bạn muốn xem tháng nào? Các tháng hiện có:</p><div className="cloudy-owner__choices">{catalog.periods.map(p=><button key={p} type="button" onClick={()=>{setPeriod(p);setMessages(m=>[...m,{role:'user',text:`Tháng ${p}`}]);}}>{p}</button>)}</div></>:
    roomUnknown?<><p>Mình chưa xác định được chính xác phòng bạn nhắc đến. Bạn muốn xem phòng nào?</p><select aria-label="Phòng cần tra cứu" value="" onChange={e=>{if(e.target.value){setRoom(e.target.value==='all'?'':e.target.value);setRoomUnknown(false);}}}><option value="">Chọn phòng</option><option value="all">Tất cả phòng của tôi</option>{catalog.rooms.map(r=><option key={r}>{r}</option>)}</select></>:
    <><p>{ownerConfirmation({task,period,room},catalog)}</p><button type="button" disabled={busy} onClick={()=>{setMessages(m=>[...m,{role:'cloudy',text:ownerConfirmation({task,period,room},catalog)},{role:'user',text:'Đúng, tra cứu'}]);void run({task,period,room,confirmed:true},'answer');}}>Đúng, tra cứu</button></>}
   <button type="button" disabled={busy} onClick={()=>{invalidate();setMessages(m=>[...m,{role:'cloudy',text:'Bạn mô tả lại giúp mình nhé. Có thể ghi rõ tháng và mã phòng.'}]);}}>Chưa đúng, sửa lại</button>
  </div>}
  {busy&&<p role="status">Cloudy đang xử lý…</p>}
  {result?.cards.map(card=><article key={card.id}><h3>{card.room} · {card.property}</h3><p>{card.status} · {card.total===null?(card.amountLabel||'Chưa chốt tiền'):new Intl.NumberFormat('vi-VN').format(card.total)+' đ'}</p><ul>{card.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul>{card.href&&<a href={card.href}>Mở màn quản lý</a>}</article>)}
  {result?.requests&&<CloudyOwnerRequests rows={result.requests} busy={busy} onDecision={decide}/>}
  {result&&!result.requests&&!result.cards.length&&<p>Không có hóa đơn phù hợp phạm vi đã chọn.</p>}
  <a href="/admin/requests">Mở yêu cầu & khiếu nại thật từ khách</a>
  <div ref={chatEnd}/>
  <form className="cloudy-owner__composer" onSubmit={e=>{e.preventDefault();if(!busy&&question.trim()){invalidate();setMessages(m=>[...m,{role:'user',text:question.trim()}]);void run({question},'interpret');}}}>
   <label className="sr-only" htmlFor="cloudy-owner-question">Tin nhắn cho Cloudy</label>
   <textarea id="cloudy-owner-question" value={question} maxLength={500} placeholder="Hỏi Cloudy: Phòng nào chưa đóng tiền tháng 10?" onChange={e=>{invalidate();setQuestion(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
   <button disabled={busy||!question.trim()}>Gửi</button>
  </form>
  </>}
 </div>;
}
