"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { propertyApi, type Property, type PropertyInput, type PropertyPatch, type PropertyStatus } from "../../../lib/api/propertyApi";
import { keepDialogFocus, useDialogFocus } from "../../../lib/ui/dialog-accessibility";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [province, setProvince] = useState("");
  const [provinceTerm, setProvinceTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Property | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState({ property_code: "", name: "", province: "", address: "", manager_name: "", status: "active" as PropertyStatus });

  useDialogFocus(open, dialogRef);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setError("");
    try {
      const result = await propertyApi.list({ page, page_size: 20, search: searchTerm, status: statusFilter, province: provinceTerm });
      setProperties(result.data);
      setTotalItems(result.meta.total_items);
      setTotalPages(result.meta.total_pages);
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "Không thể tải danh sách khu vực. Kiểm tra kết nối máy chủ rồi thử lại.");
    } finally { setLoading(false); }
  }, [page, searchTerm, statusFilter, provinceTerm]);

  useEffect(() => { void load(); }, [load]);

  function openForm(property: Property | null) {
    setEditing(property);
    setForm({
      property_code: property?.property_code ?? "",
      name: property?.name ?? "",
      province: property?.province ?? "",
      address: property?.address ?? "",
      manager_name: property?.manager_name ?? "",
      status: property?.status ?? "active",
    });
    setError("");
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (editing && editing.status !== "archived" && form.status === "archived" && !window.confirm(`Ngưng hoạt động khu vực “${editing.name}”? Dữ liệu lịch sử vẫn được giữ lại.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!editing) {
        const input: PropertyInput = {
          property_code: form.property_code.trim(), name: form.name.trim(), province: form.province.trim(), address: form.address.trim(),
          ...(form.manager_name.trim() ? { manager_name: form.manager_name.trim() } : {}),
        };
        await propertyApi.create(input);
        setNotice("Đã tạo khu vực.");
      } else {
        const patch: PropertyPatch = {};
        if (form.name.trim() !== editing.name) patch.name = form.name.trim();
        if (form.province.trim() !== editing.province) patch.province = form.province.trim();
        if (form.address.trim() !== editing.address) patch.address = form.address.trim();
        const manager = form.manager_name.trim() || null;
        if (manager !== editing.manager_name) patch.manager_name = manager;
        if (form.status !== editing.status) patch.status = form.status;
        if (Object.keys(patch).length) await propertyApi.update(editing.property_id, patch);
        setNotice(Object.keys(patch).length ? "Đã cập nhật khu vực." : "Không có thay đổi cần lưu.");
      }
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Không thể lưu khu vực. Vui lòng thử lại.");
    } finally { setSaving(false); }
  }

  async function archive(property: Property) {
    if (archivingId) return;
    if (!window.confirm(`Ngưng hoạt động khu vực “${property.name}”? Dữ liệu lịch sử vẫn được giữ lại.`)) return;
    setArchivingId(property.property_id);
    setError("");
    setNotice("");
    try {
      await propertyApi.archive(property.property_id);
      setNotice(`Đã ngưng hoạt động khu vực ${property.name}.`);
      await load();
    } catch (reason) {
      const message = reason instanceof ApiError && reason.message === "Không thể lưu trữ khu vực đang có hợp đồng hoặc cư trú hoạt động."
        ? "Không thể ngưng hoạt động khu vực đang có hợp đồng hoặc cư trú hoạt động."
        : reason instanceof ApiError ? reason.message : "Không thể ngưng hoạt động khu vực.";
      setError(message);
    } finally { setArchivingId(null); }
  }

  const statusLabel: Record<PropertyStatus, string> = { active: "Đang hoạt động", building: "Đang xây dựng", paused: "Tạm dừng", archived: "Ngưng hoạt động" };

  return <AdminShell active="/admin/properties">
    <main className="admin-main property-room-page property-page">
      <header className="property-room-heading">
        <div><p className="property-room-eyebrow">QUẢN LÝ TÀI SẢN</p><h1>Khu vực của bạn</h1><p className="property-room-description">Theo dõi khu trọ, thông tin quản lý và danh sách phòng.</p></div>
        <button className="button primary property-room-cta" type="button" onClick={() => openForm(null)}>+ Thêm khu vực</button>
      </header>
      <div className="property-room-stats property-stats" aria-label="Thống kê khu vực">
        <section className="property-room-stat" data-tone="green"><span>Tổng khu vực theo bộ lọc</span><strong>{totalItems}</strong><small>Toàn bộ kết quả từ máy chủ</small></section>
        <section className="property-room-stat" data-tone="orange"><span>Đang hoạt động trong trang</span><strong>{properties.filter((property) => property.status === "active").length}</strong><small>Tối đa 20 khu vực đang xem</small></section>
        <section className="property-room-stat" data-tone="amber"><span>Ngưng hoạt động trong trang</span><strong>{properties.filter((property) => property.status === "archived").length}</strong><small>Tối đa 20 khu vực đang xem</small></section>
      </div>
      <section className="property-room-toolbar" aria-label="Tìm kiếm và lọc khu vực"><form className="property-room-filter-form core-filter-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearchTerm(search.trim()); setProvinceTerm(province.trim()); }}>
        <label className="property-room-field property-room-search">Tìm khu vực<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, mã hoặc địa chỉ" /></label>
        <label className="property-room-field">Tỉnh / Thành phố<input maxLength={120} value={province} onChange={(event) => setProvince(event.target.value)} placeholder="Nhập tỉnh/thành" /></label>
        <label className="property-room-field">Trạng thái<select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="building">Đang xây dựng</option><option value="paused">Tạm dừng</option><option value="archived">Ngưng hoạt động</option></select></label>
        <div className="property-room-filter-actions"><button className="button primary property-room-apply" type="submit">Tìm kiếm</button><button className="button property-room-secondary" type="button" onClick={() => { setSearch(""); setSearchTerm(""); setProvince(""); setProvinceTerm(""); setStatusFilter(""); setPage(1); }}>Đặt lại</button></div>
      </form></section>
      <section className="property-room-table-card" aria-labelledby="property-list-title">
        <div className="property-room-card-heading"><div><h2 id="property-list-title">Danh sách khu vực</h2><p>Chọn “Xem phòng” để quản lý các phòng trong khu vực.</p></div><span className="property-room-result-count">{totalItems} kết quả</span></div>
        {loadError && <div className="property-room-alert" role="alert"><p>{loadError}</p><button className="button property-room-secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Đang tải…" : "Thử lại"}</button></div>}
        {error && !open && <p className="property-room-alert" role="alert">{error}</p>}
        {notice && <p className="property-room-notice" role="status">{notice}</p>}
        <div className="table-wrap property-room-table-wrap"><table className="property-room-table"><thead><tr><th>Khu vực</th><th>Địa chỉ</th><th>Người phụ trách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          {properties.map((property) => <tr key={property.property_id}><td><strong className="property-room-primary-cell">{property.name}</strong><span className="subtext">Mã {property.property_code} · {property.province}</span></td><td className="property-room-address">{property.address}</td><td>{property.manager_name ?? <span className="property-room-muted">Chưa phân công</span>}</td><td><span className={`property-room-status ${property.status === "active" ? "is-active" : property.status === "paused" ? "is-paused" : property.status === "building" ? "is-building" : "is-archived"}`}><span aria-hidden="true" />{statusLabel[property.status]}</span></td><td><div className="property-room-actions"><a className="property-room-view-link" href={`/admin/properties/${encodeURIComponent(property.property_id)}/rooms`}>Xem phòng <span aria-hidden="true">→</span></a><button className="property-room-action" type="button" disabled={Boolean(archivingId)} onClick={() => openForm(property)}>Sửa</button>{property.status !== "archived" && <button className="property-room-action is-danger" type="button" disabled={Boolean(archivingId)} onClick={() => void archive(property)}>{archivingId === property.property_id ? "Đang ngưng…" : "Ngưng hoạt động"}</button>}</div></td></tr>)}
          {!loading && !loadError && properties.length === 0 && <tr><td className="property-room-empty" colSpan={5}><strong>Chưa có khu vực phù hợp</strong><span>Thử đổi từ khóa hoặc trạng thái lọc.</span></td></tr>}
          {loading && <tr><td className="property-room-empty" colSpan={5}><span className="property-room-spinner" aria-hidden="true" />Đang tải danh sách khu vực…</td></tr>}
        </tbody></table></div>
        <div className="property-room-pagination"><span>{totalItems ? `Hiển thị ${(page - 1) * 20 + 1}–${Math.min(page * 20, totalItems)} trong ${totalItems} khu vực` : "Không có kết quả"}</span><div><button className="button property-room-secondary" type="button" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>← Trước</button><span>Trang {totalPages ? page : 0} / {totalPages}</span><button className="button property-room-secondary" type="button" aria-label="Trang sau" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Sau →</button></div></div>
      </section>
    </main>
    {open && <div className="modal-backdrop property-room-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}><section ref={dialogRef} tabIndex={-1} className="edit-modal property-room-modal" role="dialog" aria-modal="true" aria-labelledby="property-form-title" onKeyDown={(event) => keepDialogFocus(event, () => setOpen(false), saving)}><div className="property-room-modal-heading"><div><p className="property-room-eyebrow">THÔNG TIN KHU VỰC</p><h2 id="property-form-title">{editing ? "Cập nhật khu vực" : "Thêm khu vực"}</h2></div><button className="modal-close" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Đóng cửa sổ">×</button></div><form onSubmit={save}>
      <fieldset className="property-room-fieldset"><legend>Thông tin chung</legend><div className="property-room-form-grid">
        <label className="property-room-field">Mã khu vực<input data-dialog-autofocus={!editing ? "true" : undefined} required maxLength={40} disabled={Boolean(editing) || saving} value={form.property_code} onChange={(event) => setForm({ ...form, property_code: event.target.value })} /></label>
        <label className="property-room-field">Tên khu vực<input data-dialog-autofocus={editing ? "true" : undefined} required maxLength={150} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="property-room-field">Tỉnh / Thành phố<input required maxLength={120} disabled={saving} value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></label>
        <label className="property-room-field">Người phụ trách <span className="property-room-optional">Không bắt buộc</span><input maxLength={150} disabled={saving} value={form.manager_name} onChange={(event) => setForm({ ...form, manager_name: event.target.value })} /></label>
        <label className="property-room-field property-room-field-wide">Địa chỉ<textarea required maxLength={10000} disabled={saving} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      </div></fieldset>
      {editing && <fieldset className="property-room-fieldset"><legend>Trạng thái</legend><div className="property-room-form-grid"><label className="property-room-field">Tình trạng<select disabled={saving} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PropertyStatus })}><option value="active">Đang hoạt động</option><option value="building">Đang xây dựng</option><option value="paused">Tạm dừng</option><option value="archived">Ngưng hoạt động</option></select></label><p className="property-room-field-hint">Khu vực đang có hợp đồng hoặc cư trú hoạt động không thể ngưng hoạt động.</p></div></fieldset>}
      {error && <p className="property-room-alert" role="alert">{error}</p>}<div className="property-room-modal-actions"><button className="button property-room-secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>Hủy</button><button className="button primary property-room-cta" type="submit" disabled={saving}>{saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo khu vực"}</button></div></form></section></div>}
  </AdminShell>;
}
