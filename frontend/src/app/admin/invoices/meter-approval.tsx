"use client";
import {useEffect,useState} from "react";
import {apiRequest} from "../../../lib/api/apiClient";
import {useAuth} from "../../components/auth-provider";
import type {MeterRequest} from "../../components/resident-assistant";

export default function MeterApproval(){
  const {status,user}=useAuth();
  if(status!=="authenticated"||user?.account.role!=="admin")return null;
  return <MeterApprovalContent key={user.account.account_id}/>;
}
function MeterApprovalContent(){
  const [rows,setRows]=useState<MeterRequest[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<MeterRequest|null>(null);
  const [reason,setReason]=useState("");
  const [preview,setPreview]=useState("");
  const base=(process.env.NEXT_PUBLIC_API_BASE_URL??"http://localhost:4000/api/v1").replace(/\/$/,"");
  async function refresh(){setRows(await apiRequest<MeterRequest[]>("/meter-submissions"));}
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    setPreview("");if(!selected)return;
    const controller=new AbortController();let url="";
    fetch(`${base}/meter-submissions/${selected.submission_id}/image`,{credentials:"include",cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error("Không tải được ảnh.");return r.blob();}).then(blob=>{if(!controller.signal.aborted){url=URL.createObjectURL(blob);setPreview(url);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[selected,base]);
  async function decide(decision:"APPROVE"|"REJECT"){
    if(!selected||busy)return;
    setBusy(true);setError("");
    try{await apiRequest(`/meter-submissions/${selected.submission_id}/decision`,{method:"POST",body:JSON.stringify({decision,reason})});setSelected(null);setReason("");await refresh();}catch(e){setError(e instanceof Error?e.message:"Không xử lý được yêu cầu.");}finally{setBusy(false);}
  }
  return <section className="meter-approval"><header><div><h2>Ảnh chỉ số khách gửi</h2><p>Duyệt để cập nhật chỉ số vào hóa đơn nháp. Hóa đơn chưa được chốt.</p></div><button disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>Tải lại</button></header>
    {error&&<p role="alert">{error}</p>}
    {!rows.length&&<p>Chưa có yêu cầu chỉ số.</p>}
    <div className="meter-approval-list">{rows.map(row=><button key={row.submission_id} disabled={busy} onClick={()=>{setSelected(row);setReason("");setError("");}}><strong>{row.property_name} · {row.room_code}</strong><span>{row.utility==="ELECTRICITY"?"Điện":"Nước"}: {row.reading} · {row.status==="PENDING"?"Chờ duyệt":row.status==="APPROVED"?"Đã duyệt":"Đã từ chối"}</span><small>{row.period_start.slice(0,10)} → {row.period_end.slice(0,10)}</small></button>)}</div>
    {selected&&<div className="meter-approval-detail"><h3>{selected.room_code} · {selected.utility==="ELECTRICITY"?"Điện (kWh)":"Nước (m³)"}: {selected.reading}</h3>{preview?<img className="resident-meter-image" src={preview} alt="Ảnh đồng hồ khách gửi để đối chiếu"/>:<p>Đang tải ảnh…</p>}
      <a href={`/admin/invoices/${selected.invoice_id}`}>Xem hóa đơn và chỉ số kỳ trước</a>
      {selected.status==="PENDING"?<><label>Ghi chú / lý do từ chối<textarea disabled={busy} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div><button disabled={busy||!preview} onClick={()=>void decide("APPROVE")}>Duyệt chỉ số {selected.reading}</button><button disabled={busy} onClick={()=>void decide("REJECT")}>Từ chối</button></div></>:<p>{selected.decision_note}</p>}
      <button disabled={busy} onClick={()=>setSelected(null)}>Đóng chi tiết</button>
    </div>}
  </section>;
}
