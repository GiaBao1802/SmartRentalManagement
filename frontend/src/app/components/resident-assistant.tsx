"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../../lib/api/apiClient";
import { residentServiceApi, type ResidentServiceProperty, type ResidentServiceAvailability, type ResidentServiceBooking } from "../../lib/api/residentServiceApi";
import { invoiceApi, type InvoiceResource } from "../../lib/api/invoiceApi";
import { ResidentRoomRequests } from "./room-requests";
import { useAuth } from "./auth-provider";
import { CloudyPortrait } from "./cloudy-portrait";

type Target={invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string};
type ResidentChatEntry={id:number;role:"user"|"cloudy";text:string};
export type MeterRequest={submission_id:string;invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string;utility:string;reading:string;status:string;decision_note:string|null};
const label=(s:string)=>({PENDING:"Chờ chủ trọ duyệt",APPROVED:"Đã duyệt",REJECTED:"Đã từ chối"}[s]??s);
const period=(t:{period_start:string;period_end:string})=>`${t.period_start.slice(0,10)} → ${t.period_end.slice(0,10)}`;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const bookingStatus=(status:ResidentServiceBooking["status"])=>({PENDING:"Chờ chủ trọ duyệt",APPROVED:"Đã được duyệt",REJECTED:"Bị từ chối",CANCELLED:"Đã hủy"}[status]);
export function ResidentAssistant() {
  const {status,user}=useAuth();
  if(status!=="authenticated"||user?.account.role!=="resident") return null;
  return <ResidentAssistantContent key={user.account.account_id}/>;
}
function ResidentAssistantContent() {
  const [tab,setTab]=useState<"services"|"meter"|"readings"|"invoices"|"requests"|"help">("help");
  const [amenityChoice,setAmenityChoice]=useState(false);
  const [requestContent,setRequestContent]=useState("");
  const [text,setText]=useState("");
  const [lastIntent,setLastIntent]=useState<"services"|"requests"|"meter"|"invoice"|null>(null);
  const [reply,setReply]=useState("Mình giúp bạn đặt tiện ích, gửi ảnh điện/nước hoặc khiếu nại và yêu cầu bổ sung thiết bị cho phòng.");
  const [chatMessages,setChatMessages]=useState<ResidentChatEntry[]>([{id:0,role:"cloudy",text:"Chào bạn, mình là Cloudy. Bạn có thể hỏi tiền phòng, chỉ số điện nước, đăng ký dịch vụ hoặc tình trạng yêu cầu."}]);
  const [groups,setGroups]=useState<ResidentServiceProperty[]>([]);
  const [serviceBookings,setServiceBookings]=useState<ResidentServiceBooking[]>([]);
  const [invoices,setInvoices]=useState<InvoiceResource[]>([]);
  const [readingError,setReadingError]=useState("");
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
  const chatScroll=useRef<HTMLDivElement>(null);
  const workflowPopup=useRef<HTMLElement>(null);
  const nextChatMessageId=useRef(1);
  const service=groups.flatMap(g=>g.services).find(s=>s.service_id===serviceId);
  useEffect(()=>{const node=chatScroll.current;if(node)node.scrollTop=node.scrollHeight;},[chatMessages,busy]);
  useEffect(()=>{
    if(tab==="help"&&!amenityChoice&&!notice)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setTab("help");setAmenityChoice(false);}};
    window.addEventListener("keydown",closeOnEscape);
    workflowPopup.current?.focus();
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[tab,amenityChoice,notice]);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([residentServiceApi.list(),apiRequest<Target[]>("/me/meter-targets",{signal:controller.signal}),apiRequest<MeterRequest[]>("/me/meter-submissions",{signal:controller.signal})]).then(([g,t,h])=>{if(!controller.signal.aborted){setGroups(g);setTargets(t);setHistory(h);}}).catch(e=>{if(!controller.signal.aborted)setNotice(e.message);});
    return()=>controller.abort();
  },[]);
  async function run(action:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setNotice("");
    try{await action();}catch(e){setNotice(e instanceof Error?e.message:"Không thực hiện được. Bạn thử lại nhé.");}finally{setBusy(false);lock.current=false;}
  }
  async function loadServiceBookings(){setServiceBookings(await residentServiceApi.bookings());}
  async function loadInvoices(){
    setReadingError("");
    try{const page=await invoiceApi.list({page:1,page_size:100});setInvoices(page.data);}
    catch(error){setReadingError(error instanceof Error?error.message:"Không tải được chỉ số điện nước.");}
  }
  function resetSlot(){setAvailability(null);setTime("");}
  return <>
    <div ref={chatScroll} className="resident-assistant cloudy-chat__messages" role="log" aria-label="Tin nhắn với Cloudy" aria-live="polite">
    {chatMessages.map(message=><div className={`cloudy-chat__message-row cloudy-chat__message-row--${message.role}`} key={message.id}>
      {message.role==="cloudy"&&<CloudyPortrait/>}
      <p className={`cloudy-chat__message${message.role==="cloudy"&&message.id===0?" cloudy-chat__welcome":""}`}><span className="sr-only">{message.role==="user"?"Bạn: ":"Cloudy: "}</span>{message.text}</p>
    </div>)}
    {busy&&<div className="cloudy-chat__message-row cloudy-chat__message-row--cloudy"><CloudyPortrait/><p className="cloudy-chat__message cloudy-chat__message--pending">Cloudy đang kiểm tra…</p></div>}
    </div>
    {(tab!=="help"||amenityChoice||notice)&&typeof document!=="undefined"&&createPortal(<div className="resident-assistant-workflow-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget){setTab("help");setAmenityChoice(false);}}}>
      <section className="resident-assistant-workflow-popup" role="dialog" aria-modal="true" aria-labelledby="resident-assistant-workflow-title" tabIndex={-1} ref={workflowPopup}>
        <header className="resident-assistant-workflow-header">
          <div><h2 id="resident-assistant-workflow-title">{tab==="services"?"Dịch vụ & tiện ích":tab==="meter"?"Gửi chỉ số điện, nước":tab==="readings"?"Xem chỉ số điện, nước":tab==="invoices"?"Hóa đơn & tiền phòng":tab==="requests"?"Khiếu nại / yêu cầu":amenityChoice?"Tiện ích": "Cloudy"}</h2><p>{tab==="services"?"Đăng ký tiện ích và theo dõi các yêu cầu đã gửi.":tab==="meter"?"Gửi chỉ số mới để chủ trọ kiểm tra.":tab==="readings"?"Tra cứu chỉ số đã ghi trên hóa đơn.":tab==="invoices"?"Xem các khoản tiền và trạng thái thanh toán.":tab==="requests"?"Gửi và theo dõi yêu cầu liên quan đến nơi ở.":"Chọn nội dung bạn muốn thực hiện."}</p></div>
          <button type="button" className="resident-assistant-workflow-close" aria-label="Đóng popup" onClick={()=>{setTab("help");setAmenityChoice(false);}}>×</button>
        </header>
        <div className="resident-assistant-workflow-content">
    {amenityChoice&&tab==="help"&&<div className="resident-assistant-fields" aria-label="Chọn việc cần làm với tiện ích"><button type="button" disabled={busy} onClick={()=>{setAmenityChoice(false);setTab("services");setReply("Đây là tiện ích đang áp dụng cho phòng thuê. Chọn tiện ích để xem lịch hoặc gửi yêu cầu đặt; chủ trọ sẽ duyệt.");}}>Xem / đặt tiện ích đang có</button><button type="button" disabled={busy} onClick={()=>{setAmenityChoice(false);setRequestContent("Tôi muốn đề nghị bổ sung thiết bị cho phòng.");setTab("requests");setReply("Bạn chọn thiết bị cần bổ sung và phòng đang ở. Yêu cầu sẽ chờ chủ trọ duyệt; phòng chỉ cập nhật khi chủ trọ xác nhận đã thêm.");}}>Đề nghị bổ sung thiết bị</button></div>}
    {tab==="requests"&&<ResidentRoomRequests initialContent={requestContent}/>}
    {tab==="invoices"&&<div className="resident-assistant-fields" aria-label="Hóa đơn và tiền phòng">
      <h3>Hóa đơn của bạn</h3>
      <a href="/tenant/invoices">Mở danh sách hóa đơn</a>
      {readingError&&<p role="alert">Chưa tải được hóa đơn: {readingError} <button type="button" disabled={busy} onClick={()=>void run(loadInvoices)}>Thử lại</button></p>}
      {!readingError&&!invoices.length&&<p>Chưa tìm thấy hóa đơn cho hồ sơ thuê của bạn.</p>}
      {invoices.slice(0,10).map(invoice=><article key={invoice.invoice_id}><strong>{invoice.contract?.property?.name??"Nơi ở của bạn"} · Phòng {invoice.contract?.room_code??"—"}</strong><p>Kỳ {period(invoice)}</p><p>Tiền phòng: {Number(invoice.rent_amount).toLocaleString("vi-VN")} ₫</p><p>Điện: {Number(invoice.electricity_amount).toLocaleString("vi-VN")} ₫ · Nước: {Number(invoice.water_amount).toLocaleString("vi-VN")} ₫</p><p>Tổng: {Number(invoice.total_amount).toLocaleString("vi-VN")} ₫</p><small>{invoice.status==="draft"?"Bản nháp, chưa phải hóa đơn cần thanh toán":invoice.status==="paid"?"Đã thanh toán":invoice.is_overdue?"Chưa thanh toán · quá hạn":"Chưa thanh toán"}</small></article>)}
    </div>}
    {tab==="readings"&&<div className="resident-assistant-fields" aria-label="Chỉ số điện nước đã ghi">
      <h3>Chỉ số điện, nước trên hóa đơn</h3>
      <a href="/tenant/invoices">Mở danh sách hóa đơn</a>
      {readingError&&<p role="alert">Chưa tải được hóa đơn: {readingError} <button type="button" disabled={busy} onClick={()=>void run(loadInvoices)}>Thử lại</button></p>}
      {!readingError&&!invoices.length&&<p>Chưa có hóa đơn ghi nhận chỉ số cho hồ sơ thuê của bạn.</p>}
      {invoices.slice(0,10).map(invoice=><article key={invoice.invoice_id}><strong>{invoice.contract?.property?.name??"Nơi ở của bạn"} · Phòng {invoice.contract?.room_code??"—"}</strong><p>Kỳ {period(invoice)}</p><p>Điện: {invoice.electricity_previous_kwh??"—"} → {invoice.electricity_current_kwh??"—"} kWh</p><p>Nước: {invoice.water_previous_m3??"—"} → {invoice.water_current_m3??"—"} m³</p><small>{invoice.status==="draft"?"Bản nháp, chưa phải hóa đơn cần thanh toán":invoice.status==="paid"?"Đã thanh toán":"Hóa đơn chưa thanh toán"}</small></article>)}
    </div>}
    {tab==="services"&&<div className="resident-assistant-fields">
      <section aria-label="Trạng thái đăng ký dịch vụ"><h3>Yêu cầu đã gửi</h3>{!serviceBookings.length&&<p>Bạn chưa có yêu cầu đặt dịch vụ nào.</p>}{serviceBookings.map(booking=><article key={booking.booking_id}><strong>{booking.service_name}{booking.property_name?` · ${booking.property_name}`:""}</strong><p>{booking.service_date.slice(0,10)} · {booking.start_time}–{booking.end_time}</p><p><span className={`resident-assistant-booking-status is-${booking.status.toLowerCase()}`}>{bookingStatus(booking.status)}</span></p>{booking.decision_note&&<small>Ghi chú: {booking.decision_note}</small>}</article>)}</section>
      <label>Tiện ích<select value={serviceId} disabled={busy} onChange={e=>{setServiceId(e.target.value);resetSlot();}}><option value="">Chọn tiện ích</option>{groups.map(g=><optgroup key={g.property_id} label={g.property_name}>{g.services.map(s=><option key={s.service_id} value={s.service_id}>{s.name}</option>)}</optgroup>)}</select></label>
      {!groups.length&&<p>Chưa có tiện ích trong khu trọ đang ở.</p>}
      {service?.service_configuration?.service_mode==="SUBSCRIPTION"&&<p>Gói này chưa hỗ trợ đăng ký trực tuyến. Bạn liên hệ chủ trọ để đăng ký nhé.</p>}
      {service?.service_configuration?.service_mode==="BOOKING"&&<>
        <label>Ngày sử dụng<input type="date" min={today()} value={date} disabled={busy} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>
        <button disabled={busy||!date} onClick={()=>void run(async()=>{setTime("");setAvailability(null);setAvailability(await residentServiceApi.availability(serviceId,date));})}>Xem giờ còn chỗ</button>
        {availability&&<><label>Khung giờ<select value={time} disabled={busy} onChange={e=>setTime(e.target.value)}><option value="">Chọn khung giờ</option>{availability.slots.map(s=><option key={s.start_time} value={s.start_time}>{s.start_time}–{s.end_time} · còn {s.remaining_capacity} chỗ</option>)}</select></label>
          {!availability.slots.length&&<p>Ngày này không còn suất phù hợp.</p>}
          <p>Phí dự kiến: {availability.unit_price===null?"Chưa có giá":`${Number(availability.unit_price).toLocaleString("vi-VN")} đ / ${availability.unit}`}. Chỉ ghi phí sau khi chủ trọ duyệt.</p>
          <button disabled={busy||!time||availability.unit_price===null} onClick={()=>void run(async()=>{await residentServiceApi.book(serviceId,date,time);resetSlot();setNotice("Đã gửi yêu cầu đặt tiện ích. Chờ chủ trọ duyệt.");await loadServiceBookings();})}>Xác nhận gửi yêu cầu</button>
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
        </div>
      </section>
    </div>,document.body)}
    <form className="cloudy-chat__composer resident-assistant-composer" onSubmit={e=>{e.preventDefault();const message=text.trim();if(!message)return;setChatMessages(previous=>[...previous,{id:nextChatMessageId.current++,role:"user",text:message}]);setText("");void run(async()=>{try{const r=await apiRequest<{intent:"services"|"requests"|"amenity_choice"|"meter"|"meter_readings"|"invoice"|"help";text:string;contextual:boolean}>("/me/assistant/chat",{method:"POST",body:JSON.stringify({message,...(lastIntent?{context:{last_intent:lastIntent}}:{})})});const answer=r.text;setReply(answer);setChatMessages(previous=>[...previous,{id:nextChatMessageId.current++,role:"cloudy",text:answer}]);setAmenityChoice(r.intent==="amenity_choice");setTab(r.intent==="invoice"?"invoices":r.intent==="meter_readings"?"readings":r.intent==="amenity_choice"?"help":r.intent);if(r.intent==="services")await loadServiceBookings();if(r.intent==="invoice"||r.intent==="meter_readings")await loadInvoices();setLastIntent(["services","requests","meter","invoice"].includes(r.intent)?r.intent as "services"|"requests"|"meter"|"invoice":null);if(r.intent==="requests"&&!r.contextual)setRequestContent(message);}catch(error){const answer=error instanceof Error?error.message:"Mình chưa xử lý được câu hỏi. Bạn thử lại nhé.";setReply(answer);setChatMessages(previous=>[...previous,{id:nextChatMessageId.current++,role:"cloudy",text:answer}]);}});}}>
      <label className="sr-only" htmlFor="resident-cloudy-message">Bạn cần hỗ trợ gì?</label>
      <div className="cloudy-chat__composer-controls"><textarea id="resident-cloudy-message" value={text} maxLength={500} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} placeholder="Nhắn cho Cloudy…" rows={1}/><button disabled={busy||!text.trim()}>Gửi</button></div>
    </form>
  </>;
}
