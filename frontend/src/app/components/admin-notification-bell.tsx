"use client";

import { useEffect, useState } from "react";
import { notificationApi, type ResidentNotification } from "../../lib/api/notificationApi";

type Category = "all" | "invoice_demo_payment" | "resident_feedback";
type ReadFilter = "all" | "unread" | "read";

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

  useEffect(() => {
    let current = true;
    void Promise.all([
      notificationApi.list({ page: 1, page_size: 1, unread: true, type: "invoice_demo_payment" }),
      notificationApi.list({ page: 1, page_size: 1, unread: true, type: "resident_feedback" }),
    ])
      .then(([invoice, feedback]) => { if (current) setUnreadCount(invoice.meta.total_items + feedback.meta.total_items); })
      .catch(() => { if (current) setUnreadCount(null); });
    return () => { current = false; };
  }, [open, rows.length]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true); setError("");
    void notificationApi.list({ page: 1, page_size: 30, ...(category === "all" ? {} : { type: category }), ...(readFilter === "all" ? {} : { unread: readFilter === "unread" }) })
      .then((result) => { if (current) setRows(result.data); })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Không tải được thông báo."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [category, open, readFilter]);

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
      <div className="admin-notification-filters"><label>Nhóm<select value={category} onChange={(event) => setCategory(event.target.value as Category)}><option value="all">Tất cả</option><option value="invoice_demo_payment">Hóa đơn</option><option value="resident_feedback">Phản hồi</option></select></label><label>Trạng thái<select value={readFilter} onChange={(event) => setReadFilter(event.target.value as ReadFilter)}><option value="all">Tất cả</option><option value="unread">Chưa đọc</option><option value="read">Đã đọc</option></select></label></div>
      {error && <p className="admin-notification-error" role="alert">{error}</p>}{loading && <p className="admin-notification-empty">Đang tải…</p>}{!loading && !error && rows.length === 0 && <p className="admin-notification-empty">Chưa có thông báo phù hợp.</p>}
      {!loading && rows.length > 0 && <div className={`admin-notification-list${rows.length > 3 ? " is-scrollable" : ""}`}>{rows.map((row) => {
        const expanded = expandedNotificationId === row.notification_id;
        const canExpand = row.body.length > 110;
        return <article className={row.read_at ? "is-read" : "is-unread"} key={row.notification_id}>
          <div><span>{row.notification_type === "invoice_demo_payment" ? "Hóa đơn" : row.notification_type === "resident_feedback" ? "Phản hồi" : "Thông báo"}</span>{!row.read_at && <b>Chưa đọc</b>}</div>
          <h3>{row.title}</h3>
          <p className={expanded ? "is-expanded" : undefined}>{row.body}</p>
          {canExpand && <button className={`admin-notification-more${expanded ? " is-expanded" : ""}`} type="button" aria-expanded={expanded} aria-label={expanded ? "Thu gọn nội dung thông báo" : "Xem đầy đủ nội dung thông báo"} title={expanded ? "Thu gọn" : "Xem đầy đủ"} onClick={() => setExpandedNotificationId(expanded ? null : row.notification_id)}>{expanded ? "Thu gọn" : "…"}</button>}
          <time dateTime={row.created_at}>{dateLabel(row.created_at)}</time>
          {!row.read_at && <button type="button" onClick={() => void markRead(row)}>Đánh dấu đã đọc</button>}
        </article>;
      })}</div>}
    </section>}
  </div>;
}
