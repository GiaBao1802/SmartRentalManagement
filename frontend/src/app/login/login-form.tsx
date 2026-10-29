"use client";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/auth-provider";
import { loginErrorMessage } from "../../lib/api/errors";
import { loginTarget } from "../../lib/api/credentialView";
import AuthLayout from "../components/auth-layout";
import PasswordField from "../components/password-field";
import styles from "../components/auth-flow.module.css";
export default function LoginForm() {
  const router = useRouter(); const { status, user, login } = useAuth();
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const pending = useRef(false); const redirectTarget = useRef<string | null>(null); const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    router.replace(redirectTarget.current ?? loginTarget(user.account.role, new URLSearchParams(window.location.search).get("next"), window.location.origin));
  }, [router, status, user]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const account = await login(identifier, password);
      const next = loginTarget(account.account.role, new URLSearchParams(window.location.search).get("next"), window.location.origin);
      redirectTarget.current = next; router.replace(next);
    } catch (reason) { setError(loginErrorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <AuthLayout title="Chào mừng trở lại" description="Đăng nhập bằng email hoặc số điện thoại để tiếp tục." footer={<a href="/forgot-password">Quên mật khẩu?</a>}>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}><label className={styles.label} htmlFor="login-identifier">Email hoặc số điện thoại</label><input id="login-identifier" className={styles.input} autoComplete="username" required maxLength={254} disabled={busy} value={identifier} onChange={event => setIdentifier(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} /></div>
      <PasswordField label="Mật khẩu" value={password} onChange={setPassword} disabled={busy} autoComplete="current-password" minimum={1} />
      {error && <p id="login-error" className={`${styles.message} ${styles.error}`} tabIndex={-1} ref={alert} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      <p className={styles.help}>Chỉ đăng nhập trên thiết bị bạn tin dùng. Đăng xuất khi dùng xong thiết bị chung.</p>
    </form>
  </AuthLayout>;
}
