"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../../../../lib/api/errors";
import { occupancyApi } from "../../../../../lib/api/occupancyApi";
import { residentApi, type Occupancy, type Resident, type ResidentList } from "../../../../../lib/api/residentApi";
import type { Room } from "../../../../../lib/api/roomApi";
import { keepDialogFocus, useDialogFocus } from "../../../../../lib/ui/dialog-accessibility";

const today = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; };
const showDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN") : "—";

export default function ResidentRoomPanel({ room, onChanged }: { room: Room; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Occupancy[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [foundResident, setFoundResident] = useState<Resident | null>(null);
  const [candidates, setCandidates] = useState<ResidentList | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidatePage, setCandidatePage] = useState(1);
  const [selectedResidentId, setSelectedResidentId] = useState("");
  const [startedAt, setStartedAt] = useState(today());
  const [ending, setEnding] = useState<Occupancy | null>(null);
  const [endedAt, setEndedAt] = useState(today());
  const dialogRef = useRef<HTMLElement | null>(null);

  useDialogFocus(open, dialogRef);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await occupancyApi.listForRoom(room.room_id)); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được danh sách cư trú của phòng."); }
    finally { setLoading(false); }
  }, [room.room_id]);

  async function show() { setOpen(true); setError(""); setNotice(""); await reload(); }
  async function search(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setFoundResident(null);
    if (!/^\d{12}$/.test(nationalId)) { setError("CCCD cần đúng 12 chữ số."); return; }
    try {
      const resident = await residentApi.searchByNationalId(nationalId);
      if (resident.archived_at) { setError("Hồ sơ cư dân này đã được lưu trữ nên không thể thêm lượt cư trú."); return; }
      setFoundResident(resident);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tra cứu cư dân."); }
  }
  async function loadCandidates(page: number) {
    setCandidateLoading(true); setError(""); setSelectedResidentId(""); setFoundResident(null);
    try { const result = await residentApi.list({ page, page_size: 20 }); setCandidates(result); setCandidatePage(result.meta.page); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được danh sách cư dân."); }
    finally { setCandidateLoading(false); }
  }
  async function add() {
    const selectedResident = foundResident ?? candidates?.data.find((resident) => resident.resident_id === selectedResidentId) ?? null;
    if (!selectedResident || busyId) return;
    setBusyId("add"); setError(""); setNotice("");
    try {
      await occupancyApi.add(room.room_id, { resident_id: selectedResident.resident_id, started_at: startedAt });
      setNotice(`Đã thêm ${selectedResident.full_name} vào phòng ${room.room_code}.`);
      setFoundResident(null); setSelectedResidentId(""); setNationalId(""); await Promise.all([reload(), onChanged()]);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể thêm cư dân vào phòng."); }
    finally { setBusyId(null); }
  }
  async function end(event: FormEvent) {
    event.preventDefault(); if (!ending || busyId) return;
    setBusyId(ending.occupancy_id); setError(""); setNotice("");
    try {
      await occupancyApi.end(ending.occupancy_id, endedAt);
      setNotice(`Đã kết thúc lượt cư trú của ${ending.resident?.full_name ?? "cư dân"}.`);
      setEnding(null); await Promise.all([reload(), onChanged()]);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể kết thúc lượt cư trú."); }
    finally { setBusyId(null); }
  }

  return <>
    <button className="property-room-action" type="button" onClick={() => void show()}>Cư dân</button>
    {open && <div className="modal-backdrop property-room-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setOpen(false); }}><section ref={dialogRef} tabIndex={-1} className="edit-modal detail-modal property-room-modal resident-room-modal" role="dialog" aria-modal="true" aria-labelledby={`room-residents-${room.room_id}`} onKeyDown={(event) => keepDialogFocus(event, () => setOpen(false), Boolean(busyId))}><div className="property-room-modal-heading"><div><p className="property-room-eyebrow">CƯ TRÚ VÀ LỊCH SỬ</p><h2 id={`room-residents-${room.room_id}`}>Cư dân · Phòng {room.room_code}</h2></div><button className="modal-close" type="button" disabled={Boolean(busyId)} onClick={() => setOpen(false)} aria-label="Đóng cửa sổ">×</button></div>
      <p>Sức chứa theo thông tin hiện tại: {room.contract_capacity ?? room.default_capacity} người. Backend quyết định giới hạn áp dụng cho ngày bắt đầu và kiểm tra khi thêm.</p>
      {error && <div className="property-room-alert" role="alert"><p>{error}</p>{/không tải|không thể tải/i.test(error) && <button className="button property-room-secondary" type="button" disabled={loading || candidateLoading} onClick={() => void reload()}>Thử tải lại lịch sử</button>}</div>}{notice && <p className="property-room-notice" role="status">{notice}</p>}
      <section className="property-room-subcard"><div className="property-room-subcard-heading"><h3>Thêm cư dân vào phòng</h3><p>Tra cứu CCCD trong phạm vi chủ trọ hiện tại.</p></div><form className="property-room-inline-form" onSubmit={search}><label className="property-room-field">Tra cứu CCCD chính xác<input data-dialog-autofocus="true" inputMode="numeric" maxLength={12} value={nationalId} onChange={(event) => setNationalId(event.target.value.replace(/\D/g, ""))} placeholder="12 chữ số" /></label><button className="button property-room-secondary" type="submit" disabled={Boolean(busyId)}>Tra cứu</button></form>
        <button className="button property-room-secondary" type="button" disabled={candidateLoading || Boolean(busyId)} onClick={() => void loadCandidates(1)}>{candidateLoading ? "Đang tải cư dân…" : "Chọn từ danh sách cư dân"}</button>
        {candidates && <div className="property-room-inline-form"><label className="property-room-field">Cư dân<select value={selectedResidentId} onChange={(event) => setSelectedResidentId(event.target.value)}><option value="">Chọn cư dân</option>{candidates.data.map((resident) => <option key={resident.resident_id} value={resident.resident_id}>{resident.full_name}{resident.phone ? ` · ${resident.phone}` : ""}</option>)}</select></label><div className="property-room-pagination compact"><span>Trang {candidatePage} / {candidates.meta.total_pages} · {candidates.meta.total_items} cư dân</span><div><button className="button property-room-secondary" type="button" disabled={candidateLoading || candidatePage <= 1} onClick={() => void loadCandidates(candidatePage - 1)}>Trước</button><button className="button property-room-secondary" type="button" disabled={candidateLoading || candidatePage >= candidates.meta.total_pages} onClick={() => void loadCandidates(candidatePage + 1)}>Sau</button></div></div></div>}
        {(foundResident || selectedResidentId) && <div className="property-room-inline-form"><p className="property-room-selected-resident"><strong>{foundResident?.full_name ?? candidates?.data.find((resident) => resident.resident_id === selectedResidentId)?.full_name}</strong>{(foundResident ?? candidates?.data.find((resident) => resident.resident_id === selectedResidentId))?.phone ? ` · ${(foundResident ?? candidates?.data.find((resident) => resident.resident_id === selectedResidentId))?.phone}` : ""}</p><label className="property-room-field">Ngày bắt đầu<input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label><p>Hợp đồng phù hợp (nếu có) do backend xác định.</p><div className="property-room-modal-actions"><button className="button primary property-room-cta" type="button" disabled={Boolean(busyId)} onClick={() => void add()}>{busyId === "add" ? "Đang thêm…" : "Thêm vào phòng"}</button></div></div>}</section>
      <section className="property-room-subcard"><div className="property-room-subcard-heading"><h3>Lịch sử cư trú</h3><button className="button property-room-secondary" type="button" disabled={loading} onClick={() => void reload()}>{loading ? "Đang tải…" : "Tải lại"}</button></div>{loading ? <p className="property-room-panel-state"><span className="property-room-spinner" aria-hidden="true" />Đang tải lịch sử cư trú…</p> : rows.length ? <div className="table-wrap property-room-table-wrap"><table className="property-room-table"><thead><tr><th>Cư dân</th><th>Bắt đầu</th><th>Kết thúc</th><th>Hợp đồng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map((occupancy) => <tr key={occupancy.occupancy_id}><td><strong>{occupancy.resident?.full_name ?? "—"}</strong></td><td>{showDate(occupancy.started_at)}</td><td>{showDate(occupancy.ended_at)}</td><td>{occupancy.contract?.contract_no ?? "Backend tự xác định / không liên kết"}</td><td><span className={`property-room-status ${occupancy.status === "active" ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{occupancy.status === "active" ? "Đang ở" : "Đã kết thúc"}</span></td><td>{occupancy.status === "active" && <button className="property-room-action is-danger" type="button" disabled={Boolean(busyId)} onClick={() => { setEnding(occupancy); setEndedAt(today()); }}>{busyId === occupancy.occupancy_id ? "Đang xử lý…" : "Kết thúc"}</button>}</td></tr>)}</tbody></table></div> : <div className="property-room-panel-state"><strong>Phòng chưa có lịch sử cư trú</strong><span>Các lượt cư trú sẽ được lưu lại tại đây.</span></div>}</section>
      {ending && <section className="property-room-subcard"><div className="property-room-subcard-heading"><h3>Kết thúc lượt cư trú</h3><span>{ending.resident?.full_name}</span></div><form className="property-room-inline-form" onSubmit={end}><label className="property-room-field">Ngày kết thúc<input type="date" required min={ending.started_at.slice(0, 10)} value={endedAt} onChange={(event) => setEndedAt(event.target.value)} /></label><div className="property-room-modal-actions"><button className="button property-room-secondary" type="button" disabled={Boolean(busyId)} onClick={() => setEnding(null)}>Hủy</button><button className="button primary property-room-cta" type="submit" disabled={Boolean(busyId)}>{busyId === ending.occupancy_id ? "Đang kết thúc…" : "Xác nhận kết thúc"}</button></div></form></section>}
      <div className="property-room-modal-actions"><button className="button property-room-secondary" type="button" disabled={Boolean(busyId)} onClick={() => setOpen(false)}>Đóng</button></div>
    </section></div>}
  </>;
}
