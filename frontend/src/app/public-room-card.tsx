"use client";

import { useEffect, useState } from "react";
import { resolvePublicRoomImageUrl, type PublicRoomImage, type PublicRoomListItem } from "../lib/api/publicRoomApi";
import { marketplaceAmenityLabels } from "../lib/api/roomApi";

const money = (value: string) => {
  try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} đ`; }
  catch { return "Liên hệ"; }
};

export function PublicRoomCard({ room, returnTo }: { room: PublicRoomListItem; returnTo?: string }) {
  const images: PublicRoomImage[] = room.images?.length ? room.images : room.cover_image ? [{ ...room.cover_image, is_cover: true, sort_order: 1 }] : [];
  const coverIndex = Math.max(0, images.findIndex((image) => image.is_cover));
  const galleryKey = images.map((image) => image.image_id).join(",");
  const [activeIndex, setActiveIndex] = useState(coverIndex);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  useEffect(() => { setActiveIndex(coverIndex); setFailedImageIds([]); }, [room.room_id, galleryKey, coverIndex]);
  const selectedImage = images.length
    ? images.slice(activeIndex).concat(images.slice(0, activeIndex)).find((image) => !failedImageIds.includes(image.image_id))
    : undefined;
  const availableImages = images.filter((image) => !failedImageIds.includes(image.image_id) && resolvePublicRoomImageUrl(image.url));
  const imageUrl = selectedImage && !failedImageIds.includes(selectedImage.image_id) ? resolvePublicRoomImageUrl(selectedImage.url) : null;
  const moveImage = (direction: -1 | 1) => setActiveIndex((current) => (current + direction + images.length) % images.length);
  const detailHref = `/rooms/${encodeURIComponent(room.room_id)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return <article className="room-listing" data-room-id={room.room_id}>
    <div className="room-listing-cover">
    <a className="room-listing-cover-link" href={detailHref} aria-label={`Xem chi tiết phòng ${room.room_code} tại ${room.property.name}`}>
    {imageUrl && selectedImage ? <><img className="room-cover-image" src={imageUrl} alt={selectedImage.is_illustrative ? `Ảnh minh họa phòng ${room.room_code} tại ${room.property.name}` : `Ảnh phòng ${room.room_code} tại ${room.property.name}`} loading="lazy" onError={() => setFailedImageIds((ids) => ids.includes(selectedImage.image_id) ? ids : [...ids, selectedImage.image_id])} />{selectedImage.is_illustrative && <span className="room-image-illustrative-badge">Ảnh minh họa</span>}</> : <div className="room-art public-room-placeholder" role="img" aria-label={images.length ? "Không tải được ảnh phòng" : "Chủ trọ chưa thêm ảnh phòng"}>
      <svg className="room-photo-placeholder-icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="13" width="48" height="38" rx="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="23" cy="26" r="4" fill="currentColor" />
        <path d="m12 45 13-12 8 7 7-6 12 11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{images.length ? "Không tải được ảnh phòng" : "Chủ trọ chưa thêm ảnh"}</span>
    </div>}
    </a>
    {availableImages.length > 1 && <><button className="room-listing-gallery-control is-previous" type="button" aria-label={`Xem ảnh phòng ${room.room_code} trước`} onClick={() => moveImage(-1)}>‹</button><button className="room-listing-gallery-control is-next" type="button" aria-label={`Xem ảnh phòng ${room.room_code} tiếp theo`} onClick={() => moveImage(1)}>›</button><span className="room-listing-gallery-count" aria-live="polite">{availableImages.findIndex((image) => image.image_id === selectedImage?.image_id) + 1}/{availableImages.length}</span></>}
    </div>
    <div className="room-info"><span className="room-location">{room.property.province}</span><h3>{room.property.name} · Phòng {room.room_code}</h3><p>{room.property.address}</p>
      {room.public_description && <p>{room.public_description}</p>}
      <div className="room-tags"><span>{room.area_m2 ? `${room.area_m2} m²` : "Diện tích liên hệ"}</span><span>Tối đa {room.default_capacity} người</span></div>
      {room.amenities.length > 0 && <div className="room-tags" aria-label="Tiện ích đã xác nhận">{room.amenities.map(code => <span key={code}>{marketplaceAmenityLabels[code] ?? code}</span>)}</div>}
      {room.property_facilities.length > 0 && <div className="room-tags" aria-label="Tiện ích chung của khu trọ">{room.property_facilities.slice(0, 4).map(name => <span key={name}>{name}</span>)}{room.property_facilities.length > 4 && <span>+{room.property_facilities.length - 4}</span>}</div>}
      <div className="room-listing-bottom"><strong>{money(room.default_rent)}<small>/ tháng</small></strong><a href={detailHref}>Xem chi tiết <span aria-hidden="true">→</span></a></div>
    </div>
  </article>;
}
