"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api/apiClient";
import { residentServiceApi, type ResidentServiceProperty, type ResidentServiceAvailability } from "../../lib/api/residentServiceApi";
import { ResidentRoomRequests } from "./room-requests";
import { useAuth } from "./auth-provider";

type Target={invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string};
export type MeterRequest={submission_id:string;invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string;utility:string;reading:string;status:string;decision_note:string|null};
const label=(s:string)=>({PENDING:"Chờ chủ trọ duyệt",APPROVED:"Đã duyệt",REJECTED:"Đã từ chối"}[s]??s);
const period=(t:{period_start:string;period_end:string})=>`${t.period_start.slice(0,10)} → ${t.period_end.slice(0,10)}`;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export function ResidentAssistant({onClose}:{onClose:()=>void}) {
  const {status,user}=useAuth();
  if(status!=="authenticated"||user?.account.role!=="resident") return null;
  return <ResidentAssistantContent key={user.account.account_id} onClose={onClose}/>;
}
function ResidentAssistantContent({onClose}:{onClose:()=>void}) {
  const [tab,setTab]=useState<"services"|"meter"|"requests"|"help">("help");
  const [requestContent,setRequestContent]=useState("");
  const [text,setText]=useState("");
  const [reply,setReply]=useState("Mình giúp bạn đặt tiện ích, gửi ảnh điện/nước hoặc khiếu nại và yêu cầu bổ sung thiết bị cho phòng.");
  const [groups,setGroups]=useState<ResidentServiceProperty[]>([]);
  const [targets,setTargets]=useState<Target[]>([]);
  const [history,setHistory]=useState<MeterRequest[]>([]);
  const [serviceId,setServiceId]=useState("");
  const [date,setDate]=useState(today);
  const [availability,setAvailability]=useState<ResidentServiceAvailability|null>(null);
  const [time,setTime]=useState("");
  const [invoiceId,setInvoiceId]=useState("");
  const [utility,setUtility]=useState("ELECTRICITY");
  const [image,setImage]=useState("");
  const [reading,setReading]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [notice,setNotice]=useState("");
  const dialog=useRef<HTMLElement>(null);
  const service=groups.flatMap(g=>g.services).find(s=>s.service_id===serviceId);
  useEffect(()=>{
    dialog.current?.focus();
    const controller=new AbortController();
    Promise.all([residentServiceApi.list(),apiRequest<Target[]>("/me/meter-targets",{signal:controller.signal}),apiRequest<MeterRequest[]>("/me/meter-submissions",{signal:controller.signal})]).then(([g,t,h])=>{if(!controller.signal.aborted){setGroups(g);setTargets(t);setHistory(h);}}).catch(e=>{if(!controller.signal.aborted)setNotice(e.message);});
    return()=>controller.abort();
  },[]);
  async function run(action:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setNotice("");
    try{await action();}catch(e){setNotice(e instanceof Error?e.message:"Không thực hiện được. Bạn thử lại nhé.");}finally{setBusy(false);lock.current=false;}
  }
  function resetSlot(){setAvailability(null);setTime("");}
  return <div className="resident-assistant-backdrop" onClick={onClose}><section id="cloudy-chat-panel" className="resident-assistant" role="dialog" aria-modal="true" aria-labelledby="resident-assistant-title" ref={dialog} tabIndex={-1} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
    if(e.key==="Escape")onClose();
    if(e.key==="Tab") {const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')??[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <header><div><small>TRỢ LÝ KHÁCH THUÊ</small><h2 id="resident-assistant-title">Cloudy giúp bạn</h2></div><button type="button" onClick={onClose} aria-label="Đóng Cloudy">×</button></header>
    <p>{reply}</p>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{const r=await apiRequest<{intent:typeof tab;text:string}>("/me/assistant/chat",{method:"POST",body:JSON.stringify({message:text})});setReply(r.text);setTab(r.intent);if(r.intent==="requests")setRequestContent(text);setText("");});}}>
      <label>Bạn cần hỗ trợ gì?<input value={text} maxLength={500} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="Ví dụ: tôi muốn đăng ký hồ bơi"/></label><button disabled={busy||!text.trim()}>Gửi</button>
    </form>
    <nav aria-label="Chọn hỗ trợ"><button disabled={busy} aria-pressed={tab==="services"} onClick={()=>setTab("services")}>Đặt tiện ích</button><button disabled={busy} aria-pressed={tab==="meter"} onClick={()=>setTab("meter")}>Gửi chỉ số điện/nước</button><button disabled={busy} aria-pressed={tab==="requests"} onClick={()=>setTab("requests")}>Khiếu nại / yêu cầu</button></nav>
    {tab==="requests"&&<ResidentRoomRequests initialContent={requestContent}/>}
    {tab==="services"&&<div className="resident-assistant-fields">
      <label>Tiện ích<select value={serviceId} disabled={busy} onChange={e=>{setServiceId(e.target.value);resetSlot();}}><option value="">Chọn tiện ích</option>{groups.map(g=><optgroup key={g.property_id} label={g.property_name}>{g.services.map(s=><option key={s.service_id} value={s.service_id}>{s.name}</option>)}</optgroup>)}</select></label>
      {!groups.length&&<p>Chưa có tiện ích trong khu trọ đang ở.</p>}
      {service?.service_configuration?.service_mode==="SUBSCRIPTION"&&<p>Gói này chưa hỗ trợ đăng ký trực tuyến. Bạn liên hệ chủ trọ để đăng ký nhé.</p>}
      {service?.service_configuration?.service_mode==="BOOKING"&&<>
        <label>Ngày sử dụng<input type="date" min={today()} value={date} disabled={busy} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>
        <button disabled={busy||!date} onClick={()=>void run(async()=>{setTime("");setAvailability(null);setAvailability(await residentServiceApi.availability(serviceId,date));})}>Xem giờ còn chỗ</button>
        {availability&&<><label>Khung giờ<select value={time} disabled={busy} onChange={e=>setTime(e.target.value)}><option value="">Chọn khung giờ</option>{availability.slots.map(s=><option key={s.start_time} value={s.start_time}>{s.start_time}–{s.end_time} · còn {s.remaining_capacity} chỗ</option>)}</select></label>
          {!availability.slots.length&&<p>Ngày này không còn suất phù hợp.</p>}
          <p>Phí dự kiến: {availability.unit_price===null?"Chưa có giá":`${Number(availability.unit_price).toLocaleString("vi-VN")} đ / ${availability.unit}`}. Chỉ ghi phí sau khi chủ trọ duyệt.</p>
          <button disabled={busy||!time||availability.unit_price===null} onClick={()=>void run(async()=>{await residentServiceApi.book(serviceId,date,time);resetSlot();setNotice("Đã gửi yêu cầu đặt tiện ích. Chờ chủ trọ duyệt.");})}>Xác nhận gửi yêu cầu</button>
        </>}
      </>}
      <a href="/tenant/amenities">Xem lịch tiện ích của bạn</a>
    </div>}
    {tab==="meter"&&<div className="resident-assistant-fields">
      <label>Phòng và kỳ hóa đơn<select disabled={busy} value={invoiceId} onChange={e=>{setInvoiceId(e.target.value);setConfirmed(false);}}><option value="">Chọn kỳ cần gửi chỉ số</option>{targets.map(t=><option key={t.invoice_id} value={t.invoice_id}>{t.property_name} · {t.room_code} · {period(t)}</option>)}</select></label>
      {!targets.length&&<p>Chưa có hóa đơn nháp hợp lệ cho phòng đang ở. Bạn liên hệ chủ trọ để kiểm tra kỳ hóa đơn.</p>}
      <label>Loại đồng hồ<select disabled={busy} value={utility} onChange={e=>{setUtility(e.target.value);setConfirmed(false);}}><option value="ELECTRICITY">Điện (kWh)</option><option value="WATER">Nước (m³)</option></select></label>
      <label>Chụp hoặc chọn ảnh đồng hồ<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{const file=e.target.files?.[0];setImage("");setReading("");setConfirmed(false);if(!file)return;void run(async()=>{if(file.size>5*1024*1024)throw new Error("Ảnh tối đa 5 MB.");const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Không mở được ảnh."));reader.readAsDataURL(file);});setImage(data);const result=await apiRequest<{reading:string|null}>("/me/meter-ocr",{method:"POST",body:JSON.stringify({image:data})});setReading(result.reading??"");setNotice(result.reading?"Đã đọc được một số. Hãy đối chiếu với ảnh trước khi gửi.":"Ảnh chưa rõ hoặc có nhiều số. Bạn nhập đúng chỉ số đồng hồ trong ảnh.");});}}/></label>
      {image&&<img className="resident-meter-image" src={image} alt="Ảnh đồng hồ bạn đã chọn"/>}
      <label>Chỉ số trên đồng hồ ({utility==="ELECTRICITY"?"kWh":"m³"})<input inputMode="decimal" disabled={busy} value={reading} onChange={e=>{setReading(e.target.value);setConfirmed(false);}} placeholder="Ví dụ: 1234.567"/></label>
      <label className="resident-assistant-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã đối chiếu chỉ số, loại đồng hồ và kỳ hóa đơn.</label>
      <button disabled={busy||!invoiceId||!image||!confirmed||!/^\d{1,9}(\.\d{1,3})?$/.test(reading)} onClick={()=>void run(async()=>{await apiRequest("/me/meter-submissions",{method:"POST",body:JSON.stringify({invoice_id:invoiceId,utility,reading,image})});setImage("");setReading("");setConfirmed(false);setNotice("Đã gửi ảnh và chỉ số, chờ chủ trọ duyệt. Hóa đơn chưa thay đổi.");setHistory(await apiRequest<MeterRequest[]>("/me/meter-submissions"));})}>Gửi chủ trọ duyệt</button>
      <h3>Yêu cầu đã gửi</h3>{history.map(h=><article key={h.submission_id}><strong>{h.room_code} · {h.utility==="ELECTRICITY"?"Điện":"Nước"}: {h.reading}</strong><p>{period(h)} · {label(h.status)}</p>{h.decision_note&&<p>{h.decision_note}</p>}</article>)}
    </div>}
    {busy&&<p role="status">Đang xử lý…</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  </section></div>;
}
