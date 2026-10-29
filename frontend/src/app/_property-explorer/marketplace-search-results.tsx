"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandLogo from "../components/brand-logo";
import { PublicRoomCard } from "../public-room-card";
import { listPublicRooms, serializePublicRoomFilters, type PublicRoomFilters, type PublicRoomListResponse } from "../../lib/api/publicRoomApi";
import { RoomFilters } from "./room-filters";
import "./explorer.css";
import "./marketplace-search-results.css";

const queryFor = (filters: PublicRoomFilters) => serializePublicRoomFilters(filters).toString();

export default function MarketplaceSearchResults({ initialFilters }: { initialFilters: PublicRoomFilters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [results, setResults] = useState<PublicRoomListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listPublicRooms(filters).then(value => { if (active) setResults(value); })
      .catch(() => { if (active) setError("Không tải được danh sách phòng. Vui lòng thử lại."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, retry]);

  const serialized = queryFor(filters);
  const mapHref = `/tim-phong?${serialized}`;
  const visibleCount = results?.meta.total_items ?? 0;
  useEffect(() => {
    window.history.replaceState(null, "", `/tim-phong/danh-sach?${serialized}`);
  }, [serialized]);
  const changePage = (page: number) => setFilters(current => ({ ...current, page }));

  return <main className="market-results-page">
    <header className="market-results-header">
      <Link href="/" className="market-results-brand" aria-label="Góc Trọ — Trang chủ"><BrandLogo /></Link>
      <div className="market-results-header-copy"><small>DANH SÁCH PHÒNG CHO THUÊ</small><h1>Tìm nơi ở phù hợp</h1></div>
      <Link className="market-results-map-link" href={mapHref}>← Quay lại bản đồ</Link>
    </header>

    <div className="market-results-layout">
      <section className="market-results-main" aria-labelledby="market-results-title">
        <div className="market-results-title-row">
          <div><p className="market-results-eyebrow">KẾT QUẢ TÌM KIẾM</p><h2 id="market-results-title">{loading ? "Đang tìm phòng…" : error ? "Chưa tải được kết quả" : `${visibleCount} phòng phù hợp`}</h2><p className="market-results-caption">Chỉ hiển thị phòng đang được chủ trọ công khai và còn khả dụng.</p></div>
          <nav className="market-results-view-tabs" aria-label="Kiểu xem kết quả">
            <Link href={mapHref}>Bản đồ</Link><span aria-current="page">Danh sách</span>
          </nav>
        </div>

        <RoomFilters filters={filters} allowProvince onApply={next => setFilters(next)} />

        <div className="market-results-toolbar">
          <p>{results ? `Hiển thị ${results.data.length ? (results.meta.page - 1) * results.meta.page_size + 1 : 0}–${Math.min(results.meta.page * results.meta.page_size, visibleCount)} trong ${visibleCount} phòng` : "Đang lấy dữ liệu công khai"}</p>
          <label>Sắp xếp<select value={filters.sort ?? "newest"} onChange={event => setFilters(current => ({ ...current, sort: event.target.value as PublicRoomFilters["sort"], page: 1 }))}><option value="newest">Mới nhất</option><option value="price_asc">Giá thấp đến cao</option><option value="price_desc">Giá cao đến thấp</option><option value="area_asc">Diện tích nhỏ đến lớn</option><option value="area_desc">Diện tích lớn đến nhỏ</option></select></label>
          <label>Mỗi trang<select value={filters.page_size ?? 12} onChange={event => setFilters(current => ({ ...current, page_size: Number(event.target.value), page: 1 }))}>{[12, 24, 48].map(size => <option key={size} value={size}>{size} phòng</option>)}</select></label>
          {results && results.meta.total_pages > 1 && <div className="market-results-pagination" aria-label="Phân trang kết quả"><button type="button" aria-label="Trang trước" disabled={results.meta.page <= 1} onClick={() => changePage(results.meta.page - 1)}>←</button><span>Trang {results.meta.page} / {results.meta.total_pages}</span><button type="button" aria-label="Trang sau" disabled={results.meta.page >= results.meta.total_pages} onClick={() => changePage(results.meta.page + 1)}>→</button></div>}
        </div>

        {loading && <div className="market-results-state" role="status" aria-busy="true">Đang tải phòng phù hợp…</div>}
        {!loading && error && <div className="market-results-state" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>}
        {!loading && !error && results && !results.data.length && <div className="market-results-state"><strong>Chưa có phòng khớp bộ lọc</strong><p>Thử nới khoảng giá, diện tích hoặc bỏ bớt tiện ích.</p><button type="button" onClick={() => setFilters({ sort: "newest", page: 1, page_size: 12 })}>Xóa bộ lọc</button></div>}
        {!loading && !error && !!results?.data.length && <div className="market-results-grid">{results.data.map(room => <PublicRoomCard key={room.room_id} room={room} returnTo={`/tim-phong/danh-sach?${serialized}`} />)}</div>}

        {results && results.meta.total_pages > 1 && <div className="market-results-pagination market-results-pagination--bottom" aria-label="Phân trang kết quả"><button type="button" aria-label="Trang trước" disabled={results.meta.page <= 1} onClick={() => changePage(results.meta.page - 1)}>←</button><span>Trang {results.meta.page} / {results.meta.total_pages}</span><button type="button" aria-label="Trang sau" disabled={results.meta.page >= results.meta.total_pages} onClick={() => changePage(results.meta.page + 1)}>→</button></div>}
      </section>
      <aside className="market-results-aside"><strong>Chọn phòng theo nhu cầu</strong><p>So sánh giá, diện tích và tiện ích do chủ trọ cung cấp. Mở trang phòng để xem chi tiết và gửi thông tin liên hệ.</p><Link href={mapHref}>Xem lại trên bản đồ →</Link></aside>
    </div>
  </main>;
}
