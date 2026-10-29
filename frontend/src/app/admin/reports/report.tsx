"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { ownerReportApi, type OwnerOperationsReport, type OwnerRoomReport } from "../../../lib/api/ownerReportApi";

function money(value: string | number) { return `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} ₫`; }
function date(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }
function roomName(room: OwnerRoomReport) { return `${room.property_name} · ${room.room_code}`; }

function FinancialPanel({ financial }: { financial: OwnerOperationsReport["financial"] }) {
  const maximum = Math.max(1, ...financial.months.flatMap((month) => [Number(month.rent_billed), Number(month.rent_on_paid_invoices)]));
  const currentMonthLabel = `${financial.current_month.slice(5, 7)}/${financial.current_month.slice(0, 4)}`;
  return <section className="admin-card owner-report-financial">
    <div className="owner-report-section-heading"><div><h2>Doanh thu tiền phòng</h2><p>Thống kê theo kỳ hóa đơn, không phải ngày tiền vào tài khoản.</p></div><span>12 kỳ gần nhất</span></div>
    <div className="owner-report-financial-kpis">
      <article><span>Tiền phòng đã lập hóa đơn · {currentMonthLabel}</span><strong>{money(financial.current_month_rent_billed)}</strong><small>Hóa đơn đã chốt trong kỳ</small></article>
      <article><span>Tiền phòng thuộc hóa đơn đã thu · {currentMonthLabel}</span><strong>{money(financial.current_month_rent_on_paid_invoices)}</strong><small>Chỉ tính hóa đơn có trạng thái đã thanh toán</small></article>
      <article><span>Tiền phòng còn trong hóa đơn chưa thu</span><strong>{money(financial.unpaid_rent_amount)}</strong><small>Phần tiền thuê, không gồm điện nước và dịch vụ</small></article>
    </div>
    <div className="owner-report-financial-notice"><strong>Chưa thể tính lợi nhuận ròng</strong><span>Hệ thống chưa có sổ chi phí vận hành như sửa chữa, tiền điện nước chủ trọ trả, thuế và chi phí khác. Không lấy tiền thuê làm lợi nhuận.</span></div>
    <div className="owner-report-financial-legend"><span><i className="billed" /> Đã lập hóa đơn</span><span><i className="settled" /> Thuộc hóa đơn đã thanh toán</span></div>
    <div className="owner-report-month-chart" role="img" aria-label="Biểu đồ tiền phòng đã lập hóa đơn và tiền phòng thuộc các hóa đơn đã thanh toán theo từng tháng">
      {financial.months.map((month) => <div className="owner-report-month-row" key={month.month}>
        <span>{month.month.slice(5, 7)}/{month.month.slice(0, 4)}</span>
        <div className="owner-report-month-bars"><div title={`Đã lập hóa đơn: ${money(month.rent_billed)}`}><i className="billed" style={{ width: `${Math.max(0, Number(month.rent_billed) / maximum * 100)}%` }} /></div><div title={`Thuộc hóa đơn đã thanh toán: ${money(month.rent_on_paid_invoices)}`}><i className="settled" style={{ width: `${Math.max(0, Number(month.rent_on_paid_invoices) / maximum * 100)}%` }} /></div></div>
        <b>{money(month.rent_billed)}<small>Đã thu: {money(month.rent_on_paid_invoices)}</small></b>
      </div>)}
    </div>
  </section>;
}

function Ranking({ title, rows, metric, unit }: { title: string; rows: OwnerRoomReport[]; metric: (room: OwnerRoomReport) => number | null; unit: string }) {
  const maximum = Math.max(1, ...rows.map((room) => metric(room) ?? 0));
  return <section className="admin-card owner-report-ranking"><div className="owner-report-section-heading"><div><h2>{title}</h2><p>Số liệu từ hóa đơn đã chốt gần nhất của mỗi hợp đồng.</p></div></div>
    {rows.length ? <ol>{rows.map((room, index) => { const value = metric(room); return <li key={room.room_id}><span className="owner-report-rank">{index + 1}</span><div className="owner-report-rank-content"><strong>{roomName(room)}</strong><div className="owner-report-bar"><span style={{ width: `${Math.max(4, ((value ?? 0) / maximum) * 100)}%` }} /></div></div><b>{value === null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value)} ${unit}`}</b></li>; })}</ol> : <p className="owner-report-empty">Chưa có hóa đơn chốt kèm chỉ số trong 180 ngày gần đây.</p>}
  </section>;
}

export default function OwnerOperationsReport() {
  const [data, setData] = useState<OwnerOperationsReport | null>(null);
  const [properties, setProperties] = useState<OwnerOperationsReport["properties"]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (selected: string) => {
    setLoading(true); setError("");
    try {
      const result = await ownerReportApi.overview(selected || undefined);
      setData(result);
      if (!selected) setProperties(result.properties);
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error ? reason.message : "Không thể tải báo cáo vận hành.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(propertyId); }, [load, propertyId]);

  const summary = data?.summary;
  return <AdminShell active="/admin/reports"><main className="admin-main owner-report-page">
    <div className="breadcrumb">Báo cáo vận hành · Admin</div>
    <div className="page-heading owner-report-heading"><div><h1>Tình hình khu trọ</h1><p>Tổng hợp cư trú, công nợ, điện nước, phương tiện và yêu cầu từ dữ liệu đã lưu.</p></div><div className="owner-report-actions"><label>Khu trọ<select aria-label="Lọc báo cáo theo khu trọ" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Tất cả khu trọ</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}</select></label><button className="button" type="button" disabled={loading} onClick={() => void load(propertyId)}>{loading ? "Đang cập nhật…" : "Làm mới"}</button></div></div>
    {error && <p className="notice" role="alert">{error}</p>}
    {!data && loading && <section className="admin-card owner-report-loading" aria-live="polite">Đang tổng hợp dữ liệu khu trọ…</section>}
    {summary && <>
      <div className="owner-report-kpis">
        <article className="owner-report-kpi"><span>Tỷ lệ lấp đầy</span><strong>{summary.occupancy_percent}%</strong><small>{summary.occupied_rooms}/{summary.active_rooms} phòng đang có cư dân</small></article>
        <article className="owner-report-kpi"><span>Cư dân cần hoàn tất lưu trú</span><strong>{summary.registration_incomplete}</strong><small>{summary.temporary_residents} tạm trú · {summary.temporary_absences} tạm vắng</small></article>
        <article className="owner-report-kpi"><span>Tổng hóa đơn chưa thanh toán</span><strong>{money(summary.unpaid_amount)}</strong><small>{summary.unpaid_invoices} hóa đơn đã chốt · {summary.overdue_invoices} quá hạn</small></article>
        <article className="owner-report-kpi"><span>Việc cần theo dõi</span><strong>{summary.open_requests}</strong><small>{summary.expiring_contracts_30_days} hợp đồng hết hạn trong 30 ngày</small></article>
      </div>
      <FinancialPanel financial={data.financial} />
      <div className="owner-report-columns">
        <Ranking title="Phòng dùng điện nhiều" rows={data.highest_electricity_rooms} metric={(room) => room.latest_invoice?.electricity_kwh ?? null} unit="kWh" />
        <Ranking title="Phòng dùng nước nhiều" rows={data.highest_water_rooms} metric={(room) => room.latest_invoice?.water_m3 ?? null} unit="m³" />
        <Ranking title="Phòng có nhiều xe" rows={data.most_vehicles_rooms} metric={(room) => room.active_vehicles} unit="xe" />
        <section className="admin-card owner-report-ranking"><div className="owner-report-section-heading"><div><h2>Yêu cầu theo dõi</h2><p>{summary.resolved_requests} yêu cầu đã đóng trong phạm vi bộ lọc.</p></div><Link href="/admin/requests">Mở danh sách →</Link></div>
          {data.requests.by_category.length ? <ul className="owner-report-category-list">{data.requests.by_category.map((item) => <li key={item.category}><span>{item.category}</span><strong>{item.count}</strong></li>)}</ul> : <p className="owner-report-empty">Không có yêu cầu đang chờ xử lý.</p>}
          {data.requests.busiest_rooms.length > 0 && <div className="owner-report-busiest"><h3>Phòng gửi nhiều yêu cầu</h3>{data.requests.busiest_rooms.map((room) => <div key={`${room.property_name}-${room.room_code}`}><span>{room.property_name} · {room.room_code}</span><b>{room.count}</b></div>)}</div>}
        </section>
      </div>
      <section className="admin-card owner-report-room-card"><div className="owner-report-section-heading"><div><h2>Chi tiết theo phòng</h2><p>{data.rooms.length} phòng đang hoạt động · dữ liệu điện nước là hóa đơn chốt gần nhất trong 180 ngày.</p></div><span>Cập nhật {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.generated_at))}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Khu trọ / phòng</th><th>Cư dân</th><th>Xe</th><th>Điện gần nhất</th><th>Nước gần nhất</th><th>Yêu cầu mở</th><th>Hóa đơn</th></tr></thead><tbody>
          {data.rooms.map((room) => <tr key={room.room_id}><td><strong>{roomName(room)}</strong><small className="owner-report-subline">{room.province} · {room.area_m2} m² · {money(room.rent_amount)}/tháng</small></td><td>{room.occupants}/{room.capacity}{room.registration_incomplete > 0 && <small className="owner-report-warning">{room.registration_incomplete} hồ sơ chưa hoàn tất</small>}</td><td>{room.active_vehicles}{room.vehicle_types.length > 0 && <small className="owner-report-subline">{room.vehicle_types.join(", ")}</small>}</td><td>{room.latest_invoice?.electricity_kwh == null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(room.latest_invoice.electricity_kwh)} kWh`}</td><td>{room.latest_invoice?.water_m3 == null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(room.latest_invoice.water_m3)} m³`}</td><td>{room.open_requests ? <span className="chip warning">{room.open_requests}</span> : "0"}</td><td>{room.latest_invoice ? <span className={`chip ${room.latest_invoice.status === "paid" ? "success" : "warning"}`}>{room.latest_invoice.status === "paid" ? "Đã thu" : "Chưa thu"}<small>{date(room.latest_invoice.period_start)}</small></span> : "Chưa có"}</td></tr>)}
          {!data.rooms.length && <tr><td className="empty-cell" colSpan={7}>Chưa có phòng hoạt động trong phạm vi khu trọ này.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </main></AdminShell>;
}
