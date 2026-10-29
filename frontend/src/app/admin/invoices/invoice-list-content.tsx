import React, { type ReactNode } from "react";
import Link from "next/link";
import type { PageMeta } from "../../../lib/api/propertyApi";
import type { InvoiceResource } from "../../../lib/api/invoiceApi";
import { formatAdminDate, formatAdminMoney } from "../../../lib/ui/admin-presentation";
import { businessDateToday, invoiceDueStateLabel } from "../../../lib/invoice-status";
import { invoiceResidentLabel, statusLabel } from "./invoice-list.logic";

function invoicePeriod(invoice: InvoiceResource) {
  return `${formatAdminDate(invoice.period_start)} → ${formatAdminDate(invoice.period_end)}`;
}

function invoiceProperty(invoice: InvoiceResource) {
  return invoice.contract?.property?.name ?? "—";
}

function invoiceRoom(invoice: InvoiceResource) {
  return invoice.contract?.room_code ?? "—";
}

function invoiceResident(invoice: InvoiceResource, residents: Array<{ resident_id: string; full_name: string }>) {
  return invoiceResidentLabel(invoice.contract?.representative_resident_id ?? null, residents);
}

function invoiceStatus(invoice: InvoiceResource): ReactNode {
  const dueState = invoiceDueStateLabel(invoice.status, invoice.is_overdue, invoice.due_date, businessDateToday());
  return <>
    <span className={`chip ${invoice.status === "paid" ? "success" : invoice.status === "draft" ? "neutral" : "warning"}`}>{statusLabel(invoice.status)}</span>
    {dueState && <span className={`chip ${dueState === "Quá hạn" || dueState === "Cần kiểm tra hạn" || dueState === "Thiếu hạn thanh toán" ? "invoice-overdue-chip" : "invoice-due-chip"}`}>{dueState}</span>}
    {invoice.snapshot_kind === "LEGACY_AGGREGATE" && <span className="chip invoice-legacy-chip">Hóa đơn cũ</span>}
  </>;
}

export function InvoiceListContent({
  rows, meta, page, loading, error, onRetry, onPage, residents = [],
}: {
  rows: InvoiceResource[];
  meta: PageMeta | null;
  page: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onPage: (page: number) => void;
  residents?: Array<{ resident_id: string; full_name: string }>;
}) {
  const currentPage = meta?.page ?? page;
  const totalPages = meta?.total_pages ?? 0;
  const totalItems = meta?.total_items ?? 0;
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * (meta?.page_size ?? 20) + 1;
  const lastItem = Math.min(currentPage * (meta?.page_size ?? 20), totalItems);

  return <section className="admin-card invoice-list-card" aria-labelledby="invoice-list-title">
    <div className="card-title-row">
      <div><h2 id="invoice-list-title">Danh sách hóa đơn</h2><span className="invoice-list-total">{meta ? `${totalItems} hóa đơn` : "Đang lấy số liệu từ máy chủ"}</span></div>
    </div>
    {error && <div className="notice invoice-list-error" role="alert"><span>{error}</span><button className="button" type="button" disabled={loading} onClick={onRetry}>{loading ? "Đang tải…" : "Thử lại"}</button></div>}
    <div className="table-wrap invoice-table-wrap"><table className="invoice-table"><thead><tr>
      <th>Hóa đơn</th><th>Tòa nhà / Khu trọ</th><th>Phòng</th><th>Người thuê</th><th>Kỳ hóa đơn</th><th>Hạn thanh toán</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th>
    </tr></thead><tbody>
      {loading && <tr><td colSpan={9} className="empty-cell" role="status">Đang tải danh sách hóa đơn…</td></tr>}
      {!loading && !error && rows.length === 0 && <tr><td colSpan={9} className="empty-cell">Chưa có hóa đơn phù hợp với bộ lọc.</td></tr>}
      {!loading && !error && rows.map((invoice) => <tr key={invoice.invoice_id}>
        <td><Link className="invoice-detail-link" href={`/admin/invoices/${encodeURIComponent(invoice.invoice_id)}`}><strong>{invoice.invoice_no || "Hóa đơn chưa có mã"}</strong><span className="subtext">Xem chi tiết</span></Link></td>
        <td>{invoiceProperty(invoice)}</td>
        <td>{invoiceRoom(invoice)}</td>
        <td>{invoiceResident(invoice, residents)}</td>
        <td>{invoicePeriod(invoice)}</td>
        <td>{formatAdminDate(invoice.due_date)}</td>
        <td><strong>{formatAdminMoney(invoice.total_amount)}</strong>{invoice.amount_provisional && <span className="subtext invoice-provisional">Tạm tính · chưa phải số tiền phải trả</span>}</td>
        <td><div className="invoice-status-cell">{invoiceStatus(invoice)}</div></td>
        <td><Link className="button invoice-row-action" href={`/admin/invoices/${encodeURIComponent(invoice.invoice_id)}`}>Xem chi tiết</Link></td>
      </tr>)}
    </tbody></table></div>
    {meta && <footer className="invoice-pagination"><span>{totalItems ? `Hiển thị ${firstItem}–${lastItem} trong ${totalItems} hóa đơn` : "Không có hóa đơn phù hợp"}</span><nav aria-label="Phân trang hóa đơn"><button className="button" type="button" disabled={loading || currentPage <= 1} onClick={() => onPage(currentPage - 1)}>← Trước</button><span>Trang {currentPage} / {Math.max(totalPages, 1)}</span><button className="button" type="button" disabled={loading || totalPages === 0 || currentPage >= totalPages} onClick={() => onPage(currentPage + 1)}>Sau →</button></nav></footer>}
  </section>;
}
