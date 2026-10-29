"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api/apiClient";

type Kind = "operator-invitation" | "owner-invitation" | "owner-reset";
const routes: Record<Kind, { inspect: string; complete: string; title: string }> = {
  "operator-invitation": { inspect: "/auth/operator-invitation/inspect", complete: "/auth/accept-operator-invitation", title: "Thiết lập tài khoản Superadmin" },
  "owner-invitation": { inspect: "/auth/owner-invitation/inspect", complete: "/auth/accept-owner-invitation", title: "Thiết lập tài khoản chủ trọ" },
  "owner-reset": { inspect: "/auth/owner-reset/inspect", complete: "/auth/complete-owner-reset", title: "Đặt lại mật khẩu chủ trọ" },
};
export default function OneTimePassword({ kind }: { kind: Kind }) {
  const [token, setToken] = useState(""), [valid, setValid] = useState(false), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [message, setMessage] = useState("Đang kiểm tra link…"), [done, setDone] = useState(false);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!raw) { setMessage("Link không hợp lệ hoặc đã hết hạn."); return; }
    setToken(raw);
    void apiRequest(routes[kind].inspect, { method: "POST", authRequired: false, body: JSON.stringify({ token: raw }) })
      .then(() => { setValid(true); setMessage("Link còn hiệu lực. Hãy tự đặt mật khẩu."); })
      .catch(() => setMessage("Link không hợp lệ hoặc đã hết hạn. Hãy yêu cầu link mới."));
  }, [kind]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 12 || password !== confirmation) { setMessage("Mật khẩu phải có ít nhất 12 ký tự và hai lần nhập phải khớp."); return; }
    try {
      await apiRequest(routes[kind].complete, { method: "POST", authRequired: false, body: JSON.stringify({ token, password }) });
      setPassword(""); setConfirmation(""); setToken(""); setDone(true); setMessage("Đã đặt mật khẩu. Bạn có thể đăng nhập.");
    } catch { setMessage("Link không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu link mới."); }
  }
  return <main style={{ maxWidth: 460, margin: "8vh auto", padding: 24, fontFamily: "sans-serif" }}><h1>{routes[kind].title}</h1><p role="status">{message}</p>{valid && !done && <form onSubmit={event => void submit(event)}><label>Mật khẩu mới<input required type="password" autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 20px" }}/></label><label>Nhập lại mật khẩu<input required type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 20px" }}/></label><button>Hoàn tất</button></form>}{done && <a href="/login">Đến trang đăng nhập</a>}</main>;
}
