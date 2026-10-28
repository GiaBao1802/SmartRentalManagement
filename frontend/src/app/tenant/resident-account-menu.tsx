"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  email: string | null;
  logoutPending: boolean;
  onLogout: () => void;
};

export default function ResidentAccountMenu({ name, email, logoutPending, onLogout }: Props) {
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
    className={`resident-account-menu${open ? " is-open" : ""}`}
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
    <button
      className="resident-account-trigger"
      type="button"
      ref={triggerRef}
      aria-haspopup="true"
      aria-expanded={open}
      aria-controls="resident-account-popover"
      onClick={() => setOpen((current) => !current)}
    >
      <span className="resident-user-avatar" aria-hidden="true">{initials}</span>
      <span className="resident-user-copy"><strong>{name}</strong><span>Cư dân</span></span>
      <svg className="resident-account-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className="resident-account-popover" id="resident-account-popover" aria-label="Tài khoản cư dân">
      <div className="resident-account-popover-heading"><span className="resident-account-popover-avatar" aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>Tài khoản cư dân</small></span></div>
      <div className="resident-account-email"><small>Email đăng nhập</small><strong>{email || "Chưa cập nhật"}</strong></div>
      <a href="/tenant#tenant-profile-heading" onClick={() => setOpen(false)}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4 17c.5-3 2.5-4.5 6-4.5s5.5 1.5 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>Hồ sơ cư trú</a>
      <button type="button" disabled={logoutPending} onClick={onLogout}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8m4-3 4-4-4-4m4 4H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button>
    </div>}
  </div>;
}
