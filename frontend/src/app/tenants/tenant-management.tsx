"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "../components/admin-shell";

type Tenant = {
  id: string;
  fullName: string;
  nationalId: string;
  phone: string | null;
  status: "RESIDENT" | "FORMER";
  registrationStatus: "REGISTERED" | "UNREGISTERED";
  contracts: Array<{
    status: "PENDING_SIGNATURE" | "ACTIVE" | "TERMINATED" | "CANCELLED";
    room: { roomNumber: string; property: { name: string; province: string } };
  }>;
  vehicles: Array<{ vehicleType: string; plateNumber: string | null }>;
};

type TenantResponse = { data: Tenant[]; pagination: { total: number } };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function TenantManagement() {
  const [items, setItems] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`${API_URL}/api/tenants?page=1&pageSize=100&search=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh sách khách thuê.");
        return (await response.json()) as TenantResponse;
      })
      .then((result) => {
        setItems(result.data);
        setTotal(result.pagination.total);
        setError("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Chưa kết nối được API. Hãy khởi động backend và PostgreSQL rồi tải lại trang.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
  }

  const unregistered = items.filter((tenant) => tenant.registrationStatus === "UNREGISTERED");

  return (
    <AdminShell active="/admin/tenants">
      <main className="admin-main">
        <div className="breadcrumb">Phần 1 — Quản lý thông tin lưu trú · Admin</div>
        <div className="page-heading">
          <div>
            <h1>Quản lý khách thuê</h1>
            <p>Quản lý thông tin lưu trú: thêm, sửa, xóa, tìm kiếm, lọc và sắp xếp. Dữ liệu tỉnh, tòa nhà, phòng liên kết với trang Quản lý khu vực.</p>
          </div>
          <span className="total-label">Tổng: <strong>{total}</strong> khách thuê</span>
        </div>

        <section className="admin-card">
          <h2>Tìm kiếm &amp; Bộ lọc</h2>
          <form className="filter-form" onSubmit={submitSearch}>
            <label>Tỉnh / Thành phố<select defaultValue=""><option value="">Tất cả tỉnh / thành</option><option>Hà Nội</option><option>Đà Nẵng</option><option>TP. Hồ Chí Minh</option></select></label>
            <label>Tòa nhà<select defaultValue=""><option value="">Tất cả tòa nhà</option></select></label>
            <label>Họ tên<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập họ tên" /></label>
            <label>CCCD<input placeholder="Nhập CCCD" /></label>
            <label>Thời hạn hợp đồng<select defaultValue=""><option value="">Tất cả</option><option>Còn hạn</option><option>Sắp hết hạn</option><option>Đã hết hạn</option><option>Chờ ký</option><option>Đã thanh lý</option><option>Chưa có hợp đồng</option></select></label>
            <label>Tình trạng lưu trú<select defaultValue=""><option value="">Tất cả</option><option>Đang ở</option><option>Đã rời đi</option></select></label>
            <label>Tạm trú / tạm vắng<select defaultValue=""><option value="">Tất cả</option><option>Chưa đăng ký</option><option>Đã đăng ký</option></select></label>
            <div className="filter-actions"><button className="button" type="button" onClick={() => { setSearch(""); setQuery(""); }}>Đặt lại</button><button className="button primary" type="submit">Tìm kiếm</button></div>
          </form>
        </section>

        <section className="admin-card">
          <div className="card-title-row"><div><h2>Cư dân chưa đăng ký tạm trú / tạm vắng</h2><span className="chip warning">{unregistered.length}</span></div><button className="button primary" type="button" disabled>Xuất biểu mẫu đăng ký</button></div>
          <p className="card-description">Danh sách cư dân chưa có đăng ký. Biểu mẫu sẽ điền sẵn thông tin hiện có để bổ sung, in và ký.</p>
          <div className="table-wrap"><table><thead><tr><th>Họ tên</th><th>CCCD</th><th>Khu vực</th><th>Phòng</th><th>Tình trạng</th></tr></thead>
            <tbody>{unregistered.map((tenant) => {
              const contract = tenant.contracts[0];
              return <tr key={tenant.id}><td>{tenant.fullName}</td><td>{tenant.nationalId}</td><td>{contract?.room.property.province ?? "—"}</td><td>{contract?.room.roomNumber ?? "—"}</td><td><span className="chip warning">Chưa đăng ký</span></td></tr>;
            })}{!loading && unregistered.length === 0 && <tr><td colSpan={5} className="empty-cell">Không có cư dân cần đăng ký.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="admin-card">
          <h2>Danh sách thông tin lưu trú</h2>
          {error && <p className="notice" role="status">{error}</p>}
          <div className="table-wrap"><table><thead><tr><th>Tỉnh / TP</th><th>Tòa nhà</th><th>Phòng</th><th>Họ tên</th><th>CCCD</th><th>Phương tiện</th><th>Hợp đồng</th><th>Khiếu nại</th><th>Lưu trú</th><th>Tình trạng</th><th>Tài khoản</th><th>Thao tác</th></tr></thead>
            <tbody>{items.map((tenant) => {
              const contract = tenant.contracts[0];
              const contractLabel = contract?.status === "ACTIVE" ? "Hiệu lực" : contract?.status === "PENDING_SIGNATURE" ? "Chờ ký" : contract ? "Đã thanh lý" : "Chưa có hợp đồng";
              return <tr key={tenant.id}><td>{contract?.room.property.province ?? "—"}</td><td>{contract?.room.property.name ?? "—"}</td><td>{contract?.room.roomNumber ?? "—"}</td><td><strong>{tenant.fullName}</strong><span className="subtext">{tenant.phone ?? "Chưa có số điện thoại"}</span></td><td>{tenant.nationalId}</td><td>{tenant.vehicles.length ? tenant.vehicles.map((vehicle) => vehicle.plateNumber || vehicle.vehicleType).join(", ") : "—"}</td><td><span className={`chip ${contract?.status === "ACTIVE" ? "success" : "warning"}`}>{contractLabel}</span></td><td>—</td><td>{tenant.status === "RESIDENT" ? "Đang ở" : "Đã rời đi"}</td><td><span className={`chip ${tenant.registrationStatus === "REGISTERED" ? "success" : "warning"}`}>{tenant.registrationStatus === "REGISTERED" ? "Đã đăng ký" : "Chưa đăng ký"}</span></td><td>—</td><td><button className="text-action" type="button" disabled>Xem</button></td></tr>;
            })}{loading && <tr><td colSpan={12} className="empty-cell">Đang tải danh sách khách thuê…</td></tr>}{!loading && !error && items.length === 0 && <tr><td colSpan={12} className="empty-cell">Chưa có dữ liệu khách thuê.</td></tr>}</tbody>
          </table></div>
          <div className="table-footer"><span>Hiển thị {items.length} / {total} khách thuê</span></div>
        </section>
      </main>
    </AdminShell>
  );
}
