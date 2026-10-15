"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";
import { contractApi, type ContractCreate, type ContractListQuery, type ContractResource, type ContractStatus } from "../../../lib/api/contractApi";
import { contractErrorMessage, contractStatusLabel, formatContractDate, formatContractMoney } from "../../../lib/api/contractView";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { residentApi, type Resident } from "../../../lib/api/residentApi";
import { roomApi, type Room } from "../../../lib/api/roomApi";

const pageSize = 20;
const statusLabels: Record<ContractStatus, string> = { draft: contractStatusLabel("draft"), active: contractStatusLabel("active"), expired: contractStatusLabel("expired"), terminated: contractStatusLabel("terminated") };
const blankDraft = { contract_no: "", property_id: "", room_id: "", representative_resident_id: "", start_date: "", end_date: "", rent_amount: "", deposit_amount: "", resident_capacity: "", initial_electric_kwh: "", initial_water_m3: "" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function collectPages<T>(load: (page: number) => Promise<{ data: T[]; meta: { total_pages: number } }>) {
  const first = await load(1);
  const rows = [...first.data];
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await load(page)).data);
  return rows;
}

export default function ContractManagement() {
  const [rows, setRows] = useState<ContractResource[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: pageSize, total_items: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [properties, setProperties] = useState<Property[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [filterRooms, setFilterRooms] = useState<Room[]>([]);
  const [draftRooms, setDraftRooms] = useState<Room[]>([]);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterResident, setFilterResident] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterExpiring, setFilterExpiring] = useState("");
  const [filterContractNo, setFilterContractNo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ContractListQuery>({ page: 1, page_size: pageSize });
  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);

  const load = useCallback(async (targetPage = page, filters = appliedFilters) => {
    setLoading(true); setError("");
    try {
      let result = await contractApi.list({ ...filters, page: targetPage, page_size: pageSize });
      if (result.meta.total_pages > 0 && targetPage > result.meta.total_pages) {
        result = await contractApi.list({ ...filters, page: result.meta.total_pages, page_size: pageSize });
        setPage(result.meta.page);
      }
      setRows(result.data); setMeta(result.meta);
      } catch (reason) { setError(contractErrorMessage(reason, "Không tải được danh sách hợp đồng.")); }
    finally { setLoading(false); }
  }, [appliedFilters, page]);

  useEffect(() => { void load(page); }, [load, page]);
  useEffect(() => {
    let cancelled = false;
    async function loadReferences() {
      setReferencesLoading(true);
      try {
        const [propertyRows, residentRows] = await Promise.all([
          collectPages((current) => propertyApi.list({ page: current, page_size: 100 })),
          collectPages((current) => residentApi.list({ page: current, page_size: 100 })),
        ]);
        if (!cancelled) { setProperties(propertyRows); setResidents(residentRows); }
      } catch (reason) { if (!cancelled) setError(contractErrorMessage(reason, "Không tải được danh sách khu vực hoặc cư dân.")); }
      finally { if (!cancelled) setReferencesLoading(false); }
    }
    void loadReferences();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadFilterRooms() {
      if (!filterProperty) { setFilterRooms([]); setFilterRoom(""); return; }
      try {
        const result = await collectPages((current) => roomApi.list(filterProperty, current, 100));
        if (!cancelled) setFilterRooms(result);
      } catch (reason) { if (!cancelled) setError(contractErrorMessage(reason, "Không tải được danh sách phòng.")); }
    }
    void loadFilterRooms();
    return () => { cancelled = true; };
  }, [filterProperty]);

  useEffect(() => {
    let cancelled = false;
    async function loadDraftRooms() {
      if (!draft.property_id) { setDraftRooms([]); setDraft((current) => ({ ...current, room_id: "" })); return; }
      try {
        const result = await collectPages((current) => roomApi.list(draft.property_id, current, 100));
        if (!cancelled) setDraftRooms(result.filter((room) => room.is_active));
      } catch (reason) { if (!cancelled) setError(contractErrorMessage(reason, "Không tải được danh sách phòng.")); }
    }
    void loadDraftRooms();
    return () => { cancelled = true; };
  }, [draft.property_id]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const next: ContractListQuery = { page: 1, page_size: pageSize };
    if (filterProperty) next.property_id = filterProperty;
    if (filterRoom) next.room_id = filterRoom;
    if (filterResident) next.representative_resident_id = filterResident;
    if (filterStatus) next.status = filterStatus as ContractStatus;
    if (filterExpiring) { next.expiring_before = filterExpiring; next.status = "active"; }
    if (filterContractNo.trim()) next.contract_no = filterContractNo.trim();
    setPage(1); setAppliedFilters(next);
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setError(""); setNotice("");
    if (draft.end_date <= draft.start_date) { setError("Ngày kết thúc phải sau ngày bắt đầu."); return; }
    if (!/^\d+$/.test(draft.rent_amount) || !/^\d+$/.test(draft.deposit_amount)) { setError("Tiền thuê và tiền cọc phải là số nguyên VND không âm."); return; }
    const capacity = Number(draft.resident_capacity);
    if (!Number.isInteger(capacity) || capacity < 1) { setError("Sức chứa hợp đồng phải là số nguyên dương."); return; }
    const input: ContractCreate = {
      contract_no: draft.contract_no.trim(), room_id: draft.room_id, representative_resident_id: draft.representative_resident_id,
      start_date: draft.start_date, end_date: draft.end_date, rent_amount: draft.rent_amount, deposit_amount: draft.deposit_amount,
      resident_capacity: capacity, initial_electric_kwh: draft.initial_electric_kwh.trim() || null, initial_water_m3: draft.initial_water_m3.trim() || null,
    };
    setSaving(true);
    try {
      const created = await contractApi.create(input);
      setCreateOpen(false); setDraft(blankDraft); setNotice(`Đã tạo hợp đồng nháp ${created.contract_no}.`);
      await load(1, { page: 1, page_size: pageSize });
      window.location.assign(`/admin/contracts/${encodeURIComponent(created.contract_id)}`);
    } catch (reason) { setError(contractErrorMessage(reason, "Không thể tạo hợp đồng nháp.")); }
    finally { setSaving(false); }
  }

  const activeFilters = Object.keys(appliedFilters).length > 2;
  return <AdminShell active="/admin/contracts"><main className="admin-main contract-page">
    <div className="breadcrumb">Quản lý hợp đồng · Admin</div>
    <div className="page-heading"><div><h1>Quản lý hợp đồng</h1><p>Theo dõi hợp đồng theo phiên bản API V1, từ bản nháp đến hiệu lực, gia hạn và chấm dứt.</p></div><button className="button primary" type="button" onClick={() => { setError(""); setNotice(""); setDraft(blankDraft); setCreateOpen(true); }}>+ Tạo hợp đồng nháp</button></div>
    <div className="summary-grid"><section className="summary-card"><span>Hợp đồng theo bộ lọc</span><strong>{meta.total_items}</strong><small>Đếm theo kết quả máy chủ</small></section><section className="summary-card"><span>Đang hiệu lực trong trang</span><strong>{rows.filter((row) => row.status === "active").length}</strong><small>Chỉ tính trang hiện tại</small></section><section className="summary-card"><span>Bản nháp trong trang</span><strong>{rows.filter((row) => row.status === "draft").length}</strong><small>Chỉ tính trang hiện tại</small></section></div>
    <section className="admin-card contract-filter-card"><h2>Lọc hợp đồng</h2><form className="filter-form core-filter-toolbar contract-filter-form" onSubmit={applyFilters}>
      <label>Mã hợp đồng<input type="search" maxLength={40} value={filterContractNo} onChange={(event) => setFilterContractNo(event.target.value)} placeholder="Nhập mã hợp đồng" /></label>
      <label>Khu vực<select value={filterProperty} onChange={(event) => { setFilterProperty(event.target.value); setFilterRoom(""); }}><option value="">Tất cả khu vực</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name}</option>)}</select></label>
      <label>Phòng<select value={filterRoom} disabled={!filterProperty} onChange={(event) => setFilterRoom(event.target.value)}><option value="">Tất cả phòng</option>{filterRooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.room_code}</option>)}</select></label>
      <label>Cư dân đại diện<select value={filterResident} onChange={(event) => setFilterResident(event.target.value)}><option value="">Tất cả cư dân</option>{residents.map((resident) => <option key={resident.resident_id} value={resident.resident_id}>{resident.full_name}</option>)}</select></label>
      <label>Trạng thái<select value={filterStatus} onChange={(event) => { const value = event.target.value; setFilterStatus(value); if (filterExpiring && value && value !== "active") setFilterExpiring(""); }}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Đang hiệu lực đến hết ngày<input type="date" value={filterExpiring} onChange={(event) => { setFilterExpiring(event.target.value); if (event.target.value) setFilterStatus("active"); }} /></label>
      <div className="filter-actions"><button className="button primary" type="submit">Áp dụng</button><button className="button" type="button" onClick={() => { setFilterContractNo(""); setFilterProperty(""); setFilterRoom(""); setFilterResident(""); setFilterStatus(""); setFilterExpiring(""); setPage(1); setAppliedFilters({ page: 1, page_size: pageSize }); }}>Xóa lọc</button></div>
    </form>{referencesLoading && <p className="contract-reference-state" role="status">Đang tải dữ liệu khu vực và cư dân…</p>}</section>
    <section className="admin-card contract-list-card"><div className="contract-section-heading"><div><h2>Danh sách hợp đồng</h2><p>{activeFilters ? "Kết quả theo bộ lọc V1" : "Sắp xếp theo ngày bắt đầu mới nhất"}</p></div><span>{meta.total_items} hợp đồng</span></div>
      {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
      <div className="table-wrap"><table className="contract-table"><thead><tr><th>Mã hợp đồng</th><th>Khu vực / phòng</th><th>Cư dân đại diện</th><th>Thời hạn</th><th>Sức chứa</th><th>Tiền thuê / tháng</th><th>Trạng thái · phiên bản</th><th>Chi tiết</th></tr></thead><tbody>
        {rows.map((contract) => <tr key={contract.contract_id}><td><strong>{contract.contract_no}</strong></td><td>{contract.room?.property.name ?? "Chưa có thông tin khu vực"}<span className="subtext">{contract.room?.room_code ? `Phòng ${contract.room.room_code}` : "Chưa có mã phòng"}</span></td><td>{contract.representative_resident?.full_name ?? "Chưa có thông tin cư dân"}</td><td>{formatContractDate(contract.start_date)} – {formatContractDate(contract.end_date)}{contract.termination_date && <span className="subtext">Chấm dứt hiệu lực {formatContractDate(contract.termination_date)}</span>}</td><td>{contract.resident_capacity} người</td><td>{formatContractMoney(contract.rent_amount)}</td><td><span className={`chip ${contract.status === "active" ? "success" : contract.status === "draft" ? "warning" : "neutral"}`}>{statusLabels[contract.status] ?? "Chưa xác định"}</span><span className="subtext">Phiên bản {contract.revision}</span></td><td><Link className="text-action" href={`/admin/contracts/${encodeURIComponent(contract.contract_id)}`}>Mở hồ sơ</Link></td></tr>)}
        {loading && <tr><td className="empty-cell" colSpan={8}>Đang tải hợp đồng…</td></tr>}{!loading && rows.length === 0 && <tr><td className="empty-cell" colSpan={8}>Không có hợp đồng trong phạm vi bộ lọc này.</td></tr>}
      </tbody></table></div><div className="table-footer pagination"><span>Trang {meta.total_pages ? meta.page : 0} / {meta.total_pages} · {meta.total_items} hợp đồng</span><div><button className="button" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><button className="button" type="button" disabled={loading || page >= meta.total_pages} onClick={() => setPage((value) => value + 1)}>Sau</button></div></div>
    </section>
  </main>
  {createOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><section className="edit-modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-create-title"><div className="modal-heading"><div><h2 id="contract-create-title">Tạo hợp đồng nháp</h2><p>Backend xác nhận quyền sở hữu, sức chứa, trạng thái phòng và ngày hợp đồng.</p></div><button className="modal-close" type="button" aria-label="Đóng" disabled={saving} onClick={() => setCreateOpen(false)}>×</button></div>
    <form onSubmit={createContract}><div className="edit-form-grid contract-form-grid">
      <label>Mã hợp đồng *<input required maxLength={40} value={draft.contract_no} disabled={saving} onChange={(event) => setDraft({ ...draft, contract_no: event.target.value })} /></label>
      <label>Khu vực *<select required value={draft.property_id} disabled={saving || referencesLoading} onChange={(event) => setDraft({ ...draft, property_id: event.target.value, room_id: "" })}><option value="">Chọn khu vực</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name}</option>)}</select></label>
      <label>Phòng *<select required value={draft.room_id} disabled={saving || !draft.property_id || referencesLoading} onChange={(event) => setDraft({ ...draft, room_id: event.target.value })}><option value="">Chọn phòng</option>{draftRooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.room_code} · sức chứa mặc định {room.default_capacity}</option>)}</select></label>
      <label>Cư dân đại diện *<select required value={draft.representative_resident_id} disabled={saving || referencesLoading} onChange={(event) => setDraft({ ...draft, representative_resident_id: event.target.value })}><option value="">Chọn cư dân</option>{residents.map((resident) => <option key={resident.resident_id} value={resident.resident_id}>{resident.full_name}{resident.phone ? ` · ${resident.phone}` : ""}</option>)}</select></label>
      <label>Ngày bắt đầu *<input type="date" required value={draft.start_date} disabled={saving} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} /></label>
      <label>Ngày kết thúc *<input type="date" required min={draft.start_date || today()} value={draft.end_date} disabled={saving} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} /></label>
      <label>Tiền thuê tháng (VND) *<input type="number" required min="0" step="1" value={draft.rent_amount} disabled={saving} onChange={(event) => setDraft({ ...draft, rent_amount: event.target.value })} /></label>
      <label>Tiền cọc (VND) *<input type="number" required min="0" step="1" value={draft.deposit_amount} disabled={saving} onChange={(event) => setDraft({ ...draft, deposit_amount: event.target.value })} /></label>
      <label>Sức chứa theo hợp đồng *<input type="number" required min="1" step="1" value={draft.resident_capacity} disabled={saving} onChange={(event) => setDraft({ ...draft, resident_capacity: event.target.value })} /></label>
      <label>Chỉ số điện ban đầu (kWh)<input inputMode="decimal" value={draft.initial_electric_kwh} disabled={saving} onChange={(event) => setDraft({ ...draft, initial_electric_kwh: event.target.value })} placeholder="Để trống nếu chưa có" /></label>
      <label>Chỉ số nước ban đầu (m³)<input inputMode="decimal" value={draft.initial_water_m3} disabled={saving} onChange={(event) => setDraft({ ...draft, initial_water_m3: event.target.value })} placeholder="Để trống nếu chưa có" /></label>
    </div><p className="contract-form-note">Hợp đồng được tạo ở trạng thái Nháp, phiên bản 0. Kích hoạt hợp đồng là thao tác riêng sau khi rà soát.</p>{error && <p className="notice" role="alert">{error}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setCreateOpen(false)}>Hủy</button><button className="button primary" type="submit" disabled={saving || referencesLoading}>{saving ? "Đang tạo…" : "Tạo hợp đồng nháp"}</button></div></form>
  </section></div>}
  </AdminShell>;
}

