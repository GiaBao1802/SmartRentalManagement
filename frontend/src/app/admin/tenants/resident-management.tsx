"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { roomApi, type Room } from "../../../lib/api/roomApi";
import { residentApi, type Resident, type ResidentInput, type ResidentListQuery, type ResidenceRegistrationStatus, type ResidenceStatus } from "../../../lib/api/residentApi";
import { residenceStatusLabel } from "../../../lib/ui/admin-presentation";

const pageSize = 20;
const registrationLabels: Record<ResidenceRegistrationStatus, string> = { not_completed: "Chưa hoàn tất đăng ký lưu trú", temporary_resident: "Tạm trú", temporary_absence: "Tạm vắng" };
const blankForm = { national_id: "", full_name: "", phone: "", email: "", birth_date: "", gender: "", residence_registration_status: "not_completed" as ResidenceRegistrationStatus };

export default function ResidentManagement() {
  const [rows, setRows] = useState<Resident[]>([]);
  const [meta, setMeta] = useState({ page: 1, total_pages: 0, total_items: 0 });
  const [page, setPage] = useState(1);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [residenceStatus, setResidenceStatus] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [nationalIdQuery, setNationalIdQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  const loadProperties = useCallback(async () => {
    const first = await propertyApi.list({ page: 1, page_size: 100 });
    const all = [...first.data];
    for (let current = 2; current <= first.meta.total_pages; current += 1) {
      all.push(...(await propertyApi.list({ page: current, page_size: 100 })).data);
    }
    setProperties(all);
  }, []);

  useEffect(() => { void loadProperties().catch((reason) => setError(reason instanceof ApiError ? reason.message : "Không tải được danh sách khu vực.")); }, [loadProperties]);

  useEffect(() => {
    let cancelled = false;
    async function loadRooms() {
      if (!propertyId) { setRooms([]); setRoomId(""); return; }
      try {
        const first = await roomApi.list(propertyId, 1, 100);
        const all = [...first.data];
        for (let current = 2; current <= first.meta.total_pages; current += 1) all.push(...(await roomApi.list(propertyId, current, 100)).data);
        if (!cancelled) setRooms(all);
      } catch (reason) { if (!cancelled) setError(reason instanceof ApiError ? reason.message : "Không tải được danh sách phòng."); }
    }
    void loadRooms();
    return () => { cancelled = true; };
  }, [propertyId]);

  const loadResidents = useCallback(async (targetPage = page) => {
    setLoading(true); setError("");
    const query: ResidentListQuery = { page: targetPage, page_size: pageSize };
    if (residenceStatus) query.residence_status = residenceStatus as ResidenceStatus;
    if (registrationStatus) query.residence_registration_status = registrationStatus as ResidenceRegistrationStatus;
    if (propertyId) query.property_id = propertyId;
    if (roomId) query.room_id = roomId;
    try {
      let result = await residentApi.list(query);
      if (result.meta.total_pages > 0 && targetPage > result.meta.total_pages) {
        query.page = result.meta.total_pages;
        result = await residentApi.list(query);
        setPage(result.meta.page);
      }
      setRows(result.data); setMeta(result.meta);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được danh sách cư dân."); }
    finally { setLoading(false); }
  }, [page, propertyId, registrationStatus, residenceStatus, roomId]);

  useEffect(() => { if (!searchMode) void loadResidents(page); }, [loadResidents, page, searchMode]);

  async function searchNationalId(event: FormEvent) {
    event.preventDefault();
    const nationalId = nationalIdQuery.trim();
    if (!nationalId) { setSearchMode(false); setPage(1); return; }
    if (!/^\d{12}$/.test(nationalId)) { setError("CCCD cần đúng 12 chữ số. Tra cứu dùng khớp chính xác."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await residentApi.searchByNationalId(nationalId);
      setRows([result]); setMeta({ page: 1, total_pages: 1, total_items: 1 }); setSearchMode(true);
    } catch (reason) {
      setRows([]); setMeta({ page: 1, total_pages: 0, total_items: 0 }); setSearchMode(true);
      setError(reason instanceof ApiError ? reason.message : "Không thể tra cứu CCCD.");
    } finally { setLoading(false); }
  }

  function resetSearch(preserveNotice = false) { setNationalIdQuery(""); setSearchMode(false); setPage(1); if (!preserveNotice) setNotice(""); }

  async function createResident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setNotice("");
    const input: ResidentInput = {
      full_name: form.full_name.trim(),
      residence_registration_status: form.residence_registration_status,
      ...(form.national_id.trim() ? { national_id: form.national_id.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.birth_date ? { birth_date: form.birth_date } : {}),
      ...(form.gender.trim() ? { gender: form.gender.trim() } : {}),
    };
    try {
      await residentApi.create(input);
      setFormOpen(false); setForm(blankForm); setNotice("Đã tạo hồ sơ cư dân.");
      resetSearch(true); await loadResidents(1); setPage(1);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tạo hồ sơ cư dân."); }
    finally { setSaving(false); }
  }

  async function archiveResident(resident: Resident) {
    if (archivingId || !window.confirm(`Lưu trữ hồ sơ của ${resident.full_name}? Lịch sử cư trú sẽ được giữ lại.`)) return;
    setArchivingId(resident.resident_id); setError(""); setNotice("");
    try {
      await residentApi.archive(resident.resident_id);
      setNotice(`Đã lưu trữ hồ sơ ${resident.full_name}.`);
      if (searchMode) resetSearch(true); else await loadResidents(page);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể lưu trữ hồ sơ."); }
    finally { setArchivingId(null); }
  }

  const applyFilters = () => { setPage(1); setSearchMode(false); setNationalIdQuery(""); };
  return <AdminShell active="/admin/tenants"><main className="admin-main">
    <div className="breadcrumb">Quản lý cư dân · Admin</div>
    <div className="page-heading"><div><h1>Quản lý cư dân</h1><p>Hồ sơ cư dân, tình trạng lưu trú và các lượt cư trú theo khu trọ.</p></div><button className="button primary" type="button" onClick={() => { setForm(blankForm); setError(""); setFormOpen(true); }}>+ Thêm cư dân</button></div>
    <div className="summary-grid"><section className="summary-card"><span>{searchMode ? "Kết quả tra cứu" : "Tổng cư dân theo bộ lọc"}</span><strong>{meta.total_items}</strong></section><section className="summary-card"><span>Đang ở trong trang</span><strong>{rows.filter((resident) => resident.residence_status === "living").length}</strong><small>Chỉ tính trang hiện tại</small></section><section className="summary-card"><span>Không có lượt ở hiện tại</span><strong>{rows.filter((resident) => resident.residence_status === "left").length}</strong><small>Chỉ tính trang hiện tại; danh sách chưa cung cấp lịch sử cư trú</small></section><section className="summary-card"><span>Chưa hoàn tất đăng ký lưu trú</span><strong>{rows.filter((resident) => resident.residence_registration_status === "not_completed").length}</strong><small>Chỉ tính trang hiện tại</small></section></div>
    <section className="admin-card"><h2>Lọc theo dữ liệu máy chủ</h2><div className="filter-form core-filter-toolbar resident-filter-toolbar">
      <label>Trạng thái cư trú<select value={residenceStatus} onChange={(event) => setResidenceStatus(event.target.value)}><option value="">Tất cả</option><option value="living">Đang ở</option><option value="left">Không có lượt ở hiện tại</option></select></label>
      <label>Trạng thái đăng ký lưu trú<select value={registrationStatus} onChange={(event) => setRegistrationStatus(event.target.value)}><option value="">Tất cả</option><option value="not_completed">Chưa hoàn tất</option><option value="temporary_resident">Tạm trú</option><option value="temporary_absence">Tạm vắng</option></select></label>
      <label>Khu vực<select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setRoomId(""); }}><option value="">Tất cả khu vực</option>{properties.filter((property) => property.status !== "archived").map((property) => <option key={property.property_id} value={property.property_id}>{property.name}</option>)}</select></label>
      <label>Phòng<select value={roomId} disabled={!propertyId} onChange={(event) => setRoomId(event.target.value)}><option value="">Tất cả phòng</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.room_code}</option>)}</select></label>
      <div className="filter-actions"><button className="button primary" type="button" onClick={applyFilters}>Áp dụng bộ lọc</button></div>
    </div></section>
    <section className="admin-card"><h2>Tra cứu CCCD chính xác</h2><form className="filter-form simple-filter" onSubmit={searchNationalId}><label>CCCD (12 chữ số)<input inputMode="numeric" maxLength={12} value={nationalIdQuery} onChange={(event) => setNationalIdQuery(event.target.value.replace(/\D/g, ""))} placeholder="Nhập đủ 12 chữ số" /></label><div className="filter-actions"><button className="button primary" type="submit" disabled={loading}>Tra cứu</button>{searchMode && <button className="button" type="button" onClick={() => resetSearch()}>Xóa tra cứu</button>}</div></form></section>
    <section className="admin-card"><h2>Danh sách cư dân</h2>{error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
      <div className="table-wrap"><table><thead><tr><th>Họ và tên</th><th>CCCD</th><th>Liên hệ</th><th>Khu vực / phòng hiện tại</th><th>Trạng thái cư trú</th><th>Trạng thái đăng ký lưu trú</th><th>Thao tác</th></tr></thead><tbody>
        {rows.map((resident) => { const activeRooms = resident.room_residents?.filter((occupancy) => occupancy.status === "active") ?? []; return <tr key={resident.resident_id}><td><Link href={`/admin/tenants/${encodeURIComponent(resident.resident_id)}`}><strong>{resident.full_name}</strong></Link></td><td>{resident.national_id ?? "—"}</td><td>{resident.phone ?? resident.email ?? "—"}</td><td>{activeRooms.length ? activeRooms.map((occupancy) => `${occupancy.room?.property?.name ?? "Khu vực chưa xác định"} · ${occupancy.room?.room_code ? `Phòng ${occupancy.room.room_code}` : "Phòng chưa xác định"}`).join("; ") : "Không có nơi ở hiện tại"}</td><td><span className={`chip ${resident.residence_status === "living" ? "success" : "neutral"}`}>{residenceStatusLabel(resident.residence_status)}</span></td><td><span className={`chip ${resident.residence_registration_status === "not_completed" ? "warning" : resident.residence_registration_status === "temporary_resident" ? "success" : "neutral"}`}>{registrationLabels[resident.residence_registration_status] ?? "Chưa xác định"}</span></td><td><div className="row-actions"><Link className="text-action" href={`/admin/tenants/${encodeURIComponent(resident.resident_id)}`}>Chi tiết</Link><button className="text-action danger-action" type="button" disabled={archivingId === resident.resident_id} onClick={() => void archiveResident(resident)}>{archivingId === resident.resident_id ? "Đang lưu trữ…" : "Lưu trữ"}</button></div></td></tr>; })}
        {loading && <tr><td className="empty-cell" colSpan={7}>Đang tải cư dân…</td></tr>}{!loading && rows.length === 0 && <tr><td className="empty-cell" colSpan={7}>{searchMode ? "Không tìm thấy cư dân trong phạm vi chủ trọ này." : "Chưa có hồ sơ phù hợp."}</td></tr>}
      </tbody></table></div>
      {!searchMode && <div className="table-footer pagination"><span>Trang {meta.total_pages ? meta.page : 0} / {meta.total_pages} · {meta.total_items} cư dân</span><div><button className="button" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><button className="button" type="button" disabled={loading || page >= meta.total_pages} onClick={() => setPage((value) => value + 1)}>Sau</button></div></div>}
    </section>
  </main>
  {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="resident-create-title"><div className="modal-heading"><h2 id="resident-create-title">Thêm hồ sơ cư dân</h2><button className="modal-close" type="button" disabled={saving} onClick={() => setFormOpen(false)} aria-label="Đóng">×</button></div><form onSubmit={createResident}><div className="edit-form-grid">
    <label>Họ và tên *<input required maxLength={200} disabled={saving} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label><label>CCCD (12 số)<input inputMode="numeric" maxLength={12} disabled={saving} value={form.national_id} onChange={(event) => setForm({ ...form, national_id: event.target.value.replace(/\D/g, "") })} /></label><label>Số điện thoại<input maxLength={30} disabled={saving} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email<input type="email" maxLength={254} disabled={saving} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Ngày sinh<input type="date" disabled={saving} value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></label><label>Giới tính<input maxLength={40} disabled={saving} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} /></label><label>Trạng thái đăng ký lưu trú<select disabled={saving} value={form.residence_registration_status} onChange={(event) => setForm({ ...form, residence_registration_status: event.target.value as ResidenceRegistrationStatus })}><option value="not_completed">Chưa hoàn tất</option><option value="temporary_resident">Tạm trú</option><option value="temporary_absence">Tạm vắng</option></select></label>
    <p className="wide-field">Hồ sơ mới chưa có lượt cư trú. Trạng thái sẽ được cập nhật khi cư dân được thêm vào phòng.</p>
    </div>{error && <p className="notice" role="alert">{error}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setFormOpen(false)}>Hủy</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo hồ sơ"}</button></div></form></section></div>}
  </AdminShell>;
}
