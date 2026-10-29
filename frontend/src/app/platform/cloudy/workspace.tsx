"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "../../../lib/api/apiClient";
import { useAuth } from "../../components/auth-provider";

type Status = "new" | "reviewed" | "no_action" | "included_in_eval";
type Intent = "services" | "meter" | "requests" | "invoice" | "other" | "ambiguous";
type Feedback = {
  feedback_id: string; sanitized_message: string; status: Status; predicted_intent: "help"; curated_intent: Intent | null;
  model_version: string; occurrence_count: number; first_seen_at: string; last_seen_at: string;
  latest_reviewed_by_account_id: string | null; latest_reviewed_at: string | null;
  evaluation_set_version: string | null; updated_at: string;
};
type Review = { review_id: string; reviewer_account_id: string; action: string; previous_status: Status | null; next_status: Status | null; previous_intent: Intent | null; next_intent: Intent | null; previous_evaluation_set_version: string | null; next_evaluation_set_version: string | null; created_at: string };
type Detail = Feedback & { reviews: Review[] };
type Page = { data: Feedback[]; meta: { page: number; page_size: number; total_items: number; total_pages: number } };
const STATUS_LABEL: Record<Status,string> = { new:"Chưa duyệt", reviewed:"Đã xem", no_action:"Không cần xử lý", included_in_eval:"Đã đưa vào bộ đánh giá" };
const INTENT_LABEL: Record<Intent,string> = { services:"Tiện ích", meter:"Điện/nước", requests:"Khiếu nại/yêu cầu", invoice:"Hóa đơn", other:"Ngoài phạm vi", ambiguous:"Cần làm rõ" };
const dateTime=(value:string)=>new Intl.DateTimeFormat("vi-VN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(value));

export function CloudyFeedbackWorkspace() {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const [rows,setRows]=useState<Feedback[]>([]);
  const [selected,setSelected]=useState<Detail|null>(null);
  const [filter,setFilter]=useState<Status|"all">("new");
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [reviewStatus,setReviewStatus]=useState<Status>("reviewed");
  const [intent,setIntent]=useState<Intent|"">("");
  const [evaluationVersion,setEvaluationVersion]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load = useCallback(async (targetPage=page,targetFilter=filter) => {
    setBusy(true);setError("");
    try{
      const query=new URLSearchParams({page:String(targetPage),page_size:"20",...(targetFilter!=="all"?{status:targetFilter}:{})});
      const result=await apiRequest<Page>(`/platform/cloudy/unresolved-feedback?${query}`);
      setRows(result.data);setPage(result.meta.page);setTotalPages(Math.max(1,result.meta.total_pages));
      if(selected){const updated=result.data.find(row=>row.feedback_id===selected.feedback_id);if(updated)await loadDetail(updated.feedback_id);else setSelected(null);}
    }catch(e){setError(e instanceof Error?e.message:"Không tải được hàng đợi.");}
    finally{setBusy(false);}
  },[filter,page,selected]);

  async function loadDetail(feedbackId:string){
    try{
      const detail=await apiRequest<Detail>(`/platform/cloudy/unresolved-feedback/${feedbackId}`);
      setSelected(detail);setReviewStatus(detail.status);setIntent(detail.curated_intent??"");setEvaluationVersion(detail.evaluation_set_version??"");
    }catch(e){setError(e instanceof Error?e.message:"Không tải được nội dung đã làm sạch.");}
  }

  useEffect(()=>{if(status==="authenticated"&&user?.account.role==="superadmin")void load(1,filter);},[status,user?.account.role,filter]);
  useEffect(()=>{
    if(status!=="authenticated"||!user)return;
    if(user.account.role==="admin")router.replace("/admin/properties");
    else if(user.account.role==="resident")router.replace("/tenant");
  },[status,user,router]);

  async function saveReview(){
    if(!selected||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const updated=await apiRequest<Detail>(`/platform/cloudy/unresolved-feedback/${selected.feedback_id}`,{method:"PATCH",body:JSON.stringify({
        expected_updated_at:selected.updated_at,status:reviewStatus,intent:intent||null,
        evaluation_set_version:reviewStatus==="included_in_eval"?evaluationVersion:null,
      })});
      setSelected(updated);setRows(current=>current.map(row=>row.feedback_id===updated.feedback_id?updated:row));
      setIntent(updated.curated_intent??"");setEvaluationVersion(updated.evaluation_set_version??"");setNotice("Đã lưu quyết định duyệt và lịch sử thao tác. Điều này chưa thay đổi model hoặc câu trả lời đang chạy.");
    }catch(e){setError(e instanceof Error?e.message:"Không lưu được quyết định duyệt.");}
    finally{setBusy(false);}
  }

  if(status==="loading")return <main className="cloudy-platform-page"><p>Đang xác thực quyền truy cập…</p></main>;
  if(status!=="authenticated"||user?.account.role!=="superadmin")return <main className="cloudy-platform-page"><section><h1>Cloudy · Hàng đợi rà soát</h1><p>Khu vực này chỉ dành cho tài khoản Superadmin được mời. Chưa có tài khoản nào được tạo.</p><Link href="/login">Đăng nhập</Link></section></main>;

  return <main className="cloudy-platform-page">
    <header><div><small>QUẢN TRỊ NỀN TẢNG</small><h1>Câu Cloudy chưa hiểu</h1><p>Chỉ hiện câu đã được cư dân đồng ý chia sẻ và đã qua bước che thông tin. Lưu tối đa 30 ngày.</p></div><button type="button" onClick={()=>void logout()}>Đăng xuất</button></header>
    <div className="cloudy-platform-toolbar"><label>Lọc trạng thái<select value={filter} disabled={busy} onChange={e=>{setFilter(e.target.value as Status|"all");setPage(1);setSelected(null);}}><option value="new">Chưa duyệt</option><option value="reviewed">Đã xem</option><option value="no_action">Không cần xử lý</option><option value="included_in_eval">Đã đưa vào bộ đánh giá</option><option value="all">Tất cả</option></select></label><button type="button" disabled={busy} onClick={()=>void load(page,filter)}>Tải lại</button></div>
    {error&&<p className="cloudy-platform-error" role="alert">{error}</p>}
    <div className="cloudy-platform-grid">
      <section className="cloudy-platform-list" aria-label="Hàng đợi">
        {busy&&rows.length===0?<p>Đang tải…</p>:rows.length===0?<p>Không có câu hỏi trong trạng thái này.</p>:rows.map(row=><button className={selected?.feedback_id===row.feedback_id?"is-selected":""} type="button" key={row.feedback_id} onClick={()=>void loadDetail(row.feedback_id)}>
          <span className="cloudy-platform-list__meta"><b>{STATUS_LABEL[row.status]}</b><time>{dateTime(row.last_seen_at)}</time></span><span>{row.sanitized_message}</span><small>Gặp {row.occurrence_count} lần · Qwen {row.model_version}</small>
        </button>)}
        <div className="cloudy-platform-pagination"><button disabled={busy||page<=1} onClick={()=>void load(page-1,filter)}>Trước</button><span>Trang {page}/{totalPages}</span><button disabled={busy||page>=totalPages} onClick={()=>void load(page+1,filter)}>Sau</button></div>
      </section>
      <section className="cloudy-platform-detail" aria-label="Chi tiết và duyệt">
        {!selected?<p>Chọn một câu hỏi để xem nội dung đã làm sạch và lịch sử duyệt.</p>:<>
          <small>Câu nhận lần đầu {dateTime(selected.first_seen_at)} · lặp lại {selected.occurrence_count} lần</small><blockquote>{selected.sanitized_message}</blockquote>
          <p>Intent Cloudy: <b>{selected.predicted_intent}</b> · Model: <b>{selected.model_version}</b></p>
          <label>Trạng thái<select value={reviewStatus} disabled={busy} onChange={e=>setReviewStatus(e.target.value as Status)}>{Object.entries(STATUS_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Phân loại sau rà soát<select value={intent} disabled={busy} onChange={e=>setIntent(e.target.value as Intent|"")}><option value="">Chưa phân loại</option>{Object.entries(INTENT_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {reviewStatus==="included_in_eval"&&<label>Phiên bản bộ đánh giá<input value={evaluationVersion} maxLength={64} disabled={busy} onChange={e=>setEvaluationVersion(e.target.value)} placeholder="vd. cloudy-resident-v1"/></label>}
          <button className="cloudy-platform-save" type="button" disabled={busy||(reviewStatus==="included_in_eval"&&!evaluationVersion.trim())} onClick={()=>void saveReview()}>{busy?"Đang lưu…":"Lưu quyết định duyệt"}</button>
          {notice&&<p role="status">{notice}</p>}
          <h2>Lịch sử duyệt</h2>{selected.reviews.length===0?<p>Chưa có thao tác duyệt.</p>:<ol>{selected.reviews.map(review=><li key={review.review_id}><b>{review.action}</b> · tài khoản {review.reviewer_account_id} · {dateTime(review.created_at)}{review.previous_status!==review.next_status&&<span> · {review.previous_status??"—"} → {review.next_status??"—"}</span>}{review.previous_intent!==review.next_intent&&<span> · {review.previous_intent??"—"} → {review.next_intent??"—"}</span>}</li>)}</ol>}
        </>}
      </section>
    </div>
    <footer>Ví dụ đã duyệt chỉ dùng để cập nhật quy tắc/prompt và bộ kiểm thử qua quy trình phát hành. Màn hình này không huấn luyện hoặc triển khai model.</footer>
  </main>;
}
