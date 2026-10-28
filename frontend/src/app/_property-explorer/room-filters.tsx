"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PublicRoomFilters } from "../../lib/api/publicRoomApi";

export function RoomFilters({ filters, onApply, allowProvince }: {
  filters: PublicRoomFilters; onApply: (filters: PublicRoomFilters) => void; allowProvince: boolean;
}) {
  const [draft, setDraft] = useState(filters), [error, setError] = useState("");
  useEffect(() => { setDraft(filters); setError(""); }, [filters]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if ([draft.price_min, draft.price_max].some(v => v && !/^\d{1,19}$/.test(v))) { setError("Giá phải là số nguyên không âm, tối đa 19 chữ số."); return; }
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
    <div className="explore-inline-filter-actions"><button type="button" onClick={reset}>Đặt lại</button><button className="explore-primary" type="submit">Áp dụng</button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
