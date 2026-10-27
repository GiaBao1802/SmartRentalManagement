"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { displayName } from "../../lib/api/authApi";
import { ADMIN_NAV_GROUPS } from "./admin-navigation";
import BrandLogo from "./brand-logo";
import AdminNotificationBell from "./admin-notification-bell";

export default function AdminShell({ children, active }: { children: ReactNode; active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === "authenticated" && user?.account.role === "resident") router.replace("/tenant");
  }, [pathname, router, status, user]);

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  if (status !== "authenticated" || !user || user.account.role !== "admin") return <main className="auth-loading">Đang kiểm tra phiên đăng nhập…</main>;
  const name = displayName(user) || "Chủ trọ";
  const initials = name.split(/\s+/).map((part) => part[0]).slice(-2).join("").toUpperCase();
  const nav = <nav className="admin-nav" aria-label="Điều hướng quản trị">
    {ADMIN_NAV_GROUPS.map((group) => {
      const items = group.items.filter((item) => !item.adminOnly || user.account.role === "admin");
      return <div className="admin-nav-group" key={group.label}><span className="admin-nav-label">{group.label}</span>{items.map((item) => {
        const selected = active === item.href || (item.href === "/admin/properties" && pathname.startsWith("/admin/properties/"));
        return <a key={item.href} className={`admin-nav-link${selected ? " active" : ""}`} href={item.href} aria-current={selected ? "page" : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg><span>{item.label}</span>
        </a>;
      })}</div>;
    })}
  </nav>;

  return <div className={`admin-page${mobileNavOpen ? " nav-open" : ""}`}>
    {mobileNavOpen && <button className="admin-nav-scrim" type="button" aria-label="Đóng điều hướng" onClick={() => setMobileNavOpen(false)} />}
    <aside className="admin-sidebar" aria-label="Thanh điều hướng chính">
      <a className="admin-brand" href="/" aria-label="Góc Trọ - trang chủ"><BrandLogo light /></a>
      <div className="admin-sidebar-caption"><span className="admin-sidebar-dot" /> KHÔNG GIAN QUẢN LÝ</div>
      {nav}
      <div className="admin-sidebar-footer"><span className="admin-sidebar-footer-status" aria-hidden="true" /><span>Không gian quản lý<small>Vận hành khu trọ</small></span></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header">
        <div className="admin-header-inner">
          <button className="admin-menu-toggle" type="button" aria-label={mobileNavOpen ? "Đóng menu" : "Mở menu"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><span /><span /><span /></button>
          <div className="admin-header-context"><span className="admin-context-label">GÓC TRỌ <span aria-hidden="true">/</span> QUẢN TRỊ</span><strong>{[...ADMIN_NAV_GROUPS.flatMap((group) => group.items)].find((item) => item.href === active)?.label ?? "Không gian quản lý"}</strong></div>
          <div className="admin-user"><AdminNotificationBell /><span className="avatar" aria-hidden="true">{initials}</span><span className="admin-user-name">{name}<small>Chủ trọ</small></span><button className="logout-button" type="button" disabled={logoutPending} onClick={() => { if (logoutPending) return; setLogoutPending(true); setLogoutError(""); void logout().catch(() => setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy thử lại.")).finally(() => setLogoutPending(false)); }}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div>
        </div>
      </header>
      {logoutError && <p className="notice admin-global-notice" role="alert">{logoutError}</p>}
      {children}
    </div>
  </div>;
}
