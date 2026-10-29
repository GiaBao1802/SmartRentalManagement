"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  email: string | null;
  logoutPending: boolean;
  onLogout: () => void;
};

export default function AdminAccountMenu({ name, email, logoutPending, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join("").toUpperCase();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return <div
    className={`admin-account-menu${open ? " is-open" : ""}`}
    ref={rootRef}
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={(event) => {
      if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
    }}
    onFocus={() => setOpen(true)}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <button className="admin-account-trigger" type="button" ref={triggerRef} aria-expanded={open} aria-controls="admin-account-popover" onClick={() => setOpen((current) => !current)}>
      <span className="admin-account-avatar" aria-hidden="true">{initials}</span>
      <span className="admin-account-copy"><strong>{name}</strong><small>Chủ trọ</small></span>
      <svg className="admin-account-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className="admin-account-popover" id="admin-account-popover" aria-label="Tài khoản chủ trọ">
      <div className="admin-account-popover-heading"><span className="admin-account-popover-avatar" aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>Tài khoản chủ trọ</small></span></div>
      <div className="admin-account-email"><small>Email đăng nhập</small><strong>{email || "Chưa cập nhật"}</strong></div>
      <a href="/admin/properties" onClick={() => setOpen(false)}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3 8 7-5 7 5v9H3V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7 17v-5h6v5M6 9h.01M10 9h.01M14 9h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>Quản lý khu trọ</a>
      <button type="button" disabled={logoutPending} onClick={onLogout}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8m4-3 4-4-4-4m4 4H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button>
    </div>}
  </div>;
}
