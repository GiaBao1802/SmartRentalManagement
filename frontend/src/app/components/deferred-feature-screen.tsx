import Link from "next/link";

export type DeferredFeature = {
  title: string;
  description: string;
  futureScope: string;
  backHref?: string;
  backLabel?: string;
  badge?: string;
};

export const DEFERRED_FEATURES = {
  amenityCalendar: {
    title: "Lịch tiện ích",
    badge: "Phiên bản sau",
    description: "Chức năng Lịch tiện ích đang được phát triển và sẽ được mở trong phiên bản tiếp theo.",
    futureScope: "Trong phiên bản sau, cư dân có thể đăng ký hoặc chọn lịch cho các tiện ích/dịch vụ có lịch như Spa, Room Care và các tiện ích tương tự.",
    backHref: "/admin/services/utilities",
    backLabel: "Quay lại Dịch vụ & Tiện ích",
  },
  complaints: {
    title: "Khiếu nại",
    badge: "Phiên bản sau",
    description: "Chức năng Khiếu nại sẽ được hoàn thiện trong phiên bản tiếp theo.",
    futureScope: "Workflow tiếp nhận, xử lý, trạng thái và lịch sử khiếu nại chưa được mở trong phiên bản hiện tại.",
  },
} as const satisfies Record<string, DeferredFeature>;

export default function DeferredFeatureScreen({
  title,
  description,
  futureScope,
  backHref,
  backLabel,
  badge = "Phiên bản sau",
}: DeferredFeature) {
  return <main className="admin-main deferred-feature-page">
    <div className="breadcrumb">{title}</div>
    <section className="admin-card deferred-feature-card" aria-labelledby="deferred-feature-title">
      <span className="deferred-feature-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l2.5 2.5M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
      </span>
      <span className="chip neutral deferred-feature-badge">{badge}</span>
      <h1 id="deferred-feature-title">{title}</h1>
      <p className="deferred-feature-description">{description}</p>
      <p className="deferred-feature-scope">{futureScope}</p>
      {backHref && backLabel && <Link className="button deferred-feature-back" href={backHref}>{backLabel}</Link>}
    </section>
  </main>;
}
