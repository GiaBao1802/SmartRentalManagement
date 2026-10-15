"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { contractApi, type ContractResource } from "../../../lib/api/contractApi";
import { occupancyApi } from "../../../lib/api/occupancyApi";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { propertyServiceApi, type FlexibleServiceCharge } from "../../../lib/api/propertyServiceApi";
import { roomApi, type Room } from "../../../lib/api/roomApi";
import type { Occupancy } from "../../../lib/api/residentApi";

const localHcmNow = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
const dateTimeVi = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Không thể hoàn tất thao tác.";
async function collect<T>(load: (page: number) => Promise<{ data: T[]; meta: { total_pages: number } }>) { const first = await load(1); const rows = [...first.data]; for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await load(page)).data); return rows; }

export default function ServiceCharges() {
  const [properties, setProperties] = useState<Property[]>([]); const [propertyId, setPropertyId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]); const [contracts, setContracts] = useState<ContractResource[]>([]); const [occupancies, setOccupancies] = useState<Occupancy[]>([]); const [services, setServices] = useState<{ pricing_item_id: string; name: string; code: string; unit: string; status: string }[]>([]);
  const [roomId, setRoomId] = useState(""); const [contractId, setContractId] = useState(""); const [residentId, setResidentId] = useState(""); const [itemId, setItemId] = useState(""); const [quantity, setQuantity] = useState("1"); const [occurredAt, setOccurredAt] = useState(localHcmNow()); const [eventKey, setEventKey] = useState(() => crypto.randomUUID());
  const [charges, setCharges] = useState<FlexibleServiceCharge[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");

  useEffect(() => { void collect((page) => propertyApi.list({ page, page_size: 100 })).then((rows) => { setProperties(rows); const requested = new URLSearchParams(window.location.search).get("property_id"); setPropertyId(rows.find((row) => row.property_id === requested)?.property_id ?? rows[0]?.property_id ?? ""); }).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, []);
  const loadPropertyData = useCallback(async () => {
    if (!propertyId) { setRooms([]); setContracts([]); setServices([]); setCharges([]); return; }
    setLoading(true); setError("");
    try {
      const [roomRows, contractRows, serviceRows, chargeRows] = await Promise.all([
        collect((page) => roomApi.list(propertyId, page, 100)),
        collect((page) => contractApi.list({ page, page_size: 100, property_id: propertyId })),
        propertyServiceApi.list(propertyId, "FLEXIBLE_SERVICE"), collect((page) => propertyServiceApi.listCharges(propertyId, page, 100)),
      ]);
      setRooms(roomRows); setContracts(contractRows.filter((row) => ["active", "expired", "terminated"].includes(row.status))); setServices(serviceRows.items.filter((row) => row.status === "active").map(({ pricing_item_id, name, code, unit, status }) => ({ pricing_item_id, name, code, unit, status }))); setCharges(chargeRows);
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [propertyId]);
  useEffect(() => { void loadPropertyData(); }, [loadPropertyData]);
  useEffect(() => { setContractId(""); setResidentId(""); setOccupancies([]); if (!roomId) return; void occupancyApi.listForRoom(roomId).then(setOccupancies).catch(() => setOccupancies([])); }, [roomId]);
  const roomContracts = useMemo(() => contracts.filter((contract) => contract.room_id === roomId), [contracts, roomId]);
  const selectedContract = roomContracts.find((contract) => contract.contract_id === contractId);
  const residents = useMemo(() => {
    if (!selectedContract) return [];
    const map = new Map<string, string>();
    if (selectedContract.representative_resident) map.set(selectedContract.representative_resident.resident_id, selectedContract.representative_resident.full_name);
    for (const occupancy of occupancies) if (occupancy.contract_id === contractId && occupancy.resident) map.set(occupancy.resident_id, occupancy.resident.full_name);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [selectedContract, occupancies, contractId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!propertyId || saving || !selectedContract) return; setSaving(true); setError(""); setNotice("");
    try {
      await propertyServiceApi.createCharge(propertyId, { room_id: roomId, contract_id: contractId, resident_id: residentId || null, pricing_item_id: itemId, quantity: quantity.trim(), occurred_at: `${occurredAt}:00+07:00` }, eventKey);
      setNotice("Đã ghi nhận phát sinh. Khoản này đang Chờ tính hóa đơn và sẽ được tiêu thụ khi hóa đơn chốt thành công."); setQuantity("1"); setOccurredAt(localHcmNow()); setEventKey(crypto.randomUUID()); await loadPropertyData();
    } catch (reason) { setError(message(reason)); }
    finally { setSaving(false); }
  }
  const selectedRoom = rooms.find((row) => row.room_id === roomId); const selectedService = services.find((row) => row.pricing_item_id === itemId);

  return <AdminShell active="/admin/services"><main className="admin-main utility-page service-management-page">
    <div className="breadcrumb"><Link href="/admin/services">Dịch vụ & Tiện ích</Link> · Công cụ nội bộ</div>
    <div className="page-heading"><div><h1>Ghi nhận lượt sử dụng nội bộ</h1><p>Chỉ dùng cho trường hợp vận hành được ủy quyền. Theo định hướng sản phẩm, charge sẽ được hệ thống tạo từ lượt tiện ích cư dân sử dụng hoặc đã xác nhận hoàn thành.</p></div><Link className="button" href="/admin/services/flexible">Quản lý tiện ích phát sinh</Link></div>
    <p className="utility-note">Công cụ này không nằm trong luồng quản lý dịch vụ chính. Catalog do Admin quản lý; quy trình cư dân đặt hoặc sử dụng tiện ích sẽ được triển khai ở một task riêng.</p>
    <section className="admin-card utility-property-select"><div className="utility-property-field"><label htmlFor="charge-property">Khu vực</label><select id="charge-property" value={propertyId} disabled={loading || saving} onChange={(event) => { setPropertyId(event.target.value); setRoomId(""); setContractId(""); setResidentId(""); }}><option value="">Chọn khu vực</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}</select></div></section>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
    <section className="admin-card utility-section"><div className="utility-section-heading"><div><h2>Ghi nhận nội bộ</h2><p>Giá và số tiền được xác định phía máy chủ; dữ liệu tạo ra không bị thay đổi theo lần sửa giá về sau.</p></div></div>
      {!services.length && !loading && <p className="utility-empty">Khu vực chưa có tiện ích đang hoạt động. <Link href={`/admin/services/flexible?property_id=${encodeURIComponent(propertyId)}`}>Tạo danh mục tiện ích phát sinh</Link> trước.</p>}
      <form className="service-charge-form" onSubmit={(event) => void submit(event)}><div className="utility-form-grid">
        <label>Phòng *<select required value={roomId} disabled={loading || saving} onChange={(event) => { setRoomId(event.target.value); setContractId(""); setResidentId(""); }}><option value="">Chọn phòng</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.room_code} · {room.status === "occupied" ? "Đang thuê" : room.status === "available" ? "Trống" : "Ngưng hoạt động"}</option>)}</select></label>
        <label>Hợp đồng *<select required value={contractId} disabled={!roomId || saving} onChange={(event) => { setContractId(event.target.value); setResidentId(""); }}><option value="">Chọn hợp đồng</option>{roomContracts.map((row) => <option key={row.contract_id} value={row.contract_id}>{row.contract_no} · {row.status === "active" ? "Đang hiệu lực" : row.status === "terminated" ? "Đã chấm dứt" : "Đã hết hạn"}</option>)}</select></label>
        <label>Người thuê<select value={residentId} disabled={!selectedContract || saving} onChange={(event) => setResidentId(event.target.value)}><option value="">Không chỉ định</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}</select><small>Chỉ chọn cư dân thuộc hợp đồng đã chọn.</small></label>
        <label>Dịch vụ *<select required value={itemId} disabled={!services.length || saving} onChange={(event) => setItemId(event.target.value)}><option value="">Chọn dịch vụ</option>{services.map((service) => <option key={service.pricing_item_id} value={service.pricing_item_id}>{service.name} · {service.code} ({service.unit})</option>)}</select></label>
        <label>Số lượng *<input required type="number" min="0.001" step="0.001" value={quantity} disabled={saving} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Ngày giờ phát sinh (giờ Việt Nam) *<input required type="datetime-local" value={occurredAt} disabled={saving} onChange={(event) => setOccurredAt(event.target.value)} /></label>
      </div><p className="utility-note">{selectedRoom && selectedContract && selectedService ? `Sẽ ghi nhận ${selectedService.name} tại phòng ${selectedRoom.room_code}, hợp đồng ${selectedContract.contract_no}. Backend kiểm tra ngày hợp lệ, giá và tổng tiền.` : "Hóa đơn chỉ lấy lượt sử dụng nằm trong khoảng ngày của kỳ và đúng hợp đồng."} Ghi chú tự do chưa có trường lưu trong Database V1.8.</p><button className="button primary" type="submit" disabled={saving || loading || !propertyId || !services.length || !selectedContract}>{saving ? "Đang ghi nhận…" : "Ghi nhận nội bộ"}</button></form>
    </section>
    <section className="admin-card utility-section"><div className="utility-section-heading"><div><h2>Lịch sử lượt sử dụng</h2><p>Lượt hợp lệ được tính vào hóa đơn đúng kỳ; kết quả chỉ hoàn tất khi hóa đơn chốt thành công.</p></div><span className="chip neutral">{charges.length} khoản hiển thị</span></div>{loading ? <p className="utility-empty">Đang tải…</p> : charges.length === 0 ? <p className="utility-empty">Chưa có lượt sử dụng được ghi nhận trong khu vực.</p> : <div className="table-wrap"><table className="service-table"><thead><tr><th>Ngày giờ</th><th>Tiện ích</th><th>Phòng / hợp đồng</th><th>Người thuê</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Trạng thái</th></tr></thead><tbody>{charges.map((charge) => <tr key={charge.flexible_service_charge_id}><td>{dateTimeVi(charge.occurred_at)}</td><td><strong>{charge.service.name}</strong><small>{charge.service.code}</small></td><td>{charge.room_code ?? "—"}<small>{charge.contract_no ?? "—"}</small></td><td>{charge.resident_name ?? "Không chỉ định"}</td><td>{charge.quantity} {charge.unit}</td><td>{money(charge.unit_price_snapshot)} / {charge.unit}</td><td><strong>{money(charge.amount)}</strong></td><td><span className={`chip ${charge.status === "INVOICED" ? "success" : charge.status === "READY" ? "warning" : "neutral"}`}>{charge.status === "INVOICED" ? "Đã tính hóa đơn" : charge.status === "READY" ? "Chờ tính hóa đơn" : "Đã hủy"}</span>{charge.invoice_id && <small>Hóa đơn #{charge.invoice_id}</small>}</td></tr>)}</tbody></table></div>}</section>
  </main></AdminShell>;
}
