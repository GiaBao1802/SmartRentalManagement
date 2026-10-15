"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminShell from "../../../components/admin-shell";
import { ApiError } from "../../../../lib/api/errors";
import { occupancyApi, type OccupancyTransfer } from "../../../../lib/api/occupancyApi";
import { propertyApi, type Property } from "../../../../lib/api/propertyApi";
import { roomApi, type Room } from "../../../../lib/api/roomApi";
import { residentApi, type Occupancy, type Resident, type ResidentInput, type ResidenceRegistrationStatus } from "../../../../lib/api/residentApi";
import { formatAdminDate, residenceStatusLabel } from "../../../../lib/ui/admin-presentation";

const today = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; };
const showDate = (value: string | null) => formatAdminDate(value);
const registrationLabels: Record<ResidenceRegistrationStatus, string> = { not_completed: "Chưa hoàn tất đăng ký lưu trú", temporary_resident: "Tạm trú", temporary_absence: "Tạm vắng" };
function residenceLabel(resident: Resident): string {
  return residenceStatusLabel(resident.residence_status, resident.room_residents?.length);
}
const contractLabels: Record<string, string> = { draft: "Bản nháp", active: "Đang hiệu lực", expired: "Đã hết hạn", terminated: "Đã thanh lý" };
type ResidentForm = { national_id: string; full_name: string; phone: string; email: string; birth_date: string; gender: string; residence_registration_status: ResidenceRegistrationStatus };
function formFromResident(resident: Resident): ResidentForm { return { national_id: resident.national_id ?? "", full_name: resident.full_name, phone: resident.phone ?? "", email: resident.email ?? "", birth_date: resident.birth_date ?? "", gender: resident.gender ?? "", residence_registration_status: resident.residence_registration_status }; }

export default function ResidentDetail() {
  const { residentId } = useParams<{ residentId: string }>();
  const [resident, setResident] = useState<Resident | null>(null);
  const [form, setForm] = useState<ResidentForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [ending, setEnding] = useState<Occupancy | null>(null);
  const [endedAt, setEndedAt] = useState(today());
  const [transferring, setTransferring] = useState<Occupancy | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [destinationRooms, setDestinationRooms] = useState<Room[]>([]);
  const [destinationRoomId, setDestinationRoomId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await residentApi.get(residentId); setResident(result); setForm(formFromResident(result)); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được hồ sơ cư dân."); }
    finally { setLoading(false); }
  }, [residentId]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!resident || !form || saving) return;
    const next: ResidentInput = {
      full_name: form.full_name.trim(), national_id: form.national_id.trim() || null,
      phone: form.phone.trim() || null, email: form.email.trim() || null,
      birth_date: form.birth_date || null, gender: form.gender.trim() || null,
      residence_registration_status: form.residence_registration_status,
    };
    const before = formFromResident(resident);
    const patch: Partial<ResidentInput> = {};
    for (const key of Object.keys(next) as Array<keyof ResidentInput>) {
      const oldValue = key === "national_id" ? before.national_id || null : key === "phone" ? before.phone || null : key === "email" ? before.email || null : key === "birth_date" ? before.birth_date || null : key === "gender" ? before.gender || null : before[key as keyof ResidentForm];
      if (next[key] !== oldValue) Object.assign(patch, { [key]: next[key] });
    }
    if (!Object.keys(patch).length) { setNotice("Không có thay đổi cần lưu."); return; }
    setSaving(true); setError(""); setNotice("");
    try { await residentApi.update(resident.resident_id, patch); setNotice("Đã cập nhật hồ sơ cư dân."); await load(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể cập nhật hồ sơ cư dân."); }
    finally { setSaving(false); }
  }

  async function archive() {
    if (!resident || archiving || !window.confirm(`Lưu trữ hồ sơ của ${resident.full_name}? Lịch sử cư trú được giữ lại.`)) return;
    setArchiving(true); setError(""); setNotice("");
    try { await residentApi.archive(resident.resident_id); setNotice("Đã lưu trữ hồ sơ cư dân. Lịch sử vẫn được giữ lại."); await load(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể lưu trữ hồ sơ."); }
    finally { setArchiving(false); }
  }

  async function endOccupancy(event: FormEvent) {
    event.preventDefault(); if (!ending || saving) return;
    setSaving(true); setError(""); setNotice("");
    try { await occupancyApi.end(ending.occupancy_id, endedAt); setNotice("Đã kết thúc lượt cư trú."); setEnding(null); await load(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể kết thúc lượt cư trú."); }
    finally { setSaving(false); }
  }

  async function openTransfer(occupancy: Occupancy) {
    setTransferring(occupancy); setDestinationRoomId(""); setTransferDate(today()); setError(""); setNotice(""); setLoadingRooms(true);
    try {
      const first = await propertyApi.list({ page: 1, page_size: 100 });
      const allProperties = [...first.data];
      for (let current = 2; current <= first.meta.total_pages; current += 1) allProperties.push(...(await propertyApi.list({ page: current, page_size: 100 })).data);
      setProperties(allProperties.filter((property) => property.status !== "archived"));
      const available: Room[] = [];
      for (const property of allProperties.filter((item) => item.status !== "archived")) {
        const pageOne = await roomApi.list(property.property_id, 1, 100);
        available.push(...pageOne.data);
        for (let current = 2; current <= pageOne.meta.total_pages; current += 1) available.push(...(await roomApi.list(property.property_id, current, 100)).data);
      }
      setDestinationRooms(available.filter((room) => room.is_active && room.status !== "inactive" && room.room_id !== occupancy.room_id));
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được phòng đích."); }
    finally { setLoadingRooms(false); }
  }

  async function transfer(event: FormEvent) {
    event.preventDefault(); if (!resident || !transferring || !destinationRoomId || transferBusy) return;
    setTransferBusy(true); setError(""); setNotice("");
    const payload: OccupancyTransfer = { source_occupancy_id: transferring.occupancy_id, room_id: destinationRoomId, contract_id: null, started_at: transferDate };
    try {
      await occupancyApi.transfer(resident.resident_id, payload);
      setNotice("Đã chuyển cư dân. Danh sách cư trú được tải lại từ máy chủ."); setTransferring(null); await load();
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể chuyển cư dân."); }
    finally { setTransferBusy(false); }
  }

  return <AdminShell active="/admin/tenants"><main className="admin-main">
    <div className="room-back-row"><Link className="button room-back-button" href="/admin/tenants">← Danh sách cư dân</Link></div>
    {loading && !resident ? <section className="admin-card"><p>Đang tải hồ sơ…</p></section> : error && !resident ? <section className="admin-card"><p className="notice" role="alert">{error}</p></section> : resident && form && <>
      <div className="page-heading"><div><p>Hồ sơ và lịch sử cư trú được lấy từ backend trong phạm vi chủ trọ hiện tại.</p><h1>{resident.full_name}</h1></div><button className="button danger-action" type="button" disabled={archiving || Boolean(resident.archived_at)} onClick={() => void archive()}>{archiving ? "Đang lưu trữ…" : resident.archived_at ? "Đã lưu trữ" : "Lưu trữ cư dân"}</button></div>
      {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
    <section className="admin-card"><h2>Hồ sơ cư dân</h2><div className="detail-grid"><div><span>Trạng thái cư trú · do hệ thống đồng bộ</span><strong><span className={`chip ${resident.residence_status === "living" ? "success" : "neutral"}`}>{residenceLabel(resident)}</span></strong></div><div><span>Trạng thái đăng ký lưu trú</span><strong><span className={`chip ${resident.residence_registration_status === "not_completed" ? "warning" : resident.residence_registration_status === "temporary_resident" ? "success" : "neutral"}`}>{registrationLabels[resident.residence_registration_status]}</span></strong></div></div><form className="edit-form-grid" onSubmit={save}>
        <label>Họ và tên *<input required maxLength={200} disabled={saving} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label><label>CCCD<input inputMode="numeric" maxLength={12} disabled={saving} value={form.national_id} onChange={(event) => setForm({ ...form, national_id: event.target.value.replace(/\D/g, "") })} /></label><label>Số điện thoại<input maxLength={30} disabled={saving} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email<input type="email" maxLength={254} disabled={saving} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Ngày sinh<input type="date" disabled={saving} value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></label><label>Giới tính<input maxLength={40} disabled={saving} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} /></label><label>Trạng thái đăng ký lưu trú<select disabled={saving} value={form.residence_registration_status} onChange={(event) => setForm({ ...form, residence_registration_status: event.target.value as ResidenceRegistrationStatus })}><option value="not_completed">Chưa hoàn tất</option><option value="temporary_resident">Tạm trú</option><option value="temporary_absence">Tạm vắng</option></select></label>
        <div className="modal-actions wide-field"><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
      </form><div className="detail-grid"><div><span>Ngày tạo hồ sơ</span><strong>{showDate(resident.created_at)}</strong></div><div><span>Ngày cập nhật</span><strong>{showDate(resident.updated_at)}</strong></div><div><span>Hồ sơ</span><strong>{resident.archived_at ? `Đã lưu trữ ${showDate(resident.archived_at)}` : "Đang hoạt động"}</strong></div></div></section>
      <section className="admin-card"><h2>Nơi ở hiện tại</h2>{(resident.room_residents ?? []).filter((item) => item.status === "active").length ? <div className="detail-grid">{(resident.room_residents ?? []).filter((item) => item.status === "active").map((occupancy) => <div key={occupancy.occupancy_id}><span>{occupancy.room?.property?.name ?? "Khu trọ chưa xác định"} · {occupancy.room?.room_code ? `Phòng ${occupancy.room.room_code}` : "Phòng chưa xác định"}</span><strong>{showDate(occupancy.started_at)} đến nay</strong></div>)}</div> : <p>Không có lượt cư trú đang hoạt động.</p>}</section>
      <section className="admin-card"><h2>Hợp đồng hiện tại</h2>{(() => { const contracts = [...new Map((resident.room_residents ?? []).filter((item) => item.status === "active" && item.contract).map((item) => [item.contract!.contract_id, item.contract!])).values()]; return contracts.length ? <div className="detail-grid">{contracts.map((contract) => <div key={contract.contract_id}><span>{contract.contract_no} · {contractLabels[contract.status] ?? "Chưa xác định"}</span><strong>{showDate(contract.start_date)} – {showDate(contract.end_date)} · sức chứa {contract.resident_capacity} người</strong></div>)}</div> : <p>Không có hợp đồng hiện tại liên kết với các lượt cư trú đang hoạt động.</p>; })()}</section>
      <section className="admin-card"><h2>Lịch sử cư trú</h2>{resident.room_residents?.length ? <div className="table-wrap"><table><thead><tr><th>Khu vực / phòng</th><th>Bắt đầu</th><th>Kết thúc</th><th>Hợp đồng</th><th>Trạng thái lượt ở</th><th>Thao tác</th></tr></thead><tbody>{resident.room_residents.map((occupancy) => { const property = occupancy.room?.property; return <tr key={occupancy.occupancy_id}><td>{property?.name ?? "Khu vực chưa xác định"} · {occupancy.room?.room_code ? `Phòng ${occupancy.room.room_code}` : "Phòng chưa xác định"}</td><td>{showDate(occupancy.started_at)}</td><td>{showDate(occupancy.ended_at)}</td><td>{occupancy.contract?.contract_no ?? "Không liên kết"}</td><td><span className={`chip ${occupancy.status === "active" ? "success" : "neutral"}`}>{occupancy.status === "active" ? "Đang ở" : "Đã kết thúc"}</span></td><td><div className="row-actions">{occupancy.status === "active" && <><button className="text-action" type="button" disabled={saving || transferBusy} onClick={() => { setEnding(occupancy); setEndedAt(today()); setError(""); }}>Kết thúc</button><button className="text-action" type="button" disabled={saving || transferBusy} onClick={() => void openTransfer(occupancy)}>Chuyển phòng</button></>}</div></td></tr>; })}</tbody></table></div> : resident.room_residents ? <p>Cư dân chưa từng có lượt cư trú.</p> : <p>Chưa có dữ liệu lịch sử cư trú.</p>}</section>
      {ending && <section className="admin-card occupancy-confirmation" aria-labelledby="end-occupancy-title"><div className="occupancy-confirmation-heading"><div><span className="eyebrow">XÁC NHẬN THAY ĐỔI LƯỢT Ở</span><h2 id="end-occupancy-title">Kết thúc lượt cư trú</h2><p>Lượt cư trú của <strong>{resident.full_name}</strong> tại <strong>{ending.room?.property?.name ?? "khu trọ"} · {ending.room?.room_code ? `phòng ${ending.room.room_code}` : "phòng chưa xác định"}</strong> sẽ kết thúc theo ngày bạn chọn.</p></div></div><form className="filter-form simple-filter" onSubmit={endOccupancy}><label>Ngày kết thúc<input type="date" required min={ending.started_at.slice(0, 10)} value={endedAt} onChange={(event) => setEndedAt(event.target.value)} /></label><p className="occupancy-confirmation-note">Hành động này kết thúc lượt ở hiện tại; hồ sơ cư dân và lịch sử cư trú vẫn được giữ lại. Không xóa hồ sơ cư dân.</p><div className="filter-actions"><button className="button" type="button" disabled={saving} onClick={() => setEnding(null)}>Hủy</button><button className="button danger-button" type="submit" disabled={saving}>{saving ? "Đang kết thúc…" : "Xác nhận kết thúc lượt ở"}</button></div></form></section>}
      {transferring && <section className="admin-card"><h2>6. Chuyển phòng / Kết thúc lưu trú</h2><p>Phòng hiện tại: {transferring.room?.property?.name ?? "Khu vực chưa xác định"} · {transferring.room?.room_code ? `Phòng ${transferring.room.room_code}` : "Phòng chưa xác định"}</p>{loadingRooms ? <p>Đang tải phòng đích…</p> : <form className="filter-form" onSubmit={transfer}><label>Phòng đích<select required value={destinationRoomId} onChange={(event) => setDestinationRoomId(event.target.value)}><option value="">Chọn phòng</option>{destinationRooms.map((room) => <option key={room.room_id} value={room.room_id}>{properties.find((item) => item.property_id === room.property_id)?.name ?? "Khu vực chưa xác định"} · {room.room_code} · {room.status === "occupied" ? "Đang có người ở" : room.status === "available" ? "Còn trống" : "Ngưng hoạt động"} · {room.occupancy_count}/{room.contract_capacity ?? room.default_capacity} người</option>)}</select></label><label>Ngày chuyển<input type="date" required min={transferring.started_at.slice(0, 10)} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label><p>Sức chứa có hiệu lực và hợp đồng phù hợp do máy chủ kiểm tra khi chuyển.</p><div className="filter-actions"><button className="button" type="button" disabled={transferBusy} onClick={() => setTransferring(null)}>Hủy</button><button className="button primary" type="submit" disabled={transferBusy || loadingRooms || !destinationRoomId}>{transferBusy ? "Đang chuyển…" : "Xác nhận chuyển"}</button></div></form>}</section>}
    </>}
  </main></AdminShell>;
}
