"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Row = Record<string, unknown>;
type PortalData = { tenant: Row; contracts: Row[]; invoices: Row[]; requests: Row[]; bookings: Row[] };
const statusLabels: Record<string, string> = { ACTIVE: "Đang hiệu lực", PENDING_SIGNATURE: "Chờ ký", TERMINATED: "Đã thanh lý", UNPAID: "Chưa thanh toán", PAID: "Đã thanh toán", VOID: "Đã hủy", PENDING: "Chờ xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã giải quyết", REJECTED: "Từ chối", APPROVED: "Đã duyệt", USED: "Đã sử dụng", CANCELLED: "Đã hủy", REGISTERED: "Đã đăng ký", UNREGISTERED: "Chưa đăng ký" };
const money = (value: unknown) => `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} đ`;
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("vi-VN") : "—";

export default function TenantPortal() {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ category: "Sửa chữa", content: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`${apiUrl}/api/tenant-portal/summary`, { credentials: "include" });
    if (response.status === 401 || response.status === 403) { router.replace("/login"); return; }
    const result = await response.json() as { data?: PortalData; error?: string };
    if (!response.ok || !result.data) throw new Error(result.error ?? "Không tải được hồ sơ khách thuê.");
    setData(result.data);
  }, [router]);

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu.")); }, [load]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/tenant-portal/requests`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Chưa gửi được yêu cầu.");
      setForm({ ...form, content: "" }); setMessage("Đã gửi yêu cầu hỗ trợ."); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Chưa gửi được yêu cầu."); }
    finally { setBusy(false); }
  }

  async function logout() { await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" }); router.replace("/login"); }

  if (error) return <main className="tenant-loading">{error}</main>;
  if (!data) return <main className="tenant-loading">Đang tải cổng khách thuê…</main>;

  return <main className="tenant-page"><header className="tenant-header"><a href="/"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a><div><span>{String(data.tenant.fullName ?? "Khách thuê")}</span><button className="button" onClick={() => void logout()}>Đăng xuất</button></div></header><div className="tenant-content"><div className="tenant-welcome"><span className="eyebrow">CỔNG KHÁCH THUÊ</span><h1>Xin chào, {String(data.tenant.fullName ?? "bạn")}</h1><p>Theo dõi hợp đồng, hóa đơn và gửi yêu cầu hỗ trợ cho nơi bạn đang thuê.</p></div>
    <section className="tenant-profile"><div><span>Điện thoại</span><strong>{String(data.tenant.phone ?? "Chưa cập nhật")}</strong></div><div><span>Email</span><strong>{String(data.tenant.email ?? "Chưa cập nhật")}</strong></div><div><span>Tạm trú</span><strong>{statusLabels[String(data.tenant.registrationStatus)] ?? "Chưa có thông tin"}</strong></div></section>
    <section className="tenant-card"><h2>Hợp đồng và nơi ở</h2>{data.contracts.length ? data.contracts.map((contract) => { const room = contract.room as Row; const property = room.property as Row; return <article className="tenant-contract" key={String(contract.id)}><div><strong>{String(property.name)} · Phòng {String(room.roomNumber)}</strong><span>{String(property.address)} · {statusLabels[String(contract.status)] ?? String(contract.status)}</span></div><div><span>Tiền thuê mỗi tháng</span><strong>{money(contract.monthlyRentVnd)}</strong></div><div><span>Thời hạn</span><strong>{date(contract.startDate)} – {date(contract.endDate)}</strong></div></article>; }) : <p>Chưa có hợp đồng được liên kết với tài khoản.</p>}</section>
    <section className="tenant-card"><h2>Hóa đơn gần đây</h2>{data.invoices.length ? <div className="tenant-table"><table><thead><tr><th>Kỳ</th><th>Mã hóa đơn</th><th>Hạn thanh toán</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={String(invoice.id)}><td>{String(invoice.billingMonth)}/{String(invoice.billingYear)}</td><td>{String(invoice.invoiceNumber)}</td><td>{date(invoice.dueDate)}</td><td>{money(invoice.totalVnd)}</td><td>{statusLabels[String(invoice.status)] ?? String(invoice.status)}</td></tr>)}</tbody></table></div> : <p>Chưa có hóa đơn.</p>}</section>
    <section className="tenant-card"><h2>Gửi yêu cầu hỗ trợ</h2><form className="tenant-request-form" onSubmit={submitRequest}><label>Loại yêu cầu<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Sửa chữa</option><option>Hóa đơn / thanh toán</option><option>Đăng ký tạm trú</option><option>Tiện ích</option><option>Khác</option></select></label><label>Nội dung<textarea required minLength={5} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Mô tả vấn đề cần hỗ trợ" /></label>{message && <p role="status">{message}</p>}<button className="button primary" disabled={busy}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</button></form><h3>Yêu cầu của tôi</h3>{data.requests.length ? <ul>{data.requests.map((item) => <li key={String(item.id)}>{String(item.category)} · {String(item.content)} · {statusLabels[String(item.status)] ?? String(item.status)}</li>)}</ul> : <p>Chưa có yêu cầu hỗ trợ.</p>}</section>
    <section className="tenant-card"><h2>Đăng ký tiện ích gần đây</h2>{data.bookings.length ? <ul>{data.bookings.map((item) => { const amenity = item.amenity as Row; return <li key={String(item.id)}>{String(amenity.name)} · {date(item.useDate)} · {statusLabels[String(item.status)] ?? String(item.status)}</li>; })}</ul> : <p>Chưa có lượt đăng ký tiện ích.</p>}</section>
  </div></main>;
}
