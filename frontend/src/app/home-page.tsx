"use client";

import { FormEvent, useEffect, useState } from "react";
import { listPublicRooms, serializePublicRoomFilters, type PublicRoomListItem } from "../lib/api/publicRoomApi";
import { PublicRoomCard } from "./public-room-card";

export default function HomePage() {
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [preview, setPreview] = useState<PublicRoomListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void listPublicRooms({ page: 1, page_size: 6, sort: "newest" })
      .then((response) => { if (active) { setPreview(response.data); setTotal(response.meta.total_items); } })
      .catch(() => { if (active) { setPreview([]); setTotal(0); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchError("");
    if ([priceMin, priceMax].some((value) => value.trim() && !/^\d{1,19}$/.test(value.trim()))) { setSearchError("Giá thuê cần nhập bằng số VND nguyên không âm."); return; }
    if (priceMin && priceMax && BigInt(priceMin) > BigInt(priceMax)) { setSearchError("Giá từ không được lớn hơn giá đến."); return; }
    const query = serializePublicRoomFilters({ province, address, price_min: priceMin, price_max: priceMax, sort: "newest", page: 1, page_size: 12 });
    window.location.assign(`/rooms?${query.toString()}`);
  }

  return <main className="public-site">
    <header className="public-header"><a className="home-logo" href="/" aria-label="Góc Trọ"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a>
      <nav aria-label="Điều hướng chính"><a href="#phong-noi-bat">Phòng đang trống</a><a href="#gia-tri">Cách tìm phòng</a></nav>
      <div className="public-header-actions"><a className="public-login-link" href="/login">Đăng nhập quản lý</a><a className="button primary" href="/rooms">Khám phá phòng</a></div>
    </header>

    <section className="public-hero"><div className="public-hero-inner"><div className="public-hero-copy"><span className="eyebrow">Góc Trọ · Tìm dễ, ở yên</span><h1>Tìm một căn phòng<br /><span>hợp với nhịp sống của bạn.</span></h1><p>Khám phá tin phòng đang công khai, xem giá và thông tin cơ bản trước khi gửi yêu cầu liên hệ.</p>
      <form className="public-search-form" onSubmit={search} aria-label="Tìm phòng"><label>Tỉnh/thành<input value={province} onChange={(event) => setProvince(event.target.value)} maxLength={120} placeholder="Ví dụ: Đồng Nai" /></label><label>Địa chỉ hoặc khu vực<input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} placeholder="Đường, phường hoặc khu vực" /></label><label>Giá từ<input inputMode="numeric" type="number" min="0" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="VND" /></label><label>Đến<input inputMode="numeric" type="number" min="0" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="VND" /></label><button className="button primary" type="submit">Tìm phòng</button></form>{searchError && <p className="public-form-error" role="alert">{searchError}</p>}
      <a className="public-hero-secondary" href="/rooms">Xem tất cả phòng đang đăng <span aria-hidden="true">→</span></a>
    </div><div className="public-hero-aside"><div className="public-aside-mark" aria-hidden="true">⌂</div><span>Thông tin rõ ràng</span><strong>Chọn nơi ở<br />theo điều bạn cần.</strong><p>Địa chỉ, giá thuê, diện tích và sức chứa được lấy từ tin phòng công khai.</p><a href="/rooms">Bắt đầu khám phá <span aria-hidden="true">↗</span></a></div></div></section>

    <section className="public-section public-listings" id="phong-noi-bat"><div className="public-section-heading"><div><span className="eyebrow">Tin phòng công khai</span><h2>Phòng đang trống</h2><p>Danh sách được cập nhật từ các tin phòng còn khả dụng.</p></div><a href="/rooms">Tất cả phòng <span aria-hidden="true">→</span></a></div>
      <div className="public-results-summary">{loading ? "Đang tải tin phòng…" : error ? "Tạm thời chưa tải được dữ liệu phòng." : `${total} phòng đang được đăng`}</div>
      {loading ? <div className="public-room-grid" aria-label="Đang tải phòng" aria-busy="true">{[0, 1, 2].map((item) => <div className="public-room-skeleton" key={item}><div /><span /><span /><span /></div>)}</div> : error ? <div className="public-state public-state-error" role="alert"><strong>Danh sách phòng chưa tải được.</strong><span>Vui lòng thử tải lại sau.</span><button className="button" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div> : preview.length ? <div className="public-room-grid">{preview.map((room) => <PublicRoomCard key={room.room_id} room={room} />)}</div> : <div className="public-state"><strong>Chưa có phòng phù hợp để hiển thị.</strong><span>Thử tìm theo tỉnh/thành hoặc địa chỉ khác.</span><a className="button" href="/rooms">Mở bộ lọc phòng</a></div>}
      {!loading && !error && total > preview.length && <div className="public-section-action"><a className="button" href="/rooms">Xem thêm phòng</a></div>}
    </section>

    <section className="public-section public-value" id="gia-tri"><div className="public-section-heading"><div><span className="eyebrow">Tìm phòng theo thông tin thực tế</span><h2>Chủ động chọn nơi phù hợp</h2></div></div><div className="public-value-grid"><article><span>01</span><h3>So sánh thông tin</h3><p>Xem giá thuê, diện tích và sức chứa được công khai cho từng phòng.</p></article><article><span>02</span><h3>Xem hình ảnh tin đăng</h3><p>Ảnh bìa và gallery chỉ xuất hiện khi tin phòng có ảnh thực tế được tải lên.</p></article><article><span>03</span><h3>Gửi yêu cầu liên hệ</h3><p>Để lại thông tin cho chủ trọ. Bạn không cần tạo tài khoản để gửi yêu cầu.</p></article></div></section>

    <section className="public-final-cta"><div><span className="eyebrow">Đang tìm phòng?</span><h2>Xem các tin phòng đang khả dụng.</h2></div><a className="button primary" href="/rooms">Khám phá danh sách phòng <span aria-hidden="true">→</span></a></section>
    <footer className="public-footer"><a className="home-logo" href="/" aria-label="Góc Trọ"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a><span>Tìm dễ, ở yên.</span><a href="/login">Dành cho chủ trọ</a></footer>
  </main>;
}
