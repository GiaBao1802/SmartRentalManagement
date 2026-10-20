"use client";

import BrandLogo from "../../components/brand-logo";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "../../../lib/api/errors";
import { getPublicRoom, type PublicRoomDetail } from "../../../lib/api/publicRoomApi";
import { PublicRoomGallery } from "./public-room-gallery";
import { PublicContactForm } from "./public-contact-form";

function money(value: string) {
  try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} đ`; }
  catch { return "Liên hệ"; }
}

export default function PublicRoomDetailPage({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<PublicRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError(false); setUnavailable(false);
    try { setRoom(await getPublicRoom(roomId)); }
    catch (reason) {
      setRoom(null);
      if (reason instanceof ApiError && reason.status === 404) setUnavailable(true);
      else setError(true);
    } finally { setLoading(false); }
  }, [roomId]);

  useEffect(() => { void load(); }, [load, retry]);

  return <main className="public-site public-detail-page">
    <header className="public-header"><a className="home-logo" href="/" aria-label="Góc Trọ"><BrandLogo /></a><nav aria-label="Điều hướng chính"><a href="/rooms">Tìm phòng</a></nav><div className="public-header-actions"><a className="public-login-link" href="/login">Đăng nhập quản lý</a></div></header>
    {loading ? <section className="public-section"><div className="public-detail-skeleton" aria-label="Đang tải thông tin phòng" aria-busy="true"><div /><span /><span /></div></section> : unavailable ? <section className="public-section public-detail-unavailable" role="status"><span className="eyebrow">Tin phòng</span><h1>Phòng này hiện không còn khả dụng.</h1><p>Tin phòng có thể đã được cập nhật trong lúc bạn xem.</p><Link className="button primary" href="/rooms">Xem các phòng khác</Link></section> : error || !room ? <section className="public-section public-detail-unavailable" role="alert"><span className="eyebrow">Tin phòng</span><h1>Chưa tải được thông tin phòng.</h1><p>Vui lòng thử lại hoặc quay về danh sách phòng.</p><button className="button" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button><Link className="button" href="/rooms">Xem danh sách phòng</Link></section> : <>
      <section className="public-detail-shell"><div className="public-detail-breadcrumb"><Link href="/rooms">Danh sách phòng</Link><span aria-hidden="true">/</span><span>{room.property.name}</span></div>
        <div className="public-detail-layout"><div className="public-detail-main"><PublicRoomGallery roomCode={room.room_code} propertyName={room.property.name} images={room.images} />
          <article className="public-detail-content"><span className="public-available-label"><i aria-hidden="true" /> Đang khả dụng</span><span className="public-detail-location">{room.property.province} · {room.property.address}</span><h1>{room.property.name} · Phòng {room.room_code}</h1><strong className="public-detail-price">{money(room.default_rent)}<small>/ tháng</small></strong>
            <div className="public-detail-facts"><div><span>Diện tích</span><strong>{room.area_m2} m²</strong></div><div><span>Sức chứa</span><strong>Tối đa {room.default_capacity} người</strong></div><div><span>Tình trạng</span><strong>Còn phòng</strong></div></div>
            <section className="public-description"><h2>Thông tin phòng</h2><p>{room.public_description || "Chủ trọ chưa bổ sung mô tả công khai cho phòng này."}</p></section>
          </article>
        </div><aside className="public-contact-panel" id="lien-he"><span className="eyebrow">Quan tâm căn phòng này?</span><h2>Để chủ trọ liên hệ với bạn</h2><p>Gửi thông tin liên hệ để chủ trọ phản hồi. Đây chưa phải xác nhận đặt phòng.</p><PublicContactForm roomId={room.room_id} roomLabel={`${room.property.name} · ${room.room_code}`} /></aside></div>
      </section>
    </>}
    <footer className="public-footer"><a className="home-logo" href="/" aria-label="Góc Trọ"><BrandLogo /></a><span>Một góc yên tâm.</span><Link href="/rooms">Xem các phòng khác</Link></footer>
  </main>;
}
