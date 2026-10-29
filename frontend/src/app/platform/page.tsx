"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../components/auth-provider";
import { apiRequest } from "../../lib/api/apiClient";

type Owner = { owner_id: string; account_id: string | null; display_name: string; contact_email: string | null; contact_phone: string | null; account_state: string; property_count: number };
type Property = { property_id: string; owner_id: string; name: string; province: string; address: string; status: string; display_name: string };
type Report = { report_id: string; reference_code: string; property_name: string; content: string; status: string; created_at: string };
type ReportDetail = Report & { anonymous: boolean; contact_name: string | null; contact_email: string | null; contact_phone: string | null; history: { history_id: string; action: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string }[] };
type OwnerDetail = Owner & { invitations: { invitation_id: string; status: string; expires_at: string; delivery_status: string }[] };
type AuditEvent = { event_id: string; occurred_at: string; action: string; result: string; target_type: string | null; target_id: string | null; reason: string | null };
type LinkResult = { demo_link?: string; delivery_message: string; delivery_status: string };

const panel: React.CSSProperties = { background: "white", border: "1px solid #d5e0dc", borderRadius: 16, padding: 20, marginBottom: 20 };
const button: React.CSSProperties = { border: 0, borderRadius: 9, padding: "9px 13px", background: "#0E5A4F", color: "white", cursor: "pointer", marginRight: 8, marginTop: 8 };
const field: React.CSSProperties = { display: "block", padding: 10, border: "1px solid #bacbc5", borderRadius: 8, width: "100%", maxWidth: 430, margin: "6px 0 12px" };

export default function PlatformPage() {
  const demoMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PLATFORM_DEMO_LINKS === "1";
  const { user, status, logout } = useAuth();
  const [owners, setOwners] = useState<Owner[]>([]), [properties, setProperties] = useState<Property[]>([]), [reports, setReports] = useState<Report[]>([]), [events, setEvents] = useState<AuditEvent[]>([]);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [verification, setVerification] = useState("");
  const [auditPassword, setAuditPassword] = useState(""), [message, setMessage] = useState(""), [link, setLink] = useState("");
  const [ownerSearch, setOwnerSearch] = useState(""), [propertySearch, setPropertySearch] = useState(""), [propertyStatus, setPropertyStatus] = useState(""), [reportStatus, setReportStatus] = useState("");
  const [ownerDetail, setOwnerDetail] = useState<OwnerDetail | null>(null), [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [tab, setTab] = useState<"owners" | "properties" | "reports" | "audit">("owners");
  const load = useCallback(async () => {
    try {
      const ownerParams = new URLSearchParams({ page_size: "100", search: ownerSearch });
      const propertyParams = new URLSearchParams({ page_size: "100", search: propertySearch });
      if (propertyStatus) propertyParams.set("status", propertyStatus);
      const reportParams = new URLSearchParams({ page_size: "100" });
      if (reportStatus) reportParams.set("status", reportStatus);
      const [o, p, r] = await Promise.all([
        apiRequest<Owner[]>(`/platform/owners?${ownerParams}`), apiRequest<Property[]>(`/platform/properties?${propertyParams}`), apiRequest<Report[]>(`/platform/reports?${reportParams}`),
      ]);
      setOwners(o); setProperties(p); setReports(r);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được dữ liệu."); }
  }, [ownerSearch, propertySearch, propertyStatus, reportStatus]);
  useEffect(() => { if (status === "authenticated" && user?.account.role === "superadmin") void load(); }, [status, user, load, tab]);
  if (status === "loading") return <main style={{ padding: 30 }}>Đang kiểm tra phiên…</main>;
  if (user?.account.role !== "superadmin") return <main style={{ padding: 30 }}>Khu vực này chỉ dành cho Superadmin. <a href="/login">Đăng nhập</a></main>;

  async function action(path: string, body: object = {}) {
    setMessage(""); setLink("");
    try {
      const result = await apiRequest<LinkResult>(path, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
      setMessage(result.delivery_message ?? "Đã cập nhật.");
      if (result.demo_link) setLink(result.demo_link);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Thao tác không thành công."); }
  }
  async function createOwner(event: FormEvent) {
    event.preventDefault();
    await action("/platform/owners", { display_name: name, contact_email: email, contact_phone: phone || null, recipient_verification: { method: "phone_call", note: verification } });
  }
  async function updateAccount(accountId: string, mode: "lock" | "unlock") {
    const reason = window.prompt(`Lý do ${mode === "lock" ? "khóa" : "mở khóa"} tài khoản:`)?.trim();
    if (!reason) return;
    await action(`/platform/accounts/${accountId}/${mode}`, { reason });
  }
  async function loadAudit() {
    try { setEvents(await apiRequest<AuditEvent[]>("/platform/audit-events")); setMessage("Đã tải nhật ký."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được nhật ký."); }
  }
  async function recheck(event: FormEvent) {
    event.preventDefault();
    try {
      await apiRequest("/platform/audit/recheck", { method: "POST", authRequired: false, body: JSON.stringify({ password: auditPassword }) });
      setAuditPassword(""); await loadAudit();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Xác thực lại thất bại."); }
  }
  async function transition(report: Report) {
    const to_status = report.status === "NEW" ? "IN_PROGRESS" : "RESOLVED";
    if (report.status === "RESOLVED") return;
    const note = window.prompt("Ghi chú xử lý:")?.trim();
    if (!note) return;
    await action(`/platform/reports/${report.report_id}/transition`, { to_status, note });
    setReportDetail(null);
  }
  async function showOwner(ownerId: string) {
    try { setOwnerDetail(await apiRequest<OwnerDetail>(`/platform/owners/${ownerId}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được hồ sơ."); }
  }
  async function showReport(reportId: string) {
    try { setReportDetail(await apiRequest<ReportDetail>(`/platform/reports/${reportId}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được phản ánh."); }
  }
  async function addReportNote() {
    if (!reportDetail) return;
    const note = window.prompt("Ghi chú xử lý:")?.trim();
    if (!note) return;
    await action(`/platform/reports/${reportDetail.report_id}/notes`, { note });
    await showReport(reportDetail.report_id);
  }

  return <main style={{ background: "#F3F5F2", color: "#0B2B2A", minHeight: "100vh", padding: "24px clamp(16px,4vw,64px)" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}><div><h1>Quản trị nền tảng</h1><p>Superadmin · dữ liệu của tất cả chủ trọ</p></div><button style={button} onClick={() => void logout()}>Đăng xuất</button></header>
    <nav aria-label="Mục quản trị">{(["owners", "properties", "reports", "audit"] as const).map((item, index) => <button key={item} style={{ ...button, background: tab === item ? "#0E5A4F" : "#607d75" }} onClick={() => setTab(item)}>{["Chủ trọ", "Khu trọ", "Phản ánh", "Nhật ký"][index]}</button>)}</nav>
    <p role="status">{message}</p>
    {demoMode && link && <section style={panel}><strong>Link demo · chưa gửi thật qua Zalo/số điện thoại</strong><p>Chỉ Superadmin trong môi trường demo thấy link này. Hãy sao chép ngay; hệ thống chỉ lưu mã kiểm tra.</p><input style={field} readOnly aria-label="Link demo" value={link}/><button style={button} onClick={() => void navigator.clipboard.writeText(link)}>Sao chép link</button></section>}
    {tab === "owners" && <>{demoMode && <section style={panel}><h2>Cấp tài khoản chủ trọ</h2><form onSubmit={event => void createOwner(event)}><label>Tên chủ trọ<input style={field} required value={name} onChange={event => setName(event.target.value)}/></label><label>Email liên hệ<input style={field} type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label><label>Số điện thoại dạng +84<input style={field} value={phone} onChange={event => setPhone(event.target.value)}/></label><label>Ghi chú xác nhận người nhận qua cuộc gọi<input style={field} required value={verification} onChange={event => setVerification(event.target.value)}/></label><button style={button}>Tạo hồ sơ và link demo</button></form></section>}{!demoMode && <section style={panel}><h2>Cấp tài khoản chủ trọ</h2><p>Chưa cấu hình kênh gửi lời mời hoặc link đặt lại. Hệ thống chưa tạo và chưa gửi link mới.</p></section>}<section style={panel}><h2>Chủ trọ</h2><label>Tìm chủ trọ<input style={field} value={ownerSearch} onChange={event => setOwnerSearch(event.target.value)}/></label>{owners.map(owner => <article key={owner.owner_id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}><strong>{owner.display_name}</strong> · {owner.account_state} · {owner.property_count} khu trọ<br/>{owner.contact_email} {owner.contact_phone}<div><button style={button} onClick={() => void showOwner(owner.owner_id)}>Chi tiết</button>{owner.account_id ? <>{demoMode && <button style={button} onClick={() => void action(`/platform/accounts/${owner.account_id}/password-reset`)}>Link đặt lại</button>}<button style={button} onClick={() => void updateAccount(owner.account_id!, owner.account_state === "locked" ? "unlock" : "lock")}>{owner.account_state === "locked" ? "Mở khóa" : "Khóa"}</button></> : demoMode ? <button style={button} onClick={() => void action(`/platform/owners/${owner.owner_id}/invitation-resend`)}>Tạo link mới</button> : <span>Lời mời chưa khả dụng</span>}</div></article>)}</section>{ownerDetail && <section style={panel}><h2>Hồ sơ {ownerDetail.display_name}</h2><p>Tài khoản: {ownerDetail.account_state} · Email: {ownerDetail.contact_email} · Điện thoại: {ownerDetail.contact_phone || "—"}</p><h3>Lời mời gần đây</h3>{ownerDetail.invitations.map(invitation => <p key={invitation.invitation_id}>{invitation.status} · hết hạn {new Date(invitation.expires_at).toLocaleString("vi-VN")} · {invitation.delivery_status}</p>)}<button style={button} onClick={() => setOwnerDetail(null)}>Đóng</button></section>}</>}
    {tab === "properties" && <section style={panel}><h2>Khu trọ</h2><label>Tìm tên, chủ trọ hoặc địa chỉ<input style={field} value={propertySearch} onChange={event => setPropertySearch(event.target.value)}/></label><label>Trạng thái<select style={field} value={propertyStatus} onChange={event => setPropertyStatus(event.target.value)}><option value="">Tất cả</option><option value="active">Đang hoạt động</option><option value="building">Đang xây</option><option value="paused">Tạm dừng</option><option value="archived">Lưu trữ</option></select></label>{properties.map(property => <article key={property.property_id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}><strong>{property.name}</strong> · {property.status}<br/>{property.display_name} · {property.province} · {property.address}</article>)}</section>}
    {tab === "reports" && <><section style={panel}><h2>Phản ánh gửi nền tảng</h2><label>Trạng thái<select style={field} value={reportStatus} onChange={event => setReportStatus(event.target.value)}><option value="">Tất cả</option><option value="NEW">Mới</option><option value="IN_PROGRESS">Đang xử lý</option><option value="RESOLVED">Đã giải quyết</option></select></label>{reports.map(report => <article key={report.report_id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}><strong>{report.reference_code}</strong> · {report.property_name} · {report.status}<p>{report.content}</p><button style={button} onClick={() => void showReport(report.report_id)}>Chi tiết</button><button style={button} onClick={() => void transition(report)} disabled={report.status === "RESOLVED"}>Chuyển bước xử lý</button></article>)}</section>{reportDetail && <section style={panel}><h2>Phản ánh {reportDetail.reference_code}</h2><p>{reportDetail.content}</p><p>{reportDetail.anonymous ? "Ẩn danh" : "Có liên hệ"} · {reportDetail.contact_name || "—"} · {reportDetail.contact_email || "—"} · {reportDetail.contact_phone || "—"}</p><h3>Lịch sử</h3>{reportDetail.history.map(item => <p key={item.history_id}>{new Date(item.created_at).toLocaleString("vi-VN")} · {item.action} · {item.from_status || "—"} → {item.to_status || "—"} · {item.note || "—"}</p>)}<button style={button} onClick={() => void addReportNote()}>Thêm ghi chú</button><button style={button} onClick={() => setReportDetail(null)}>Đóng</button></section>}</>}
    {tab === "audit" && <section style={panel}><h2>Nhật ký nhạy cảm</h2><p>Cần quyền PLATFORM_AUDIT_READ được cấp riêng và nhập lại mật khẩu của chính bạn. Quyền xem hết sau 10 phút không hoạt động hoặc 30 phút.</p><form onSubmit={event => void recheck(event)}><label>Mật khẩu của tôi<input style={field} type="password" autoComplete="current-password" value={auditPassword} onChange={event => setAuditPassword(event.target.value)}/></label><button style={button}>Xác thực và xem</button></form><button style={button} onClick={() => void loadAudit()}>Tải lại nhật ký</button>{events.map(event => <p key={event.event_id}>{new Date(event.occurred_at).toLocaleString("vi-VN")} · {event.action} · {event.result} · {event.target_type} {event.target_id} {event.reason}</p>)}</section>}
  </main>;
}
