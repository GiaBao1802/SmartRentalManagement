"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { notificationApi, type ResidentNotification } from "../../lib/api/notificationApi";

type Category = "all" | "resident_feedback" | "service_booking_requested" | "parking_request" | "invoice_demo_payment" | "billing_period_closeout";
type ReadFilter = "all" | "unread" | "read";
const PAGE_SIZE = 30;

const notificationDetails: Record<string, { label: string; href: string; action: string }> = {
  resident_feedback: { label: "Khiếu nại / yêu cầu", href: "/admin/requests", action: "Mở yêu cầu" },
  service_booking_requested: { label: "Yêu cầu dịch vụ", href: "/admin/services/flexible", action: "Mở yêu cầu dịch vụ" },
  parking_request: { label: "Yêu cầu gửi xe", href: "/admin/services/parking", action: "Mở yêu cầu gửi xe" },
  invoice_demo_payment: { label: "Hóa đơn / thanh toán", href: "/admin/invoices", action: "Mở hóa đơn" },
  billing_period_closeout: { label: "Chốt kỳ hóa đơn", href: "/admin/billing", action: "Mở chốt kỳ" },
};

function dateLabel(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ResidentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    let current = true;
    void notificationApi.list({ page: 1, page_size: 1, unread: true })
      .then((result) => { if (current) setUnreadCount(result.meta.total_items); })
      .catch(() => { if (current) setUnreadCount(null); });
    return () => { current = false; };
  }, [open, rows.length]);

  useEffect(() => {
    if (!open) return;
    const version = ++requestVersion.current;
    setLoading(true); setLoadingMore(false); setError(""); setRows([]); setNextPage(null);
    void notificationApi.list({ page: 1, page_size: PAGE_SIZE, ...(category === "all" ? {} : { type: category }), ...(readFilter === "all" ? {} : { unread: readFilter === "unread" }) })
      .then((result) => {
        if (requestVersion.current !== version) return;
        setRows(result.data); setNextPage(result.meta.total_pages > 1 ? 2 : null);
      })
      .catch((reason: unknown) => { if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Không tải được thông báo."); })
      .finally(() => { if (requestVersion.current === version) setLoading(false); });
    return () => { requestVersion.current += 1; };
  }, [category, open, readFilter]);

  async function loadMore() {
    if (nextPage === null || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true); setError("");
    try {
      const result = await notificationApi.list({ page: nextPage, page_size: PAGE_SIZE, ...(category === "all" ? {} : { type: category }), ...(readFilter === "all" ? {} : { unread: readFilter === "unread" }) });
      if (requestVersion.current !== version) return;
      setRows((current) => {
        const known = new Set(current.map((row) => row.notification_id));
        return [...current, ...result.data.filter((row) => !known.has(row.notification_id))];
      });
      setNextPage(nextPage < result.meta.total_pages ? nextPage + 1 : null);
    } catch (reason) {
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Không tải thêm được thông báo.");
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }

  async function markRead(row: ResidentNotification) {
    if (row.read_at) return;
    try {
      const updated = await notificationApi.markRead(row.notification_id);
      setRows((current) => current.map((item) => item.notification_id === row.notification_id ? updated : item));
      setUnreadCount((current) => current === null ? current : Math.max(0, current - 1));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không cập nhật được trạng thái đã đọc."); }
  }

  return <div className="admin-notification-wrap">
    <button className="admin-notification-button" type="button" aria-label={unreadCount ? "Thông báo, " + unreadCount + " chưa đọc" : "Thông báo"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {typeof unreadCount === "number" && unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section className="admin-notification-popover" aria-label="Thông báo quản trị">
      <header><div><small>HỘP THƯ QUẢN TRỊ</small><h2>Thông báo</h2></div><button type="button" aria-label="Đóng thông báo" onClick={() => setOpen(false)}>×</button></header>
      <div className="admin-notification-filters"><label>Nhóm<select value={category} onChange={(event) => setCategory(event.target.value as Category)}><option value="all">Tất cả</option><option value="resident_feedback">Khiếu nại / yêu cầu</option><option value="service_booking_requested">Yêu cầu dịch vụ</option><option value="parking_request">Yêu cầu gửi xe</option><option value="invoice_demo_payment">Hóa đơn / thanh toán</option><option value="billing_period_closeout">Chốt kỳ hóa đơn</option></select></label><label>Trạng thái<select value={readFilter} onChange={(event) => setReadFilter(event.target.value as ReadFilter)}><option value="all">Tất cả</option><option value="unread">Chưa đọc</option><option value="read">Đã đọc</option></select></label></div>
      {error && <p className="admin-notification-error" role="alert">{error}</p>}{loading && <p className="admin-notification-empty">Đang tải…</p>}{!loading && !error && rows.length === 0 && <p className="admin-notification-empty">Chưa có thông báo phù hợp.</p>}
      {!loading && rows.length > 0 && <div className={`admin-notification-list${rows.length > 3 ? " is-scrollable" : ""}`}>{rows.map((row) => {
        const expanded = expandedNotificationId === row.notification_id;
        const canExpand = row.body.length > 110;
        const detail = notificationDetails[row.notification_type];
        return <article className={row.read_at ? "is-read" : "is-unread"} key={row.notification_id}>
          <div><span>{detail?.label ?? "Thông báo"}</span>{!row.read_at && <b>Chưa đọc</b>}</div>
          <h3>{row.title}</h3>
          <p className={expanded ? "is-expanded" : undefined}>{row.body}</p>
          {canExpand && <button className={`admin-notification-more${expanded ? " is-expanded" : ""}`} type="button" aria-expanded={expanded} aria-label={expanded ? "Thu gọn nội dung thông báo" : "Xem đầy đủ nội dung thông báo"} title={expanded ? "Thu gọn" : "Xem đầy đủ"} onClick={() => setExpandedNotificationId(expanded ? null : row.notification_id)}>{expanded ? "Thu gọn" : "…"}</button>}
          <time dateTime={row.created_at}>{dateLabel(row.created_at)}</time>
          {detail && <Link className="admin-notification-action" href={detail.href}>{detail.action}</Link>}
          {!row.read_at && <button type="button" onClick={() => void markRead(row)}>Đánh dấu đã đọc</button>}
        </article>;
      })}{nextPage !== null && <button className="admin-notification-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Đang tải…" : "Tải thêm thông báo"}</button>}</div>}
    </section>}
  </div>;
}
