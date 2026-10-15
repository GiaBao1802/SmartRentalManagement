"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminShell from "../../../components/admin-shell";
import { contractApi, type ContractResource } from "../../../../lib/api/contractApi";
import { contractErrorMessage, contractStatusLabel } from "../../../../lib/api/contractView";
import { propertyApi, type Property } from "../../../../lib/api/propertyApi";
import { utilityTariffApi, type ElectricityTier, type UtilityKind, type UtilityTariff, type UtilityTariffProperty } from "../../../../lib/api/utilityTariffApi";
import ServiceWorkspaceNav from "../service-workspace-nav";

type TierDraft = { lower_kwh: string; upper_kwh: string; unit_price: string };
const blankTier = (): TierDraft => ({ lower_kwh: "0", upper_kwh: "", unit_price: "" });
const businessToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
async function collect<T>(load: (page: number) => Promise<{ data: T[]; meta: { total_pages: number } }>) {
  const first = await load(1); const rows = [...first.data];
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await load(page)).data);
  return rows;
}
function dateLabel(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }
function activeTariff(config: UtilityTariffProperty | null, type: UtilityKind): UtilityTariff | null {
  return config?.tariffs.find((tariff) => tariff.utility_type === type && tariff.status === "active") ?? null;
}
function currentVersion(tariff: UtilityTariff | null) {
  const today = businessToday();
  return tariff?.versions.filter((version) => version.published_at && version.effective_from.slice(0, 10) <= today)
    .sort((left, right) => right.effective_from.localeCompare(left.effective_from) || right.version_no - left.version_no)[0] ?? null;
}
function formatPrice(value: string | null, suffix = "đ") { return value === null ? "—" : `${new Intl.NumberFormat("vi-VN").format(Number(value))} ${suffix}`; }
function statusFor(version: { effective_from: string; published_at: string | null }, selected: boolean) {
  if (!version.published_at) return "Chưa phát hành";
  if (selected) return "Đang áp dụng theo ngày Việt Nam";
  if (version.effective_from.slice(0, 10) > businessToday()) return "Đã phát hành · chờ hiệu lực";
  return "Lịch sử";
}

function TariffHistory({ type, tariff }: { type: UtilityKind; tariff: UtilityTariff | null }) {
  const selected = currentVersion(tariff);
  if (!tariff?.versions.length) return <p className="utility-empty">Chưa có phiên bản giá. Tạo phiên bản đầu tiên bên dưới.</p>;
  return <div className="utility-history-list">{tariff.versions.map((version) => <details className="utility-history-item" key={version.utility_tariff_version_id} open={version.utility_tariff_version_id === selected?.utility_tariff_version_id}>
    <summary><span><strong>Phiên bản {version.version_no}</strong><small>Hiệu lực từ {dateLabel(version.effective_from)}</small></span><span className={`chip ${version.utility_tariff_version_id === selected?.utility_tariff_version_id ? "success" : "neutral"}`}>{statusFor(version, version.utility_tariff_version_id === selected?.utility_tariff_version_id)}</span></summary>
    {type === "WATER" ? <p className="utility-current-price">{formatPrice(version.flat_unit_price, "đ/m³")}</p> : <div className="table-wrap"><table className="utility-tier-table"><thead><tr><th>Bậc</th><th>Khoảng dùng</th><th>Đơn giá</th></tr></thead><tbody>{version.tiers.map((tier: ElectricityTier) => <tr key={tier.electricity_tariff_tier_id}><td>{tier.tier_no}</td><td>{tier.lower_kwh} – {tier.upper_kwh ?? "∞"} kWh</td><td>{formatPrice(tier.unit_price, "đ/kWh")}</td></tr>)}</tbody></table></div>}
    {(version.source_name || version.source_reference) && <p className="utility-source">Nguồn: {version.source_name ?? "—"}{version.source_reference ? ` · ${version.source_reference}` : ""}</p>}
  </details>)}</div>;
}

export default function UtilityManagement() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [config, setConfig] = useState<UtilityTariffProperty | null>(null);
  const [contracts, setContracts] = useState<ContractResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<UtilityKind | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [electricity, setElectricity] = useState({ effective_from: businessToday(), source_name: "", source_reference: "", tiers: [blankTier()] });
  const [water, setWater] = useState({ effective_from: businessToday(), source_name: "", source_reference: "", flat_unit_price: "" });

  const loadProperties = useCallback(async () => {
    const rows = await collect((page) => propertyApi.list({ page, page_size: 100 }));
    setProperties(rows);
    const requested = new URLSearchParams(window.location.search).get("property_id");
    const chosen = rows.find((property) => property.property_id === requested) ?? rows[0];
    setPropertyId(chosen?.property_id ?? "");
  }, []);
  useEffect(() => { void loadProperties().catch((reason) => setError(contractErrorMessage(reason, "Không tải được danh sách khu vực."))).finally(() => setLoading(false)); }, [loadProperties]);

  const loadSelected = useCallback(async () => {
    if (!propertyId) { setConfig(null); setContracts([]); return; }
    setLoading(true); setError("");
    try {
      const [nextConfig, allContracts] = await Promise.all([
        utilityTariffApi.getForProperty(propertyId),
        collect((page) => contractApi.list({ page, page_size: 100, property_id: propertyId })),
      ]);
      setConfig(nextConfig); setContracts(allContracts.filter((contract) => contract.status === "draft" || contract.status === "active"));
    } catch (reason) { setError(contractErrorMessage(reason, "Không tải được biểu giá hoặc hồ sơ hợp đồng.")); }
    finally { setLoading(false); }
  }, [propertyId]);
  useEffect(() => { void loadSelected(); }, [loadSelected]);

  const electricityTariff = useMemo(() => activeTariff(config, "ELECTRICITY"), [config]);
  const waterTariff = useMemo(() => activeTariff(config, "WATER"), [config]);
  const currentElectricity = currentVersion(electricityTariff);
  const currentWater = currentVersion(waterTariff);

  async function saveElectricity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!propertyId || saving) return;
    if (!electricity.tiers.length || electricity.tiers.some((tier) => tier.unit_price === "" || tier.lower_kwh === "")) { setError("Nhập đầy đủ ngưỡng và đơn giá cho từng bậc."); return; }
    setSaving("ELECTRICITY"); setError(""); setNotice("");
    try {
      await utilityTariffApi.publishElectricity(propertyId, { effective_from: electricity.effective_from, source_name: electricity.source_name || undefined, source_reference: electricity.source_reference || undefined, tiers: electricity.tiers.map((tier, index) => ({ tier_no: index + 1, lower_kwh: tier.lower_kwh.trim(), upper_kwh: tier.upper_kwh.trim() || null, unit_price: tier.unit_price.trim() })) });
      setNotice("Đã phát hành phiên bản biểu giá điện. Các kỳ hóa đơn chọn theo ngày bắt đầu kỳ."); await loadSelected();
    } catch (reason) { setError(contractErrorMessage(reason, "Không thể phát hành biểu giá điện.")); }
    finally { setSaving(null); }
  }
  async function saveWater(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!propertyId || saving) return;
    setSaving("WATER"); setError(""); setNotice("");
    try {
      await utilityTariffApi.publishWater(propertyId, { effective_from: water.effective_from, source_name: water.source_name || undefined, source_reference: water.source_reference || undefined, flat_unit_price: water.flat_unit_price.trim() });
      setNotice("Đã phát hành phiên bản giá nước. Các kỳ hóa đơn chọn theo ngày bắt đầu kỳ."); await loadSelected();
    } catch (reason) { setError(contractErrorMessage(reason, "Không thể phát hành giá nước.")); }
    finally { setSaving(null); }
  }

  return <AdminShell active="/admin/services"><main className="admin-main utility-page">
    <div className="breadcrumb">Dịch vụ & Tiện ích · Điện & nước</div>
    <div className="page-heading"><div><h1>Điện & nước</h1><p>Quản lý biểu giá theo từng khu vực và theo dõi nguồn chỉ số đầu kỳ của hợp đồng.</p></div></div>
    <ServiceWorkspaceNav active="utilities" />
    <section className="admin-card utility-property-select"><div className="utility-property-field"><label htmlFor="utility-property">Khu vực</label><select id="utility-property" value={propertyId} disabled={loading || properties.length === 0} onChange={(event) => setPropertyId(event.target.value)}><option value="">{properties.length ? "Chọn khu vực" : "Chưa có khu vực trong tài khoản"}</option>{properties.map((property) => <option key={property.property_id} value={property.property_id}>{property.name} · {property.province}</option>)}</select><small>Quyền truy cập và phạm vi dữ liệu do phiên Admin xác định.</small></div></section>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
    {propertyId && <div className="utility-grid">
      <section className="admin-card utility-section" id="electricity"><div className="utility-section-heading"><div><h2>Biểu giá điện</h2><p>Giá lũy tiến theo kWh; mỗi phiên bản giữ nguyên sau khi phát hành.</p></div><span className={`chip ${currentElectricity ? "success" : "warning"}`}>{currentElectricity ? `Đang áp dụng · từ ${dateLabel(currentElectricity.effective_from)}` : "Chưa có giá hiệu lực"}</span></div>
        <TariffHistory type="ELECTRICITY" tariff={electricityTariff} />
        <details className="utility-editor"><summary>Tạo và phát hành phiên bản điện</summary><form onSubmit={saveElectricity}><div className="utility-form-grid"><label>Ngày hiệu lực *<input required type="date" value={electricity.effective_from} disabled={saving !== null} onChange={(event) => setElectricity({ ...electricity, effective_from: event.target.value })} /></label><label>Nguồn giá<input maxLength={200} value={electricity.source_name} disabled={saving !== null} onChange={(event) => setElectricity({ ...electricity, source_name: event.target.value })} /></label><label className="wide-field">Tham chiếu / ghi chú nguồn<input maxLength={10000} value={electricity.source_reference} disabled={saving !== null} onChange={(event) => setElectricity({ ...electricity, source_reference: event.target.value })} /></label></div>
          <div className="utility-tier-editor"><div className="utility-subheading"><h3>Các bậc điện</h3><button className="button" type="button" disabled={saving !== null || electricity.tiers.length >= 20} onClick={() => setElectricity({ ...electricity, tiers: [...electricity.tiers, { lower_kwh: electricity.tiers.at(-1)?.upper_kwh ?? "", upper_kwh: "", unit_price: "" }] })}>+ Thêm bậc</button></div>{electricity.tiers.map((tier, index) => <div className="utility-tier-row" key={index}><strong>Bậc {index + 1}</strong><label>Từ kWh<input required inputMode="decimal" value={tier.lower_kwh} disabled={saving !== null || index === 0} onChange={(event) => setElectricity({ ...electricity, tiers: electricity.tiers.map((row, i) => i === index ? { ...row, lower_kwh: event.target.value } : row) })} /></label><label>Đến kWh<input inputMode="decimal" placeholder={index === electricity.tiers.length - 1 ? "Không giới hạn" : "Nhập ngưỡng"} value={tier.upper_kwh} disabled={saving !== null || index === electricity.tiers.length - 1} onChange={(event) => setElectricity({ ...electricity, tiers: electricity.tiers.map((row, i) => i === index ? { ...row, upper_kwh: event.target.value } : i === index + 1 ? { ...row, lower_kwh: event.target.value } : row) })} /></label><label>VND/kWh *<input required type="number" min="0" step="1" value={tier.unit_price} disabled={saving !== null} onChange={(event) => setElectricity({ ...electricity, tiers: electricity.tiers.map((row, i) => i === index ? { ...row, unit_price: event.target.value } : row) })} /></label>{electricity.tiers.length > 1 && <button className="button danger-button" type="button" aria-label={`Xóa bậc ${index + 1}`} disabled={saving !== null} onClick={() => setElectricity({ ...electricity, tiers: electricity.tiers.filter((_, i) => i !== index) })}>Xóa</button>}</div>)}</div>
          <p className="utility-note">Các bậc phải liền nhau; chỉ bậc cuối được để ngỏ. Sau phát hành, tier không thể sửa hoặc xóa.</p><button className="button primary" type="submit" disabled={saving !== null}>{saving === "ELECTRICITY" ? "Đang phát hành…" : "Phát hành phiên bản điện"}</button></form></details>
      </section>
      <section className="admin-card utility-section" id="water"><div className="utility-section-heading"><div><h2>Giá nước</h2><p>Đơn giá cố định theo m³; không có bậc giá.</p></div><span className={`chip ${currentWater ? "success" : "warning"}`}>{currentWater ? `Đang áp dụng · từ ${dateLabel(currentWater.effective_from)}` : "Chưa có giá hiệu lực"}</span></div>
        <TariffHistory type="WATER" tariff={waterTariff} />
        <details className="utility-editor"><summary>Tạo và phát hành phiên bản nước</summary><form onSubmit={saveWater}><div className="utility-form-grid"><label>Ngày hiệu lực *<input required type="date" value={water.effective_from} disabled={saving !== null} onChange={(event) => setWater({ ...water, effective_from: event.target.value })} /></label><label>Đơn giá (VND/m³) *<input required type="number" min="0" step="1" value={water.flat_unit_price} disabled={saving !== null} onChange={(event) => setWater({ ...water, flat_unit_price: event.target.value })} /></label><label>Nguồn giá<input maxLength={200} value={water.source_name} disabled={saving !== null} onChange={(event) => setWater({ ...water, source_name: event.target.value })} /></label><label className="wide-field">Tham chiếu / ghi chú nguồn<input maxLength={10000} value={water.source_reference} disabled={saving !== null} onChange={(event) => setWater({ ...water, source_reference: event.target.value })} /></label></div><p className="utility-note">Phiên bản giá đã phát hành là lịch sử bất biến. Dùng phiên bản mới để thay đổi giá.</p><button className="button primary" type="submit" disabled={saving !== null}>{saving === "WATER" ? "Đang phát hành…" : "Phát hành phiên bản nước"}</button></form></details>
      </section>
      <section className="admin-card utility-section utility-meter-section" id="meter-source"><div className="utility-section-heading"><div><h2>Nguồn chỉ số đầu kỳ</h2><p>Invoice đầu tiên của mỗi hợp đồng lấy từ chỉ số ban đầu trên hợp đồng. Các kỳ sau lấy hóa đơn đã chốt gần nhất của chính hợp đồng đó.</p></div></div>
        {contracts.length === 0 ? <p className="utility-empty">Không có hợp đồng Nháp hoặc Đang hiệu lực trong khu vực này.</p> : <div className="table-wrap"><table className="utility-contract-table"><thead><tr><th>Hợp đồng</th><th>Phòng</th><th>Tình trạng nguồn</th><th></th></tr></thead><tbody>{contracts.map((contract) => { const hasElectric = contract.initial_electric_kwh !== null; const hasWater = contract.initial_water_m3 !== null; return <tr key={contract.contract_id}><td><strong>{contract.contract_no}</strong><small>{contractStatusLabel(contract.status)}</small></td><td>{contract.room?.room_code ?? "—"}</td><td><span className={`chip ${hasElectric && hasWater ? "success" : "warning"}`}>{hasElectric && hasWater ? "Điện và nước đã có" : `${hasElectric ? "Điện đã có" : "Thiếu điện"} · ${hasWater ? "nước đã có" : "thiếu nước"}`}</span></td><td><Link className="button" href={`/admin/contracts/${encodeURIComponent(contract.contract_id)}#meter-source`}>Mở hợp đồng</Link></td></tr>; })}</tbody></table></div>}
        <p className="utility-note">Cập nhật trong hồ sơ hợp đồng bằng luồng sửa hiện có. Hợp đồng Nháp lưu trực tiếp; hợp đồng Đang hiệu lực yêu cầu revision và lý do để ghi audit. Hợp đồng gia hạn cần chỉ số đầu kỳ riêng, không kế thừa tự động.</p>
      </section>
    </div>}
    {!loading && !propertyId && <section className="admin-card utility-empty-state"><h2>Chưa có khu vực</h2><p>Tạo khu vực trước khi thiết lập giá điện, nước hoặc nguồn đọc đồng hồ.</p><Link className="button primary" href="/admin/properties">Mở quản lý khu vực</Link></section>}
  </main></AdminShell>;
}
