"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { propertyServiceApi, type PropertyPricingItem, type ServiceKind } from "../../../lib/api/propertyServiceApi";
import ServiceWorkspaceNav from "./service-workspace-nav";

const todayHcm = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const priceDate = (value: string) => { const [y, m, d] = value.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
async function allProperties() {
  const first = await propertyApi.list({ page: 1, page_size: 100 }); const rows = [...first.data];
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await propertyApi.list({ page, page_size: 100 })).data);
  return rows;
}
function currentVersion(item: PropertyPricingItem) { const date = todayHcm(); return item.price_versions.find((version) => version.effective_from <= date) ?? null; }
function errorMessage(error: unknown) { return error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Không thể hoàn tất thao tác."; }

export default function ServiceCatalog({ kind }: { kind: ServiceKind }) {
  const fixed = kind === "FIXED_SERVICE";
  const [properties, setProperties] = useState<Property[]>([]); const [propertyId, setPropertyId] = useState("");
  const [items, setItems] = useState<PropertyPricingItem[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ code: "", name: "", description: "", unit: fixed ? "kỳ" : "lần" });
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { effective_from: string; unit_price: string; source_name: string }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const loadItems = useCallback(async () => {
    if (!propertyId) { setItems([]); return; }
    setLoading(true); setError("");
    try { setItems((await propertyServiceApi.list(propertyId, kind)).items); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, [propertyId, kind]);
  useEffect(() => { void allProperties().then((rows) => { setProperties(rows); const requested = new URLSearchParams(window.location.search).get("property_id"); setPropertyId(rows.find((row) => row.property_id === requested)?.property_id ?? rows[0]?.property_id ?? ""); }).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false)); }, []);
  useEffect(() => { void loadItems(); }, [loadItems]);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!propertyId || saving) return; setSaving(true); setError(""); setNotice("");
    try { await propertyServiceApi.create(propertyId, { kind, code: draft.code.trim().toUpperCase(), name: draft.name.trim(), description: draft.description.trim() || undefined, unit: draft.unit.trim() }); setDraft({ code: "", name: "", description: "", unit: fixed ? "kỳ" : "lần" }); setNotice("Đã tạo dịch vụ trong khu vực."); await loadItems(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  }
  async function publish(event: FormEvent<HTMLFormElement>, item: PropertyPricingItem) {
    event.preventDefault(); if (saving) return; const input = priceDrafts[item.pricing_item_id] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" }; setSaving(true); setError(""); setNotice("");
    try { await propertyServiceApi.publishPrice(propertyId, item.pricing_item_id, kind, { effective_from: input.effective_from, unit_price: input.unit_price, source_name: input.source_name || undefined }); setNotice(`Đã phát hành phiên bản giá mới cho ${item.name}. Lịch sử cũ được giữ nguyên.`); setExpanded(null); await loadItems(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  }
  async function retire(item: PropertyPricingItem) {
    if (!window.confirm(`Ngưng hoạt động dịch vụ “${item.name}”? Lịch sử giá và hóa đơn đã chốt vẫn được giữ nguyên.`)) return;
    setSaving(true); setError(""); setNotice(""); try { await propertyServiceApi.retire(propertyId, item.pricing_item_id, kind); setNotice(`Đã ngưng hoạt động ${item.name}.`); await loadItems(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  }
  const selectedProperty = useMemo(() => properties.find((row) => row.property_id === propertyId), [properties, propertyId]);

  return <AdminShell active="/admin/services"><main className="admin-main utility-page service-management-page">
    <div className="breadcrumb"><Link href="/admin/services">Dịch vụ & Tiện ích</Link> · {fixed ? "Dịch vụ cố định" : "Tiện ích phát sinh"}</div>
    <div className="page-heading"><div><h1>{fixed ? "Dịch vụ cố định" : "Tiện ích phát sinh"}</h1><p>{fixed ? "Áp dụng theo từng phòng đủ điều kiện trong khu vực; tính trọn kỳ hóa đơn, không chia ngày." : "Quản lý danh mục và giá hiệu lực. Khoản thu chỉ phát sinh khi có lượt sử dụng hợp lệ."}</p></div></div>
    <ServiceWorkspaceNav active={fixed ? "fixed" : "flexible"} />
    <section className="admin-card utility-property-select"><div className="utility-property-field"><label htmlFor="service-property">Khu vực</label><select id="service-property" value={propertyId} disabled={!properties.length || saving} onChange={(event) => setPropertyId(event.target.value)}><option value="">{properties.length ? "Chọn khu vực" : "Chưa có khu vực"}</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}</select><small>Phạm vi Owner lấy từ phiên đăng nhập.</small></div></section>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
    <section className="admin-card utility-section"><div className="utility-section-heading"><div><h2>{selectedProperty?.name ?? "Danh sách dịch vụ"}</h2><p>{fixed ? "Mỗi dịch vụ có một giá hiệu lực theo ngày bắt đầu kỳ hóa đơn." : "Giá áp dụng theo ngày phát sinh, theo lịch Việt Nam."}</p></div><span className="chip neutral">{items.length} dịch vụ</span></div>
      {loading ? <p className="utility-empty" role="status">Đang tải danh sách…</p> : items.length === 0 ? <p className="utility-empty">Khu vực chưa có dịch vụ thuộc nhóm này.</p> : <div className="table-wrap"><table className="service-table"><thead><tr><th>Dịch vụ</th><th>Đơn vị</th><th>Trạng thái</th><th>Giá hiện tại</th><th>Phiên bản</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => { const current = currentVersion(item); return <tr key={item.pricing_item_id}><td><strong>{item.name}</strong><small>{item.code}{item.description ? ` · ${item.description}` : ""}</small></td><td>{item.unit}</td><td><span className={`chip ${item.status === "active" ? "success" : "neutral"}`}>{item.status === "active" ? "Đang hoạt động" : "Ngưng hoạt động"}</span></td><td>{current ? <><strong>{money(current.unit_price)}</strong><small>Hiệu lực {priceDate(current.effective_from)}</small></> : <span className="chip warning">Chưa có giá hiệu lực</span>}</td><td>{item.price_versions.length} phiên bản</td><td><div className="service-row-actions"><button className="button" type="button" onClick={() => setExpanded(expanded === item.pricing_item_id ? null : item.pricing_item_id)}>{expanded === item.pricing_item_id ? "Đóng" : "Giá & lịch sử"}</button>{item.status === "active" && <button className="button danger-button" type="button" disabled={saving} onClick={() => void retire(item)}>Ngưng</button>}</div></td></tr>; })}</tbody></table></div>}
    </section>
    {expanded && items.find((item) => item.pricing_item_id === expanded) && (() => { const item = items.find((row) => row.pricing_item_id === expanded)!; const priceDraft = priceDrafts[item.pricing_item_id] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" }; const updatePriceDraft = (field: "effective_from" | "unit_price" | "source_name", value: string) => setPriceDrafts((current) => ({ ...current, [item.pricing_item_id]: { ...(current[item.pricing_item_id] ?? { effective_from: todayHcm(), unit_price: "", source_name: "" }), [field]: value } })); return <section className="admin-card utility-section" aria-label={`Lịch sử giá ${item.name}`}><div className="utility-section-heading"><div><h2>Giá và lịch sử · {item.name}</h2><p>Phiên bản đã phát hành không thể sửa. Mỗi ngày hiệu lực chỉ có một mức giá.</p></div></div>{item.price_versions.length > 0 ? <div className="table-wrap"><table className="service-table"><thead><tr><th>Phiên bản</th><th>Hiệu lực từ</th><th>Đơn giá</th><th>Nguồn</th><th>Đã phát hành</th></tr></thead><tbody>{item.price_versions.map((version) => <tr key={version.price_version_id}><td>#{version.version_no}</td><td>{priceDate(version.effective_from)}</td><td><strong>{money(version.unit_price)}</strong> / {item.unit}</td><td>{version.source_name ?? "—"}</td><td>{new Date(version.published_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td></tr>)}</tbody></table></div> : <p className="utility-empty">Chưa có phiên bản giá.</p>}{item.status === "active" && <form className="service-price-form" onSubmit={(event) => void publish(event, item)}><h3>Phát hành giá mới</h3><div className="utility-form-grid"><label>Ngày hiệu lực *<input required type="date" value={priceDraft.effective_from} disabled={saving} onChange={(event) => updatePriceDraft("effective_from", event.target.value)} /></label><label>Đơn giá (VND / {item.unit}) *<input required type="number" min="0" step="1" value={priceDraft.unit_price} disabled={saving} onChange={(event) => updatePriceDraft("unit_price", event.target.value)} /></label><label className="wide-field">Nguồn / ghi chú<input maxLength={200} value={priceDraft.source_name} disabled={saving} onChange={(event) => updatePriceDraft("source_name", event.target.value)} /></label></div><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang phát hành…" : "Phát hành phiên bản giá"}</button></form>}</section>; })()}
    <section className="admin-card utility-section"><div className="utility-section-heading"><div><h2>{fixed ? "Tạo dịch vụ cố định" : "Tạo tiện ích phát sinh"}</h2><p>{fixed ? "Tạo cấu hình dùng cho các kỳ hóa đơn tiếp theo." : "Danh mục do Admin quản lý; khoản thu gắn với lượt sử dụng hợp lệ."}</p></div></div><form onSubmit={(event) => void createItem(event)}><div className="utility-form-grid"><label>{fixed ? "Mã dịch vụ" : "Mã tiện ích"} *<input required maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={draft.code} disabled={saving} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label><label>{fixed ? "Tên dịch vụ" : "Tên tiện ích"} *<input required maxLength={150} value={draft.name} disabled={saving} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Đơn vị *<input required maxLength={30} placeholder={fixed ? "kỳ" : "lần, giờ, kg…"} value={draft.unit} disabled={saving} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} /></label><label>Mô tả<input maxLength={10000} value={draft.description} disabled={saving} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div><button className="button primary" type="submit" disabled={saving || !propertyId}>{saving ? "Đang lưu…" : fixed ? "Tạo dịch vụ cố định" : "Tạo tiện ích"}</button></form></section>
  </main></AdminShell>;
}
