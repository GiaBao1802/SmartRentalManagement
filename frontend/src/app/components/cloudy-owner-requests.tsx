"use client";
import {useState} from 'react';
export type OwnerRequest={id:string;room:string;kind:string;resident:string;title:string;content:string;status:string;revision:number;createdAt:string;actions:string[];actionLabels:Record<string,string>;history:{action:string;reason:string;at:string}[]};
const labels:Record<string,string>={pending:'Chờ xử lý',in_progress:'Đang xử lý',approved:'Đã duyệt',rejected:'Đã từ chối',resolved:'Đã giải quyết'};
export function CloudyOwnerRequests({rows,busy,onDecision}:{rows:OwnerRequest[];busy:boolean;onDecision:(body:object)=>Promise<boolean>}){
 const [kind,setKind]=useState(''),[onlyOpen,setOnlyOpen]=useState(true),[selection,setSelection]=useState<{id:string;action:string}|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
 const filtered=rows.filter(r=>(!kind||r.kind===kind)&&(!onlyOpen||['pending','in_progress'].includes(r.status)));
 return <section aria-label="Yêu cầu từ người thuê">
  <h3>Yêu cầu từ người thuê · mô phỏng</h3>
  <label>Loại yêu cầu<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">Tất cả</option><option value="service">Đăng ký tiện ích</option><option value="complaint">Khiếu nại / sự cố</option></select></label>
  <label><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/> Chỉ yêu cầu đang chờ / đang xử lý</label>
  {rows.length===0?<p>Không có yêu cầu nào trong phạm vi tra cứu.</p>:filtered.length===0?<p>Không có yêu cầu nào khớp bộ lọc hiện tại. Thử đổi loại yêu cầu hoặc bỏ chọn “Chỉ yêu cầu đang chờ / đang xử lý”.</p>:<p>{filtered.length} yêu cầu phù hợp.</p>}
  {filtered.map(row=><article key={row.id}><h3>{row.room} · {row.title}</h3><p>{row.resident} · {labels[row.status]??row.status}</p><p>Gửi ngày {row.createdAt.slice(0,10)} · {row.id}</p><p>{row.content}</p>
   <div>{row.actions.map(action=><button key={action} type="button" disabled={busy} onClick={()=>{setSelection({id:row.id,action});setReason('');setConfirmed(false);}}>{row.actionLabels[action]}</button>)}</div>
   {selection?.id===row.id&&<form onSubmit={async e=>{e.preventDefault();if(confirmed&&await onDecision({requestId:row.id,action:selection.action,revision:row.revision,reason,confirmed:true})){setSelection(null);setReason('');setConfirmed(false);}}}>
    <p>Thao tác: {row.actionLabels[selection.action]}. Chỉ cập nhật yêu cầu mẫu, không tạo khoản thu hay thông báo thật.</p>
    <label>Lý do / ghi chú<textarea required maxLength={1000} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Tôi xác nhận thao tác mô phỏng cho {row.id}.</label>
    <button disabled={busy||!confirmed||!reason.trim()}>Xác nhận xử lý mô phỏng</button><button type="button" onClick={()=>setSelection(null)}>Hủy</button>
   </form>}
   {row.history.length>0&&<details><summary>Lịch sử xử lý ({row.history.length})</summary><ul>{row.history.map((event,i)=><li key={i}>{row.actionLabels[event.action]} · {event.reason} · {new Date(event.at).toLocaleString('vi-VN')}</li>)}</ul></details>}
  </article>)}
 </section>;
}
