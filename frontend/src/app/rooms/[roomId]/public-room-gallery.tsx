"use client";

import { useMemo, useState } from "react";
import { resolvePublicRoomImageUrl, type PublicRoomImage } from "../../../lib/api/publicRoomApi";

export function PublicRoomGallery({ roomCode, propertyName, images }: { roomCode: string; propertyName: string; images: PublicRoomImage[] }) {
  const initial = useMemo(() => Math.max(0, images.findIndex((image) => image.is_cover)), [images]);
  const [selected, setSelected] = useState(initial);
  const [broken, setBroken] = useState<string[]>([]);
  const current = images[selected];
  const currentUrl = current && !broken.includes(current.image_id) ? resolvePublicRoomImageUrl(current.url) : null;

  if (!images.length) return <div className="public-gallery-empty"><img src="/assets/brand-v2/mark.svg" alt="" /><span>Phòng này chưa có hình ảnh.</span></div>;

  return <div className="public-gallery"><div className="public-gallery-main">{currentUrl ? <><img src={currentUrl} alt={current.is_illustrative ? `Ảnh minh họa phòng ${roomCode} tại ${propertyName}` : `Ảnh phòng ${roomCode} tại ${propertyName}`} onError={() => setBroken((ids) => [...ids, current.image_id])} />{current.is_illustrative && <span className="public-gallery-illustrative-badge">Ảnh minh họa</span>}</> : <div className="public-gallery-empty public-gallery-broken"><img src="/assets/brand-v2/mark.svg" alt="" /><span>Không tải được ảnh này.</span></div>}</div>
    {images.length > 1 && <div className="public-gallery-thumbnails" aria-label="Ảnh phòng">{images.map((image, index) => {
      const imageUrl = broken.includes(image.image_id) ? null : resolvePublicRoomImageUrl(image.url);
      return <button type="button" key={image.image_id} className={selected === index ? "selected" : ""} aria-label={`Xem ảnh ${index + 1}${image.is_cover ? ", ảnh bìa" : ""}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>{imageUrl ? <img src={imageUrl} alt="" loading="lazy" onError={() => setBroken((ids) => ids.includes(image.image_id) ? ids : [...ids, image.image_id])} /> : <span>Ảnh lỗi</span>}</button>;
    })}</div>}
  </div>;
}
