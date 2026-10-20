"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { credentialApi } from "../../lib/api/credentialApi";
import { passwordErrors, credentialFailure } from "../../lib/api/credentialView";
import AuthLayout from "./auth-layout";
import PasswordField from "./password-field";
import styles from "./auth-flow.module.css";
type LinkState = "checking" | "ready" | "missing" | "invalid" | "unavailable";
export default function CredentialForm({ mode }: { mode: "accept" | "reset" | "forgot" }) {
  const [token, setToken] = useState(""); const [login, setLogin] = useState("");
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [linkState, setLinkState] = useState<LinkState>("checking"); const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState({ password: "", confirmation: "" }); const [done, setDone] = useState(false);
  const busy = useRef(false); const inspectionBusy = useRef<string | null>(null), inspectionVersion = useRef(0); const initialized = useRef(false); const originalToken = useRef<string | null>(null); const alert = useRef<HTMLParagraphElement>(null);
  const inspect = useCallback(async (raw: string) => {
    if (inspectionBusy.current === raw) return; inspectionBusy.current = raw; const version = ++inspectionVersion.current;
    setLinkState("checking"); setError("");
    try { const result = await credentialApi.inspect(mode === "accept" ? "invitation" : "reset", raw); if (version === inspectionVersion.current) { setExpiresAt(result.expires_at); setLinkState("ready"); } }
    catch (reason) { if (version !== inspectionVersion.current) return; const code = (reason as { code?: string }).code; setLinkState(code === "TOKEN_INVALID" || code === "VALIDATION_ERROR" ? "invalid" : "unavailable"); setError(credentialFailure(reason)); }
    finally { if (version === inspectionVersion.current) inspectionBusy.current = null; }
  }, [mode]);
  useEffect(() => {
    if (mode === "forgot") return;
    const readFragment = () => {
      const raw = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (!raw) { if (!originalToken.current) setLinkState("missing"); return; }
      originalToken.current = raw; setToken(raw); setDone(false); setPassword(""); setConfirmation(""); setFields({ password: "", confirmation: "" });
      window.history.replaceState(null, "", window.location.pathname);
      void inspect(raw);
    };
    if (!initialized.current) { initialized.current = true; readFragment(); }
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, [mode, inspect]);
  useEffect(() => { if (error || linkState === "invalid" || linkState === "missing") alert.current?.focus(); }, [error, linkState]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (mode !== "forgot") { const next = passwordErrors(password, confirmation); setFields(next); if (next.password || next.confirmation) return; if (linkState !== "ready") return; }
    busy.current = true; setPending(true); setError("");
    try {
      if (mode === "forgot") await credentialApi.forgot(login);
      else if (mode === "accept") await credentialApi.accept(token, password);
      else await credentialApi.reset(token, password);
      setDone(true); setToken(""); originalToken.current = null; setPassword(""); setConfirmation("");
    } catch (reason) {
      if ((reason as { code?: string }).code === "TOKEN_INVALID") { setLinkState("invalid"); setPassword(""); setConfirmation(""); }
      setError(credentialFailure(reason));
    } finally { busy.current = false; setPending(false); }
  }
  const title = mode === "accept" ? "Thiết lập tài khoản cư dân" : mode === "reset" ? "Đặt lại mật khẩu" : "Quên mật khẩu";
  const description = mode === "accept" ? "Tự tạo mật khẩu để bắt đầu sử dụng tài khoản cư dân." : mode === "reset" ? "Chọn mật khẩu mới. Sau khi hoàn tất, bạn cần đăng nhập lại." : "Nhập email hoặc số điện thoại đã dùng cho tài khoản.";
  const unavailable = mode !== "forgot" && linkState !== "ready";
  return <AuthLayout title={title} description={description} footer={<a href="/login">← Về đăng nhập</a>}>
    {done ? <div className={styles.form}><p className={`${styles.message} ${styles.success}`} role="status">{mode === "forgot" ? "Nếu thông tin phù hợp và kênh xác minh sẵn sàng, bạn sẽ nhận được hướng dẫn. Thông báo này không xác nhận tài khoản có tồn tại hay tin đã gửi." : mode === "accept" ? "Tài khoản đã được thiết lập. Hãy đăng nhập bằng số điện thoại và mật khẩu vừa tạo." : "Đã đặt lại mật khẩu và thu hồi các phiên cũ. Hãy đăng nhập bằng mật khẩu mới."}</p><a className={styles.submit} href="/login">Đến trang đăng nhập</a></div> : <form className={styles.form} onSubmit={submit} noValidate>
      {mode === "forgot" ? <div className={styles.field}><label className={styles.label} htmlFor="recovery-login">Email hoặc số điện thoại</label><input id="recovery-login" className={styles.input} autoComplete="username" required maxLength={254} value={login} disabled={pending} onChange={event => setLogin(event.target.value)} /></div> : <>
        {linkState === "checking" && <p className={styles.message} role="status">Đang kiểm tra liên kết…</p>}
        {linkState === "missing" && <p ref={alert} tabIndex={-1} className={`${styles.message} ${styles.error}`} role="alert">Liên kết thiếu mã xác minh. Hãy mở lại liên kết được gửi cho bạn.</p>}
        {linkState === "invalid" && <p ref={alert} tabIndex={-1} className={`${styles.message} ${styles.error}`} role="alert">Liên kết không hợp lệ, đã dùng hoặc đã hết hạn. {mode === "reset" ? "Hãy yêu cầu một liên kết đặt lại mới." : "Hãy liên hệ chủ trọ để nhận lời mời mới."}</p>}
        {linkState === "ready" && <p className={styles.help}>Liên kết hợp lệ đến {new Date(expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Mở trang chưa làm thay đổi tài khoản.</p>}
        {!unavailable && <>
          <PasswordField label="Mật khẩu mới" value={password} onChange={value => { setPassword(value); setFields(current => ({ ...current, password: "" })); }} disabled={pending} error={fields.password} helper="Dùng ít nhất 12 ký tự. Không dùng lại mật khẩu cũ." />
          <PasswordField label="Xác nhận mật khẩu" value={confirmation} onChange={value => { setConfirmation(value); setFields(current => ({ ...current, confirmation: "" })); }} disabled={pending} error={fields.confirmation} />
        </>}
      </>}
      {error && linkState !== "invalid" && <p className={`${styles.message} ${styles.error}`} ref={alert} tabIndex={-1} role="alert">{error}</p>}
      {linkState === "unavailable" && mode !== "forgot" && <button type="button" className={styles.secondary} onClick={() => void inspect(token)}>Thử kiểm tra lại</button>}
      {mode === "forgot" || !unavailable ? <button type="submit" className={styles.submit} disabled={pending || (mode === "forgot" && !login.trim())}>{pending ? "Đang xử lý…" : mode === "forgot" ? "Gửi yêu cầu xác minh" : mode === "accept" ? "Tạo mật khẩu và hoàn tất" : "Lưu mật khẩu mới"}</button> : null}
      {linkState === "invalid" && mode === "reset" && <a className={styles.secondary} href="/forgot-password">Yêu cầu liên kết mới</a>}
    </form>}
  </AuthLayout>;
}
