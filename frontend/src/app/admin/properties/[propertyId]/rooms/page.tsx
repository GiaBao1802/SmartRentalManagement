"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "../../../../components/admin-shell";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Room = { id: string; roomNumber: string; floor: number; areaM2: number | null; rentOverrideVnd: number | null; condition: string; tenant: string | null };
type Property = { id: string; name: string; code: string; defaultRentVnd: number; roomCount: number };

export default function PropertyRoomsPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ roomNumber: "", floor: "1", areaM2: "", rentOverrideVnd: "", condition: "READY" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [propertyResponse, roomsResponse] = await Promise.all([
      fetch(`${apiUrl}/api/properties`, { credentials: "include" }),
      fetch(`${apiUrl}/api/properties/${propertyId}/rooms`, { credentials: "include" }),
    ]);
    if (!propertyResponse.ok || !roomsResponse.ok) throw new Error("Không tải được dữ liệu phòng.");
    const propertyData = await propertyResponse.json() as { data: Property[] };
    const roomData = await roomsResponse.json() as { data: Room[] };
    setProperty(propertyData.data.find((item) => item.id === propertyId) ?? null);
    setRooms(roomData.data);
  }, [propertyId]);

  useEffect(() => { void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu.")); }, [reload]);

  function showForm(room: Room | null) {
    setEditing(room);
    setForm({ roomNumber: room?.roomNumber ?? "", floor: String(room?.floor ?? 1), areaM2: room?.areaM2 == null ? "" : String(room.areaM2), rentOverrideVnd: room?.rentOverrideVnd == null ? "" : String(room.rentOverrideVnd), condition: room?.condition ?? "READY" });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = { roomNumber: form.roomNumber.trim(), floor: Number(form.floor), areaM2: form.areaM2 ? Number(form.areaM2) : null, rentOverrideVnd: form.rentOverrideVnd ? Number(form.rentOverrideVnd) : null, condition: form.condition };
    try {
      const response = await fetch(editing ? `${apiUrl}/api/rooms/${editing.id}` : `${apiUrl}/api/properties/${propertyId}/rooms`, { method: editing ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không lưu được phòng.");
      setOpen(false); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không lưu được phòng."); }
    finally { setSaving(false); }
  }

  async function remove(room: Room) {
    if (!window.confirm(`Xóa phòng ${room.roomNumber}?`)) return;
    const response = await fetch(`${apiUrl}/api/rooms/${room.id}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "Không xóa được phòng."); return; }
    await reload();
  }

  return <AdminShell active="/admin/properties"><main className="admin-main">
    <div className="breadcrumb"><a href="/admin/properties">Quản lý khu vực</a> · Phòng</div>
    <div className="page-heading"><div><h1>{property ? `${property.name} · Quản lý phòng` : "Quản lý phòng"}</h1><p>Thêm, sửa trạng thái, giá và diện tích từng phòng. Phòng đang có hợp đồng sẽ không thể xóa.</p></div><button className="button primary" type="button" onClick={() => showForm(null)}>+ Thêm phòng</button></div>
    {property && <div className="summary-grid"><section className="summary-card"><span>Tổng số phòng</span><strong>{rooms.length}</strong></section><section className="summary-card"><span>Đang có hợp đồng</span><strong>{rooms.filter((room) => room.tenant).length}</strong></section><section className="summary-card"><span>Giá thuê mặc định</span><strong>{new Intl.NumberFormat("vi-VN").format(property.defaultRentVnd)} đ</strong></section></div>}
    {error && <p className="notice">{error}</p>}
    <section className="admin-card"><h2>Danh sách phòng</h2><div className="table-wrap"><table><thead><tr><th>Phòng</th><th>Tầng</th><th>Diện tích</th><th>Giá thuê</th><th>Khách thuê</th><th>Tình trạng</th><th>Thao tác</th></tr></thead><tbody>
      {rooms.map((room) => <tr key={room.id}><td><strong>{room.roomNumber}</strong></td><td>{room.floor}</td><td>{room.areaM2 ? `${room.areaM2} m²` : "—"}</td><td>{new Intl.NumberFormat("vi-VN").format(room.rentOverrideVnd ?? property?.defaultRentVnd ?? 0)} đ</td><td>{room.tenant ?? "—"}</td><td><span className={`chip ${room.condition === "READY" ? "success" : "warning"}`}>{room.condition === "READY" ? "Sẵn sàng" : room.condition === "MAINTENANCE" ? "Đang bảo trì" : "Không khả dụng"}</span></td><td><div className="row-actions"><button className="text-action" type="button" onClick={() => showForm(room)}>Sửa</button><button className="text-action danger-action" type="button" onClick={() => void remove(room)}>Xóa</button></div></td></tr>)}
      {!rooms.length && <tr><td className="empty-cell" colSpan={7}>Khu vực này chưa có phòng.</td></tr>}
    </tbody></table></div></section>
  </main>{open && <div className="modal-backdrop"><section className="edit-modal" role="dialog" aria-modal="true"><div className="modal-heading"><h2>{editing ? "Cập nhật phòng" : "Thêm phòng"}</h2><button className="modal-close" type="button" onClick={() => setOpen(false)}>×</button></div><form onSubmit={save}><div className="edit-form-grid">
    <label>Số phòng<input required value={form.roomNumber} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} /></label>
    <label>Tầng<input required min="1" type="number" value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} /></label>
    <label>Diện tích (m²)<input min="0" step="0.01" type="number" value={form.areaM2} onChange={(event) => setForm({ ...form, areaM2: event.target.value })} /></label>
    <label>Giá thuê riêng (đ/tháng)<input min="0" step="1000" type="number" value={form.rentOverrideVnd} onChange={(event) => setForm({ ...form, rentOverrideVnd: event.target.value })} placeholder="Để trống dùng giá mặc định" /></label>
    <label>Tình trạng<select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}><option value="READY">Sẵn sàng</option><option value="MAINTENANCE">Đang bảo trì</option><option value="UNAVAILABLE">Không khả dụng</option></select></label>
    </div>{error && <p className="notice">{error}</p>}<div className="modal-actions"><button className="button" type="button" onClick={() => setOpen(false)}>Hủy</button><button className="button primary" disabled={saving} type="submit">{saving ? "Đang lưu…" : "Lưu phòng"}</button></div></form></section></div>}</AdminShell>;
}
