"use client";

import { useEffect, useMemo } from "react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateRoomImageFiles(files: File[], limit: number) {
  if (files.length > limit) return `Chỉ chọn tối đa ${limit} ảnh.`;
  const invalidType = files.find((file) => !ALLOWED_TYPES.has(file.type));
  if (invalidType) return `${invalidType.name}: chỉ hỗ trợ JPEG, PNG hoặc WebP.`;
  const tooLarge = files.find((file) => file.size > MAX_IMAGE_BYTES);
  if (tooLarge) return `${tooLarge.name}: kích thước tối đa là 5 MB.`;
  return "";
}

export default function RoomImagePicker({
  files,
  maxFiles = 5,
  disabled = false,
  onChange,
  onError,
}: {
  files: File[];
  maxFiles?: number;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}) {
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  function selectFiles(selected: FileList | null) {
    const next = selected ? [...files, ...Array.from(selected)] : files;
    const problem = validateRoomImageFiles(next, maxFiles);
    onError(problem);
    if (!problem) onChange(next);
  }

  return <section className="room-image-picker" aria-label="Chọn hình ảnh phòng">
    <div className="room-image-picker-heading"><div><strong>Hình ảnh phòng</strong><p>Không bắt buộc · JPEG, PNG hoặc WebP · tối đa 5 MB mỗi ảnh</p></div><span aria-live="polite">{files.length}/{maxFiles}</span></div>
    <label className={`room-image-pick-button${disabled || files.length >= maxFiles ? " is-disabled" : ""}`}>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || files.length >= maxFiles} onChange={(event) => { selectFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <span aria-hidden="true">＋</span> Chọn ảnh
    </label>
    {files.length > 0 && <div className="room-image-picker-grid">{previews.map(({ file, url }, index) => <figure className="room-image-picker-item" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
      {/* Browser-local preview; this URL is never sent to the API. */}
      <img src={url} alt={`Ảnh xem trước ${index + 1}: ${file.name}`} />
      <figcaption title={file.name}>{file.name}</figcaption>
      <button type="button" aria-label={`Bỏ ảnh ${file.name}`} disabled={disabled} onClick={() => { onError(""); onChange(files.filter((_, fileIndex) => fileIndex !== index)); }}>×</button>
    </figure>)}</div>}
  </section>;
}

