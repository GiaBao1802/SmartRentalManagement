"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminShell from "../../components/admin-shell";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Account = { id: string; username: string; displayName: string | null; email: string | null; role: string; isActive: boolean; tenantName: string | null; tenantNationalId: string | null; propertyCount: number };
type TenantOption = { id: string; fullName: string; nationalId: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [form, setForm] = useState({ username: "", displayName: "", email: "", password: "", role: "LANDLORD", tenantId: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [accountResponse, tenantResponse] = await Promise.all([
      fetch(`${apiUrl}/api/admin/accounts`, { credentials: "include" }),
      fetch(`${apiUrl}/api/tenants?pageSize=100`, { credentials: "include" }),
    ]);
    if (accountResponse.status === 403) throw new Error("Chỉ admin hệ thống mới được quản lý tài khoản.");
    if (!accountResponse.ok || !tenantResponse.ok) throw new Error("Không tải được danh sách tài khoản.");
    const [accountResult, tenantResult] = await Promise.all([accountResponse.json(), tenantResponse.json()]) as [{ data: Account[] }, { data: TenantOption[] }];
    setAccounts(accountResult.data); setTenants(tenantResult.data);
  }, []);

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu.")); }, [load]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiUrl}/api/admin/accounts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không tạo được tài khoản.");
      setForm({ username: "", displayName: "", email: "", password: "", role: "LANDLORD", tenantId: "" });
      setNotice("Đã tạo tài khoản."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không tạo được tài khoản."); }
    finally { setBusy(false); }
  }

  async function toggle(account: Account) {
    const response = await fetch(`${apiUrl}/api/admin/accounts/${account.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !account.isActive }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Không cập nhật được tài khoản."); return; }
    await load();
  }

  return <AdminShell active="/admin/accounts"><main className="admin-main"><div className="breadcrumb">Admin hệ thống · Tài khoản</div><div className="page-heading"><div><h1>Tài khoản và quyền truy cập</h1><p>Tạo tài khoản chủ trọ hoặc liên kết tài khoản khách thuê. Chủ trọ chỉ xem dữ liệu của khu trọ đã được giao.</p></div></div>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <section className="admin-card"><h2>Tạo tài khoản</h2><form className="account-create-form" onSubmit={createAccount}><label>Vai trò<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, tenantId: "" })}><option value="LANDLORD">Chủ trọ</option><option value="TENANT">Khách thuê</option></select></label><label>Tên đăng nhập<input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label>Tên hiển thị<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Mật khẩu khởi tạo<input type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>{form.role === "TENANT" && <label>Hồ sơ khách thuê<select required value={form.tenantId} onChange={(event) => setForm({ ...form, tenantId: event.target.value })}><option value="">Chọn hồ sơ</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.fullName} · {tenant.nationalId}</option>)}</select></label>}<button className="button primary" disabled={busy}>{busy ? "Đang tạo…" : "Tạo tài khoản"}</button></form></section>
    <section className="admin-card"><h2>Danh sách tài khoản ({accounts.length})</h2><div className="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Liên kết</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.displayName || account.username}</strong><br />{account.username}{account.email ? ` · ${account.email}` : ""}</td><td>{account.role === "ADMIN" ? "Admin toàn hệ thống" : account.role === "LANDLORD" ? "Chủ trọ" : "Khách thuê"}</td><td>{account.role === "LANDLORD" ? `${account.propertyCount} khu trọ` : account.tenantName ? `${account.tenantName} · ${account.tenantNationalId}` : "—"}</td><td><span className={`chip ${account.isActive ? "success" : "warning"}`}>{account.isActive ? "Hoạt động" : "Đã khóa"}</span></td><td>{account.role !== "ADMIN" && <button type="button" className="text-action" onClick={() => void toggle(account)}>{account.isActive ? "Khóa tài khoản" : "Mở tài khoản"}</button>}</td></tr>)}</tbody></table></div></section>
  </main></AdminShell>;
}
