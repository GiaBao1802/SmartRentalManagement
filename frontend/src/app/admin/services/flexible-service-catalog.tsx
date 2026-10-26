"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { propertyServiceApi, type FlexibleServiceConfiguration, type FlexibleServiceConfigurationInput, type PropertyPricingItem, type ServicePriceVersion } from "../../../lib/api/propertyServiceApi";
import ServiceWorkspaceNav from "./service-workspace-nav";

const weekdayOptions = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const todayHcm = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const priceDate = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; };
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
type ConfigurationDraft = { service_mode: "BOOKING" | "SUBSCRIPTION"; available_weekdays: number[]; opens_at: string; closes_at: string; slot_duration_minutes: string; capacity_per_slot: string; package_duration_count: string; package_duration_unit: "MONTH" | "YEAR" };
const blankConfiguration = (): ConfigurationDraft => ({ service_mode: "BOOKING", available_weekdays: [1, 2, 3, 4, 5, 6, 7], opens_at: "08:00", closes_at: "22:00", slot_duration_minutes: "60", capacity_per_slot: "1", package_duration_count: "1", package_duration_unit: "MONTH" });

async function allProperties() {
  const first = await propertyApi.list({ page: 1, page_size: 100 });
  const rows = [...first.data];
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await propertyApi.list({ page, page_size: 100 })).data);
  return rows;
}

function toConfigurationInput(draft: ConfigurationDraft): FlexibleServiceConfigurationInput {
  const common = { available_weekdays: draft.available_weekdays, opens_at: draft.opens_at, closes_at: draft.closes_at };
  if (draft.service_mode === "BOOKING") return { service_mode: "BOOKING", ...common, booking: { slot_duration_minutes: Number(draft.slot_duration_minutes), capacity_per_slot: Number(draft.capacity_per_slot) } };
  return { service_mode: "SUBSCRIPTION", ...common, subscription: { duration_count: Number(draft.package_duration_count), duration_unit: draft.package_duration_unit } };
}

function fromConfiguration(config: FlexibleServiceConfiguration | null) {
  const draft = blankConfiguration();
  if (!config) return draft;
  return {
    ...draft,
    service_mode: config.service_mode,
    available_weekdays: config.available_weekdays,
    opens_at: config.opens_at,
    closes_at: config.closes_at,
    slot_duration_minutes: config.booking ? String(config.booking.slot_duration_minutes) : draft.slot_duration_minutes,
    capacity_per_slot: config.booking ? String(config.booking.capacity_per_slot) : draft.capacity_per_slot,
    package_duration_count: config.subscription ? String(config.subscription.duration_count) : draft.package_duration_count,
    package_duration_unit: config.subscription?.duration_unit ?? draft.package_duration_unit,
  };
}

function currentVersion(item: PropertyPricingItem) {
  const today = todayHcm();
  return item.price_versions.find((version) => version.effective_from <= today) ?? null;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Không thể hoàn tất thao tác.";
}

function configSummary(config: FlexibleServiceConfiguration | null) {
  if (!config) return "Chưa cấu hình lịch hoặc gói";
  const hours = `${config.opens_at}–${config.closes_at}`;
  const days = config.available_weekdays.map((day) => weekdayOptions[day - 1]).join(", ");
  if (config.booking) return `Đặt lịch · ${config.booking.slot_duration_minutes} phút/lượt · tối đa ${config.booking.capacity_per_slot} người/lượt · ${hours}`;
  const subscription = config.subscription;
  const duration = subscription ? `${subscription.duration_count} ${subscription.duration_unit === "MONTH" ? "tháng" : "năm"}` : "Gói";
  return `Gói ${duration} · dùng ${hours} · ${days}`;
}

export default function FlexibleServiceCatalog() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [items, setItems] = useState<PropertyPricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ code: "", name: "", description: "" });
  const [configDraft, setConfigDraft] = useState(blankConfiguration());
  const [configTarget, setConfigTarget] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { effective_from: string; unit_price: string; source_name: string }>>({});
  const [priceTarget, setPriceTarget] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!propertyId) { setItems([]); return; }
    setLoading(true);
    setError("");
    try { setItems((await propertyServiceApi.list(propertyId, "FLEXIBLE_SERVICE")).items); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => {
    void allProperties()
      .then((rows) => {
        setProperties(rows);
        const requested = new URLSearchParams(window.location.search).get("property_id");
        setPropertyId(rows.find((row) => row.property_id === requested)?.property_id ?? rows[0]?.property_id ?? "");
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const selectedProperty = useMemo(() => properties.find((row) => row.property_id === propertyId), [properties, propertyId]);

  function toggleWeekday(day: number) {
    setConfigDraft((current) => ({
      ...current,
      available_weekdays: current.available_weekdays.includes(day)
        ? current.available_weekdays.filter((value) => value !== day)
        : [...current.available_weekdays, day].sort((a, b) => a - b),
    }));
  }

  function openConfiguration(item: PropertyPricingItem) {
    setConfigTarget(item.pricing_item_id);
    setConfigDraft(fromConfiguration(item.service_configuration));
    setPriceTarget(null);
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const created = await propertyServiceApi.create(propertyId, {
        kind: "FLEXIBLE_SERVICE",
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        service_configuration: toConfigurationInput(configDraft),
      });
      setDraft({ code: "", name: "", description: "" });
      setConfigDraft(blankConfiguration());
      setPriceTarget(created.pricing_item_id);
      setConfigTarget(null);
      setNotice("Đã tạo tiện ích phát sinh cùng lịch sử dụng. Thêm giá trong mục Giá & lịch sử.");
      await loadItems();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>, item: PropertyPricingItem) {
    event.preventDefault();
    if (!propertyId || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await propertyServiceApi.saveFlexibleConfiguration(propertyId, item.pricing_item_id, toConfigurationInput(configDraft));
      setNotice(`Đã lưu cấu hình cho ${item.name}.`);
      setConfigTarget(null);
      await loadItems();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>, item: PropertyPricingItem) {
    event.preventDefault();
    if (saving) return;
    const input = priceDrafts[item.pricing_item_id] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" };
    setSaving(true); setError(""); setNotice("");
    try {
      await propertyServiceApi.publishPrice(propertyId, item.pricing_item_id, "FLEXIBLE_SERVICE", {
        effective_from: input.effective_from,
        unit_price: input.unit_price,
        source_name: input.source_name || undefined,
      });
      setNotice(`Đã phát hành phiên bản giá mới cho ${item.name}. Lịch sử cũ được giữ nguyên.`);
      setPriceTarget(null);
      await loadItems();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function retire(item: PropertyPricingItem) {
    if (!window.confirm(`Ngưng hoạt động tiện ích phát sinh “${item.name}”? Lịch sử giá và hóa đơn đã chốt vẫn được giữ nguyên.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await propertyServiceApi.retire(propertyId, item.pricing_item_id, "FLEXIBLE_SERVICE");
      setNotice(`Đã ngưng hoạt động ${item.name}.`);
      await loadItems();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  function updatePriceDraft(itemId: string, field: "effective_from" | "unit_price" | "source_name", value: string) {
    setPriceDrafts((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" }), [field]: value },
    }));
  }

  function renderConfigurationFields(legacyMode: boolean) {
    return <>
      <fieldset className="flex-service-mode-fields" disabled={saving || legacyMode}>
        <legend>Kiểu sử dụng</legend>
        <div className="flex-service-mode-options">
          <label className={configDraft.service_mode === "BOOKING" ? "selected" : ""}>
            <input type="radio" name={configTarget ? `mode-${configTarget}` : "new-service-mode"} value="BOOKING" checked={configDraft.service_mode === "BOOKING"} onChange={() => setConfigDraft((value) => ({ ...value, service_mode: "BOOKING" }))} />
            <span><strong>Đặt lịch từng lượt</strong><small>Ví dụ: spa, dọn phòng, sửa chữa</small></span>
          </label>
          <label className={configDraft.service_mode === "SUBSCRIPTION" ? "selected" : ""}>
            <input type="radio" name={configTarget ? `mode-${configTarget}` : "new-service-mode"} value="SUBSCRIPTION" checked={configDraft.service_mode === "SUBSCRIPTION"} onChange={() => setConfigDraft((value) => ({ ...value, service_mode: "SUBSCRIPTION" }))} />
            <span><strong>Gói sử dụng</strong><small>Ví dụ: gym, hồ bơi, sân thể thao</small></span>
          </label>
        </div>
      </fieldset>
      {legacyMode && <p className="utility-note">Loại sử dụng đã khóa để giữ nguyên ý nghĩa các mức giá hiện tại.</p>}

      <fieldset className="flex-service-schedule-fields" disabled={saving}>
        <legend>Lịch mở cửa và khung giờ</legend>
        <div className="flex-service-weekdays" aria-label="Ngày mở cửa">
          {weekdayOptions.map((label, index) => <label key={label} className={configDraft.available_weekdays.includes(index + 1) ? "selected" : ""}>
            <input type="checkbox" checked={configDraft.available_weekdays.includes(index + 1)} onChange={() => toggleWeekday(index + 1)} />{label}
          </label>)}
        </div>
        <div className="utility-form-grid">
          <label>Giờ mở cửa *<input required type="time" value={configDraft.opens_at} onChange={(event) => setConfigDraft((value) => ({ ...value, opens_at: event.target.value }))} /></label>
          <label>Giờ đóng cửa *<input required type="time" value={configDraft.closes_at} onChange={(event) => setConfigDraft((value) => ({ ...value, closes_at: event.target.value }))} /></label>
        </div>
        <p className="utility-note">Khung giờ áp dụng cho các ngày đã chọn; giờ đóng cửa phải sau giờ mở cửa trong cùng ngày.</p>
      </fieldset>

      {configDraft.service_mode === "BOOKING" ? <div className="flex-service-mode-detail">
        <h3>Thông tin mỗi lượt đặt</h3>
        <div className="utility-form-grid">
          <label>Thời lượng mỗi lượt (phút) *<input required type="number" min="1" max="1440" step="1" value={configDraft.slot_duration_minutes} disabled={saving} onChange={(event) => setConfigDraft((value) => ({ ...value, slot_duration_minutes: event.target.value }))} /></label>
          <label>Sức chứa mỗi lượt (người) *<input required type="number" min="1" step="1" value={configDraft.capacity_per_slot} disabled={saving} onChange={(event) => setConfigDraft((value) => ({ ...value, capacity_per_slot: event.target.value }))} /></label>
        </div>
        <p className="utility-note">Sức chứa giới hạn số người trong cùng khung giờ. Khi Resident được triển khai, hệ thống sẽ chỉ xác nhận lượt còn chỗ.</p>
      </div> : <div className="flex-service-mode-detail">
        <h3>Thời hạn gói</h3>
        <div className="utility-form-grid">
          <label>Số lượng thời hạn *<input required type="number" min="1" step="1" value={configDraft.package_duration_count} disabled={saving} onChange={(event) => setConfigDraft((value) => ({ ...value, package_duration_count: event.target.value }))} /></label>
          <label>Đơn vị thời hạn *<select value={configDraft.package_duration_unit} disabled={saving} onChange={(event) => setConfigDraft((value) => ({ ...value, package_duration_unit: event.target.value as "MONTH" | "YEAR" }))}><option value="MONTH">Tháng</option><option value="YEAR">Năm</option></select></label>
        </div>
        <p className="utility-note">Người đăng ký dùng gói trong khung giờ này, không cần đặt từng lượt. Số người dùng gói có mặt cùng lúc chưa được giới hạn.</p>
      </div>}
    </>;
  }

  return <AdminShell active="/admin/services"><main className="admin-main utility-page service-management-page">
    <div className="breadcrumb"><Link href="/admin/services">Dịch vụ & Tiện ích</Link> · Tiện ích phát sinh</div>
    <div className="page-heading"><div><h1>Tiện ích phát sinh</h1><p>Tạo dịch vụ cần đặt lịch hoặc gói sử dụng theo thời hạn; mỗi loại có lịch, giá và cách dùng riêng.</p></div></div>
    <ServiceWorkspaceNav active="flexible" />
    <section className="admin-card utility-property-select"><div className="utility-property-field"><label htmlFor="service-property">Khu vực</label><select id="service-property" value={propertyId} disabled={!properties.length || saving} onChange={(event) => { setPropertyId(event.target.value); setPriceTarget(null); setConfigTarget(null); }}><option value="">{properties.length ? "Chọn khu vực" : "Chưa có khu vực"}</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}</select><small>Phạm vi Owner lấy từ phiên đăng nhập.</small></div></section>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}

    <section className="admin-card utility-section"><div className="utility-section-heading"><div><h2>{selectedProperty?.name ?? "Danh sách tiện ích phát sinh"}</h2><p>Đơn giá có hiệu lực theo ngày phát sinh; lịch sử giá đã phát hành được giữ nguyên.</p></div><span className="chip neutral">{items.length} dịch vụ</span></div>
      {loading ? <p className="utility-empty" role="status">Đang tải danh sách…</p> : items.length === 0 ? <p className="utility-empty">Khu vực chưa có tiện ích phát sinh.</p> : <div className="table-wrap"><table className="service-table flexible-service-table"><thead><tr><th>Tiện ích</th><th>Cách sử dụng</th><th>Trạng thái</th><th>Giá hiện tại</th><th>Phiên bản</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => {
        const current = currentVersion(item);
        const canConfigure = item.service_configuration !== null || item.price_versions.length === 0;
        return <tr key={item.pricing_item_id}>
          <td><strong>{item.name}</strong><small>{item.code}{item.description ? ` · ${item.description}` : ""}</small></td>
          <td><strong>{item.service_configuration?.service_mode === "BOOKING" ? "Đặt lịch" : item.service_configuration?.service_mode === "SUBSCRIPTION" ? "Gói đăng ký" : "Chưa cấu hình"}</strong><small>{configSummary(item.service_configuration)}</small></td>
          <td><span className={`chip ${item.status === "active" ? "success" : "neutral"}`}>{item.status === "active" ? "Đang hoạt động" : "Ngưng hoạt động"}</span></td>
          <td>{current ? <><strong>{money(current.unit_price)} / {item.unit}</strong><small>Hiệu lực {priceDate(current.effective_from)}</small></> : <span className="chip warning">Chưa có giá hiệu lực</span>}</td>
          <td>{item.price_versions.length} phiên bản</td>
          <td><div className="service-row-actions">
            <button className="button" type="button" onClick={() => { setPriceTarget(priceTarget === item.pricing_item_id ? null : item.pricing_item_id); setConfigTarget(null); }}>{priceTarget === item.pricing_item_id ? "Đóng giá" : "Giá & lịch sử"}</button>
            {item.status === "active" && canConfigure && <button className="button" type="button" onClick={() => openConfiguration(item)}>{item.service_configuration ? "Sửa lịch/gói" : "Cấu hình"}</button>}
            {item.status === "active" && !canConfigure && <span className="service-legacy-config" title="Giữ nguyên lịch sử giá cũ; tạo mục mới để chọn loại sử dụng.">Cần tạo mục mới để cấu hình</span>}
            {item.status === "active" && <button className="button danger-button" type="button" disabled={saving} onClick={() => void retire(item)}>Ngưng</button>}
          </div></td>
        </tr>;
      })}</tbody></table></div>}
    </section>

    {configTarget && items.find((item) => item.pricing_item_id === configTarget) && (() => {
      const item = items.find((row) => row.pricing_item_id === configTarget)!;
      return <section className="admin-card utility-section" aria-label={`Cấu hình ${item.name}`}>
        <div className="utility-section-heading"><div><h2>{item.service_configuration ? `Cấu hình · ${item.name}` : `Hoàn thiện cấu hình · ${item.name}`}</h2><p>{item.service_configuration ? "Cập nhật lịch hoặc thông số của cùng kiểu sử dụng." : "Chọn loại sử dụng, rồi khai báo ngày và giờ hoạt động."}</p></div><button className="button" type="button" onClick={() => setConfigTarget(null)}>Đóng</button></div>
        <form className="flexible-service-config-form" onSubmit={(event) => void saveConfiguration(event, item)}>
          {renderConfigurationFields(item.service_configuration !== null)}
          <button className="button primary" type="submit" disabled={saving || configDraft.available_weekdays.length === 0}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button>
        </form>
      </section>;
    })()}

    {priceTarget && items.find((item) => item.pricing_item_id === priceTarget) && (() => {
      const item = items.find((row) => row.pricing_item_id === priceTarget)!;
      const priceDraft = priceDrafts[item.pricing_item_id] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" };
      return <section className="admin-card utility-section" aria-label={`Lịch sử giá ${item.name}`}>
        <div className="utility-section-heading"><div><h2>Giá và lịch sử · {item.name}</h2><p>Phiên bản đã phát hành không thể sửa. Mỗi ngày hiệu lực chỉ có một mức giá.</p></div><button className="button" type="button" onClick={() => setPriceTarget(null)}>Đóng</button></div>
        {item.price_versions.length > 0 ? <div className="table-wrap"><table className="service-table service-price-history"><thead><tr><th>Phiên bản</th><th>Hiệu lực từ</th><th>Đơn giá</th><th>Nguồn</th><th>Đã phát hành</th></tr></thead><tbody>{item.price_versions.map((version: ServicePriceVersion) => <tr key={version.price_version_id}><td>#{version.version_no}</td><td>{priceDate(version.effective_from)}</td><td><strong>{money(version.unit_price)}</strong> / {item.unit}</td><td>{version.source_name ?? "—"}</td><td>{new Date(version.published_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td></tr>)}</tbody></table></div> : <p className="utility-empty">Chưa có phiên bản giá.</p>}
        {item.status === "active" && <form className="service-price-form" onSubmit={(event) => void publish(event, item)}><h3>Phát hành giá mới</h3><div className="utility-form-grid"><label>Ngày hiệu lực *<input required type="date" value={priceDraft.effective_from} disabled={saving} onChange={(event) => updatePriceDraft(item.pricing_item_id, "effective_from", event.target.value)} /></label><label>Đơn giá (VND / {item.unit}) *<input required type="number" min="0" step="1" value={priceDraft.unit_price} disabled={saving} onChange={(event) => updatePriceDraft(item.pricing_item_id, "unit_price", event.target.value)} /></label><label className="wide-field">Nguồn / ghi chú<input maxLength={200} value={priceDraft.source_name} disabled={saving} onChange={(event) => updatePriceDraft(item.pricing_item_id, "source_name", event.target.value)} /></label></div><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang phát hành…" : "Phát hành phiên bản giá"}</button></form>}
      </section>;
    })()}

    <section className="admin-card utility-section" id="create-flexible-service"><div className="utility-section-heading"><div><h2>Tạo dịch vụ hoặc gói</h2><p>Tạo xong, hãy mở “Giá & lịch sử” để phát hành giá. Cấu hình và danh mục được lưu cho khu vực đã chọn.</p></div></div>
      <form className="flexible-service-config-form" onSubmit={(event) => void createItem(event)}>
        <div className="utility-form-grid"><label>Mã dịch vụ *<input required maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={draft.code} disabled={saving} onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))} /></label><label>Tên dịch vụ *<input required maxLength={150} value={draft.name} disabled={saving} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label><label className="wide-field">Mô tả<input maxLength={10000} value={draft.description} disabled={saving} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label></div>
        {renderConfigurationFields(false)}
        <button className="button primary" type="submit" disabled={saving || !propertyId || configDraft.available_weekdays.length === 0}>{saving ? "Đang tạo…" : configDraft.service_mode === "BOOKING" ? "Tạo dịch vụ đặt lịch" : "Tạo gói sử dụng"}</button>
      </form>
    </section>
  </main></AdminShell>;
}
