"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PublicRoomFilters } from "../../lib/api/publicRoomApi";
import { marketplaceAmenityOptions, type MarketplaceAmenity } from "../../lib/api/roomApi";
import { listPublicPropertyFacilities } from "../../lib/api/publicRoomApi";

export function RoomFilters({ filters, onApply, allowProvince, includePropertyFacilities = true }: {
  filters: PublicRoomFilters; onApply: (filters: PublicRoomFilters) => void; allowProvince: boolean; includePropertyFacilities?: boolean;
}) {
  const [draft, setDraft] = useState(filters), [error, setError] = useState("");
  const [propertyFacilities, setPropertyFacilities] = useState<string[]>([]);
  useEffect(() => { setDraft(filters); setError(""); }, [filters]);
  useEffect(() => {
    if (!includePropertyFacilities) { setPropertyFacilities([]); return; }
    let active = true;
    listPublicPropertyFacilities().then((items) => { if (active) setPropertyFacilities(items); }).catch(() => { if (active) setPropertyFacilities([]); });
    return () => { active = false; };
  }, [includePropertyFacilities]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if ([draft.price_min, draft.price_max].some(v => v && !/^\d{1,19}$/.test(v))) { setError("Vui lòng nhập mức giá bằng số, không kèm ký tự khác."); return; }
    if (draft.price_min && draft.price_max && BigInt(draft.price_min) > BigInt(draft.price_max)) { setError("Giá từ phải nhỏ hơn hoặc bằng giá đến."); return; }
    if (draft.area_min && draft.area_max && Number(draft.area_min) > Number(draft.area_max)) { setError("Diện tích từ phải nhỏ hơn hoặc bằng diện tích đến."); return; }
    setError(""); onApply({ ...draft, page: 1 });
  }
  function reset() {
    const next = { sort: filters.sort, page_size: filters.page_size, page: 1 };
    setDraft(next); setError(""); onApply(next);
  }
  const field = (key: "price_min" | "price_max" | "area_min" | "area_max", label: string) => <label>{label}<input
    type={key.startsWith("price") ? "text" : "number"} inputMode={key.startsWith("price") ? "numeric" : "decimal"}
    min="0" step="0.01" maxLength={19} value={draft[key] ?? ""}
    onChange={e => setDraft({ ...draft, [key]: e.target.value })} placeholder="Bất kỳ" /></label>;
  return <form className="explore-inline-filters" aria-label="Lọc danh sách phòng" onSubmit={apply}>
    {allowProvince && draft.location !== undefined ? <label>Tỉnh/thành hoặc khu vực<input maxLength={100} value={draft.location ?? ""} onChange={e => setDraft({ ...draft, location: e.target.value })} placeholder="Ví dụ: Đồng Nai, Biên Hòa" /></label> : <>
      {allowProvince && <label>Tỉnh/thành<input maxLength={120} value={draft.province ?? ""} onChange={e => setDraft({ ...draft, province: e.target.value })} placeholder="Toàn quốc" /></label>}
      <label>Địa chỉ / khu vực<input maxLength={200} value={draft.address ?? ""} onChange={e => setDraft({ ...draft, address: e.target.value })} placeholder="Đường, phường hoặc khu vực" /></label>
    </>}
    {field("price_min", "Giá từ (đ/tháng)")}{field("price_max", "Giá đến (đ/tháng)")}
    {field("area_min", "Diện tích từ (m²)")}{field("area_max", "Diện tích đến (m²)")}
    <label>Sức chứa tối thiểu<select value={draft.capacity_min ?? ""} onChange={e => setDraft({ ...draft, capacity_min: e.target.value })}><option value="">Bất kỳ</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} người</option>)}</select></label>
    <fieldset className="explore-amenity-filter"><legend>Tiện ích đã xác nhận</legend><div>{marketplaceAmenityOptions.map(({ code, label }) => <label key={code}>
      <input type="checkbox" checked={draft.amenities?.includes(code) ?? false} onChange={event => {
        const amenities = new Set(draft.amenities ?? []);
        if (event.target.checked) amenities.add(code); else amenities.delete(code);
        setDraft({ ...draft, amenities: [...amenities] as MarketplaceAmenity[] });
      }} />{label}
    </label>)}</div><small>Chỉ lọc tiện ích do chủ trọ xác nhận.</small></fieldset>
    {propertyFacilities.length > 0 && <fieldset className="explore-amenity-filter explore-shared-facility-filter"><legend>Tiện ích chung của khu trọ</legend><div>{propertyFacilities.map((name) => <label key={name}>
      <input type="checkbox" checked={draft.property_facilities?.includes(name) ?? false} onChange={event => {
        const selected = new Set(draft.property_facilities ?? []);
        if (event.target.checked) selected.add(name); else selected.delete(name);
        setDraft({ ...draft, property_facilities: [...selected] });
      }} />{name}
    </label>)}</div><small>Chỉ chọn các tiện ích chung đang hoạt động tại khu trọ; khi chọn nhiều mục, khu trọ phải có đủ tất cả.</small></fieldset>}
    <div className="explore-inline-filter-actions"><button type="button" onClick={reset}>Đặt lại</button><button className="explore-primary" type="submit">Áp dụng</button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
