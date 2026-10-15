"use client";

import { FormEvent, useEffect, useState } from "react";
import { PublicRoomCard } from "../public-room-card";
import { ApiError } from "../../lib/api/errors";
import { listPublicRooms, serializePublicRoomFilters, type PublicRoomFilters, type PublicRoomListItem, type PublicRoomListResponse } from "../../lib/api/publicRoomApi";

type Props = { initialFilters: PublicRoomFilters };
const sortOptions = [
  ["newest", "Mới nhất"], ["price_asc", "Giá thấp → cao"], ["price_desc", "Giá cao → thấp"], ["area_asc", "Diện tích nhỏ → lớn"], ["area_desc", "Diện tích lớn → nhỏ"],
] as const;
const genericError = "Không thể tải danh sách phòng lúc này. Vui lòng thử lại.";

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return "Danh sách đang được truy cập nhiều. Vui lòng chờ một chút rồi thử lại.";
  return genericError;
}

function safePageSize(value: number | undefined) { return value && value >= 1 && value <= 100 ? value : 12; }

export default function RoomListing({ initialFilters }: Props) {
  const [filters, setFilters] = useState<PublicRoomFilters>({ ...initialFilters, page_size: safePageSize(initialFilters.page_size) });
  const [draft, setDraft] = useState<PublicRoomFilters>({ ...initialFilters, page_size: safePageSize(initialFilters.page_size) });
  const [rooms, setRooms] = useState<PublicRoomListItem[]>([]);
  const [meta, setMeta] = useState<PublicRoomListResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void listPublicRooms(filters)
      .then((result) => { if (active) { setRooms(result.data); setMeta(result.meta); } })
      .catch((reason: unknown) => { if (active) { setRooms([]); setMeta(null); setError(errorMessage(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, retry]);

  function updateUrl(next: PublicRoomFilters) {
    const query = serializePublicRoomFilters(next);
    window.history.pushState(null, "", `/rooms?${query.toString()}`);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFilterError("");
    if ([draft.price_min, draft.price_max].some((value) => value?.trim() && !/^\d{1,19}$/.test(value.trim()))) { setFilterError("Khoảng giá phải là số nguyên VND không âm."); return; }
    const minPrice = draft.price_min?.trim() ? BigInt(draft.price_min) : undefined;
    const maxPrice = draft.price_max?.trim() ? BigInt(draft.price_max) : undefined;
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) { setFilterError("Giá tối thiểu không được lớn hơn giá tối đa."); return; }
    const minArea = draft.area_min?.trim() ? Number(draft.area_min) : undefined;
    const maxArea = draft.area_max?.trim() ? Number(draft.area_max) : undefined;
    if ((minArea !== undefined && (!Number.isFinite(minArea) || minArea <= 0)) || (maxArea !== undefined && (!Number.isFinite(maxArea) || maxArea <= 0))) { setFilterError("Diện tích phải là số lớn hơn 0."); return; }
    if (minArea !== undefined && maxArea !== undefined && minArea > maxArea) { setFilterError("Diện tích tối thiểu không được lớn hơn diện tích tối đa."); return; }
    if (draft.capacity_min?.trim() && (!/^\d+$/.test(draft.capacity_min) || Number(draft.capacity_min) < 1 || Number(draft.capacity_min) > 1_000_000)) { setFilterError("Sức chứa phải là số nguyên từ 1 đến 1.000.000."); return; }
    const next = { ...draft, page: 1, page_size: safePageSize(filters.page_size) };
    setDraft(next); setFilters(next); updateUrl(next);
  }

  function clear() {
    const next: PublicRoomFilters = { sort: "newest", page: 1, page_size: safePageSize(filters.page_size) };
    setDraft(next); setFilters(next); setFilterError(""); updateUrl(next);
  }

  function goToPage(page: number) {
    if (page < 1 || (meta && page > meta.total_pages)) return;
    const next = { ...filters, page };
    setFilters(next); setDraft(next); updateUrl(next);
    document.getElementById("public-room-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <main className="public-site public-list-page">
    <header className="public-header"><a className="home-logo" href="/" aria-label="Góc Trọ"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a><nav aria-label="Điều hướng chính"><a href="/#phong-noi-bat">Phòng đang trống</a><a href="/#gia-tri">Cách tìm phòng</a></nav><div className="public-header-actions"><a className="public-login-link" href="/login">Đăng nhập quản lý</a></div></header>
    <section className="public-section public-list-main" id="public-room-results"><div className="public-section-heading"><div><span className="eyebrow">Tin phòng công khai</span><h1>Phòng trống phù hợp với bạn</h1><p>Lọc thông tin công khai từ các phòng đang khả dụng.</p></div></div>
      <details className="public-filter-drawer"><summary>Bộ lọc tìm phòng</summary><form className="public-filter-form" onSubmit={apply}>
        <label>Tỉnh/thành<input value={draft.province ?? ""} maxLength={120} onChange={(event) => setDraft({ ...draft, province: event.target.value })} placeholder="Tỉnh/thành" /></label>
        <label>Địa chỉ<input value={draft.address ?? ""} maxLength={200} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Địa chỉ hoặc khu vực" /></label>
        <label>Giá từ (VND)<input type="number" min="0" value={draft.price_min ?? ""} onChange={(event) => setDraft({ ...draft, price_min: event.target.value })} /></label>
        <label>Giá đến (VND)<input type="number" min="0" value={draft.price_max ?? ""} onChange={(event) => setDraft({ ...draft, price_max: event.target.value })} /></label>
        <label>Diện tích từ (m²)<input type="number" min="0.01" step="0.01" value={draft.area_min ?? ""} onChange={(event) => setDraft({ ...draft, area_min: event.target.value })} /></label>
        <label>Diện tích đến (m²)<input type="number" min="0.01" step="0.01" value={draft.area_max ?? ""} onChange={(event) => setDraft({ ...draft, area_max: event.target.value })} /></label>
        <label>Sức chứa tối thiểu<input type="number" min="1" max="1000000" step="1" value={draft.capacity_min ?? ""} onChange={(event) => setDraft({ ...draft, capacity_min: event.target.value })} /></label>
        <label>Sắp xếp<select value={draft.sort ?? "newest"} onChange={(event) => setDraft({ ...draft, sort: event.target.value as PublicRoomFilters["sort"] })}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {filterError && <p className="public-form-error" role="alert">{filterError}</p>}
        <div className="public-filter-actions"><button className="button primary" type="submit">Áp dụng bộ lọc</button><button className="button" type="button" onClick={clear}>Xóa bộ lọc</button></div>
      </form></details>
      <div className="public-results-toolbar"><span>{loading ? "Đang tải phòng…" : meta ? `${meta.total_items} phòng phù hợp` : "Kết quả tìm phòng"}</span>{meta && <span>Trang {meta.page} / {meta.total_pages}</span>}</div>
      {loading ? <div className="public-room-grid" aria-label="Đang tải phòng" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((item) => <div className="public-room-skeleton" key={item}><div /><span /><span /><span /></div>)}</div> : error ? <div className="public-state public-state-error" role="alert"><strong>{error}</strong><button className="button" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div> : rooms.length ? <div className="public-room-grid">{rooms.map((room) => <PublicRoomCard key={room.room_id} room={room} />)}</div> : <div className="public-state"><strong>Chưa tìm thấy phòng phù hợp.</strong><span>Thử điều chỉnh tỉnh/thành, địa chỉ hoặc các khoảng lọc.</span><button className="button" type="button" onClick={clear}>Xóa bộ lọc</button></div>}
      {meta && meta.total_pages > 1 && <nav className="public-pagination" aria-label="Phân trang danh sách phòng"><button className="button" type="button" disabled={loading || meta.page <= 1} onClick={() => goToPage(meta.page - 1)}>Trang trước</button><span>Trang {meta.page} / {meta.total_pages}</span><button className="button" type="button" disabled={loading || meta.page >= meta.total_pages} onClick={() => goToPage(meta.page + 1)}>Trang sau</button></nav>}
    </section><footer className="public-footer"><a className="home-logo" href="/" aria-label="Góc Trọ"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a><span>Tìm dễ, ở yên.</span><a href="/login">Dành cho chủ trọ</a></footer>
  </main>;
}
