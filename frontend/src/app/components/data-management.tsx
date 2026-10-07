"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "./admin-shell";

type Row = Record<string, string | number | boolean | null | undefined>;
type Column = { key: string; label: string; format?: "money" | "date" | "status" | "boolean" };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusLabels: Record<string, string> = {
  ACTIVE: "Hiệu lực / đang hoạt động", PAUSED: "Tạm dừng", UNDER_CONSTRUCTION: "Đang xây dựng",
  READY: "Sẵn sàng", MAINTENANCE: "Đang bảo trì", UNAVAILABLE: "Không khả dụng",
  PENDING_SIGNATURE: "Chờ ký", ACTIVE_CONTRACT: "Hiệu lực", TERMINATED: "Đã thanh lý", CANCELLED: "Đã hủy",
  UNPAID: "Chưa thanh toán", PAID: "Đã thanh toán", VOID: "Đã hủy",
  PENDING: "Chờ xử lý", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã xử lý", REJECTED: "Đã từ chối",
  LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", URGENT: "Khẩn cấp",
};

function formatValue(value: Row[string], format?: Column["format"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money" && typeof value === "number") return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
  if (format === "date" && typeof value === "string") return new Date(value).toLocaleDateString("vi-VN");
  if (format === "boolean") return value ? "Đang mở" : "Đã đóng";
  if (typeof value === "string") return statusLabels[value] ?? value;
  return String(value);
}

export default function DataManagement({
  active, title, description, endpoint, columns, searchKeys, summary,
}: {
  active: string;
  title: string;
  description: string;
  endpoint: string;
  columns: Column[];
  searchKeys: string[];
  summary: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}${endpoint}`, { signal: controller.signal, credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("API error");
        return (await response.json()) as { data: Row[] };
      })
      .then((result) => { setRows(result.data); setError(""); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Chưa kết nối được API. Kiểm tra backend và PostgreSQL rồi tải lại trang.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return rows;
    return rows.filter((row) => searchKeys.some((key) => String(row[key] ?? "").toLocaleLowerCase("vi").includes(normalized)));
  }, [rows, query, searchKeys]);

  const stats = useMemo(() => {
    const activeCount = rows.filter((row) => row.status === "ACTIVE" || row.status === "PAID" || row.isActive === true).length;
    const pendingCount = rows.filter((row) => row.status === "PENDING" || row.status === "UNPAID" || row.status === "PENDING_SIGNATURE").length;
    return [
      { label: summary, value: rows.length },
      { label: "Đang hiệu lực / hoạt động", value: activeCount },
      { label: "Chờ xử lý / thanh toán", value: pendingCount },
    ];
  }, [rows, summary]);

  return <AdminShell active={active}>
    <main className="admin-main">
      <div className="breadcrumb">Phần quản lý · Admin</div>
      <div className="page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
        <button className="button primary" type="button" disabled>+ Thêm mới</button>
      </div>
      <div className="summary-grid">{stats.map((stat) => <section className="summary-card" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></section>)}</div>
      <section className="admin-card">
        <h2>Tìm kiếm &amp; Bộ lọc</h2>
        <div className="filter-form simple-filter">
          <label>Tìm theo thông tin<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm trong ${title.toLocaleLowerCase("vi")}`} /></label>
          <div className="filter-actions"><button type="button" className="button" onClick={() => setQuery("")}>Đặt lại</button></div>
        </div>
      </section>
      <section className="admin-card">
        <h2>Danh sách {title.toLocaleLowerCase("vi")}</h2>
        {error && <p className="notice" role="status">{error}</p>}
        <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {filtered.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => {
              const value = row[column.key];
              const isStatus = column.format === "status" || column.format === "boolean";
              const label = formatValue(value, column.format);
              const isGood = value === "ACTIVE" || value === "PAID" || value === "RESOLVED" || value === true;
              return <td key={column.key}>{isStatus ? <span className={`chip ${isGood ? "success" : "warning"}`}>{label}</span> : label}</td>;
            })}</tr>)}
            {loading && <tr><td colSpan={columns.length} className="empty-cell">Đang tải dữ liệu…</td></tr>}
            {!loading && !error && filtered.length === 0 && <tr><td colSpan={columns.length} className="empty-cell">Không có dữ liệu phù hợp.</td></tr>}
          </tbody>
        </table></div>
        <div className="table-footer">Hiển thị {filtered.length} / {rows.length} mục</div>
      </section>
    </main>
  </AdminShell>;
}
