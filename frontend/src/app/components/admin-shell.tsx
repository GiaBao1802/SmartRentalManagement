"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const tabs = [
  { href: "/admin/properties", label: "Quản lý khu vực" },
  { href: "/admin/tenants", label: "Quản lý khách thuê" },
  { href: "/admin/contracts", label: "Quản lý hợp đồng" },
  { href: "/admin/invoices", label: "Quản lý hóa đơn" },
  { href: "/admin/amenities", label: "Tiện ích" },
  { href: "/admin/bookings", label: "Lịch tiện ích" },
  { href: "/admin/viewings", label: "Lịch xem phòng" },
  { href: "/admin/complaints", label: "Khiếu nại" },
];

export default function AdminShell({ children, active }: { children: ReactNode; active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/auth/me`, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("unauthenticated");
        return response.json() as Promise<{ user: { displayName?: string } }>;
      })
      .then(({ user: account }) => setUser(account.displayName ?? "Quản trị viên"))
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`))
      .finally(() => setReady(true));
  }, [pathname, router]);

  async function logout() {
    await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    router.replace("/login");
  }

  if (!ready || !user) return <main className="auth-loading">Đang kiểm tra phiên đăng nhập…</main>;

  return <div className="admin-page">
    <header className="admin-header">
      <div className="admin-header-inner">
        <a className="admin-brand" href="/" aria-label="Góc trọ - trang quản trị"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a>
        <nav className="admin-nav" aria-label="Điều hướng quản trị">
          {tabs.map((tab) => <a key={tab.href} className={active === tab.href ? "active" : ""} href={tab.href}>{tab.label}</a>)}
        </nav>
        <div className="admin-user"><span className="avatar">{user.split(/\s+/).map((part) => part[0]).slice(-2).join("").toUpperCase()}</span><span>{user}<small>Chủ trọ / Admin</small></span><button className="logout-button" type="button" onClick={logout}>Đăng xuất</button></div>
      </div>
    </header>
    {children}
  </div>;
}
