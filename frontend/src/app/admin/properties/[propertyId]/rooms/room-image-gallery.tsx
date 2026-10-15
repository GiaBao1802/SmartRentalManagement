"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../../../../lib/api/errors";
import { roomImageApi, type RoomImage } from "../../../../../lib/api/roomImageApi";
import { uploadRoomImagesSequentially } from "../../../../../lib/api/roomImageWorkflow";
import RoomImagePicker, { validateRoomImageFiles } from "./room-image-picker";

const MAX_IMAGES = 5;

function imageMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Không thể kết nối máy chủ. Hãy thử lại.";
  if (error.code === "ROOM_IMAGE_LIMIT_REACHED") return "Phòng đã đạt giới hạn 5 ảnh.";
  if (error.code === "ROOM_IMAGE_RETRY_REQUIRED") return "Có thao tác hình ảnh khác đang diễn ra. Vui lòng thử lại.";
  if (error.code === "STORAGE_UNAVAILABLE" || error.code === "STORAGE_OBJECT_UNAVAILABLE") return "Dịch vụ lưu trữ ảnh hiện chưa khả dụng. Vui lòng thử lại sau.";
  if (error.code === "NOT_FOUND" || error.status === 404) return "Không tìm thấy phòng hoặc ảnh trong tài khoản của bạn.";
  if (error.status === 413 || error.code === "PAYLOAD_TOO_LARGE") return "Ảnh vượt quá giới hạn 5 MB.";
  if (error.code === "VALIDATION_ERROR") return "Ảnh không hợp lệ. Chỉ hỗ trợ JPEG, PNG hoặc WebP tối đa 5 MB.";
  if (error.status === 401 || error.status === 403) return "Phiên đăng nhập đã hết hạn hoặc không có quyền quản lý ảnh.";
  if (error.status >= 500) return "Máy chủ hoặc dịch vụ lưu trữ ảnh đang gặp sự cố. Vui lòng thử lại sau.";
  return "Không thể xử lý ảnh lúc này. Vui lòng thử lại.";
}

function contentUrl(path: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
  return new URL(path, new URL(apiBase).origin).toString();
}

export default function RoomImageGallery({ propertyId, roomId, roomCode }: { propertyId: string; roomId: string; roomCode: string }) {
  const [images, setImages] = useState<RoomImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [pickerError, setPickerError] = useState("");
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; ok: boolean; message?: string }>>([]);
  const [working, setWorking] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setImages(await roomImageApi.list(propertyId, roomId));
      setBrokenImages(new Set());
    } catch (error) {
      setLoadError(imageMessage(error));
    } finally {
      setLoading(false);
    }
  }, [propertyId, roomId]);

  useEffect(() => { void load(); }, [load]);

  const remaining = Math.max(0, MAX_IMAGES - images.length);
  const orderedIds = useMemo(() => images.map((image) => image.image_id), [images]);

  async function upload() {
    if (working || uploadFiles.length === 0 || pickerError) return;
    setWorking(true);
    setActionError("");
    setNotice("");
    const rawOutcomes = await uploadRoomImagesSequentially(roomId, uploadFiles, (targetRoomId, file) => roomImageApi.upload(propertyId, targetRoomId, file));
    const outcomes = rawOutcomes.map((outcome) => ({ name: outcome.name, ok: outcome.ok, ...(outcome.error ? { message: imageMessage(outcome.error) } : {}) }));
    setUploadResults(outcomes);
    setUploadFiles([]);
    await load();
    const successCount = outcomes.filter((outcome) => outcome.ok).length;
    setNotice(successCount ? `Đã tải lên ${successCount}/${outcomes.length} ảnh cho phòng ${roomCode}.` : "Chưa tải được ảnh nào.");
    setWorking(false);
  }

  async function move(imageId: string, direction: -1 | 1) {
    if (working) return;
    const from = images.findIndex((image) => image.image_id === imageId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= images.length) return;
    const next = [...images];
    [next[from], next[to]] = [next[to]!, next[from]!];
    const previous = images;
    setImages(next);
    setWorking(true);
    setActionError("");
    try {
      setImages(await roomImageApi.reorder(propertyId, roomId, next.map((image) => image.image_id)));
      setNotice("Đã cập nhật thứ tự ảnh.");
    } catch (error) {
      setImages(previous);
      setActionError(imageMessage(error));
      await load();
    } finally { setWorking(false); }
  }

  async function setCover(image: RoomImage) {
    if (working || image.is_cover) return;
    setWorking(true);
    setActionError("");
    try {
      await roomImageApi.setCover(propertyId, roomId, image.image_id);
      await load();
      setNotice("Đã đổi ảnh bìa.");
    } catch (error) { setActionError(imageMessage(error)); }
    finally { setWorking(false); }
  }

  async function remove(image: RoomImage) {
    if (working || !window.confirm("Xóa ảnh này khỏi phòng? Ảnh sẽ được gỡ khỏi thư viện của phòng này.")) return;
    setWorking(true);
    setActionError("");
    setNotice("");
    try {
      const result = await roomImageApi.delete(propertyId, roomId, image.image_id);
      await load();
      setNotice(result.promoted_cover_image_id ? "Đã gỡ ảnh. Ảnh tiếp theo được chọn làm ảnh bìa." : "Đã gỡ ảnh khỏi phòng.");
    } catch (error) { setActionError(imageMessage(error)); }
    finally { setWorking(false); }
  }

  function chooseFiles(files: File[]) {
    const problem = validateRoomImageFiles(files, remaining);
    setPickerError(problem);
    if (!problem) setUploadFiles(files);
  }

  return <section className="room-image-gallery" aria-labelledby={`room-image-title-${roomId}`}>
    <div className="room-image-gallery-heading"><div><h3 id={`room-image-title-${roomId}`}>Hình ảnh phòng</h3><p>Ảnh của phòng này được quản lý riêng, tối đa 5 ảnh.</p></div><span className="room-image-count" aria-live="polite">{images.length}/{MAX_IMAGES}</span></div>
    {loading && <p className="room-image-state" role="status">Đang tải thư viện ảnh…</p>}
    {loadError && <div className="room-image-alert" role="alert"><span>{loadError}</span><button type="button" className="button property-room-secondary" disabled={loading} onClick={() => void load()}>Thử tải lại</button></div>}
    {!loading && !loadError && images.length === 0 && <div className="room-image-empty"><span className="room-image-empty-icon" aria-hidden="true">▧</span><strong>Phòng này chưa có hình ảnh.</strong><span>Thêm ảnh thật của phòng để hoàn thiện hồ sơ.</span></div>}
    {!loading && !loadError && images.length > 0 && <div className="room-image-grid">{images.map((image, index) => <article className="room-image-card" key={image.image_id}>
      <div className="room-image-frame">{brokenImages.has(image.image_id)
        ? <div className="room-image-fallback" role="img" aria-label={`Không tải được ảnh ${index + 1}`}>Ảnh chưa tải được</div>
        : <img src={contentUrl(image.url)} alt={`Ảnh ${index + 1} của phòng ${roomCode}`} crossOrigin="use-credentials" loading="lazy" onError={() => setBrokenImages((current) => new Set(current).add(image.image_id))} />}
        {image.is_cover && <span className="room-image-cover-badge">Ảnh bìa</span>}
      </div>
      <div className="room-image-card-actions">
        <button type="button" className="button property-room-secondary" aria-label={`Chuyển ảnh ${index + 1} lên trước`} disabled={working || index === 0} onClick={() => void move(image.image_id, -1)}>←</button>
        <button type="button" className="button property-room-secondary" aria-label={`Chuyển ảnh ${index + 1} xuống sau`} disabled={working || index === images.length - 1} onClick={() => void move(image.image_id, 1)}>→</button>
        {!image.is_cover && <button type="button" className="button property-room-secondary" disabled={working} onClick={() => void setCover(image)}>Đặt làm ảnh bìa</button>}
        {image.is_cover && <span className="room-image-cover-label">Ảnh bìa hiện tại</span>}
        <button type="button" className="button room-image-delete" disabled={working} onClick={() => void remove(image)}>Xóa ảnh</button>
      </div>
    </article>)}</div>}
    {!loading && !loadError && remaining > 0 && <div className="room-image-upload-row">
      <RoomImagePicker files={uploadFiles} maxFiles={remaining} disabled={working} onChange={chooseFiles} onError={setPickerError} />
      {pickerError && <p className="room-image-error" role="alert">{pickerError}</p>}
      <button type="button" className="button primary property-room-cta" disabled={working || uploadFiles.length === 0 || Boolean(pickerError)} onClick={() => void upload()}>{working ? "Đang tải ảnh…" : `Tải lên ${uploadFiles.length || "ảnh"}`}</button>
    </div>}
    {actionError && <p className="room-image-error" role="alert">{actionError}</p>}
    {notice && <p className="room-image-notice" role="status">{notice}</p>}
    {uploadResults.length > 0 && <section className="room-image-upload-results" aria-label="Kết quả tải ảnh">
      <strong>Kết quả tải ảnh</strong><ul>{uploadResults.map((result, index) => <li key={`${result.name}-${index}`} data-state={result.ok ? "success" : "failure"}><span>{result.ok ? "Đã tải" : "Chưa tải được"}: {result.name}</span>{!result.ok && <small>{result.message}</small>}</li>)}</ul>
    </section>}
  </section>;
}

