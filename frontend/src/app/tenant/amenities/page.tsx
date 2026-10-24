"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "../../components/brand-logo";
import { useAuth } from "../../components/auth-provider";
import { displayName } from "../../../lib/api/authApi";
import { ApiError } from "../../../lib/api/errors";
import { residentServiceApi, type ResidentService, type ResidentServiceProperty } from "../../../lib/api/residentServiceApi";
import ResidentPrimaryNavigation from "../resident-primary-navigation";

function message(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải danh sách tiện ích.";
}

function money(value: string) {
  try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`; }
  catch { return "Chưa có giá hiện hành"; }
}

function date(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toLocaleDateString("vi-VN");
}

function ServiceIcon({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={small ? "resident-amenity-icon is-small" : "resident-amenity-icon"}>
    <path d="M12 3.5 14.3 9l5.7 2.2-5.7 2.3-2.3 5.6-2.2-5.6L4 11.2 9.8 9 12 3.5Z" />
    <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" />
  </svg>;
}

function ServiceCard({ service, expanded, onToggle }: { service: ResidentService; expanded: boolean; onToggle: () => void }) {
  return <article className={`resident-amenity-card${expanded ? " is-expanded" : ""}`}>
    <div className="resident-amenity-card-top">
      <span className="resident-amenity-card-icon"><ServiceIcon /></span>
      <span className="resident-amenity-kind">Tiện ích phát sinh</span>
    </div>
    <h3>{service.name}</h3>
    <p className="resident-amenity-card-description">{service.description?.trim() || "Chủ trọ chưa thêm mô tả cho tiện ích này."}</p>
    <div className="resident-amenity-card-price">
      <span>Giá hiện hành</span>
      <strong>{service.current_price ? money(service.current_price.unit_price) : "Chưa có giá áp dụng"}</strong>
      {service.current_price && <small>{service.unit ? `/${service.unit}` : ""}</small>}
    </div>
    {expanded && <div className="resident-amenity-details">
      <div><span>Đơn vị tính</span><strong>{service.unit || "Chưa cập nhật"}</strong></div>
      {service.current_price && <div><span>Áp dụng từ</span><strong>{date(service.current_price.effective_from) || "Chưa xác định"}</strong></div>}
      <p>Thông tin này được đồng bộ từ danh mục tiện ích của khu trọ.</p>
    </div>}
    <button className="resident-amenity-detail-button" type="button" aria-expanded={expanded} onClick={onToggle}>
      {expanded ? "Thu gọn" : "Xem chi tiết"}<span aria-hidden="true">{expanded ? "−" : "＋"}</span>
    </button>
  </article>;
}

export default function ResidentAmenitiesPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const [groups, setGroups] = useState<ResidentServiceProperty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant%2Famenities");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
  }, [router, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setLoading(true);
    setError("");
    void residentServiceApi.list()
      .then((result) => { if (active) setGroups(result); })
      .catch((reason: unknown) => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, status, user]);

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy kiểm tra kết nối và thử lại."); }
    finally { setLogoutPending(false); }
  }

  const name = user ? displayName(user) : "Cư dân";
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join("").toUpperCase();
  const serviceCount = useMemo(() => groups?.reduce((sum, group) => sum + group.services.length, 0) ?? 0, [groups]);

  if (status === "loading" || (status === "authenticated" && user?.account.role === "resident" && loading && groups === null && !error)) {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ServiceIcon /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải tiện ích</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  }
  if (status !== "authenticated" || user?.account.role !== "resident") {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ServiceIcon /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang chuyển đến trang phù hợp</h1><p>Hệ thống đang kiểm tra phiên đăng nhập của bạn.</p><span className="resident-progress" aria-label="Đang chuyển trang" /></div></main>;
  }

  return <main className="tenant-page resident-home resident-amenities-page">
    <header className="tenant-header resident-topbar">
      <a href="/" aria-label="Trang chủ Góc Trọ"><BrandLogo /></a>
      <ResidentPrimaryNavigation active="amenities" />
      <div className="resident-topbar-actions"><span className="resident-user-avatar" aria-hidden="true">{initials}</span><div className="resident-user-copy"><strong>{name}</strong><span>Cư dân</span></div><button className="resident-logout-button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div>
    </header>

    <div className="tenant-content resident-layout resident-amenities-layout">
      <section className="resident-amenity-hero" aria-labelledby="resident-amenity-title">
        <div className="resident-amenity-hero-copy"><span className="resident-eyebrow">DỊCH VỤ DÀNH CHO NƠI Ở CỦA BẠN</span><h1 id="resident-amenity-title">Tiện ích</h1><p>Xem các tiện ích phát sinh đang được cung cấp tại khu trọ và thông tin giá hiện hành.</p></div>
        <div className="resident-amenity-hero-art" aria-hidden="true"><span className="resident-amenity-orbit orbit-one" /><span className="resident-amenity-orbit orbit-two" /><span className="resident-amenity-hero-icon"><ServiceIcon /></span><i className="resident-amenity-spark spark-one" /><i className="resident-amenity-spark spark-two" /></div>
        <div className="resident-amenity-hero-count"><strong>{groups === null || loading ? "…" : serviceCount}</strong><span>tiện ích đang mở</span></div>
      </section>

      {logoutError && <p className="notice resident-inline-notice" role="alert">{logoutError}</p>}

      <section className="resident-amenity-content" aria-label="Danh sách tiện ích">
        <div className="resident-amenity-section-heading"><div><span className="resident-eyebrow">THEO KHU TRỌ ĐANG CƯ TRÚ</span><h2>Tiện ích hiện có</h2></div><span className="resident-amenity-count-pill"><i />{groups === null || loading ? "Đang cập nhật" : `${serviceCount} dịch vụ`}</span></div>

        {error && <div className="resident-amenity-state is-error" role="alert"><span className="resident-amenity-state-icon"><ServiceIcon /></span><div><h3>Chưa tải được danh sách</h3><p>{error}</p><button className="resident-secondary-button" type="button" onClick={() => setRetry((current) => current + 1)}>Thử tải lại</button></div></div>}
        {!error && loading && groups === null && <div className="resident-amenity-state" role="status"><span className="resident-progress" aria-label="Đang tải" /><p>Đang tải danh mục tiện ích…</p></div>}
        {!error && !loading && groups?.length === 0 && <div className="resident-amenity-state"><span className="resident-amenity-state-icon"><ServiceIcon /></span><div><h3>Chưa có nơi ở đang hoạt động</h3><p>Danh sách tiện ích sẽ hiển thị khi tài khoản được liên kết với nơi ở hiện tại.</p></div></div>}

        {!error && !loading && groups && groups.length > 0 && <div className="resident-amenity-properties">
          {groups.map((group) => <section className="resident-amenity-property" key={group.property_id} aria-labelledby={`resident-amenity-property-${group.property_id}`}>
            <div className="resident-amenity-property-heading"><div><span className="resident-amenity-property-mark"><ServiceIcon small /></span><div><span className="resident-eyebrow">KHU TRỌ</span><h3 id={`resident-amenity-property-${group.property_id}`}>{group.property_name}</h3></div></div><span>{group.services.length} tiện ích</span></div>
            {group.services.length === 0
              ? <div className="resident-amenity-property-empty"><span>Chưa có tiện ích phát sinh được đăng tải tại khu trọ này.</span></div>
              : <div className="resident-amenity-grid">{group.services.map((service) => <ServiceCard key={service.service_id} service={service} expanded={expandedServiceId === service.service_id} onToggle={() => setExpandedServiceId((current) => current === service.service_id ? null : service.service_id)} />)}</div>}
          </section>)}
        </div>}
      </section>

      <footer className="resident-footer"><span className="resident-footer-mark"><ServiceIcon small /></span><span>Góc Trọ <b>·</b> Cổng cư dân</span><span className="resident-footer-caption">Một góc yên tâm.</span></footer>
    </div>
  </main>;
}
