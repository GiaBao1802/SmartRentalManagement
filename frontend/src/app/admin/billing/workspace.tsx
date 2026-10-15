"use client";

import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { invoiceApi, type BillingWorkspaceResponse, type BillingWorkspaceRow, type BillingWorkspaceState, type InvoiceStatus } from "../../../lib/api/invoiceApi";
import { propertyApi } from "../../../lib/api/propertyApi";
import { roomApi } from "../../../lib/api/roomApi";
import { residentApi, type Resident } from "../../../lib/api/residentApi";
import { BusinessCombobox } from "../invoices/business-combobox";
import { filterProperties, filterResidents, propertyOption, residentOption, roomOption, type BusinessOption } from "../invoices/invoice-list.logic";

const PAGE_SIZE = 20;
const STATES: Array<{ value: BillingWorkspaceState | ""; label: string }> = [
  { value: "", label: "Tất cả tình trạng" },
  { value: "UPCOMING", label: "Sắp đến kỳ" },
  { value: "IN_PROGRESS", label: "Kỳ đang diễn ra" },
  { value: "REMINDER_DUE", label: "Đã đến cuối kỳ" },
  { value: "MISSING_DRAFT", label: "Thiếu bản nháp dự kiến" },
  { value: "MISSING_DATA", label: "Thiếu dữ liệu" },
  { value: "READY_TO_FINALIZE", label: "Sẵn sàng chốt" },
  { value: "FINALIZED_UNPAID", label: "Đã chốt · chưa thanh toán" },
  { value: "OVERDUE", label: "Quá hạn" },
  { value: "PAID", label: "Đã thanh toán" },
];

function dateVi(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
function moneyVi(value: string) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
}
function actionFor(row: BillingWorkspaceRow) {
  if (!row.invoice) return { label: row.state.code === "MISSING_DRAFT" ? "Chờ scheduler tạo bản nháp" : "Chưa có thao tác", href: null as string | null };
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => /^(ELECTRICITY|WATER)_(TARIFF|VERSION|AMBIGUOUS|INVALID)/.test(item.code))) {
    return { label: "Cấu hình biểu giá điện / nước", href: "/admin/services/utilities?property_id=" + encodeURIComponent(row.property.property_id) };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => item.code.startsWith("FIXED_SERVICE_"))) {
    return { label: "Quản lý dịch vụ cố định", href: "/admin/services/fixed?property_id=" + encodeURIComponent(row.property.property_id) };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => item.code.startsWith("FLEXIBLE_SERVICE_"))) {
    return { label: "Quản lý tiện ích phát sinh", href: "/admin/services/flexible?property_id=" + encodeURIComponent(row.property.property_id) };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => item.code.startsWith("PARKING_"))) {
    return { label: "Kiểm tra đăng ký và giá Parking", href: "/admin/services/parking?property_id=" + encodeURIComponent(row.property.property_id) };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => /ENDING_(MISSING|INVALID|BELOW_OPENING)/.test(item.code))) {
    return { label: "Nhập chỉ số cuối kỳ", href: `/admin/invoices/${encodeURIComponent(row.invoice.invoice_id)}` };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.some((item) => /OPENING_(MISSING|INVALID)/.test(item.code))) {
    return { label: "Cập nhật chỉ số đầu kỳ", href: `/admin/contracts/${encodeURIComponent(row.contract_id)}#meter-source` };
  }
  if (row.state.code === "MISSING_DATA" && row.missing_or_invalid.length > 0) {
    return { label: "Cần bổ sung cấu hình nguồn", href: null as string | null };
  }
  if (row.state.code === "READY_TO_FINALIZE") return { label: "Kiểm tra và chốt hóa đơn", href: `/admin/invoices/${encodeURIComponent(row.invoice.invoice_id)}` };
  return { label: "Xem hóa đơn", href: `/admin/invoices/${encodeURIComponent(row.invoice.invoice_id)}` };
}

export function WorkspaceRow({ row }: { row: BillingWorkspaceRow }) {
  const action = actionFor(row);
  const statusClass = row.state.code === "READY_TO_FINALIZE" || row.state.code === "PAID" ? "success"
    : ["MISSING_DATA", "MISSING_DRAFT", "OVERDUE", "REMINDER_DUE"].includes(row.state.code) ? "warning" : "neutral";
  return <article className="billing-work-row">
    <div className="billing-work-row-main">
      <div className="billing-room-title"><strong>{row.room.room_code}</strong><span>{row.property.name}</span></div>
      <div className="billing-period"><span>Kỳ hóa đơn</span><strong>{dateVi(row.period.period_start)} – {dateVi(row.period.period_end)}</strong><small>Hợp đồng {row.contract_no}</small></div>
      <div className="billing-resident"><span>Người thuê</span><strong>{row.resident.full_name}</strong></div>
      <div className="billing-state"><span className={`chip ${statusClass}`}>{row.state.label}</span>
        {row.reminder.due && <small className={row.reminder.recorded ? "billing-reminder-recorded" : "billing-reminder-pending"}>{row.reminder.recorded ? "Đã ghi nhận nhắc cuối kỳ" : "Đang chờ ghi nhận nhắc cuối kỳ"}</small>}
        {row.invoice && <small>{row.invoice.invoice_no} · {row.invoice.amount_provisional ? "Số tiền tạm tính" : moneyVi(row.invoice.total_amount)}</small>}
      </div>
    </div>
    {row.missing_or_invalid.length > 0 && <ul className="billing-reasons" aria-label="Dữ liệu còn thiếu hoặc chưa hợp lệ">
      {row.missing_or_invalid.map((reason) => <li key={`${reason.code}-${reason.category}`}>{reason.message}</li>)}
    </ul>}
    <div className="billing-row-action">
      {action.href ? <Link className="button primary" href={action.href}>{action.label}</Link> : <button className="button" type="button" disabled title={row.state.code === "MISSING_DRAFT" ? "Scheduler tạo bản nháp vào ngày sau khi kỳ kết thúc." : undefined}>{action.label}</button>}
    </div>
  </article>;
}

export function BillingSummary({ summary }: { summary: BillingWorkspaceResponse["summary"] | null }) {
  const cards = [
    ["Cần xử lý trong trang", summary?.needs_attention_on_page, "Cuối kỳ, thiếu bản nháp hoặc thiếu dữ liệu"],
    ["Bản nháp đang chuẩn bị trong trang", summary?.drafts_on_page, "Các kỳ đã có hóa đơn nháp"],
    ["Đã chốt trong trang", summary?.finalized_on_page, "Hóa đơn đã được chốt ở các kỳ trong trang"],
    ["Thiếu dữ liệu trong trang", summary?.missing_data_on_page, "Backend trả lý do cụ thể cho từng bản nháp"],
    ["Sẵn sàng chốt trong trang", summary?.ready_to_finalize_on_page, "Đã kiểm tra nguồn dữ liệu phía máy chủ"],
    ["Chưa thanh toán", summary?.finalized_unpaid, "Tổng hóa đơn đã chốt theo bộ lọc"],
    ["Quá hạn", summary?.overdue, "Trạng thái suy ra theo ngày Việt Nam"],
  ] as const;
  return <section className="billing-summary-grid" aria-label="Tổng quan vận hành hóa đơn">
    {cards.map(([label, count, description]) => <article className="billing-summary-card" key={label}><span>{label}</span><strong>{count ?? "—"}</strong><small>{description}</small></article>)}
  </section>;
}

export default function BillingWorkspace() {
  const [result, setResult] = useState<BillingWorkspaceResponse | null>(null);
  const [page, setPage] = useState(1);
  const [property, setProperty] = useState<BusinessOption | null>(null);
  const [room, setRoom] = useState<BusinessOption | null>(null);
  const [resident, setResident] = useState<BusinessOption | null>(null);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [residentQuery, setResidentQuery] = useState("");
  const [properties, setProperties] = useState<BusinessOption[]>([]);
  const allPropertiesCache = useRef<Awaited<ReturnType<typeof propertyApi.list>>["data"] | null>(null);
  const [rooms, setRooms] = useState<BusinessOption[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [residentLoading, setResidentLoading] = useState(false);
  const [state, setState] = useState<BillingWorkspaceState | "">("");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | "">("");
  const [applied, setApplied] = useState<{ propertyId?: string; roomId?: string; residentId?: string; state?: BillingWorkspaceState; invoiceStatus?: InvoiceStatus }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await invoiceApi.billingWorkspace({
        page, page_size: PAGE_SIZE,
        ...(applied.propertyId ? { property_id: applied.propertyId } : {}),
        ...(applied.roomId ? { room_id: applied.roomId } : {}),
        ...(applied.residentId ? { resident_id: applied.residentId } : {}),
        ...(applied.state ? { state: applied.state } : {}),
        ...(applied.invoiceStatus ? { invoice_status: applied.invoiceStatus } : {}),
      });
      setResult(response);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải không gian hóa đơn.");
    } finally { setLoading(false); }
  }, [page, applied]);
  useEffect(() => { void load(); }, [load, reload]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPropertyLoading(true);
      try {
        const response = await propertyApi.list({ page: 1, page_size: 100, search: propertyQuery.trim() || undefined });
        let matches = filterProperties(response.data, propertyQuery);
        if (propertyQuery.trim() && matches.length === 0) {
          if (!allPropertiesCache.current) {
            const first = await propertyApi.list({ page: 1, page_size: 100 });
            const all = [...first.data];
            for (let current = 2; current <= first.meta.total_pages && !cancelled; current += 1) {
              const next = await propertyApi.list({ page: current, page_size: 100 });
              all.push(...next.data);
            }
            allPropertiesCache.current = all;
          }
          matches = filterProperties(allPropertiesCache.current, propertyQuery);
        }
        if (!cancelled) setProperties(matches.map(propertyOption));
      } catch { if (!cancelled) setProperties([]); }
      finally { if (!cancelled) setPropertyLoading(false); }
    }, propertyQuery ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [propertyQuery]);
  useEffect(() => {
    if (!property) { setRooms([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRoomLoading(true);
      try {
        const response = await roomApi.list(property.id, 1, 100, undefined, roomQuery.trim());
        if (!cancelled) setRooms(response.data.map(roomOption));
      } catch { if (!cancelled) setRooms([]); }
      finally { if (!cancelled) setRoomLoading(false); }
    }, roomQuery ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [property?.id, roomQuery]);
  useEffect(() => {
    if (!property) { setResidents([]); return; }
    let cancelled = false;
    setResidentLoading(true);
    void (async () => {
      const all: Resident[] = [];
      let pageNo = 1;
      let totalPages = 1;
      do {
        const response = await residentApi.list({ page: pageNo, page_size: 100, property_id: property.id, ...(room ? { room_id: room.id } : {}) });
        all.push(...response.data);
        totalPages = response.meta.total_pages;
        pageNo += 1;
      } while (pageNo <= totalPages && !cancelled);
      if (!cancelled) setResidents(all);
    })()
      .catch(() => { if (!cancelled) setResidents([]); })
      .finally(() => { if (!cancelled) setResidentLoading(false); });
    return () => { cancelled = true; };
  }, [property?.id, room?.id]);

  const residentOptions = useMemo(() => filterResidents(residents, residentQuery).slice(0, 50).map(residentOption), [residents, residentQuery]);
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(1);
    setApplied({ ...(property ? { propertyId: property.id } : {}), ...(room ? { roomId: room.id } : {}), ...(resident ? { residentId: resident.id } : {}), ...(state ? { state } : {}), ...(invoiceStatus ? { invoiceStatus } : {}) });
  }
  function resetFilters() {
    setProperty(null); setRoom(null); setResident(null); setPropertyQuery(""); setRoomQuery(""); setResidentQuery(""); setState(""); setInvoiceStatus(""); setApplied({}); setPage(1);
  }
  const summary = result?.summary;
  const queueRows = result?.data.filter((row) => ["MISSING_DATA", "MISSING_DRAFT", "REMINDER_DUE"].includes(row.state.code)) ?? [];
  const readyRows = result?.data.filter((row) => row.state.code === "READY_TO_FINALIZE") ?? [];
  const monitorRows = result?.data.filter((row) => !["MISSING_DATA", "MISSING_DRAFT", "REMINDER_DUE", "READY_TO_FINALIZE"].includes(row.state.code)) ?? [];

  return <AdminShell active="/admin/billing"><main className="admin-main billing-workspace-page">
    <div className="breadcrumb">Vận hành · Hóa đơn</div>
    <div className="billing-heading"><div><span className="billing-eyebrow">THEO DÕI THEO KỲ THU</span><h1>Vận hành hóa đơn</h1><p>Theo dõi từng kỳ theo hợp đồng, bổ sung dữ liệu và chốt hóa đơn trong phạm vi chủ trọ.</p></div><Link className="button" href="/admin/invoices">Xem lịch sử hóa đơn</Link></div>
    <BillingSummary summary={summary ?? null} />
    <section className="admin-card billing-filter-card" aria-labelledby="billing-filter-title">
      <div className="billing-section-heading"><div><h2 id="billing-filter-title">Lọc kỳ vận hành</h2><p>Tên khu trọ, mã phòng và tên người thuê; kỳ hiển thị theo mốc riêng của từng hợp đồng.</p></div></div>
      <form className="billing-filter-grid" onSubmit={applyFilters}>
        <BusinessCombobox label="Tòa nhà / Khu trọ" placeholder="Tìm theo tên hoặc địa chỉ" selected={property} options={properties} loading={propertyLoading} onSearch={setPropertyQuery} onSelect={(value) => { setProperty(value); setRoom(null); setResident(null); setRoomQuery(""); setResidentQuery(""); }} />
        <BusinessCombobox label="Phòng" placeholder={property ? "Tìm theo mã phòng" : "Chọn khu trọ trước"} selected={room} options={rooms} loading={roomLoading} disabled={!property} emptyText="Không tìm thấy phòng." onSearch={setRoomQuery} onSelect={(value) => { setRoom(value); setResident(null); setResidentQuery(""); }} />
        <BusinessCombobox label="Người thuê" placeholder={property ? "Tìm tên người thuê" : "Chọn khu trọ trước"} selected={resident} options={residentOptions} loading={residentLoading} disabled={!property} emptyText="Không tìm thấy người thuê trong khu trọ." onSearch={setResidentQuery} onSelect={setResident} />
        <label className="billing-select-label">Tình trạng xử lý<select value={state} onChange={(event) => setState(event.target.value as BillingWorkspaceState | "")}>{STATES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="billing-select-label">Trạng thái hóa đơn<select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus | "")}><option value="">Tất cả trạng thái</option><option value="draft">Đang chuẩn bị</option><option value="unpaid">Chưa thanh toán</option><option value="paid">Đã thanh toán</option></select></label>
        <div className="billing-filter-actions"><button className="button primary" type="submit">Áp dụng</button><button className="button" type="button" onClick={resetFilters}>Đặt lại</button><button className="button" type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>{loading ? "Đang tải…" : "Làm mới"}</button></div>
      </form>
    </section>
    <section className="admin-card billing-queue-card" aria-labelledby="billing-queue-title">
      <div className="billing-section-heading"><div><h2 id="billing-queue-title">Kỳ cần theo dõi</h2><p>{result ? `${result.meta.total_items} hợp đồng trong phạm vi lọc · readiness và lý do do backend xác định` : "Đang tải dữ liệu theo phiên chủ trọ…"}</p></div></div>
      {error && <div className="notice" role="alert">{error} <button className="button" type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>Thử lại</button></div>}
      {loading && <p className="billing-empty" role="status">Đang tải kỳ hóa đơn…</p>}
      {!loading && !error && result?.data.length === 0 && <p className="billing-empty">Không có kỳ hóa đơn phù hợp với bộ lọc.</p>}
      {!loading && !error && queueRows.length > 0 && <div className="billing-queue-group"><h3>Cần bổ sung dữ liệu</h3>{queueRows.map((row) => <WorkspaceRow key={`${row.contract_no}-${row.period.period_start}`} row={row} />)}</div>}
      {!loading && !error && queueRows.length === 0 && result?.data.length !== 0 && <p className="billing-subempty">Không có kỳ nào đang thiếu dữ liệu hoặc chờ chốt.</p>}
      {!loading && !error && <div className="billing-queue-group"><h3>Sẵn sàng chốt</h3>{readyRows.length ? readyRows.map((row) => <WorkspaceRow key={`${row.contract_no}-${row.period.period_start}`} row={row} />) : <p className="billing-subempty">Chưa có hóa đơn nào sẵn sàng chốt.</p>}</div>}
      {!loading && !error && monitorRows.length > 0 && <div className="billing-queue-group"><h3>Kỳ đang diễn ra và đã chốt</h3>{monitorRows.map((row) => <WorkspaceRow key={`${row.contract_no}-${row.period.period_start}`} row={row} />)}</div>}
      {result && result.meta.total_pages > 1 && <nav className="billing-pagination" aria-label="Phân trang kỳ hóa đơn"><button className="button" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page} / {result.meta.total_pages}</span><button className="button" type="button" disabled={loading || page >= result.meta.total_pages} onClick={() => setPage((value) => value + 1)}>Sau →</button></nav>}
    </section>
    <section className="admin-card billing-overview-card" aria-labelledby="billing-overview-title">
      <div className="billing-section-heading"><div><h2 id="billing-overview-title">Đã chốt · chờ thanh toán</h2><p>{summary?.overdue ?? 0} hóa đơn quá hạn · {summary?.paid ?? 0} hóa đơn đã thanh toán theo bộ lọc</p></div><Link href="/admin/invoices">Mở lịch sử hóa đơn</Link></div>
      {summary?.unpaid_preview.length ? <div className="billing-unpaid-list">{summary.unpaid_preview.map((invoice) => <Link key={invoice.invoice_id} href={`/admin/invoices/${encodeURIComponent(invoice.invoice_id)}`} className="billing-unpaid-row"><span><strong>{invoice.room_code} · {invoice.property_name}</strong><small>{invoice.resident_name} · {dateVi(invoice.period_start)} – {dateVi(invoice.period_end)}</small></span><span className={invoice.is_overdue ? "billing-overdue-label" : "billing-unpaid-label"}>{invoice.is_overdue ? "Quá hạn" : "Chưa thanh toán"}</span><span>{invoice.due_date ? `Hạn ${dateVi(invoice.due_date)}` : "Chưa có hạn"}</span><span aria-hidden="true">›</span></Link>)}</div> : <p className="billing-empty">Không có hóa đơn chưa thanh toán phù hợp.</p>}
    </section>
  </main></AdminShell>;
}
