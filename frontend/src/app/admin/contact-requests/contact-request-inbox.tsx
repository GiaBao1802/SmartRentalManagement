"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminShell from "../../components/admin-shell";
import { adminContactRequestApi, type AdminContactRequest, type ContactRequestStatus } from "../../../lib/api/publicRoomApi";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { formatAdminTimestamp } from "../../../lib/ui/admin-presentation";

const statuses: Array<{ value: ContactRequestStatus | ""; label: string }> = [{ value: "", label: "Tất cả trạng thái" }, { value: "new", label: "Mới" }, { value: "contacted", label: "Đã liên hệ" }, { value: "closed", label: "Đã đóng" }];
const statusLabel: Record<ContactRequestStatus, string> = { new: "Mới", contacted: "Đã liên hệ", closed: "Đã đóng" };
const dateLabel = (value: string) => formatAdminTimestamp(value);

export default function ContactRequestsPage() {
  const [rows, setRows] = useState<AdminContactRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [status, setStatus] = useState<ContactRequestStatus | "">("");
  const [createdAt, setCreatedAt] = useState("");
  const [applied, setApplied] = useState({ property_id: "", status: "" as ContactRequestStatus | "", created_at: "", page: 1 });
  const [meta, setMeta] = useState<{ page: number; page_size: number; total_items: number; total_pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<AdminContactRequest | null>(null);
  const [statusDraft, setStatusDraft] = useState<ContactRequestStatus>("new");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await adminContactRequestApi.list({ page: applied.page, page_size: 20, ...(applied.property_id ? { property_id: applied.property_id } : {}), ...(applied.status ? { status: applied.status } : {}), ...(applied.created_at ? { created_at: applied.created_at } : {}) });
      setRows(result.data); setMeta(result.meta);
    } catch { setRows([]); setMeta(null); setError("Không tải được yêu cầu liên hệ. Vui lòng thử lại."); }
    finally { setLoading(false); }
  }, [applied]);

  useEffect(() => { void load(); }, [load, retry]);
  useEffect(() => { void propertyApi.list({ page: 1, page_size: 100 }).then((result) => setProperties(result.data)).catch(() => setProperties([])); }, []);

  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setApplied({ property_id: propertyId, status, created_at: createdAt, page: 1 }); setNotice(""); }
  function clear() { setPropertyId(""); setStatus(""); setCreatedAt(""); setApplied({ property_id: "", status: "", created_at: "", page: 1 }); setNotice(""); }

  async function openDetail(id: string) {
    setNotice("");
    try { const detail = await adminContactRequestApi.get(id); setSelected(detail); setStatusDraft(detail.status); }
    catch { setNotice("Không mở được chi tiết yêu cầu liên hệ."); }
  }

  async function saveStatus() {
    if (!selected || saving) return;
    setSaving(true); setNotice("");
    try {
      const updated = await adminContactRequestApi.updateStatus(selected.contact_request_id, statusDraft);
      setSelected(updated); setRows((current) => current.map((row) => row.contact_request_id === updated.contact_request_id ? updated : row));
      setNotice("Đã cập nhật trạng thái yêu cầu.");
    } catch { setNotice("Chưa cập nhật được trạng thái. Vui lòng thử lại."); }
    finally { setSaving(false); }
  }

  return <AdminShell active="/admin/contact-requests"><main className="admin-main contact-inbox-page"><div className="page-heading"><div><h1>Khách quan tâm</h1><p>Tiếp nhận và phản hồi yêu cầu liên hệ từ khách tìm phòng.</p></div></div>
    <form className="filter-form contact-inbox-filter" onSubmit={apply}><label>Khu vực<select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Tất cả khu vực</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name}</option>)}</select></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as ContactRequestStatus | "")}>{statuses.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}</select></label><label>Ngày gửi<input type="date" value={createdAt} onChange={(event) => setCreatedAt(event.target.value)} /></label><div className="filter-actions"><button className="button primary" type="submit">Lọc</button><button className="button" type="button" onClick={clear}>Xóa lọc</button></div></form>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="table-card"><div className="table-heading"><strong>Yêu cầu liên hệ</strong><span>{meta?.total_items ?? 0} yêu cầu</span></div>
      {loading ? <div className="public-admin-loading" role="status">Đang tải yêu cầu…</div> : error ? <div className="empty-cell"><p>{error}</p><button className="button" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div> : rows.length ? <div className="table-scroll"><table><thead><tr><th>Khách liên hệ</th><th>Phòng / khu vực</th><th>Ngày gửi</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.contact_request_id}><td><strong>{row.requester_name}</strong><span className="subtext">{row.phone}{row.email ? ` · ${row.email}` : ""}</span></td><td>{row.room ? `Phòng ${row.room.room_code} · ` : ""}{row.property.name}<span className="subtext">{row.property.province}</span></td><td>{dateLabel(row.created_at)}</td><td><span className={`chip ${row.status === "new" ? "warning" : row.status === "contacted" ? "success" : ""}`}>{statusLabel[row.status]}</span></td><td><button className="text-action" type="button" onClick={() => void openDetail(row.contact_request_id)}>Xem chi tiết</button></td></tr>)}</tbody></table></div> : <div className="empty-cell">Chưa có yêu cầu liên hệ nào theo bộ lọc.</div>}
      {meta && meta.total_pages > 1 && <div className="table-footer pagination"><span>Trang {meta.page} / {meta.total_pages}</span><div><button className="button" type="button" disabled={loading || meta.page <= 1} onClick={() => setApplied((current) => ({ ...current, page: current.page - 1 }))}>Trước</button><button className="button" type="button" disabled={loading || meta.page >= meta.total_pages} onClick={() => setApplied((current) => ({ ...current, page: current.page + 1 }))}>Sau</button></div></div>}
    </section>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}><section className="edit-modal contact-request-detail" role="dialog" aria-modal="true" aria-labelledby="contact-request-title"><div className="modal-heading"><h2 id="contact-request-title">Yêu cầu liên hệ</h2><button className="modal-close" type="button" aria-label="Đóng" onClick={() => setSelected(null)}>×</button></div><div className="detail-grid">{[["Khách", selected.requester_name], ["Điện thoại", selected.phone], ["Email", selected.email || "—"], ["Phòng", selected.room?.room_code || "Quan tâm khu vực"], ["Khu vực", selected.property.name], ["Địa chỉ", `${selected.property.address}, ${selected.property.province}`], ["Ngày gửi", dateLabel(selected.created_at)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><h3>Lời nhắn</h3><p className="contact-request-message">{selected.message || "Khách chưa để lại lời nhắn."}</p><label className="contact-request-status">Trạng thái<select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as ContactRequestStatus)}>{statuses.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{notice && <p className="notice" role="status">{notice}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setSelected(null)}>Đóng</button><button className="button primary" type="button" disabled={saving || statusDraft === selected.status} onClick={() => void saveStatus()}>{saving ? "Đang lưu…" : "Lưu trạng thái"}</button></div></section></div>}
  </main></AdminShell>;
}
