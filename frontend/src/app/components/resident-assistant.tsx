"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "../../lib/api/apiClient";
import { residentServiceApi, type ResidentServiceProperty, type ResidentServiceAvailability } from "../../lib/api/residentServiceApi";
import { invoiceApi, type InvoiceResource } from "../../lib/api/invoiceApi";
import { CloudyPortrait } from "./cloudy-portrait";
import { ResidentRoomRequests } from "./room-requests";
import { useAuth } from "./auth-provider";

type Target={invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string};
type ResidentContextIntent="services"|"requests"|"meter"|"invoice";
type ResidentChatMessage={id:number;role:"assistant"|"user";content:string};
export type MeterRequest={submission_id:string;invoice_id:string;room_code:string;property_name:string;period_start:string;period_end:string;utility:string;reading:string;status:string;decision_note:string|null};
const label=(s:string)=>({PENDING:"Chờ chủ trọ duyệt",APPROVED:"Đã duyệt",REJECTED:"Đã từ chối"}[s]??s);
const displayDate=(value:string)=>{const date=new Date(`${value.slice(0,10)}T12:00:00+07:00`);return Number.isNaN(date.valueOf())?value.slice(0,10):new Intl.DateTimeFormat("vi-VN",{dateStyle:"medium",timeZone:"Asia/Ho_Chi_Minh"}).format(date);};
const period=(t:{period_start:string;period_end:string})=>`${displayDate(t.period_start)} → ${displayDate(t.period_end)}`;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const invoiceMoney=(value:string)=>{try{return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;}catch{return "Chưa có số tiền";}};
const invoiceStatus=(invoice:InvoiceResource)=>invoice.status==="draft"?"Bản nháp · chưa phải khoản cần thanh toán":invoice.status==="paid"?"Đã thanh toán":invoice.is_overdue?"Chưa thanh toán · quá hạn":"Chưa thanh toán";
export function ResidentAssistant({onClose}:{onClose:()=>void}) {
  const {status,user}=useAuth();
  if(status!=="authenticated"||user?.account.role!=="resident") return null;
  return <ResidentAssistantContent key={user.account.account_id} onClose={onClose}/>;
}
function ResidentAssistantContent({onClose}:{onClose:()=>void}) {
  const [tab,setTab]=useState<"services"|"meter"|"requests"|"invoices"|"help">("help");
  const [requestContent,setRequestContent]=useState("");
  const [text,setText]=useState("");
  const [messages,setMessages]=useState<ResidentChatMessage[]>([{id:0,role:"assistant",content:"Chào bạn! Mình là Cloudy, trợ lý khách thuê. Bạn cứ nhắn điều đang cần, mình sẽ hỏi thêm nếu chưa rõ. Một số yêu cầu cần chủ trọ duyệt trước khi có hiệu lực."}]);
  const [thinking,setThinking]=useState(false);
  const [typingMessageId,setTypingMessageId]=useState<number|null>(null);
  const [typedText,setTypedText]=useState("");
  const [groups,setGroups]=useState<ResidentServiceProperty[]>([]);
  const [targets,setTargets]=useState<Target[]>([]);
  const [invoices,setInvoices]=useState<InvoiceResource[]>([]);
  const [invoiceLoading,setInvoiceLoading]=useState(false);
  const [invoiceError,setInvoiceError]=useState("");
  const [serviceLoadError,setServiceLoadError]=useState("");
  const [meterTargetError,setMeterTargetError]=useState("");
  const [meterHistoryError,setMeterHistoryError]=useState("");
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
  const lastIntent=useRef<ResidentContextIntent|null>(null);
  const [notice,setNotice]=useState("");
  const [feedbackOptIn,setFeedbackOptIn]=useState<boolean|null>(null);
  const [feedbackPreferenceBusy,setFeedbackPreferenceBusy]=useState(false);
  const [feedbackPreferenceError,setFeedbackPreferenceError]=useState("");
  const dialog=useRef<HTMLElement>(null);
  const scrollContent=useRef<HTMLDivElement>(null);
  const nextMessageId=useRef(1);
  const shouldAutoScroll=useRef(true);
  const service=groups.flatMap(g=>g.services).find(s=>s.service_id===serviceId);
  useEffect(()=>{
    dialog.current?.focus();
    const controller=new AbortController();
    void loadServices(controller.signal);
    void loadMeterTargets(controller.signal);
    void loadMeterHistory(controller.signal);
    void loadFeedbackPreference(controller.signal);
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    const body=document.body;
    const oldOverflow=body.style.overflow;
    const oldPaddingRight=body.style.paddingRight;
    const scrollbarWidth=window.innerWidth-document.documentElement.clientWidth;
    body.style.overflow="hidden";
    if(scrollbarWidth>0)body.style.paddingRight=`${scrollbarWidth}px`;
    return()=>{body.style.overflow=oldOverflow;body.style.paddingRight=oldPaddingRight;};
  },[]);
  useEffect(()=>{
    const message=messages.find(item=>item.id===typingMessageId);
    if(!message)return;
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion){setTypedText(message.content);setTypingMessageId(null);return;}
    const characters=Array.from(message.content);
    let visible=0;
    setTypedText("");
    const timer=window.setInterval(()=>{
      visible=Math.min(visible+2,characters.length);
      setTypedText(characters.slice(0,visible).join(""));
      if(visible>=characters.length){window.clearInterval(timer);setTypingMessageId(null);}
    },18);
    return()=>window.clearInterval(timer);
  },[messages,typingMessageId]);
  useEffect(()=>{
    const content=scrollContent.current;
    if(shouldAutoScroll.current&&content)content.scrollTop=content.scrollHeight;
  },[messages,thinking,typedText,typingMessageId,tab,invoices,invoiceLoading]);
  function appendAssistantReply(content:string,autoScroll=true){
    shouldAutoScroll.current=autoScroll;
    const assistantMessageId=nextMessageId.current++;
    setMessages(previous=>[...previous,{id:assistantMessageId,role:"assistant",content}]);
    setTypingMessageId(assistantMessageId);
  }
  async function loadServices(signal?:AbortSignal){
    setServiceLoadError("");
    try{setGroups(await residentServiceApi.list(signal?{signal}:undefined));}
    catch(error){if(!signal?.aborted)setServiceLoadError(error instanceof Error?error.message:"Không tải được tiện ích.");}
  }
  async function loadMeterTargets(signal?:AbortSignal){
    setMeterTargetError("");
    try{setTargets(await apiRequest<Target[]>("/me/meter-targets",signal?{signal}:undefined));}
    catch(error){if(!signal?.aborted)setMeterTargetError(error instanceof Error?error.message:"Không tải được phòng và kỳ hóa đơn.");}
  }
  async function loadMeterHistory(signal?:AbortSignal){
    setMeterHistoryError("");
    try{setHistory(await apiRequest<MeterRequest[]>("/me/meter-submissions",signal?{signal}:undefined));}
    catch(error){if(!signal?.aborted)setMeterHistoryError(error instanceof Error?error.message:"Không tải được lịch sử gửi chỉ số.");}
  }
  async function loadFeedbackPreference(signal?:AbortSignal){
    setFeedbackPreferenceError("");
    try{const result=await apiRequest<{enabled:boolean}>("/me/assistant/feedback-preference",signal?{signal}:undefined);if(!signal?.aborted)setFeedbackOptIn(result.enabled);}
    catch(error){if(!signal?.aborted){setFeedbackOptIn(null);setFeedbackPreferenceError(error instanceof Error?error.message:"Chưa tải được cài đặt chia sẻ.");}}
  }
  async function changeFeedbackPreference(enabled:boolean){
    if(feedbackPreferenceBusy)return;
    setFeedbackPreferenceBusy(true);setFeedbackPreferenceError("");
    try{const result=await apiRequest<{enabled:boolean}>("/me/assistant/feedback-preference",{method:"PUT",body:JSON.stringify({enabled})});setFeedbackOptIn(result.enabled);}
    catch(error){setFeedbackPreferenceError(error instanceof Error?error.message:"Không lưu được lựa chọn chia sẻ.");}
    finally{setFeedbackPreferenceBusy(false);}
  }
  async function run(action:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setNotice("");
    try{await action();}catch(e){setNotice(e instanceof Error?e.message:"Không thực hiện được. Bạn thử lại nhé.");}finally{setBusy(false);lock.current=false;}
  }
  function resetSlot(){setAvailability(null);setTime("");}
  async function loadInvoices(){
    setInvoiceLoading(true);setInvoiceError("");
    try{const page=await invoiceApi.list({page:1,page_size:100});setInvoices(page.data);}
    catch(error){setInvoiceError(error instanceof Error?error.message:"Không tải được hóa đơn.");}
    finally{setInvoiceLoading(false);}
  }
  async function submitQuestion(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const question=text.trim();
    if(!question||lock.current)return;
    if(typingMessageId!==null){
      const previous=messages.find(item=>item.id===typingMessageId);
      if(previous)setTypedText(previous.content);
      setTypingMessageId(null);
    }
    shouldAutoScroll.current=true;
    const userMessageId=nextMessageId.current++;
    setMessages(previous=>[...previous,{id:userMessageId,role:"user",content:question}]);
    setText("");setNotice("");setThinking(true);lock.current=true;setBusy(true);
    try{
      const result=await apiRequest<{intent:"services"|"requests"|"amenity_choice"|"meter"|"invoice"|"help";text:string;contextual:boolean;feedback_saved?:boolean}>("/me/assistant/chat",{method:"POST",body:JSON.stringify({message:question,...(lastIntent.current?{context:{last_intent:lastIntent.current}}:{})})});
      if(result.intent==="services"||result.intent==="requests"||result.intent==="meter"||result.intent==="invoice")lastIntent.current=result.intent;
      else if(result.intent==="amenity_choice")lastIntent.current=null;
      let answer=result.text;
      if(result.intent==="help"&&result.feedback_saved)answer+=" Câu hỏi đã được chia sẻ sau khi che một số thông tin liên hệ; dữ liệu sẽ tự xóa sau 30 ngày.";
      if(result.intent==="invoice"){
        setTab("invoices");
        await loadInvoices();
      }else{
        setTab(result.intent==="amenity_choice"?"help":result.intent);
        if(result.intent==="requests")setRequestContent(result.contextual?"":question);
      }
      if(result.intent==="invoice")answer="Mình sẽ tìm hóa đơn có kỳ đang áp dụng cho bạn. Nếu không có, mình sẽ hiển thị các kỳ gần nhất. Đây chỉ là tra cứu, không gửi chỉ số hay tạo yêu cầu.";
      setThinking(false);
      appendAssistantReply(answer);
    }catch{
      setThinking(false);
      appendAssistantReply("Mình chưa kết nối xử lý được lúc này. Tin nhắn của bạn vẫn còn trong cuộc trò chuyện; bạn thử gửi lại sau một chút nhé.");
    }finally{setBusy(false);lock.current=false;}
  }
  const currentDate=today();
  const currentPeriodInvoices=invoices.filter(invoice=>invoice.period_start.slice(0,10)<=currentDate&&invoice.period_end.slice(0,10)>=currentDate);
  const sortedInvoices=[...invoices].sort((a,b)=>b.period_end.localeCompare(a.period_end)||b.period_start.localeCompare(a.period_start));
  const visibleInvoices=currentPeriodInvoices.length?currentPeriodInvoices:sortedInvoices.slice(0,3);
  return <div className="resident-assistant-backdrop" onClick={onClose}><section id="cloudy-chat-panel" className="resident-assistant" role="dialog" aria-modal="true" aria-labelledby="resident-assistant-title" ref={dialog} tabIndex={-1} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
    if(e.key==="Escape")onClose();
    if(e.key==="Tab") {const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')??[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <header><div><small>TRỢ LÝ KHÁCH THUÊ</small><h2 id="resident-assistant-title">Cloudy giúp bạn</h2></div><button type="button" onClick={onClose} aria-label="Đóng Cloudy">×</button></header>
    <div className="resident-assistant-scroll" ref={scrollContent}>
      <section className="resident-cloudy-feedback-consent" aria-label="Cài đặt chia sẻ câu hỏi Cloudy chưa hiểu">
        <p>Nếu bật, hệ thống lưu riêng câu Cloudy chưa hiểu sau khi lọc email, số điện thoại và số định danh phổ biến; dữ liệu được xóa sau tối đa 30 ngày. Bộ lọc có thể bỏ sót thông tin nhạy cảm, vì vậy vui lòng không nhập dữ liệu cá nhân vào câu hỏi.</p>
        <label><input type="checkbox" checked={feedbackOptIn===true} disabled={feedbackOptIn===null||feedbackPreferenceBusy} onChange={e=>void changeFeedbackPreference(e.target.checked)}/> Cho phép chia sẻ câu Cloudy chưa hiểu để cải thiện trợ lý</label>
        <p>Không lưu lịch sử trò chuyện hay thông tin phòng. Tắt lựa chọn sẽ ngừng lưu câu mới; câu đã thu thập tự xóa theo hạn 30 ngày kể từ lần đầu ghi nhận.</p>
      {feedbackPreferenceError&&<p role="status">Chưa lưu được lựa chọn chia sẻ. Câu hỏi chưa hiểu sẽ không được lưu. {feedbackPreferenceError}</p>}
    </section>
    <div className="resident-assistant-chat" role="log" aria-label="Tin nhắn với Cloudy" aria-live="off">
      {messages.map(message=>{
        const isTyping=message.id===typingMessageId&&message.role==="assistant";
        return <div className={`resident-assistant-message is-${message.role}`} key={message.id}>
          {message.role==="assistant"&&<span className="resident-assistant-avatar"><CloudyPortrait/></span>}
          <div className="resident-assistant-bubble">
            <p aria-hidden={isTyping||undefined}>{isTyping?typedText:message.content}{isTyping&&<span className="resident-assistant-caret" aria-hidden="true"/>}</p>
            {isTyping&&<span className="resident-assistant-sr-only" role="status" aria-live="polite" aria-atomic="true">{message.content}</span>}
          </div>
        </div>;
      })}
      {thinking&&<div className="resident-assistant-message is-assistant"><span className="resident-assistant-avatar"><CloudyPortrait/></span><div className="resident-assistant-thinking" role="status" aria-live="polite"><span>Cloudy đang nghĩ</span><span className="resident-assistant-thinking-dots" aria-hidden="true"><i/><i/><i/></span></div></div>}
    </div>
    {tab==="invoices"&&<div className="resident-assistant-fields" aria-label="Hóa đơn của bạn">
      {invoiceLoading&&<p role="status">Đang tải hóa đơn…</p>}
      {invoiceError&&<p className="notice" role="alert">{invoiceError} <button type="button" disabled={invoiceLoading} onClick={()=>void loadInvoices()}>Thử lại</button></p>}
      {!invoiceLoading&&!invoiceError&&invoices.length===0&&<div className="resident-assistant-empty"><strong>Chưa có hóa đơn được ghi nhận</strong><p>Hãy hỏi chủ trọ nếu bạn cần kiểm tra kỳ thuê hiện tại.</p><Link href="/tenant/invoices">Mở trang hóa đơn</Link></div>}
      {!invoiceLoading&&!invoiceError&&visibleInvoices.length>0&&<>
        <p>{currentPeriodInvoices.length?"Hóa đơn có kỳ bao gồm hôm nay":"Chưa thấy hóa đơn có kỳ bao gồm hôm nay. Đây là các kỳ gần nhất:"}</p>
        {visibleInvoices.map(invoice=><article className="resident-assistant-invoice" key={invoice.invoice_id}>
          <strong>{invoice.contract?.property?.name??"Nơi ở của bạn"} · Phòng {invoice.contract?.room_code??"—"}</strong>
          <span>Kỳ {period(invoice)}</span><span className={`resident-assistant-invoice-status is-${invoice.status}`}>{invoiceStatus(invoice)}</span>
          <div><span>Tiền thuê</span><b>{invoiceMoney(invoice.rent_amount)}</b></div>
          <div><span>Điện</span><b>{invoiceMoney(invoice.electricity_amount)}</b></div>
          <div><span>Nước</span><b>{invoiceMoney(invoice.water_amount)}</b></div>
          <div><span>Dịch vụ / khoản khác</span><b>{invoiceMoney(invoice.service_amount)}</b></div>
          <div className="resident-assistant-invoice-total"><span>{invoice.amount_provisional?"Tổng tạm tính":"Tổng hóa đơn"}</span><b>{invoiceMoney(invoice.total_amount)}</b></div>
          {invoice.status==="draft"&&<small>Bản nháp chưa phải số tiền cần thanh toán; chủ trọ chưa phát hành hóa đơn.</small>}
          {invoice.status==="unpaid"&&<small>{invoice.due_date?`Hạn thanh toán ${displayDate(invoice.due_date)}${invoice.is_overdue?" · đã quá hạn":""}`:"Chưa có hạn thanh toán"}</small>}
        </article>)}
        {invoices.length>visibleInvoices.length&&<small>Đang hiển thị {visibleInvoices.length} kỳ liên quan hoặc gần nhất trong {invoices.length} hóa đơn được tải.</small>}
        <Link href="/tenant/invoices">Mở toàn bộ hóa đơn</Link>
      </>}
    </div>}
    {tab==="requests"&&<ResidentRoomRequests initialContent={requestContent} onAssistantReply={message=>appendAssistantReply(message,false)}/>}
    {tab==="services"&&<div className="resident-assistant-fields">
      {serviceLoadError&&<p className="notice" role="alert">Chưa tải được danh sách tiện ích: {serviceLoadError} <button type="button" disabled={busy} onClick={()=>void loadServices()}>Thử lại</button></p>}
      <label>Tiện ích<select value={serviceId} disabled={busy} onChange={e=>{setServiceId(e.target.value);resetSlot();}}><option value="">Chọn tiện ích</option>{groups.map(g=><optgroup key={g.property_id} label={g.property_name}>{g.services.map(s=><option key={s.service_id} value={s.service_id}>{s.name}</option>)}</optgroup>)}</select></label>
      {!serviceLoadError&&!groups.some(group=>group.services.length>0)&&<div className="resident-assistant-empty"><strong>Chưa có dịch vụ đặt lịch trực tuyến</strong><p>Tiện ích chung vẫn được hiển thị riêng tại trang Tiện ích; bạn có thể hỏi chủ trọ cách sử dụng.</p><Link href="/tenant/amenities">Xem tiện ích khu trọ</Link></div>}
      {service?.service_configuration?.service_mode==="SUBSCRIPTION"&&<p>Gói này chưa hỗ trợ đăng ký trực tuyến. Bạn liên hệ chủ trọ để đăng ký nhé.</p>}
      {service?.service_configuration?.service_mode==="BOOKING"&&<>
        <label>Ngày sử dụng<input type="date" min={today()} value={date} disabled={busy} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>
        <button disabled={busy||!date} onClick={()=>void run(async()=>{setTime("");setAvailability(null);setAvailability(await residentServiceApi.availability(serviceId,date));})}>Xem giờ còn chỗ</button>
        {availability&&<><label>Khung giờ<select value={time} disabled={busy} onChange={e=>setTime(e.target.value)}><option value="">Chọn khung giờ</option>{availability.slots.map(s=><option key={s.start_time} value={s.start_time}>{s.start_time}–{s.end_time} · còn {s.remaining_capacity} chỗ</option>)}</select></label>
          {!availability.slots.length&&<p>Ngày này không còn suất phù hợp.</p>}
          <p>{availability.unit_price===null?"Chưa có giá hiệu lực":availability.unit_price==="0"?"Tiện ích này miễn phí. Lịch chỉ được giữ sau khi chủ trọ duyệt.":`Phí dự kiến ${Number(availability.unit_price).toLocaleString("vi-VN")} đ / ${availability.unit}. Chỉ ghi phí sau khi chủ trọ duyệt.`}</p>
          <button disabled={busy||!time||availability.unit_price===null} onClick={()=>void run(async()=>{await residentServiceApi.book(serviceId,date,time);resetSlot();setNotice("Đã gửi yêu cầu đặt tiện ích. Chờ chủ trọ duyệt.");})}>Xác nhận gửi yêu cầu</button>
        </>}
      </>}
      <a href="/tenant/amenities">Xem lịch tiện ích của bạn</a>
    </div>}
    {tab==="meter"&&<div className="resident-assistant-fields">
      {meterTargetError&&<p className="notice" role="alert">Chưa tải được phòng và kỳ hóa đơn: {meterTargetError} <button type="button" disabled={busy} onClick={()=>void loadMeterTargets()}>Thử lại</button></p>}
      <label>Phòng và kỳ hóa đơn<select disabled={busy} value={invoiceId} onChange={e=>{setInvoiceId(e.target.value);setConfirmed(false);}}><option value="">Chọn kỳ cần gửi chỉ số</option>{targets.map(t=><option key={t.invoice_id} value={t.invoice_id}>{t.property_name} · {t.room_code} · {period(t)}</option>)}</select></label>
      {!meterTargetError&&!targets.length&&<p>Chưa có hóa đơn nháp hợp lệ cho phòng đang ở. Bạn liên hệ chủ trọ để kiểm tra kỳ hóa đơn.</p>}
      <label>Loại đồng hồ<select disabled={busy} value={utility} onChange={e=>{setUtility(e.target.value);setConfirmed(false);}}><option value="ELECTRICITY">Điện (kWh)</option><option value="WATER">Nước (m³)</option></select></label>
      <label>Chụp hoặc chọn ảnh đồng hồ<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{const file=e.target.files?.[0];setImage("");setReading("");setConfirmed(false);if(!file)return;void run(async()=>{if(file.size>5*1024*1024)throw new Error("Ảnh tối đa 5 MB.");const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Không mở được ảnh."));reader.readAsDataURL(file);});setImage(data);const result=await apiRequest<{reading:string|null}>("/me/meter-ocr",{method:"POST",body:JSON.stringify({image:data})});setReading(result.reading??"");setNotice(result.reading?"Đã đọc được một số. Hãy đối chiếu với ảnh trước khi gửi.":"Ảnh chưa rõ hoặc có nhiều số. Bạn nhập đúng chỉ số đồng hồ trong ảnh.");});}}/></label>
      {image&&<img className="resident-meter-image" src={image} alt="Ảnh đồng hồ bạn đã chọn"/>}
      <label>Chỉ số trên đồng hồ ({utility==="ELECTRICITY"?"kWh":"m³"})<input inputMode="decimal" disabled={busy} value={reading} onChange={e=>{setReading(e.target.value);setConfirmed(false);}} placeholder="Ví dụ: 1234.567"/></label>
      <label className="resident-assistant-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã đối chiếu chỉ số, loại đồng hồ và kỳ hóa đơn.</label>
      <button disabled={busy||!invoiceId||!image||!confirmed||!/^\d{1,9}(\.\d{1,3})?$/.test(reading)} onClick={()=>void run(async()=>{await apiRequest("/me/meter-submissions",{method:"POST",body:JSON.stringify({invoice_id:invoiceId,utility,reading,image})});setImage("");setReading("");setConfirmed(false);setNotice("Đã gửi ảnh và chỉ số, chờ chủ trọ duyệt. Hóa đơn chưa thay đổi.");await loadMeterHistory();})}>Gửi chủ trọ duyệt</button>
      <h3>Yêu cầu đã gửi</h3>{meterHistoryError&&<p role="alert">Chưa tải được lịch sử: {meterHistoryError} <button type="button" disabled={busy} onClick={()=>void loadMeterHistory()}>Thử lại</button></p>}{history.map(h=><article key={h.submission_id}><strong>{h.room_code} · {h.utility==="ELECTRICITY"?"Điện":"Nước"}: {h.reading}</strong><p>{period(h)} · {label(h.status)}</p>{h.decision_note&&<p>{h.decision_note}</p>}</article>)}
    </div>}
    {notice&&<p role="status" className="notice">{notice}</p>}
    </div>
    <form className="resident-assistant-composer" onSubmit={e=>void submitQuestion(e)} aria-label="Nhắn tin cho Cloudy">
      <label className="resident-assistant-sr-only" htmlFor="resident-cloudy-message">Nhắn tin cho Cloudy</label><input id="resident-cloudy-message" value={text} maxLength={500} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="Nhập tin nhắn..."/><button disabled={busy||!text.trim()}>Gửi</button>
    </form>
  </section></div>;
}
