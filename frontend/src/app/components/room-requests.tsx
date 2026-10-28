"use client";
import {useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../lib/api/apiClient';
import {useAuth} from './auth-provider';
type Room={occupancy_id:string;room_id:string;room_code:string;property_name:string;equipment:{code:string;name:string}[]};
type Catalog={rooms:Room[];equipment_options:{code:string;name:string}[]};
type RequestRow={complaint_id:string;room_id:string|null;property_id:string;room_code:string|null;property_name:string;category:string;content:string;status:string;equipment_code:string|null;equipment_name:string|null;created_at:string;history:{action:string;to_status:string|null;note:string|null;created_at:string}[]};
const labels:Record<string,string>={pending:'Chờ xử lý',in_progress:'Đang xử lý',resolved:'Đã giải quyết',rejected:'Đã từ chối'};
function requestedRoomCode(text:string){const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLocaleLowerCase('vi-VN');return normalized.match(/\b(?:phong|room)\s*(?:so\s*)?([a-z0-9][a-z0-9-]*)\b/)?.[1]??null;}
function preparedRequestContent(text:string){return text.trim().replace(/^(?:tôi|toi)\s+(?:muốn|muon)\s+(?:khiếu nại|khieu nai|phàn nàn|phan nan|báo sự cố|bao su co|báo hỏng|bao hong)\s*/i,'')||text.trim();}
function RequestHistory({row}:{row:RequestRow}){return <details><summary>Lịch sử xử lý</summary>{row.history.map((h,i)=><p key={i}>{new Date(h.created_at).toLocaleString('vi-VN')} · {h.to_status?labels[h.to_status]:h.action}: {h.note}</p>)}</details>;}
export function ResidentRoomRequests({initialContent='',onAssistantReply}:{initialContent?:string;onAssistantReply?:(message:string)=>void}){
  const {status,user}=useAuth();
  if(status!=='authenticated'||user?.account.role!=='resident')return null;
  return <ResidentRequestContent key={user.account.account_id} initialContent={initialContent} onAssistantReply={onAssistantReply}/>;
}
function ResidentRequestContent({initialContent,onAssistantReply}:{initialContent:string;onAssistantReply?:(message:string)=>void}){
  const [catalog,setCatalog]=useState<Catalog|null>(null),[rows,setRows]=useState<RequestRow[]>([]),[occupancy,setOccupancy]=useState(''),[code,setCode]=useState(''),[content,setContent]=useState(initialContent),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[submitted,setSubmitted]=useState<{complaint_id:string;status:string}|null>(null);
  const requestKey=useRef(''),lock=useRef(false),preparedInitialContent=useRef(''),successCard=useRef<HTMLDivElement>(null);
  async function load(){const [c,h]=await Promise.all([apiRequest<Catalog>('/me/room-request-targets'),apiRequest<RequestRow[]>('/me/room-requests')]);setCatalog(c);setRows(h);if(c.rooms.length===1)setOccupancy(c.rooms[0].occupancy_id);}
  useEffect(()=>{void load().catch(e=>setNote(e.message));},[]);
  useEffect(()=>{setContent(preparedRequestContent(initialContent));setConfirmed(false);setSubmitted(null);setNote('');requestKey.current='';},[initialContent]);
  useEffect(()=>{if(!catalog||!initialContent.trim()||preparedInitialContent.current===initialContent)return;preparedInitialContent.current=initialContent;const code=requestedRoomCode(initialContent);if(!code)return;const matches=catalog.rooms.filter(r=>r.room_code.toLocaleLowerCase('vi-VN')===code);if(matches.length===1){setOccupancy(matches[0].occupancy_id);setNote(`Mình đã chọn phòng ${matches[0].room_code}. Bạn kiểm tra lại nội dung rồi xác nhận gửi khiếu nại.`);}else if(matches.length===0){setOccupancy('');setNote(`Mình chưa tìm thấy phòng ${code} trong danh sách phòng bạn đang ở. Hãy chọn đúng phòng trước khi gửi.`);}else{setOccupancy('');setNote(`Có nhiều phòng ${code} trong danh sách bạn đang ở. Hãy chọn đúng địa điểm trước khi gửi.`);}},[catalog,initialContent]);
  useEffect(()=>{if(!submitted)return;const card=successCard.current;if(!card)return;const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;card.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'nearest'});},[submitted]);
  function changed(){setConfirmed(false);setSubmitted(null);setNote('');requestKey.current='';}
  const room=catalog?.rooms.find(r=>r.occupancy_id===occupancy);
  return <section className="resident-assistant-fields"><h3>Khiếu nại / yêu cầu cho phòng</h3>
    <label>Phòng đang ở<select disabled={busy} value={occupancy} onChange={e=>{setOccupancy(e.target.value);changed();}}><option value="">Chọn phòng</option>{catalog?.rooms.map(r=><option key={r.occupancy_id} value={r.occupancy_id}>{r.property_name} · {r.room_code}</option>)}</select></label>
    {catalog&&!catalog.rooms.length&&<p>Bạn chưa có phòng đang ở hợp lệ để gửi yêu cầu.</p>}
    {room&&<p>Thiết bị đã xác nhận: {room.equipment.length?room.equipment.map(e=>e.name).join(', '):'Chưa có thiết bị được ghi nhận.'}</p>}
    <label>Loại yêu cầu<select disabled={busy} value={code} onChange={e=>{setCode(e.target.value);changed();}}><option value="">Khiếu nại / yêu cầu khác</option>{catalog?.equipment_options.map(e=><option key={e.code} value={e.code} disabled={room?.equipment.some(x=>x.code===e.code)}>Bổ sung {e.name}</option>)}</select></label>
    <label>Nội dung<textarea disabled={busy} rows={3} maxLength={5000} value={content} onChange={e=>{setContent(e.target.value);changed();}} placeholder="Ví dụ: Phòng tôi muốn bổ sung tủ lạnh để bảo quản thực phẩm."/></label>
    <p>{code?'Chủ trọ xác nhận đã bổ sung thì thiết bị mới được ghi vào phòng.':'Chủ trọ sẽ tiếp nhận và phản hồi yêu cầu; nội dung tự do không tự thay đổi thiết bị phòng.'}</p>
    <label className="resident-assistant-check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi xác nhận đúng phòng, loại yêu cầu và nội dung.</label>
    <button disabled={busy||!confirmed||!occupancy||content.trim().length<5} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setNote('');try{requestKey.current ||= crypto.randomUUID();const result=await apiRequest<{complaint_id:string;status:string}>('/me/room-requests',{method:'POST',body:JSON.stringify({occupancy_id:occupancy,request_key:requestKey.current,equipment_code:code||null,content:content.trim()})});setContent('');setCode('');setConfirmed(false);requestKey.current='';setSubmitted(result);onAssistantReply?.(`Mình đã gửi yêu cầu đến chủ trọ. Mã yêu cầu ${result.complaint_id}; phòng chưa thay đổi và đang ở trạng thái ${labels[result.status]??'Chờ xử lý'}.`);await load().catch(()=>setNote('Yêu cầu đã gửi nhưng danh sách chưa tải lại được. Nhấn “Tải lại” để cập nhật trạng thái.'));}catch(e){setNote(e instanceof Error?e.message:'Không gửi được yêu cầu.');}finally{lock.current=false;setBusy(false);}}}>Gửi chủ trọ</button>
    {submitted&&<div className="resident-request-success" role="status" aria-live="polite" aria-atomic="true" ref={successCard}>
      <div className="resident-request-success-icon" aria-hidden="true">✓</div><div className="resident-request-success-copy"><strong>Đã gửi đến chủ trọ</strong><p>Yêu cầu của bạn đã được ghi nhận. Phòng vẫn giữ nguyên cho đến khi chủ trọ xử lý.</p><div className="resident-request-success-meta"><span>Mã yêu cầu · {submitted.complaint_id}</span><span className="resident-request-success-status">{labels[submitted.status]??'Chờ xử lý'}</span></div></div>
    </div>}
    {note&&<p className="resident-request-note" role="status">{note}</p>}
    <h3>Yêu cầu của bạn</h3><button disabled={busy} onClick={()=>void load().catch(e=>setNote(e.message))}>Tải lại</button>
    {rows.map(r=><article key={r.complaint_id}><strong>{r.property_name} · {r.room_code} · {r.equipment_name?`Bổ sung ${r.equipment_name}`:r.category}</strong><p>{r.content}</p><p>{labels[r.status]}</p><RequestHistory row={r}/></article>)}
  </section>;
}
export function OwnerRoomRequests(){
  const {status,user}=useAuth();
  if(status!=='authenticated'||user?.account.role!=='admin')return null;
  return <OwnerRequestContent key={user.account.account_id}/>;
}
function OwnerRequestContent(){
  const [rows,setRows]=useState<RequestRow[]>([]),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[selection,setSelection]=useState<{row:RequestRow;decision:string}|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[openOnly,setOpenOnly]=useState(true);
  const lock=useRef(false);
  async function load(){setRows(await apiRequest<RequestRow[]>('/room-requests'));}
  useEffect(()=>{void load().catch(e=>setNote(e.message));},[]);
  return <section className="meter-approval"><header><div><h2>Yêu cầu & khiếu nại từ khách</h2><p>Dữ liệu thật. Xác nhận đã bổ sung thiết bị sẽ cập nhật phòng tương ứng.</p></div><button disabled={busy} onClick={()=>void load().catch(e=>setNote(e.message))}>Tải lại</button></header>
    <label className="meter-approval-toggle"><input type="checkbox" checked={openOnly} onChange={e=>setOpenOnly(e.target.checked)}/> <span>Chỉ xem đang chờ / đang xử lý</span></label>
    {note&&<p role="status">{note}</p>}
    {rows.filter(r=>!openOnly||['pending','in_progress'].includes(r.status)).map(r=><article className="meter-approval-detail" key={r.complaint_id}>
      <h3>{r.property_name} · Phòng {r.room_code??'—'} · {r.equipment_name?`Bổ sung ${r.equipment_name}`:r.category}</h3><p>{r.content}</p><p>{labels[r.status]} · {new Date(r.created_at).toLocaleString('vi-VN')}</p>
      {r.room_id&&<RoomEquipment roomId={r.room_id} refreshKey={r.status}/>}
      {['pending','in_progress'].includes(r.status)&&<div>{(r.status==='pending'?['START','APPROVE','REJECT']:['APPROVE','REJECT']).map(d=><button disabled={busy} key={d} onClick={()=>{setSelection({row:r,decision:d});setReason('');setConfirmed(false);}}>{d==='START'?'Tiếp nhận':d==='REJECT'?'Từ chối':r.equipment_name?`Xác nhận đã bổ sung ${r.equipment_name}`:'Xác nhận đã giải quyết'}</button>)}</div>}
      {selection?.row.complaint_id===r.complaint_id&&<form onSubmit={async e=>{e.preventDefault();if(lock.current||!confirmed)return;lock.current=true;setBusy(true);setNote('');try{await apiRequest(`/room-requests/${r.complaint_id}/decision`,{method:'POST',body:JSON.stringify({decision:selection.decision,reason})});setSelection(null);setNote(selection.decision==='APPROVE'&&r.equipment_name?`Đã cập nhật ${r.equipment_name} cho phòng ${r.room_code}.`:'Đã lưu xử lý yêu cầu.');await load();}catch(e){setNote(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);lock.current=false;}}}>
        <p>{selection.decision==='APPROVE'&&r.equipment_name?`Xác nhận phòng ${r.room_code} đã có ${r.equipment_name}. Hệ thống sẽ lưu thiết bị vào phòng và hoàn tất yêu cầu.`:'Xác nhận xử lý yêu cầu này.'}</p>
        <label>Lý do / ghi chú<textarea required maxLength={1000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label><label className="meter-approval-toggle"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> <span>Tôi xác nhận đúng yêu cầu và phòng.</span></label><button disabled={busy||!confirmed||!reason.trim()}>Xác nhận</button><button type="button" disabled={busy} onClick={()=>setSelection(null)}>Hủy</button>
      </form>}<RequestHistory row={r}/>
    </article>)}
    {!rows.length&&<p>Chưa có yêu cầu từ khách.</p>}
  </section>;
}
export function RoomEquipment({roomId,refreshKey=''}:{roomId:string;refreshKey?:string}){
  const [items,setItems]=useState<{code:string;name:string}[]>([]),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();setItems([]);setError('');apiRequest<{code:string;name:string}[]>(`/rooms/${roomId}/equipment`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setItems(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[roomId,refreshKey]);
  return <p>Thiết bị phòng đã xác nhận: {error|| (items.length?items.map(i=>i.name).join(', '):'Chưa có thiết bị được ghi nhận.')}</p>;
}
