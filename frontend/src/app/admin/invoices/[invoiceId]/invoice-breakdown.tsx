import type { InvoiceDetailResponse, InvoiceItem, InvoiceItemCategory } from "../../../../lib/api/invoiceApi";
import { formatAdminMoney } from "../../../../lib/ui/admin-presentation";

const itemGroups: Array<{ category: InvoiceItemCategory; title: string }> = [
  { category: "RENT", title: "Tiền phòng" },
  { category: "ELECTRICITY", title: "Điện" },
  { category: "WATER", title: "Nước" },
  { category: "FIXED_SERVICE", title: "Dịch vụ cố định" },
  { category: "FLEXIBLE_SERVICE", title: "Dịch vụ phát sinh" },
  { category: "PARKING", title: "Gửi xe" },
];

function InvoiceItemLine({ item }: { item: InvoiceItem }) {
  return <article className="invoice-breakdown-line">
    <div className="invoice-breakdown-line-title"><div><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</div><strong>{formatAdminMoney(item.amount)}</strong></div>
    <div className="invoice-breakdown-line-meta"><span>Số lượng: {item.quantity} {item.unit}</span><span>Đơn giá: {item.unit_price === null ? "—" : formatAdminMoney(item.unit_price)}</span></div>
    {item.category === "ELECTRICITY" && <details className="invoice-electricity-tiers"><summary>Chi tiết {item.electricity_tiers?.length ?? 0} bậc điện</summary>
      {item.electricity_tiers?.length ? <ol>{item.electricity_tiers.map((tier) => <li key={tier.tier_no}><span>Bậc {tier.tier_no} · {tier.lower_kwh}–{tier.upper_kwh ?? "không giới hạn"} kWh</span><strong>{tier.quantity} kWh × {formatAdminMoney(tier.unit_price)} = {formatAdminMoney(tier.amount)}</strong></li>)}</ol> : <p>Không có dữ liệu bậc điện trong snapshot.</p>}
    </details>}
  </article>;
}

function AggregateBreakdown({ invoice }: { invoice: InvoiceDetailResponse }) {
  return <div className="invoice-aggregate-grid"><div><span>Tiền phòng</span><strong>{formatAdminMoney(invoice.rent_amount)}</strong></div><div><span>Điện</span><strong>{formatAdminMoney(invoice.electricity_amount)}</strong></div><div><span>Nước</span><strong>{formatAdminMoney(invoice.water_amount)}</strong></div><div><span>Dịch vụ</span><strong>{formatAdminMoney(invoice.service_amount)}</strong></div><div><span>Tổng cộng</span><strong>{formatAdminMoney(invoice.total_amount)}</strong></div></div>;
}

export function InvoiceBreakdown({ invoice }: { invoice: InvoiceDetailResponse }) {
  if (invoice.snapshot_kind === "LEGACY_AGGREGATE") return <><p className="invoice-detail-note">Hóa đơn cũ — chỉ có dữ liệu tổng hợp. Không có chi tiết khoản thu để hiển thị.</p><AggregateBreakdown invoice={invoice} /></>;
  if (invoice.snapshot_kind === "NOT_FINALIZED") return <p className="invoice-detail-note">Các khoản tiền có thẩm quyền sẽ được máy chủ tính khi chốt. Hóa đơn nháp chưa có breakdown.</p>;
  if (!invoice.itemization_available) return <><p className="invoice-detail-note">Hóa đơn đã chốt nhưng API không có dòng khoản thu. Không dựng breakdown từ các số tổng hợp.</p><AggregateBreakdown invoice={invoice} /></>;
  return <div className="invoice-itemized-breakdown">
    {itemGroups.map((group) => { const items = invoice.invoice_items.filter((item) => item.category === group.category); return <section className="invoice-breakdown-group" key={group.category}><h3>{group.title}</h3>{items.length ? items.map((item) => <InvoiceItemLine key={item.invoice_item_id} item={item} />) : <p className="invoice-breakdown-empty">Không có khoản thu thuộc nhóm này.</p>}</section>; })}
    <div className="invoice-breakdown-total"><span>Tổng cộng</span><strong>{formatAdminMoney(invoice.total_amount)}</strong></div>
  </div>;
}
