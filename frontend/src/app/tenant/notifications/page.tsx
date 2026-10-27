"use client";

import BrandLogo from "../../components/brand-logo";
import ResidentPrimaryNavigation from "../resident-primary-navigation";
import { useAuth } from "../../components/auth-provider";
import { displayName } from "../../../lib/api/authApi";
import { ApiError } from "../../../lib/api/errors";
import { notificationApi, type NotificationPreferencePatch, type NotificationPreferences, type ResidentNotification } from "../../../lib/api/notificationApi";
import { demoPaymentApi } from "../../../lib/api/demoPaymentApi";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const pageSize = 10;
type InboxFilter = "all" | "unread";
const preferenceOptions: Array<{ key: keyof NotificationPreferencePatch; label: string; description: string }> = [
  { key: "new_invoice", label: "Hóa đơn mới", description: "Thông báo khi có hóa đơn được phát hành cho bạn." },
  { key: "overdue_invoice", label: "Hóa đơn quá hạn", description: "Nhắc bạn khi hóa đơn chưa thanh toán đã quá hạn." },
  { key: "expiring_contract", label: "Hợp đồng sắp hết hạn", description: "Cập nhật khi hợp đồng của bạn sắp đến hạn." },
  { key: "complaint_updates", label: "Cập nhật phản ánh", description: "Thông báo khi có cập nhật liên quan đến phản ánh của bạn." },
];

function message(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải thông báo.";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Thời gian chưa xác định" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    invoice: "Hóa đơn",
    new_invoice: "Hóa đơn mới",
    overdue_invoice: "Hóa đơn quá hạn",
    expiring_contract: "Hợp đồng",
    complaint: "Phản ánh",
    complaint_update: "Cập nhật phản ánh",
    complaint_updates: "Cập nhật phản ánh",
    billing_period_closeout: "Chuẩn bị kỳ hóa đơn",
    service_booking_requested: "Yêu cầu đặt tiện ích",
    service_booking_approved: "Yêu cầu tiện ích đã được duyệt",
    service_booking_rejected: "Yêu cầu tiện ích chưa được duyệt",
    service_booking_cancelled: "Lịch tiện ích đã hủy",
    invoice_demo_payment: "Thanh toán hóa đơn",
    resident_feedback: "Phản hồi cư dân",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function NoticeBell({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={small ? "resident-notice-bell is-small" : "resident-notice-bell"}>
    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10 21h4" />
  </svg>;
}

export default function ResidentNotificationsPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ResidentNotification[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: pageSize, total_items: 0, total_pages: 0 });
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [retry, setRetry] = useState(0);
  const [readPendingId, setReadPendingId] = useState<string | null>(null);
  const [readAllPending, setReadAllPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [draftPreferences, setDraftPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesRetry, setPreferencesRetry] = useState(0);
  const [preferencesError, setPreferencesError] = useState("");
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("Góp ý dịch vụ");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant%2Fnotifications");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
  }, [router, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setLoading(true);
    setError("");
    void notificationApi.list({ page, page_size: pageSize, ...(filter === "unread" ? { unread: true } : {}) })
      .then((result) => {
        if (!active) return;
        setRows(result.data);
        setMeta(result.meta);
      })
      .catch((reason: unknown) => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, page, retry, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setSummaryLoading(true);
    setSummaryError("");
    void Promise.all([
      notificationApi.list({ page: 1, page_size: 1 }),
      notificationApi.list({ page: 1, page_size: 1, unread: true }),
    ]).then(([all, unread]) => {
      if (!active) return;
      setTotalCount(all.meta.total_items);
      setUnreadCount(unread.meta.total_items);
    }).catch((reason: unknown) => {
      if (active) setSummaryError(message(reason));
    }).finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [status, retry, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setPreferencesLoading(true);
    setPreferencesError("");
    void notificationApi.preferences().then((result) => {
      if (!active) return;
      setPreferences(result);
      setDraftPreferences(result);
    }).catch((reason: unknown) => {
      if (active) setPreferencesError(message(reason));
    }).finally(() => { if (active) setPreferencesLoading(false); });
    return () => { active = false; };
  }, [preferencesRetry, status, user]);

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy kiểm tra kết nối và thử lại."); }
    finally { setLogoutPending(false); }
  }

  async function markRead(row: ResidentNotification) {
    if (row.read_at || readPendingId) return;
    setReadPendingId(row.notification_id);
    setActionError("");
    try {
      const updated = await notificationApi.markRead(row.notification_id);
      setRows((current) => filter === "unread"
        ? current.filter((item) => item.notification_id !== row.notification_id)
        : current.map((item) => item.notification_id === row.notification_id ? updated : item));
      setUnreadCount((current) => current === null ? current : Math.max(0, current - 1));
      if (filter === "unread") {
        setMeta((current) => ({ ...current, total_items: Math.max(0, current.total_items - 1), total_pages: Math.ceil(Math.max(0, current.total_items - 1) / pageSize) }));
        if (rows.length === 1 && page > 1) setPage((current) => current - 1);
      }
    } catch (reason) { setActionError(message(reason)); }
    finally { setReadPendingId(null); }
  }

  async function markAllRead() {
    if (readAllPending || !unreadCount) return;
    setReadAllPending(true);
    setActionError("");
    try {
      const result = await notificationApi.markAllRead();
      setRows((current) => filter === "unread" ? [] : current.map((row) => row.read_at ? row : { ...row, read_at: result.read_at }));
      setUnreadCount((current) => current === null ? 0 : Math.max(0, current - result.updated_count));
      if (filter === "unread") {
        setMeta((current) => ({ ...current, total_items: Math.max(0, current.total_items - result.updated_count), total_pages: Math.ceil(Math.max(0, current.total_items - result.updated_count) / pageSize) }));
        setPage(1);
      }
    } catch (reason) { setActionError(message(reason)); }
    finally { setReadAllPending(false); }
  }

  function changePreference(key: keyof NotificationPreferencePatch, value: boolean) {
    setPreferencesSaved(false);
    setDraftPreferences((current) => current ? { ...current, [key]: value } : current);
  }

  async function savePreferences() {
    if (!preferences || !draftPreferences || preferencesSaving) return;
    const patch = Object.fromEntries(preferenceOptions
      .filter(({ key }) => preferences[key] !== draftPreferences[key])
      .map(({ key }) => [key, draftPreferences[key]])) as NotificationPreferencePatch;
    if (Object.keys(patch).length === 0) { setPreferencesSaved(true); return; }
    setPreferencesSaving(true);
    setPreferencesError("");
    setPreferencesSaved(false);
    try {
      const updated = await notificationApi.updatePreferences(patch);
      setPreferences(updated);
      setDraftPreferences(updated);
      setPreferencesSaved(true);
    } catch (reason) { setPreferencesError(message(reason)); }
    finally { setPreferencesSaving(false); }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (feedbackPending) return;
    setFeedbackPending(true); setFeedbackError(""); setFeedbackMessage("");
    try {
      await demoPaymentApi.sendFeedback(feedbackCategory, feedbackContent);
      setFeedbackContent("");
      setFeedbackMessage("Đã gửi phản hồi đến chủ trọ. Phản hồi được lưu trong hệ thống.");
      setRetry((value) => value + 1);
    } catch (reason) { setFeedbackError(message(reason)); }
    finally { setFeedbackPending(false); }
  }

  if (status === "loading" || (status === "authenticated" && user?.account.role === "resident" && loading && rows.length === 0 && !error)) {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><NoticeBell /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải thông báo</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  }
  if (status !== "authenticated" || user?.account.role !== "resident") {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><NoticeBell /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang chuyển đến trang phù hợp</h1><p>Hệ thống đang kiểm tra phiên đăng nhập của bạn.</p><span className="resident-progress" aria-label="Đang chuyển trang" /></div></main>;
  }

  const name = displayName(user);
  const nameInitials = name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join("").toUpperCase();
  const hasPreferenceChanges = Boolean(preferences && draftPreferences && preferenceOptions.some(({ key }) => preferences[key] !== draftPreferences[key]));

  return <main className="tenant-page resident-home resident-notifications-page">
    <header className="tenant-header resident-topbar">
      <a href="/" aria-label="Trang chủ Góc trọ"><BrandLogo /></a>
      <ResidentPrimaryNavigation active="notifications" unreadCount={unreadCount} />
      <div className="resident-topbar-actions"><span className="resident-user-avatar" aria-hidden="true">{nameInitials}</span><div className="resident-user-copy"><strong>{name}</strong><span>Cư dân</span></div><button className="resident-logout-button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div>
    </header>
    <div className="tenant-content resident-layout resident-notice-layout">
      <section className="resident-notice-hero" aria-labelledby="resident-notice-title">
        <div><span className="resident-eyebrow">CẬP NHẬT TỪ GÓC TRỌ <span aria-hidden="true">·</span> LUÔN TRONG TẦM TAY</span><h1 id="resident-notice-title">Thông báo</h1><p>Nơi xem cập nhật về cư trú, hóa đơn và phản hồi của bạn.</p></div>
        <div className="resident-notice-hero-art" aria-hidden="true"><span className="resident-notice-art-halo" /><span className="resident-notice-art-icon"><NoticeBell /></span><i className="resident-notice-art-dot dot-one" /><i className="resident-notice-art-dot dot-two" /><i className="resident-notice-art-dot dot-three" /></div>
      </section>

      {logoutError && <p className="notice resident-inline-notice" role="alert">{logoutError}</p>}
      {actionError && <p className="resident-notice-feedback is-error" role="alert">{actionError}</p>}
      {summaryError && <p className="resident-notice-feedback" role="status">Chưa tải được số liệu thông báo. <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></p>}

      <section className="resident-notice-summary" aria-label="Tổng hợp thông báo">
        <article><span className="resident-notice-summary-icon"><NoticeBell small /></span><div><small>Tất cả thông báo</small><strong>{summaryLoading ? "…" : totalCount ?? "—"}</strong></div></article>
        <article className="is-unread"><span className="resident-notice-summary-icon"><i aria-hidden="true" /></span><div><small>Chưa đọc</small><strong>{summaryLoading ? "…" : unreadCount ?? "—"}</strong></div></article>
        <p><span className="resident-notice-live-dot" /> Chỉ hiển thị thông báo trong ứng dụng</p>
      </section>

      <div className="resident-notice-columns">
        <section className="resident-panel resident-notice-inbox" aria-labelledby="resident-notice-inbox-title">
          <div className="resident-notice-panel-heading"><div><span className="resident-eyebrow">HỘP THƯ CỦA BẠN</span><h2 id="resident-notice-inbox-title">Cập nhật gần đây</h2></div><button className="resident-secondary-button resident-notice-read-all" type="button" disabled={readAllPending || !unreadCount} onClick={() => void markAllRead()}>{readAllPending ? "Đang cập nhật…" : "Đánh dấu tất cả đã đọc"}</button></div>
          <div className="resident-notice-filters" role="group" aria-label="Lọc thông báo">
            <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "is-selected" : ""} onClick={() => { setFilter("all"); setPage(1); }}>Tất cả{totalCount !== null && <span>{totalCount}</span>}</button>
            <button type="button" aria-pressed={filter === "unread"} className={filter === "unread" ? "is-selected" : ""} onClick={() => { setFilter("unread"); setPage(1); }}>Chưa đọc{unreadCount !== null && <span>{unreadCount}</span>}</button>
          </div>

          {error && <div className="resident-notice-empty is-error" role="alert"><span className="resident-notice-empty-icon"><NoticeBell /></span><div><h3>Chưa tải được thông báo</h3><p>{error}</p><button className="resident-secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>Thử tải lại</button></div></div>}
          {!error && loading && <div className="resident-notice-empty" role="status"><span className="resident-progress" aria-label="Đang tải" /><p>Đang tải hộp thư…</p></div>}
          {!error && !loading && rows.length === 0 && <div className="resident-notice-empty"><span className="resident-notice-empty-icon"><NoticeBell /></span><div><h3>{filter === "unread" ? "Bạn đã xem hết thông báo mới" : "Chưa có thông báo"}</h3><p>{filter === "unread" ? "Các cập nhật chưa đọc sẽ xuất hiện ở đây." : "Khi có cập nhật liên quan đến hồ sơ của bạn, thông báo sẽ được lưu tại đây."}</p></div></div>}
          {!error && !loading && rows.length > 0 && <div className="resident-notice-list">
            {rows.map((row) => <article className={`resident-notice-card ${row.read_at ? "is-read" : "is-unread"}`} key={row.notification_id}>
              <span className="resident-notice-card-icon"><NoticeBell small /></span>
              <div className="resident-notice-card-copy"><div className="resident-notice-card-meta"><span>{typeLabel(row.notification_type)}</span>{!row.read_at && <i>Chưa đọc</i>}</div><h3>{row.title}</h3><p>{row.body}</p><time dateTime={row.created_at}>{formatDate(row.created_at)}</time></div>
              {!row.read_at && <button className="resident-notice-mark-read" type="button" disabled={readPendingId !== null} onClick={() => void markRead(row)}>{readPendingId === row.notification_id ? "Đang lưu…" : "Đánh dấu đã đọc"}</button>}
            </article>)}
          </div>}
          {meta.total_pages > 1 && <div className="resident-pagination resident-notice-pagination"><span>Trang {meta.page} / {meta.total_pages}<small>{meta.total_items} thông báo trong bộ lọc này</small></span><div><button className="resident-page-button" type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>← <span>Trước</span></button><button className="resident-page-button" type="button" disabled={loading || page >= meta.total_pages} onClick={() => setPage((current) => current + 1)}><span>Sau</span> →</button></div></div>}
        </section>

        <aside className="resident-panel resident-notice-settings" aria-labelledby="resident-notice-settings-title">
          <div className="resident-notice-panel-heading"><div><span className="resident-eyebrow">CÀI ĐẶT CỦA BẠN</span><h2 id="resident-notice-settings-title">Loại cập nhật</h2></div><span className="resident-notice-settings-mark"><NoticeBell small /></span></div>
          <p className="resident-notice-settings-intro">Lưu lựa chọn cho các nhóm cập nhật trong ứng dụng.</p>
          {preferencesError && <p className="resident-notice-settings-error" role="alert">{preferencesError} <button type="button" onClick={() => setPreferencesRetry((value) => value + 1)}>Thử tải lại</button></p>}
          {preferencesLoading && <p className="resident-notice-settings-loading" role="status">Đang tải cài đặt…</p>}
          {!preferencesLoading && draftPreferences && <div className="resident-notice-settings-list">
            {preferenceOptions.map(({ key, label, description }) => <label className="resident-notice-setting" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={draftPreferences[key] ?? true} disabled={preferencesSaving || Boolean(preferencesError)} onChange={(event) => changePreference(key, event.target.checked)} /><i aria-hidden="true" /></label>)}
          </div>}
          <div className="resident-notice-settings-actions"><button className="resident-primary-button" type="button" disabled={!hasPreferenceChanges || preferencesSaving || preferencesLoading || Boolean(preferencesError)} onClick={() => void savePreferences()}>{preferencesSaving ? "Đang lưu…" : "Lưu tùy chọn"}</button>{preferencesSaved && <span role="status">Đã lưu cài đặt.</span>}</div>
          <p className="resident-notice-settings-note">Cài đặt được lưu theo tài khoản; luồng gửi từng nhóm cần được tích hợp tương ứng. V1 không gửi email hoặc thông báo đẩy.</p>
        </aside>
      </div>

      <section className="resident-panel resident-feedback-panel" aria-labelledby="resident-feedback-title">
        <div className="resident-notice-panel-heading"><div><span className="resident-eyebrow">KẾT NỐI VỚI CHỦ TRỌ</span><h2 id="resident-feedback-title">Gửi phản hồi</h2></div></div>
        <p className="resident-notice-settings-intro">Góp ý hoặc báo vấn đề liên quan đến nơi ở. Chủ trọ sẽ nhận thông báo trong khu vực quản trị.</p>
        {feedbackError && <p className="resident-notice-feedback is-error" role="alert">{feedbackError}</p>}{feedbackMessage && <p className="resident-notice-feedback" role="status">{feedbackMessage}</p>}
        <form className="resident-feedback-form" onSubmit={(event) => void submitFeedback(event)}>
          <label>Loại phản hồi<select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)}><option>Góp ý dịch vụ</option><option>Vấn đề nơi ở</option><option>Hóa đơn</option><option>Khác</option></select></label>
          <label>Nội dung<textarea value={feedbackContent} minLength={5} maxLength={5000} required rows={4} onChange={(event) => setFeedbackContent(event.target.value)} placeholder="Bạn muốn góp ý hoặc báo vấn đề gì?" /></label>
          <button className="resident-primary-button" type="submit" disabled={feedbackPending || feedbackContent.trim().length < 5}>{feedbackPending ? "Đang gửi…" : "Gửi phản hồi"}</button>
        </form>
      </section>

      <footer className="resident-footer"><span className="resident-footer-mark"><NoticeBell small /></span><span>Góc Trọ <b>·</b> Cổng cư dân</span><span className="resident-footer-caption">Một góc yên tâm.</span></footer>
    </div>
  </main>;
}
