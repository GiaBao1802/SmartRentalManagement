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
  const [rows,setRows]=useState<RequestRow[]>([]),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[selection,setSelection]=useState<{row:RequestRow;decision:string}|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[statusFilter,setStatusFilter]=useState('all');
  const lock=useRef(false);
  async function load(){setLoading(true);try{setRows(await apiRequest<RequestRow[]>('/room-requests'));}finally{setLoading(false);}}
  useEffect(()=>{void load().catch(e=>setNote(e.message));},[]);
  const pendingCount=rows.filter(r=>r.status==='pending').length;
  const processingCount=rows.filter(r=>r.status==='in_progress').length;
  const completedCount=rows.filter(r=>['resolved','rejected'].includes(r.status)).length;
  const visibleRows=rows.filter(r=>statusFilter==='all'||(statusFilter==='open'?['pending','in_progress'].includes(r.status):r.status===statusFilter));
  return <section className="admin-requests">
    <header className="admin-requests__heading">
      <div><p className="admin-requests__eyebrow">DỊCH VỤ & HỖ TRỢ</p><h1>Yêu cầu & khiếu nại</h1><p>Theo dõi, tiếp nhận và cập nhật tiến độ yêu cầu từ cư dân.</p></div>
      <button className="button admin-requests__reload" type="button" disabled={busy||loading} onClick={()=>void load().catch(e=>setNote(e.message))}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/></svg>{loading?'Đang tải…':'Tải lại'}</button>
    </header>
    <div className="admin-requests__stats" aria-label="Tổng quan yêu cầu">
      <section className="admin-requests__stat is-total"><span>Tổng yêu cầu</span><strong>{rows.length}</strong><small>Ghi nhận từ cư dân</small></section>
      <section className="admin-requests__stat is-pending"><span>Chờ xử lý</span><strong>{pendingCount}</strong><small>Cần được tiếp nhận</small></section>
      <section className="admin-requests__stat is-processing"><span>Đang xử lý</span><strong>{processingCount}</strong><small>Đang được theo dõi</small></section>
      <section className="admin-requests__stat is-completed"><span>Đã kết thúc</span><strong>{completedCount}</strong><small>Đã giải quyết hoặc từ chối</small></section>
    </div>
    <section className="admin-requests__panel" aria-labelledby="admin-requests-title">
      <div className="admin-requests__toolbar">
        <div><h2 id="admin-requests-title">Hộp thư yêu cầu</h2><p>{loading?'Đang cập nhật danh sách…':visibleRows.length+' yêu cầu được hiển thị'}</p></div>
        <label className="admin-requests__status-filter"><span>Lọc trạng thái</span><span className="admin-requests__status-select"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Lọc yêu cầu theo trạng thái"><option value="all">Tất cả trạng thái</option><option value="open">Đang mở</option><option value="pending">Chờ xử lý</option><option value="in_progress">Đang xử lý</option><option value="resolved">Đã giải quyết</option><option value="rejected">Đã từ chối</option></select><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span></label>
      </div>
      {note&&<p className="admin-requests__notice" role="status">{note}</p>}
      {loading&&!rows.length?<div className="admin-requests__empty"><span className="admin-requests__spinner" aria-hidden="true"/><strong>Đang tải yêu cầu</strong><p>Đang lấy dữ liệu mới nhất từ hệ thống.</p></div>
      :visibleRows.length===0?<div className="admin-requests__empty"><span className="admin-requests__empty-icon" aria-hidden="true">✓</span><strong>{rows.length?(statusFilter==='open'?'Không còn yêu cầu đang mở':'Không có yêu cầu phù hợp với bộ lọc'):'Chưa có yêu cầu từ khách'}</strong><p>{rows.length?'Thử chọn trạng thái khác hoặc xem tất cả trạng thái.':'Khi cư dân gửi phản hồi, yêu cầu sẽ xuất hiện tại đây.'}</p></div>
      :<div className="admin-requests__list">{visibleRows.map(r=>{
        const category=r.equipment_name?'Bổ sung '+r.equipment_name:r.category;
        const date=new Date(r.created_at);
        return <article className={'admin-request-card is-'+r.status} key={r.complaint_id}>
          <header className="admin-request-card__header">
            <div className="admin-request-card__identity"><span className="admin-request-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9a2.5 2.5 0 0 1-2.5 2.5H9l-5 4v-15.5Z"/><path d="M8 8h8M8 12h5"/></svg></span><div><p>{r.property_name}</p><h3>{r.room_code?'Phòng '+r.room_code:'Khu vực chung'} <span aria-hidden="true">·</span> {category}</h3></div></div>
            <span className={'admin-request-status is-'+r.status}><i aria-hidden="true"/>{labels[r.status]??r.status}</span>
          </header>
          <p className="admin-request-card__content">{r.content}</p>
          <div className="admin-request-card__meta"><span><time dateTime={r.created_at}>{date.toLocaleString('vi-VN')}</time></span><span>Mã yêu cầu #{r.complaint_id}</span></div>
          {r.room_id&&<div className="admin-request-equipment"><strong>Thiết bị phòng đã xác nhận</strong><RoomEquipment roomId={r.room_id} refreshKey={r.status}/></div>}
          {['pending','in_progress'].includes(r.status)&&<div className="admin-request-card__actions">{(r.status==='pending'?['START','APPROVE','REJECT']:['APPROVE','REJECT']).map(d=><button className={'button admin-request-action '+(d==='REJECT'?'is-danger':d==='START'?'is-secondary':'is-primary')} disabled={busy} key={d} onClick={()=>{setSelection({row:r,decision:d});setReason('');setConfirmed(false);}}>{d==='START'?'Tiếp nhận':d==='REJECT'?'Từ chối':r.equipment_name?'Xác nhận đã bổ sung '+r.equipment_name:'Xác nhận đã giải quyết'}</button>)}</div>}
          {selection?.row.complaint_id===r.complaint_id&&<form className="admin-request-decision" onSubmit={async e=>{e.preventDefault();if(lock.current||!confirmed)return;lock.current=true;setBusy(true);setNote('');try{await apiRequest('/room-requests/'+r.complaint_id+'/decision',{method:'POST',body:JSON.stringify({decision:selection.decision,reason})});setSelection(null);setNote(selection.decision==='APPROVE'&&r.equipment_name?'Đã cập nhật '+r.equipment_name+' cho phòng '+r.room_code+'.':'Đã lưu xử lý yêu cầu.');await load();}catch(e){setNote(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);lock.current=false;}}}>
            <p>{selection.decision==='APPROVE'&&r.equipment_name?'Xác nhận phòng '+r.room_code+' đã có '+r.equipment_name+'. Hệ thống sẽ lưu thiết bị vào phòng và hoàn tất yêu cầu.':'Xác nhận xử lý yêu cầu này.'}</p>
            <label>Lý do / ghi chú<textarea required maxLength={1000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label>
            <label className="admin-request-decision__check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Tôi xác nhận đúng yêu cầu và phòng.</span></label>
            <div className="admin-request-decision__actions"><button className="button admin-request-action is-primary" disabled={busy||!confirmed||!reason.trim()}>{busy?'Đang lưu…':'Xác nhận xử lý'}</button><button className="button admin-request-action is-secondary" type="button" disabled={busy} onClick={()=>setSelection(null)}>Hủy</button></div>
          </form>}
          <details className="admin-request-history"><summary><span>Lịch sử xử lý</span><span className="admin-request-history__count">{r.history.length}</span></summary>{r.history.length?<ol>{r.history.map((h,i)=><li key={i}><time dateTime={h.created_at}>{new Date(h.created_at).toLocaleString('vi-VN')}</time><span>{h.to_status?labels[h.to_status]??h.to_status:h.action}{h.note?' · '+h.note:''}</span></li>)}</ol>:<p>Chưa có cập nhật xử lý.</p>}</details>
        </article>;
      })}</div>}
    </section>
  </section>;
}
export function RoomEquipment({roomId,refreshKey=''}:{roomId:string;refreshKey?:string}){
  const [items,setItems]=useState<{code:string;name:string}[]>([]),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();setItems([]);setError('');apiRequest<{code:string;name:string}[]>(`/rooms/${roomId}/equipment`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setItems(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[roomId,refreshKey]);
  return <p>Thiết bị phòng đã xác nhận: {error|| (items.length?items.map(i=>i.name).join(', '):'Chưa có thiết bị được ghi nhận.')}</p>;
}
