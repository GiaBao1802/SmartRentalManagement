"use client";

import BrandLogo from "../../components/brand-logo";
import ResidentPrimaryNavigation from "../resident-primary-navigation";
import ResidentAccountMenu from "../resident-account-menu";
import { useAuth } from "../../components/auth-provider";
import { displayName } from "../../../lib/api/authApi";
import { ApiError } from "../../../lib/api/errors";
import { invoiceApi, type InvoiceDetailResponse, type InvoiceResource, type InvoiceStatus } from "../../../lib/api/invoiceApi";
import { demoPaymentApi, type DemoPayment } from "../../../lib/api/demoPaymentApi";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const pageSize = 12;
const filters: Array<{ value: InvoiceStatus | "all"; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "draft", label: "Bản nháp" },
];

const money = (value: string | null | undefined) => {
  if (value == null || value === "") return "—";
  try {
    if (/^-?\d+$/.test(value)) return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`;
  } catch { /* Keep the fallback for values outside the integer DTO shape. */ }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numeric)} ₫` : "—";
};

const date = (value: string | null | undefined) => value
  ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN")
  : "Chưa có";

const statusLabel = (invoice: Pick<InvoiceResource, "status" | "is_overdue">) =>
  invoice.status === "unpaid" && invoice.is_overdue ? "Quá hạn" :
    invoice.status === "unpaid" ? "Chưa thanh toán" :
      invoice.status === "paid" ? "Đã thanh toán" : "Bản nháp";

function errorMessage(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải dữ liệu hóa đơn.";
}

function invoiceRoom(invoice: InvoiceResource) {
  const property = invoice.contract?.property?.name;
  const room = invoice.contract?.room_code;
  return [property, room ? `Phòng ${room}` : null].filter(Boolean).join(" · ") || "Thông tin nơi ở chưa có";
}

function DemoQr({ invoiceNo }: { invoiceNo: string }) {
  const cells: ReactNode[] = [];
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const finder = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7
      ? x === ox || x === ox + 6 || y === oy || y === oy + 6 || (x >= ox + 2 && x <= ox + 4 && y >= oy + 2 && y <= oy + 4)
      : null;
    const fixed = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14);
    const seed = invoiceNo.charCodeAt((x + y * 3) % invoiceNo.length) || 11;
    if (fixed ?? ((x * 7 + y * 11 + seed) % 5 < 2)) cells.push(<rect key={`${x}-${y}`} x={x + 2} y={y + 2} width="1" height="1" rx=".12" />);
  }
  return <svg className="resident-demo-qr" viewBox="0 0 25 25" role="img" aria-label="Mã QR minh họa cho thanh toán demo"><rect width="25" height="25" rx="1.5" fill="white" /><g fill="#0b2b2a">{cells}</g></svg>;
}

function DemoPaymentPanel({ invoice, onPaid }: { invoice: InvoiceDetailResponse; onPaid: (payment: DemoPayment) => void }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<DemoPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!open) return;
    let current = true;
    void demoPaymentApi.list(invoice.invoice_id).then((rows) => { if (current) setHistory(rows); }).catch(() => { if (current) setHistoryError("Chưa tải được lịch sử demo."); });
    return () => { current = false; };
  }, [invoice.invoice_id, open]);

  async function simulate(outcome: "success" | "failed") {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const payment = await demoPaymentApi.simulate(invoice.invoice_id, outcome);
      setHistory((current) => [payment, ...current]);
      if (outcome === "success") { setSuccess("Thanh toán mô phỏng thành công. Hóa đơn đã chuyển sang Đã thanh toán."); onPaid(payment); }
      else setError(payment.failure_reason ?? "Thanh toán mô phỏng thất bại. Hóa đơn vẫn chưa thanh toán; bạn có thể thử lại.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  return <section className="resident-demo-payment" aria-label="Thanh toán mô phỏng">
    <div className="resident-demo-payment-heading"><div><span className="resident-eyebrow">THANH TOÁN MÔ PHỎNG</span><h3>{invoice.status === "paid" ? "Lịch sử thanh toán mô phỏng" : "Thanh toán hóa đơn"}</h3><p>Chỉ mô phỏng, không kết nối ngân hàng hoặc chuyển tiền.</p></div><button className="resident-primary-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? "Đóng" : invoice.status === "paid" ? "Xem lịch sử thanh toán" : "Thanh toán"}</button></div>
    {open && <div className="resident-demo-checkout">
      <div className="resident-demo-qr-wrap"><DemoQr invoiceNo={invoice.invoice_no} /><span>MÃ QR MINH HỌA</span></div>
      <div className="resident-demo-checkout-copy"><p>Hóa đơn <strong>{invoice.invoice_no}</strong></p><p>Số tiền <strong>{money(invoice.total_amount)}</strong></p><p className="resident-demo-warning">Mã QR không thể quét để chuyển tiền. Hãy chọn một kết quả mô phỏng:</p>
        {error && <p className="resident-demo-message is-error" role="alert">{error}</p>}{success && <p className="resident-demo-message is-success" role="status">{success}</p>}
        {invoice.status === "unpaid" && <div className="resident-demo-actions"><button className="resident-primary-button" type="button" disabled={busy} onClick={() => void simulate("success")}>{busy ? "Đang xử lý…" : "Mô phỏng thanh toán thành công"}</button><button className="resident-secondary-button" type="button" title="Mô phỏng giao dịch không thành công" disabled={busy} onClick={() => void simulate("failed")}>Mô phỏng thất bại</button></div>}
      </div>
      <div className="resident-demo-history"><h4>Lịch sử thanh toán mô phỏng</h4>{historyError && <p role="alert">{historyError}</p>}{history.length === 0 && !historyError && <p>Chưa có giao dịch mô phỏng.</p>}{history.map((item) => <article key={item.transaction_id}><div><strong>{item.outcome === "success" ? "Thành công" : "Thất bại"}</strong><small>{item.transaction_code} · {new Date(item.created_at).toLocaleString("vi-VN")}</small>{item.failure_reason && <small>{item.failure_reason}</small>}</div><b>{money(item.amount)}</b></article>)}</div>
    </div>}
  </section>;
}

function InvoiceDetails({ invoice, onPaid }: { invoice: InvoiceDetailResponse; onPaid: (payment: DemoPayment) => void }) {
  const rows = [
    ["Tiền thuê", invoice.rent_amount],
    ["Điện", invoice.electricity_amount],
    ["Nước", invoice.water_amount],
    ["Dịch vụ", invoice.service_amount],
  ] as const;

  return <section className="resident-invoice-detail" aria-label={`Chi tiết hóa đơn ${invoice.invoice_no}`}>
    <div className="resident-invoice-detail-heading">
      <div><span className="resident-eyebrow">THÔNG TIN HÓA ĐƠN</span><h3>{invoice.invoice_no}</h3></div>
      <span className={`resident-invoice-status ${invoice.status === "paid" ? "is-paid" : invoice.status === "draft" ? "is-draft" : invoice.is_overdue ? "is-overdue" : "is-unpaid"}`}>{statusLabel(invoice)}</span>
    </div>
    <div className="resident-invoice-detail-meta">
      <p><span>Kỳ hóa đơn</span><strong>{date(invoice.period_start)} – {date(invoice.period_end)}</strong></p>
      <p><span>Hạn thanh toán</span><strong>{invoice.due_date ? date(invoice.due_date) : "Chưa xác định"}</strong></p>
      <p><span>Nơi ở</span><strong>{invoiceRoom(invoice)}</strong></p>
      {invoice.finalized_at && <p><span>Ngày phát hành</span><strong>{new Date(invoice.finalized_at).toLocaleDateString("vi-VN")}</strong></p>}
    </div>
    {invoice.amount_provisional && <p className="resident-invoice-provisional">Đây là số tiền tạm tính của hóa đơn nháp, chưa phải số tiền cần thanh toán.</p>}
    <div className="resident-invoice-breakdown" aria-label="Tóm tắt các khoản">
      {rows.map(([label, amount]) => <div key={label}><span>{label}</span><strong>{money(amount)}</strong></div>)}
      <div className="is-total"><span>Tổng cộng</span><strong>{money(invoice.total_amount)}</strong></div>
    </div>
    {invoice.finalized_at && invoice.status !== "draft" && <DemoPaymentPanel invoice={invoice} onPaid={onPaid} />}
  </section>;
}

export default function ResidentInvoicesPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [listRetry, setListRetry] = useState(0);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [rows, setRows] = useState<InvoiceResource[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: pageSize, total_items: 0, total_pages: 0 });
  const [counts, setCounts] = useState<Record<InvoiceStatus | "all", number | null>>({ all: null, draft: null, unpaid: null, paid: null });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, InvoiceDetailResponse>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant%2Finvoices");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
  }, [router, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setLoading(true);
    setError("");
    void invoiceApi.list({ page, page_size: pageSize, ...(filter === "all" ? {} : { status: filter }) })
      .then((result) => {
        if (!active) return;
        setRows(result.data);
        setMeta(result.meta);
        setSelectedId(null);
      })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, listRetry, page, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setSummaryLoading(true);
    setSummaryError("");
    const requests = filters.map(({ value }) => invoiceApi.list({ page: 1, page_size: 1, ...(value === "all" ? {} : { status: value }) }));
    void Promise.all(requests)
      .then((results) => {
        if (!active) return;
        setCounts({ all: results[0].meta.total_items, unpaid: results[1].meta.total_items, paid: results[2].meta.total_items, draft: results[3].meta.total_items });
      })
      .catch((reason: unknown) => { if (active) setSummaryError(errorMessage(reason)); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [status, summaryRetry, user]);

  async function loadDetails(invoiceId: string) {
    setSelectedId(invoiceId);
    setDetailErrors((current) => { const next = { ...current }; delete next[invoiceId]; return next; });
    setDetailLoadingId(invoiceId);
    try {
      const result = await invoiceApi.getInvoiceDetail(invoiceId);
      setDetails((current) => ({ ...current, [invoiceId]: result }));
    } catch (reason) {
      setDetailErrors((current) => ({ ...current, [invoiceId]: errorMessage(reason) }));
    } finally { setDetailLoadingId(null); }
  }

  async function toggleDetails(invoiceId: string) {
    if (selectedId === invoiceId && !detailErrors[invoiceId]) { setSelectedId(null); return; }
    if (details[invoiceId] && !detailErrors[invoiceId]) { setSelectedId(invoiceId); return; }
    await loadDetails(invoiceId);
  }

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy kiểm tra kết nối và thử lại."); }
    finally { setLogoutPending(false); }
  }

  if (status === "loading" || (status === "authenticated" && user?.account.role === "resident" && loading && rows.length === 0 && !error)) {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><span className="resident-invoice-count-icon">₫</span></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải hóa đơn</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  }
  if (status !== "authenticated" || user?.account.role !== "resident") {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><span className="resident-invoice-count-icon">₫</span></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang chuyển đến trang phù hợp</h1><p>Hệ thống đang kiểm tra phiên đăng nhập của bạn.</p><span className="resident-progress" aria-label="Đang chuyển trang" /></div></main>;
  }

  const name = displayName(user);
  const summaries = [
    { key: "all", label: "Tổng hóa đơn", tone: "" },
    { key: "unpaid", label: "Chưa thanh toán", tone: "is-attention" },
    { key: "paid", label: "Đã thanh toán", tone: "is-good" },
    { key: "draft", label: "Bản nháp", tone: "" },
  ] as const;

  return <main className="tenant-page resident-home resident-invoices-page">
    <header className="tenant-header resident-topbar">
      <a href="/tenant/invoices" onClick={(e) => { e.preventDefault(); window.location.reload(); }} aria-label="Tải lại trang hóa đơn"><BrandLogo /></a>
      <ResidentPrimaryNavigation active="invoices" />
      <div className="resident-topbar-actions"><ResidentAccountMenu name={name} email={user?.account.email ?? null} logoutPending={logoutPending} onLogout={() => void handleLogout()} /></div>
    </header>
    <div className="tenant-content resident-layout resident-invoice-layout">
      <section className="resident-invoice-hero" aria-labelledby="resident-invoice-title">
        <div><span className="resident-eyebrow">TÀI CHÍNH CỦA BẠN <span aria-hidden="true">·</span> RÕ RÀNG, DỄ THEO DÕI</span><h1 id="resident-invoice-title">Hóa đơn</h1><p>Xem các hóa đơn gắn với hồ sơ thuê của bạn, trạng thái và thông tin từng kỳ.</p></div>
        <div className="resident-invoice-hero-mark" aria-hidden="true"><span>₫</span><i /><i /><i /></div>
      </section>

      {logoutError && <p className="notice resident-inline-notice" role="alert">{logoutError}</p>}
      <section className="resident-invoice-summary" aria-label="Tổng hợp hóa đơn">
        {summaries.map(({ key, label, tone }) => <article className={`resident-invoice-summary-card ${tone}`} key={key}><span>{label}</span><strong>{summaryLoading ? "…" : counts[key] === null ? "—" : counts[key]}</strong><small>{key === "unpaid" ? "Hóa đơn đã phát hành" : key === "draft" ? "Chưa phải khoản cần thanh toán" : key === "paid" ? "Đã ghi nhận thanh toán" : "Theo hợp đồng của bạn"}</small></article>)}
      </section>
      {summaryError && <p className="resident-invoice-summary-note" role="status">Chưa tải được số liệu tổng hợp. Danh sách bên dưới vẫn có thể xem. <button type="button" onClick={() => setSummaryRetry((value) => value + 1)}>Thử lại</button></p>}

      <section className="resident-panel resident-invoice-list-panel" aria-labelledby="resident-invoice-list-title">
        <div className="resident-section-heading resident-invoice-list-heading"><div><span className="resident-eyebrow">LỊCH SỬ THANH TOÁN</span><h2 id="resident-invoice-list-title">Danh sách hóa đơn</h2></div><span className="resident-count-pill"><span className="resident-invoice-count-icon">₫</span>{meta.total_items} hóa đơn</span></div>
        <div className="resident-invoice-filters" aria-label="Lọc hóa đơn">
          {filters.map((option) => <button key={option.value} type="button" aria-pressed={filter === option.value} className={filter === option.value ? "is-selected" : ""} onClick={() => { setFilter(option.value); setPage(1); }}>{option.label}</button>)}
        </div>
        {error && <div className="resident-empty-state resident-invoice-error" role="alert"><div><h3>Chưa tải được danh sách hóa đơn</h3><p>{error}</p><button type="button" className="resident-secondary-button" onClick={() => setListRetry((value) => value + 1)}>Thử tải lại</button></div></div>}
        {!error && loading && <div className="resident-empty-state" role="status"><span className="resident-progress" aria-label="Đang tải" /><p>Đang tải danh sách hóa đơn…</p></div>}
        {!error && !loading && rows.length === 0 && <div className="resident-empty-state resident-invoice-empty"><span className="resident-empty-icon"><span className="resident-invoice-count-icon">₫</span></span><div><h3>{filter === "all" ? "Chưa có hóa đơn" : "Không có hóa đơn ở trạng thái này"}</h3><p>{filter === "all" ? "Hóa đơn sẽ xuất hiện tại đây khi được tạo cho hợp đồng của bạn." : "Thử chọn trạng thái khác để xem các hóa đơn còn lại."}</p></div></div>}
        {!error && !loading && rows.length > 0 && <div className="resident-invoice-list">
          {rows.map((invoice) => {
            const expanded = selectedId === invoice.invoice_id;
            const detail = details[invoice.invoice_id];
            return <article className={`resident-invoice-card ${expanded ? "is-expanded" : ""}`} key={invoice.invoice_id}>
              <div className="resident-invoice-card-main">
                <div className="resident-invoice-identity"><span className="resident-invoice-icon"><span aria-hidden="true">₫</span></span><div><span className="resident-field-label">{invoice.invoice_no}</span><h3>{invoiceRoom(invoice)}</h3><p>Kỳ {date(invoice.period_start)} – {date(invoice.period_end)}</p></div></div>
                <div className="resident-invoice-card-amount"><span>{invoice.amount_provisional ? "Tạm tính" : "Tổng hóa đơn"}</span><strong>{money(invoice.total_amount)}</strong></div>
                <span className={`resident-invoice-status ${invoice.status === "paid" ? "is-paid" : invoice.status === "draft" ? "is-draft" : invoice.is_overdue ? "is-overdue" : "is-unpaid"}`}>{statusLabel(invoice)}</span>
                <button className="resident-invoice-detail-button" type="button" disabled={detailLoadingId !== null} aria-expanded={expanded} aria-controls={expanded ? `invoice-detail-${invoice.invoice_id}` : undefined} onClick={() => void toggleDetails(invoice.invoice_id)}>{detailLoadingId === invoice.invoice_id ? "Đang tải…" : expanded ? "Ẩn chi tiết" : "Xem chi tiết"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
              </div>
              {invoice.due_date && <p className={`resident-invoice-due ${invoice.is_overdue ? "is-overdue" : ""}`}>Hạn thanh toán: <strong>{date(invoice.due_date)}</strong>{invoice.is_overdue && <span> · Đã quá hạn</span>}</p>}
              {expanded && <div id={`invoice-detail-${invoice.invoice_id}`} className="resident-invoice-expanded">
                {detailLoadingId === invoice.invoice_id && <p className="resident-empty-copy" role="status">Đang tải chi tiết…</p>}
                {detailErrors[invoice.invoice_id] && <p className="notice resident-inline-notice" role="alert">{detailErrors[invoice.invoice_id]} <button type="button" onClick={() => void loadDetails(invoice.invoice_id)}>Thử lại</button></p>}
                {detail && <InvoiceDetails invoice={detail} onPaid={(payment) => {
                  setCounts((current) => ({ ...current, unpaid: Math.max(0, (current.unpaid ?? 0) - 1), paid: (current.paid ?? 0) + 1 }));
                  if (filter === "unpaid") {
                    setRows((current) => current.filter((item) => item.invoice_id !== invoice.invoice_id));
                    setMeta((current) => ({ ...current, total_items: Math.max(0, current.total_items - 1), total_pages: Math.ceil(Math.max(0, current.total_items - 1) / pageSize) }));
                    setSelectedId(null);
                  } else {
                    setRows((current) => current.map((item) => item.invoice_id === invoice.invoice_id ? { ...item, status: "paid", is_overdue: false, payment_summary: { ...item.payment_summary, attempt_count: item.payment_summary.attempt_count + 1, successful_amount: (BigInt(item.payment_summary.successful_amount) + BigInt(payment.amount)).toString(), latest_status: "success" } } : item));
                    void loadDetails(invoice.invoice_id);
                  }
                }} />}
              </div>}
            </article>;
          })}
        </div>}
        {meta.total_pages > 1 && <div className="resident-pagination"><span>Trang {meta.page} / {meta.total_pages}<small>{meta.total_items} hóa đơn trong bộ lọc này</small></span><div><button className="resident-page-button" type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>← <span>Trước</span></button><button className="resident-page-button" type="button" disabled={loading || page >= meta.total_pages} onClick={() => setPage((current) => current + 1)}><span>Sau</span> →</button></div></div>}
      </section>
      <footer className="resident-footer"><span className="resident-footer-mark"><span className="resident-invoice-count-icon">₫</span></span><span>Góc Trọ <b>·</b> Cổng cư dân</span><span className="resident-footer-caption">Một góc yên tâm.</span></footer>
    </div>
  </main>;
}
