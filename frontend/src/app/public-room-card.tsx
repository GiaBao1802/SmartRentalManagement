"use client";

import { useEffect, useState } from "react";
import { resolvePublicRoomImageUrl, type PublicRoomListItem } from "../lib/api/publicRoomApi";

const money = (value: string) => {
  try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} đ`; }
  catch { return "Liên hệ"; }
};

export function PublicRoomCard({ room }: { room: PublicRoomListItem }) {
  const imageUrl = resolvePublicRoomImageUrl(room.cover_image?.url);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  return <article className="room-listing" data-room-id={room.room_id}>
    {imageUrl && !imageFailed ? <img className="room-cover-image" src={imageUrl} alt={`Ảnh phòng ${room.room_code} tại ${room.property.name}`} loading="lazy" onError={() => setImageFailed(true)} /> : <div className="room-art public-room-placeholder" aria-label="Phòng chưa có ảnh bìa"><img src="/assets/brand-v2/mark.svg" alt="" /><span>Chưa có ảnh bìa</span></div>}
    <div className="room-info"><span className="room-location">{room.property.province}</span><h3>{room.property.name} · Phòng {room.room_code}</h3><p>{room.property.address}</p>
      {room.public_description && <p>{room.public_description}</p>}
      <div className="room-tags"><span>{room.area_m2 ? `${room.area_m2} m²` : "Diện tích liên hệ"}</span><span>Tối đa {room.default_capacity} người</span></div>
      <div className="room-listing-bottom"><strong>{money(room.default_rent)}<small>/ tháng</small></strong><a href={`/rooms/${encodeURIComponent(room.room_id)}`}>Xem chi tiết <span aria-hidden="true">→</span></a></div>
    </div>
  </article>;
}
