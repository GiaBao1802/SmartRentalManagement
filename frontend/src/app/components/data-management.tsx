"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { formatAdminDate, formatAdminMoney, formatAdminStatus } from "../../lib/ui/admin-presentation";

type Row = Record<string, unknown>;
type Column = { key: string; label: string; format?: "money" | "date" | "status" | "boolean" };
type FormField = { key: string; label: string; type?: "text" | "number" | "date" | "textarea" | "select"; required?: boolean; options?: Array<{ value: string; label: string }>; optionsEndpoint?: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusLabels: Record<string, string> = {
  ACTIVE: "Hiệu lực / đang hoạt động", PAUSED: "Tạm dừng", UNDER_CONSTRUCTION: "Đang xây dựng",
  READY: "Sẵn sàng", MAINTENANCE: "Đang bảo trì", UNAVAILABLE: "Không khả dụng",
  PENDING_SIGNATURE: "Chờ ký", TERMINATED: "Đã thanh lý", CANCELLED: "Đã hủy",
  UNPAID: "Chưa thanh toán", PAID: "Đã thanh toán", VOID: "Đã hủy",
  PENDING: "Chờ xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã xử lý", REJECTED: "Đã từ chối",
  APPROVED: "Đã duyệt", USED: "Đã sử dụng", CONTACTED: "Đã liên hệ", CONFIRMED: "Đã xác nhận", COMPLETED: "Hoàn tất",
  LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", URGENT: "Khẩn cấp",
};

function formatValue(value: unknown, format?: Column["format"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money" && (typeof value === "number" || typeof value === "string")) return formatAdminMoney(value);
  if (format === "date" && typeof value === "string") return formatAdminDate(value);
  if (format === "boolean") return value ? "Đang mở" : "Đã đóng";
  if (format === "status" && typeof value === "string") return statusLabels[value] ?? formatAdminStatus(value);
  if (typeof value === "string") return value;
  return String(value);
}

function safeResponseError(status: number, fallback: string) {
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Tài khoản không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu trong phạm vi tài khoản.";
  if (status === 409) return "Dữ liệu vừa thay đổi. Hãy tải lại danh sách rồi thử lại.";
  if (status === 410) return "Chức năng này đang chờ kết nối với dịch vụ hiện tại.";
  if (status >= 500) return "Máy chủ chưa thể xử lý yêu cầu. Vui lòng thử lại sau.";
  return fallback;
}

function safeCaughtError(reason: unknown, fallback: string) {
  if (reason instanceof Error && ["Phiên đăng nhập", "Tài khoản", "Không tìm thấy dữ liệu", "Dữ liệu vừa thay đổi", "Chức năng này", "Máy chủ"].some((prefix) => reason.message.startsWith(prefix))) return reason.message;
  return fallback;
}

function fieldValue(row: Row | null, field: FormField) {
  const value = row?.[field.key];
  if (field.type === "date" && typeof value === "string") return value.slice(0, 10);
  return value === null || value === undefined ? "" : String(value);
}

export default function DataManagement({
  active, title, description, endpoint, columns, searchKeys, summary, fields, defaultStatus, allowCreate = true,
}: {
  active: string;
  title: string;
  description: string;
  endpoint: string;
  columns: Column[];
  searchKeys: string[];
  summary: string;
  fields: FormField[];
  defaultStatus?: { key: string; value: string; label: string };
  allowCreate?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [saving, setSaving] = useState(false);

  async function loadRows() {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}${endpoint}`, { credentials: "include" });
      if (!response.ok) throw new Error(safeResponseError(response.status, "Không tải được dữ liệu."));
      const result = await response.json() as { data: Row[] };
      setRows(result.data);
      setError("");
    } catch (reason) {
      setError(safeCaughtError(reason, "Không tải được dữ liệu. Vui lòng thử lại."));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadRows(); }, [endpoint]);

  async function openForm(row: Row | null) {
    setEditing(row);
    setFormOpen(true);
    setForm(Object.fromEntries(fields.map((field) => [field.key, fieldValue(row, field)])));
    const endpoints = [...new Set(fields.flatMap((field) => field.optionsEndpoint ? [field.optionsEndpoint] : []))];
    const loadedOptions: Record<string, Array<{ value: string; label: string }>> = {};
    await Promise.all(endpoints.map(async (path) => {
      const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
      if (response.ok) {
        const result = await response.json() as { data: Array<{ value: string; label: string }> };
        loadedOptions[path] = result.data;
      }
    }));
    setOptions(loadedOptions);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload: Record<string, string | number | null> = {};
    for (const field of fields) {
      const value = form[field.key] ?? "";
      if (field.type === "number") payload[field.key] = value === "" ? null : Number(value);
      else payload[field.key] = value.trim() || null;
    }
    try {
      const response = await fetch(editing ? `${apiUrl}${endpoint}/${editing.id}` : `${apiUrl}${endpoint}`, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(safeResponseError(response.status, "Không lưu được dữ liệu."));
      setFormOpen(false);
      setEditing(null);
      await loadRows();
    } catch (reason) {
      setError(safeCaughtError(reason, "Không lưu được dữ liệu. Vui lòng kiểm tra thông tin và thử lại."));
    } finally { setSaving(false); }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Xóa mục “${String(row.name ?? row.fullName ?? row.invoiceNumber ?? row.contractNumber ?? "này") }”?`)) return;
    try {
      const response = await fetch(`${apiUrl}${endpoint}/${row.id}`, { method: "DELETE", credentials: "include" });
      const result = response.status === 204 ? {} : await response.json() as { error?: string };
      if (!response.ok) throw new Error(safeResponseError(response.status, "Không xóa được dữ liệu."));
      await loadRows();
    } catch (reason) { setError(safeCaughtError(reason, "Không xóa được dữ liệu. Vui lòng thử lại.")); }
  }

  async function viewDetails(row: Row) {
    try {
      const response = await fetch(`${apiUrl}${endpoint}/${row.id}`, { credentials: "include" });
      const result = await response.json() as { data?: Row; error?: string };
      if (!response.ok || !result.data) throw new Error(safeResponseError(response.status, "Không tải được chi tiết."));
      setViewing(result.data);
    } catch { setError("Không tải được hồ sơ chi tiết. Vui lòng thử lại."); }
  }

  async function quickStatus(row: Row) {
    if (!defaultStatus) return;
    const value = defaultStatus.value;
    try {
      const response = await fetch(`${apiUrl}${endpoint}/${row.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [defaultStatus.key]: value }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(safeResponseError(response.status, "Không cập nhật được trạng thái."));
      await loadRows();
    } catch (reason) { setError(safeCaughtError(reason, "Không cập nhật được trạng thái. Vui lòng thử lại.")); }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const matchesText = !normalized || searchKeys.some((key) => String(row[key] ?? "").toLocaleLowerCase("vi").includes(normalized));
      const statusColumn = columns.find((column) => column.key === "status") ?? columns.find((column) => column.format === "status" || column.format === "boolean");
      const matchesStatus = !statusFilter || String(row[statusColumn?.key ?? ""] ?? "") === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [rows, query, searchKeys, statusFilter, columns]);

  const statusKey = columns.find((column) => column.key === "status")?.key ?? columns.find((column) => column.format === "status" || column.format === "boolean")?.key;

  return <AdminShell active={active}>
    <main className="admin-main">
      <div className="breadcrumb">Phần quản lý · Admin</div>
      <div className="page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
        {allowCreate && <button className="button primary" type="button" onClick={() => void openForm(null)}>+ Thêm mới</button>}
      </div>
      <div className="summary-grid"><section className="summary-card"><span>{summary} trong danh sách hiện tại</span><strong>{rows.length}</strong><small>Số mục đang tải theo nguồn dữ liệu hiện có</small></section></div>
      <section className="admin-card"><h2>Tìm kiếm &amp; Bộ lọc</h2><div className="filter-form simple-filter"><label>Tìm theo thông tin<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${title.toLocaleLowerCase("vi")}`} /></label>{statusKey && <label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{[...new Set(rows.map((row) => String(row[statusKey] ?? "")).filter(Boolean))].map((value) => <option key={value} value={value}>{statusLabels[value] ?? formatAdminStatus(value)}</option>)}</select></label>}<div className="filter-actions"><button type="button" className="button" onClick={() => { setQuery(""); setStatusFilter(""); }}>Đặt lại</button></div></div></section>
      <section className="admin-card">
        <h2>Danh sách {title.toLocaleLowerCase("vi")}</h2>
        {error && <p className="notice" role="status">{error}</p>}
        <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Thao tác</th></tr></thead>
          <tbody>
            {filtered.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => {
              const value = row[column.key];
              const isStatus = column.format === "status" || column.format === "boolean";
              const label = formatValue(value, column.format);
              const isGood = value === "ACTIVE" || value === "PAID" || value === "RESOLVED" || value === true;
              return <td key={column.key}>{isStatus ? <span className={`chip ${isGood ? "success" : "warning"}`}>{label}</span> : label}</td>;
            })}<td><div className="row-actions">{active === "/admin/tenants" && <button className="text-action" type="button" onClick={() => void viewDetails(row)}>Chi tiết</button>}{active === "/admin/properties" && <a className="text-action" href={`/admin/properties/${row.id}/rooms`}>Phòng</a>}<button className="text-action" type="button" onClick={() => void openForm(row)}>Sửa</button>{defaultStatus && row[defaultStatus.key] !== defaultStatus.value && <button className="text-action" type="button" onClick={() => void quickStatus(row)}>{defaultStatus.label}</button>}<button className="text-action danger-action" type="button" onClick={() => void remove(row)}>Xóa</button></div></td></tr>)}
            {loading && <tr><td colSpan={columns.length + 1} className="empty-cell">Đang tải dữ liệu…</td></tr>}
            {!loading && !error && filtered.length === 0 && <tr><td colSpan={columns.length + 1} className="empty-cell">Không có dữ liệu phù hợp.</td></tr>}
          </tbody>
        </table></div>
        <div className="table-footer">Hiển thị {filtered.length} / {rows.length} mục</div>
      </section>
    </main>
    {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="modal-heading"><h2 id="edit-title">{editing ? `Cập nhật ${title.toLocaleLowerCase("vi")}` : `Thêm ${title.toLocaleLowerCase("vi")}`}</h2><button className="modal-close" type="button" onClick={() => setFormOpen(false)} aria-label="Đóng">×</button></div><form onSubmit={save}><div className="edit-form-grid">{fields.map((field) => <label key={field.key}>{field.label}{field.type === "textarea" ? <textarea required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} /> : field.type === "select" ? <select required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}><option value="">Chọn…</option>{(field.options ?? options[field.optionsEndpoint ?? ""] ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type ?? "text"} required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />}</label>)}</div>{error && <p className="notice">{error}</p>}<div className="modal-actions"><button className="button" type="button" onClick={() => setFormOpen(false)}>Hủy</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thông tin"}</button></div></form></section></div>}
    {viewing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="edit-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-detail-title"><div className="modal-heading"><h2 id="tenant-detail-title">Hồ sơ khách thuê · {String(viewing.fullName ?? "Chưa có tên")}</h2><button className="modal-close" type="button" onClick={() => setViewing(null)} aria-label="Đóng">×</button></div><div className="detail-grid">{[["CCCD", viewing.nationalId], ["Điện thoại", viewing.phone], ["Email", viewing.email], ["Lưu trú", formatAdminStatus(viewing.status)], ["Đăng ký tạm trú", formatAdminStatus(viewing.registrationStatus)], ["Tài khoản", viewing.account ? `${String((viewing.account as Row).username ?? "Chưa có tên đăng nhập")}${(viewing.account as Row).isActive ? " · Hoạt động" : " · Đã khóa"}` : "Chưa có"]].map(([label, value]) => <div key={String(label)}><span>{String(label)}</span><strong>{String(value ?? "—")}</strong></div>)}</div><h3>Phương tiện</h3><ul>{((viewing.vehicles as Row[] | undefined) ?? []).map((vehicle, index) => <li key={String(vehicle.id ?? index)}>{String(vehicle.vehicleType ?? "Phương tiện chưa xác định")}{vehicle.plateNumber ? ` · ${String(vehicle.plateNumber)}` : ""}{vehicle.parkingSlot ? ` · Vị trí ${String(vehicle.parkingSlot)}` : ""}</li>)}</ul><h3>Hợp đồng và phòng</h3><ul>{((viewing.contracts as Row[] | undefined) ?? []).map((contract, index) => { const room = contract.room as Row | undefined; const property = room?.property as Row | undefined; return <li key={String(contract.id ?? index)}>{String(contract.contractNumber ?? "Hợp đồng chưa có mã")} · {String(property?.name ?? "Khu vực chưa xác định")} / {String(room?.roomNumber ?? "Phòng chưa xác định")} · {formatAdminStatus(contract.status)} · {formatValue(contract.monthlyRentVnd, "money")}<ul>{((contract.invoices as Row[] | undefined) ?? []).map((invoice, invoiceIndex) => <li key={String(invoice.id ?? invoiceIndex)}>Hóa đơn {String(invoice.billingMonth ?? "—")}/{String(invoice.billingYear ?? "—")} · {formatValue(invoice.totalVnd, "money")} · {formatAdminStatus(invoice.status)}</li>)}</ul></li>; })}</ul><h3>Đăng ký tiện ích gần đây</h3><ul>{((viewing.amenityBookings as Row[] | undefined) ?? []).map((booking, index) => { const amenity = booking.amenity as Row | undefined; return <li key={String(booking.id ?? index)}>{String(amenity?.name ?? "Tiện ích")} · {formatValue(booking.useDate, "date")} · {formatAdminStatus(booking.status)}</li>; })}</ul><h3>Yêu cầu hỗ trợ gần đây</h3><ul>{((viewing.maintenanceRequests as Row[] | undefined) ?? []).map((item, index) => <li key={String(item.id ?? index)}>{String(item.category ?? "Yêu cầu hỗ trợ")} · {String(item.content ?? "Chưa có mô tả")} · {formatAdminStatus(item.status)}</li>)}</ul><div className="modal-actions"><button className="button" type="button" onClick={() => setViewing(null)}>Đóng</button></div></section></div>}
  </AdminShell>;
}
