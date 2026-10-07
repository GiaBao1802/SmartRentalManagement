"use client";

import { FormEvent, useEffect, useState } from "react";

type Room = { id: string; roomNumber: string; floor: number; areaM2: string | null; rentVnd: number | null; property: { name: string; province: string; address: string } };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const money = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} đ`;

export default function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState({ visitorName: "", phone: "", email: "", roomId: "", preferredDate: "", preferredTime: "", note: "" });
  const [viewingMessage, setViewingMessage] = useState("");
  const [submittingViewing, setSubmittingViewing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/api/public/rooms?search=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ data: Room[] }>)
      .then((result) => setRooms(result.data))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchText.trim());
    document.getElementById("phong")?.scrollIntoView({ behavior: "smooth" });
  }

  async function requestViewing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmittingViewing(true); setViewingMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/public/viewing-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(viewing) });
      const result = await response.json() as { data?: { message: string }; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Chưa gửi được yêu cầu. Vui lòng thử lại.");
      setViewingMessage(result.data?.message ?? "Đã nhận yêu cầu xem phòng.");
      setViewing({ visitorName: "", phone: "", email: "", roomId: "", preferredDate: "", preferredTime: "", note: "" });
    } catch (reason) { setViewingMessage(reason instanceof Error ? reason.message : "Chưa gửi được yêu cầu."); }
    finally { setSubmittingViewing(false); }
  }

  return <main className="home-page">
    <header className="home-header"><a className="home-logo" href="/" aria-label="Góc trọ"><img src="/logo-goc-tro.png" alt="Góc trọ — Tìm dễ, ở yên" /></a><nav><a href="#vi-sao">Vì sao chọn</a><a href="#phong">Phòng trống</a><a href="#dich-vu">Dịch vụ</a><a href="#lien-he">Liên hệ</a></nav><a className="button primary login-link" href="/login">Đăng nhập</a></header>
    <section className="home-hero"><div className="home-hero-inner"><div className="home-hero-copy"><span className="home-tag">Góc trọ · Chốn về bình yên</span><h1>Tìm phòng gần bạn,<br /><span>chọn nơi an tâm</span></h1><p>Khám phá phòng trống theo khu vực, xem giá rõ ràng và kết nối với chủ trọ chỉ trong vài bước.</p>
      <form className="home-search" onSubmit={search}><label htmlFor="home-search-input">Địa chỉ hoặc tỉnh thành</label><div><input id="home-search-input" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Nhập địa chỉ, quận hoặc tỉnh/thành..."/><button className="button primary" type="submit">Tìm phòng</button></div></form>
      <div className="popular-searches"><span>Khu vực phổ biến:</span>{["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng"].map((place) => <button type="button" key={place} onClick={() => { setSearchText(place); setQuery(place); }}>{place}</button>)}</div>
    </div><div className="hero-note"><div className="hero-note-icon">⌂</div><strong>Một nơi ở vừa ý</strong><span>Chi phí minh bạch · Kết nối trực tiếp</span><div className="hero-note-bottom"><span>Phòng đang được cập nhật</span><b>{rooms.length} lựa chọn</b></div></div></div></section>

    <section className="home-section why-section" id="vi-sao"><div className="section-heading"><span className="eyebrow">Ở tốt bắt đầu từ lựa chọn đúng</span><h2>Vì sao chọn Góc trọ</h2><p>Một nơi ở không chỉ có bốn bức tường.</p></div><div className="benefit-grid">
      {[{ icon: "🛡️", title: "An ninh 24/7", text: "Khu trọ có người trông coi, lối đi thông thoáng và thông tin khu vực rõ ràng." }, { icon: "💡", title: "Chi phí minh bạch", text: "Giá thuê và các khoản dịch vụ được hiển thị rõ trước khi bạn liên hệ." }, { icon: "📄", title: "Hợp đồng rõ ràng", text: "Thông tin thuê, thời hạn và tiền cọc được thống nhất minh bạch." }, { icon: "🤝", title: "Kết nối dễ dàng", text: "Tìm theo khu vực, gửi yêu cầu xem phòng và trao đổi trực tiếp." }].map((benefit) => <article className="benefit-card" key={benefit.title}><span>{benefit.icon}</span><h3>{benefit.title}</h3><p>{benefit.text}</p></article>)}
    </div></section>

    <section className="home-section rooms-section" id="phong"><div className="section-heading room-heading"><div><span className="eyebrow">Tìm nơi phù hợp với bạn</span><h2>Phòng đang trống</h2><p>Xem phòng sẵn sàng theo khu vực và khoảng giá.</p></div><span className="room-count">{rooms.length} phòng đang hiển thị</span></div>
      {loading ? <div className="home-empty">Đang tải danh sách phòng…</div> : rooms.length ? <div className="room-list">{rooms.map((room) => <article className="room-listing" key={room.id}><div className="room-art"><span>GÓC TRỌ</span><b>{room.roomNumber}</b></div><div className="room-info"><span className="room-location">{room.property.province}</span><h3>{room.property.name} · Phòng {room.roomNumber}</h3><p>{room.property.address}</p><div className="room-tags"><span>{room.areaM2 ? `${room.areaM2} m²` : "Diện tích liên hệ"}</span><span>Tầng {room.floor}</span><span>Sẵn sàng</span></div><div className="room-listing-bottom"><strong>{money(room.rentVnd ?? 0)}<small>/ tháng</small></strong><a href="#lien-he">Liên hệ xem phòng →</a></div></div></article>)}</div> : <div className="home-empty"><strong>Chưa tìm thấy phòng trống phù hợp.</strong><span>Thử khu vực khác hoặc liên hệ để được hỗ trợ tìm phòng.</span></div>}
    </section>

    <section className="home-section services-section" id="dich-vu"><div className="section-heading"><span className="eyebrow">Đồng hành trong thời gian thuê</span><h2>Dịch vụ thiết thực</h2><p>Thông tin dịch vụ và chi phí được quản lý rõ ràng trong suốt thời gian bạn ở.</p></div><div className="service-grid"><article><span>🧾</span><h3>Theo dõi chi phí</h3><p>Tiền phòng, điện, nước và dịch vụ được ghi rõ theo từng kỳ.</p></article><article><span>🛠️</span><h3>Hỗ trợ sự cố</h3><p>Gửi yêu cầu hỗ trợ khi cần sửa chữa hoặc kiểm tra thiết bị.</p></article><article><span>🏡</span><h3>Tiện ích khu trọ</h3><p>Tra cứu tiện ích, khung giờ hoạt động và thông tin đăng ký.</p></article></div></section>

    <section className="contact-band" id="lien-he"><div><span className="eyebrow">Bạn đang tìm chỗ ở?</span><h2>Bắt đầu tìm một góc nhỏ cho riêng mình.</h2><p>Để lại thông tin và thời gian thuận tiện. Góc trọ sẽ liên hệ xác nhận lịch xem phòng.</p></div><form className="viewing-form" onSubmit={requestViewing}><div className="viewing-form-grid"><label>Họ và tên<input required minLength={2} value={viewing.visitorName} onChange={(event) => setViewing({ ...viewing, visitorName: event.target.value })} /></label><label>Số điện thoại<input required type="tel" value={viewing.phone} onChange={(event) => setViewing({ ...viewing, phone: event.target.value })} /></label><label>Email (không bắt buộc)<input type="email" value={viewing.email} onChange={(event) => setViewing({ ...viewing, email: event.target.value })} /></label><label>Phòng quan tâm<select value={viewing.roomId} onChange={(event) => setViewing({ ...viewing, roomId: event.target.value })}><option value="">Chưa chọn phòng cụ thể</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.property.name} · Phòng {room.roomNumber}</option>)}</select></label><label>Ngày muốn xem<input type="date" value={viewing.preferredDate} onChange={(event) => setViewing({ ...viewing, preferredDate: event.target.value })} /></label><label>Khung giờ phù hợp<input value={viewing.preferredTime} onChange={(event) => setViewing({ ...viewing, preferredTime: event.target.value })} placeholder="Ví dụ: sau 17:00" /></label><label className="viewing-note">Ghi chú<textarea value={viewing.note} onChange={(event) => setViewing({ ...viewing, note: event.target.value })} /></label></div>{viewingMessage && <p className="viewing-message" role="status">{viewingMessage}</p>}<button className="button primary" type="submit" disabled={submittingViewing}>{submittingViewing ? "Đang gửi…" : "Gửi yêu cầu xem phòng"}</button></form></section>
    <footer className="home-footer"><a className="home-logo" href="/"><img src="/logo-goc-tro.png" alt="Góc trọ" /></a><span>Tìm dễ, ở yên · Xuân Lộc, Đồng Nai, Việt Nam</span><a href="/login">Đăng nhập quản lý</a></footer>
  </main>;
}
