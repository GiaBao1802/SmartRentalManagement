"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/auth-provider";
import { loginErrorMessage } from "../../lib/api/errors";

export default function LoginForm() {
  const router = useRouter();
  const { status, user, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const redirectTarget = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    router.replace(redirectTarget.current ?? (user.account.role === "resident" ? "/tenant" : "/admin/properties"));
  }, [router, status, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const account = await login(identifier, password);
      const defaultPath = account.account.role === "resident" ? "/tenant" : "/admin/properties";
      const requested = new URLSearchParams(window.location.search).get("next") ?? defaultPath;
      const next = requested.startsWith("/") && !requested.startsWith("//") && (account.account.role === "admin" || requested === "/tenant") ? requested : defaultPath;
      redirectTarget.current = next;
      router.replace(next);
    } catch (reason) {
      setError(loginErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <a className="login-back" href="/">← Về trang chủ</a>
    <div className="login-layout">
      <aside className="login-brand-panel"><a className="login-logo" href="/"><img src="/assets/goc-tro-logo-newstyle.svg" alt="Góc trọ · Chốn về bình yên" /></a><span className="login-brand-kicker">KHÔNG GIAN QUẢN LÝ</span><h2>Vận hành khu trọ<br />gọn gàng, an tâm.</h2><p>Một nơi để theo dõi khu vực, phòng và thông tin cư dân của bạn.</p><div className="login-brand-rule"><span /><span /><span /></div></aside>
      <section className="login-card">
        <span className="eyebrow">CỔNG QUẢN LÝ GÓC TRỌ</span>
        <h1>Chào mừng trở lại</h1>
        <p>Đăng nhập bằng email hoặc số điện thoại để tiếp tục.</p>
        <form onSubmit={submit}>
          <label>Email hoặc số điện thoại<input autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Nhập email hoặc số điện thoại" /></label>
          <label>Mật khẩu<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="button primary login-submit" type="submit" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        </form>
        <div className="login-demo"><strong>Đăng nhập an toàn</strong><span>Phiên làm việc được lưu bằng cookie bảo mật do máy chủ quản lý.</span></div>
        <p className="login-help">Quên mật khẩu? Vui lòng liên hệ quản trị viên để được hỗ trợ.</p>
      </section>
    </div>
  </main>;
}
