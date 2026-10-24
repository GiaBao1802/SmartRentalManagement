"use client";

import { useEffect, useState } from "react";
import { notificationApi } from "../../lib/api/notificationApi";

type ResidentPrimaryNavigationProps = {
  active: "overview" | "invoices" | "amenities" | "notifications";
  unreadCount?: number | null;
};

const links = [
  { key: "overview", href: "/tenant", label: "Tổng quan" },
  { key: "invoices", href: "/tenant/invoices", label: "Hóa đơn" },
  { key: "amenities", href: "/tenant/amenities", label: "Tiện ích" },
  { key: "notifications", href: "/tenant/notifications", label: "Thông báo" },
] as const;

export default function ResidentPrimaryNavigation({ active, unreadCount }: ResidentPrimaryNavigationProps) {
  const hasCurrentCount = unreadCount !== undefined;
  const [loadedUnreadCount, setLoadedUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    if (hasCurrentCount) return;
    let current = true;
    void notificationApi.list({ page: 1, page_size: 1, unread: true })
      .then((result) => { if (current) setLoadedUnreadCount(result.meta.total_items); })
      .catch(() => { if (current) setLoadedUnreadCount(null); });
    return () => { current = false; };
  }, [hasCurrentCount]);

  const count = hasCurrentCount ? unreadCount : loadedUnreadCount;

  return <nav className="resident-primary-nav" aria-label="Điều hướng cư dân">
    {links.map((link) => {
      const isActive = link.key === active;
      const showUnread = link.key === "notifications" && typeof count === "number" && count > 0;
      return <a
        key={link.key}
        className={isActive ? "is-active" : undefined}
        href={link.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={showUnread ? `Thông báo, ${count} thông báo chưa đọc` : undefined}
      >
        {link.label}
        {showUnread && <span className="resident-notice-nav-count" aria-hidden="true"><i />{count > 99 ? "99+" : count}</span>}
      </a>;
    })}
  </nav>;
}
