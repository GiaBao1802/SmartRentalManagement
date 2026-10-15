"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../../lib/api/errors";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { propertyServiceApi, type PropertyPricingItem } from "../../../lib/api/propertyServiceApi";
import { utilityTariffApi, type UtilityTariff } from "../../../lib/api/utilityTariffApi";

async function allProperties() {
  const first = await propertyApi.list({ page: 1, page_size: 100 });
  const rows = [...first.data];
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await propertyApi.list({ page, page_size: 100 })).data);
  return rows;
}

const todayHcm = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const currentUtilityVersion = (tariff: UtilityTariff) => [...tariff.versions].filter((version) => version.effective_from.slice(0, 10) <= todayHcm()).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
const errorText = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Không thể tải dữ liệu dịch vụ.";

export default function ServiceOverview() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [utilities, setUtilities] = useState<UtilityTariff[]>([]);
  const [fixed, setFixed] = useState<PropertyPricingItem[]>([]);
  const [flexible, setFlexible] = useState<PropertyPricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void allProperties().then((rows) => {
      setProperties(rows);
      const requested = new URLSearchParams(window.location.search).get("property_id");
      setPropertyId(rows.find((row) => row.property_id === requested)?.property_id ?? rows[0]?.property_id ?? "");
    }).catch((reason) => setError(errorText(reason))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!propertyId) { setUtilities([]); setFixed([]); setFlexible([]); return; }
    let cancelled = false;
    setLoading(true); setError("");
    void Promise.all([
      utilityTariffApi.getForProperty(propertyId),
      propertyServiceApi.list(propertyId, "FIXED_SERVICE"),
      propertyServiceApi.list(propertyId, "FLEXIBLE_SERVICE"),
    ]).then(([utilityData, fixedData, flexibleData]) => {
      if (cancelled) return;
      setUtilities(utilityData.tariffs);
      setFixed(fixedData.items);
      setFlexible(flexibleData.items);
    }).catch((reason) => { if (!cancelled) setError(errorText(reason)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const selectedProperty = useMemo(() => properties.find((property) => property.property_id === propertyId), [properties, propertyId]);
  const activeFixed = fixed.filter((item) => item.status === "active");
  const activeFlexible = flexible.filter((item) => item.status === "active");
  const activeUtilities = utilities.filter((tariff) => tariff.status === "active");
  const currentUtilities = activeUtilities.filter(currentUtilityVersion);
  const withoutCurrentPrice = (items: PropertyPricingItem[]) => items.filter((item) => !item.current_price_version).length;
  const utilityConfigured = (kind: "ELECTRICITY" | "WATER") => currentUtilities.some((tariff) => tariff.utility_type === kind);

  return <section className="service-overview-content" aria-label="Tổng quan dịch vụ">
    <div className="admin-card utility-property-select service-overview-property">
      <label htmlFor="service-overview-property">Khu vực đang xem</label>
      <select id="service-overview-property" value={propertyId} disabled={!properties.length || loading} onChange={(event) => setPropertyId(event.target.value)}>
        <option value="">{properties.length ? "Chọn khu vực" : "Chưa có khu vực"}</option>
        {properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}
      </select>
      <small>Số liệu bên dưới lấy trực tiếp từ cấu hình của khu vực đang chọn.</small>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {loading ? <p className="utility-empty" role="status">Đang tải cấu hình dịch vụ…</p> : !propertyId ? <p className="utility-empty">Chưa có khu vực để hiển thị cấu hình.</p> : <div className="service-overview-grid">
      <article className="admin-card service-overview-card">
        <span className="service-overview-mark" aria-hidden="true">ϟ</span><h2>Điện & nước</h2>
        <p>{selectedProperty?.name}</p>
        <ul className="service-overview-status-list">
          <li><span>Điện</span><strong className={utilityConfigured("ELECTRICITY") ? "text-success" : "text-warning"}>{utilityConfigured("ELECTRICITY") ? "Đã có giá hiệu lực" : "Thiếu giá hiệu lực"}</strong></li>
          <li><span>Nước</span><strong className={utilityConfigured("WATER") ? "text-success" : "text-warning"}>{utilityConfigured("WATER") ? "Đã có giá hiệu lực" : "Thiếu giá hiệu lực"}</strong></li>
        </ul>
        <Link className="service-overview-link" href={`/admin/services/utilities?property_id=${encodeURIComponent(propertyId)}`}>Cấu hình điện & nước →</Link>
      </article>
      <article className="admin-card service-overview-card">
        <span className="service-overview-mark" aria-hidden="true">≡</span><h2>Dịch vụ cố định</h2>
        <p>{activeFixed.length} dịch vụ đang hoạt động</p>
        <p className={withoutCurrentPrice(activeFixed) ? "text-warning" : "text-success"}>{withoutCurrentPrice(activeFixed) ? `${withoutCurrentPrice(activeFixed)} dịch vụ chưa có giá hiệu lực` : "Các dịch vụ đang hoạt động đều có giá hiệu lực"}</p>
        <Link className="service-overview-link" href={`/admin/services/fixed?property_id=${encodeURIComponent(propertyId)}`}>Quản lý dịch vụ cố định →</Link>
      </article>
      <article className="admin-card service-overview-card">
        <span className="service-overview-mark" aria-hidden="true">✳</span><h2>Tiện ích phát sinh</h2>
        <p>{activeFlexible.length} tiện ích đang hoạt động</p>
        <p className={withoutCurrentPrice(activeFlexible) ? "text-warning" : "text-success"}>{withoutCurrentPrice(activeFlexible) ? `${withoutCurrentPrice(activeFlexible)} tiện ích chưa có giá hiệu lực` : "Các tiện ích đang hoạt động đều có giá hiệu lực"}</p>
        <Link className="service-overview-link" href={`/admin/services/flexible?property_id=${encodeURIComponent(propertyId)}`}>Quản lý tiện ích phát sinh →</Link>
      </article>
      <article className="admin-card service-overview-card service-coming-soon">
        <span className="chip success">Đang hoạt động</span><h2>Parking</h2>
        <p>Quản lý cấp slot và khoản phí bãi xe sẽ nằm trong workspace này.</p>
        <Link className="service-overview-link" href="/admin/services/parking">Quản lý Parking →</Link>
      </article>
      <article className="admin-card service-overview-card">
        <span className="service-overview-mark" aria-hidden="true">₫</span><h2>Kết nối hóa đơn</h2>
        <p>Khả năng chốt hóa đơn được kiểm tra theo từng hợp đồng và kỳ; cấu hình thiếu sẽ hiện thành mục cần xử lý.</p>
        <Link className="service-overview-link" href="/admin/billing">Mở vận hành hóa đơn →</Link>
      </article>
      <p className="service-overview-source">Đang xem cấu hình của {selectedProperty?.name}. Số liệu chỉ gồm dữ liệu API trả về cho khu vực này.</p>
    </div>}
  </section>;
}
