"use client";

import { FormEvent, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json() as { error?: string; user?: { role: "ADMIN" | "LANDLORD" | "TENANT" } };
      if (!response.ok) throw new Error(result.error ?? "Đăng nhập chưa thành công.");
      const defaultPath = result.user?.role === "TENANT" ? "/tenant" : "/admin/properties";
      const requested = new URLSearchParams(window.location.search).get("next") ?? defaultPath;
      const next = requested.startsWith("/") && !requested.startsWith("//") && result.user?.role !== "TENANT" ? requested : defaultPath;
      window.location.assign(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể kết nối máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <a className="login-back" href="/">← Về trang chủ</a>
    <section className="login-card">
      <a className="login-logo" href="/"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a>
      <span className="eyebrow">GÓC TRỌ · CỔNG QUẢN LÝ</span>
      <h1>Chào mừng trở lại</h1>
      <p>Đăng nhập để quản lý khu vực, khách thuê, hợp đồng và hóa đơn.</p>
      <form onSubmit={submit}>
        <label>Tài khoản<input autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Tên đăng nhập, email hoặc số điện thoại" /></label>
        <label>Mật khẩu<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="button primary login-submit" type="submit" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </form>
      <div className="login-demo"><strong>Tài khoản demo theo vai trò</strong><span>Admin: admin / 123456</span><span>Chủ trọ (Tòa A): landlord / 123456</span><span>Khách thuê mẫu: tenant / 123456</span><small>Chỉ dùng local; mật khẩu có thể đặt bằng biến DEV_*_PASSWORD trước khi seed.</small></div>
      <p className="login-help">Quên mật khẩu? Vui lòng liên hệ quản trị viên để được hỗ trợ.</p>
    </section>
  </main>;
}
