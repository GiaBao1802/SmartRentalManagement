"use client";
import { RoomEquipment } from "../../../../components/room-requests";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminShell from "../../../../components/admin-shell";
import { ApiError } from "../../../../../lib/api/errors";
import { propertyApi, type Property } from "../../../../../lib/api/propertyApi";
import { marketplaceAmenityOptions, roomApi, type MarketplaceAmenity, type Room, type RoomInput, type RoomListStatus, type RoomPatch, type RoomStatus } from "../../../../../lib/api/roomApi";
import { keepDialogFocus, useDialogFocus } from "../../../../../lib/ui/dialog-accessibility";
import ResidentRoomPanel from "./resident-room-panel";
import RoomImageGallery from "./room-image-gallery";
import RoomImagePicker from "./room-image-picker";
import { roomImageApi, type BulkRoomImageResult } from "../../../../../lib/api/roomImageApi";
import { attachImagesToCreatedRooms, createRoomWithImages, createRoomsSequentially } from "../../../../../lib/api/roomImageWorkflow";
import { formatAdminDate, formatAdminMoney, formatAdminStatus } from "../../../../../lib/ui/admin-presentation";

const blankForm = { room_code: "", default_rent: "", area_m2: "", default_capacity: "1", is_active: true, is_public: false, public_description: "", marketplace_amenities: [] as MarketplaceAmenity[] };
const money = (value: string) => formatAdminMoney(value);
type CreateMode = "single" | "bulk";
type BulkFailure = { roomCode: string; message: string };
type ImageUploadOutcome = { name: string; ok: boolean; message?: string };
function imageErrorMessage(reason: unknown) {
  if (!(reason instanceof ApiError)) return "Không thể kết nối máy chủ.";
  if (reason.code === "ROOM_IMAGE_LIMIT_REACHED") return "Phòng đã đạt giới hạn 5 ảnh.";
  if (reason.code === "ROOM_IMAGE_RETRY_REQUIRED") return "Có thao tác ảnh khác đang diễn ra. Vui lòng thử lại.";
  if (reason.code === "STORAGE_UNAVAILABLE") return "Dịch vụ lưu trữ ảnh hiện chưa khả dụng.";
  if (reason.status === 413 || reason.code === "PAYLOAD_TOO_LARGE") return "Ảnh vượt quá giới hạn 5 MB.";
  if (reason.code === "VALIDATION_ERROR") return "Ảnh không hợp lệ. Chỉ hỗ trợ JPEG, PNG hoặc WebP tối đa 5 MB.";
  if (reason.status === 401 || reason.status === 403) return "Phiên đăng nhập đã hết hạn hoặc không có quyền tải ảnh.";
  if (reason.status >= 500) return "Máy chủ hoặc dịch vụ lưu trữ ảnh đang gặp sự cố. Vui lòng thử lại sau.";
  return "Không thể tải ảnh lên. Vui lòng kiểm tra ảnh và thử lại.";
}
function bulkImageFailureMessage(code?: string) {
  if (code === "ROOM_IMAGE_LIMIT_REACHED") return "Phòng đã đạt giới hạn 5 ảnh.";
  if (code === "ROOM_IMAGE_RETRY_REQUIRED") return "Có thao tác ảnh khác đang diễn ra. Vui lòng thử lại.";
  if (code === "STORAGE_UNAVAILABLE") return "Dịch vụ lưu trữ ảnh hiện chưa khả dụng.";
  if (code === "NOT_FOUND") return "Không tìm thấy phòng trong tài khoản của bạn.";
  if (code === "INVALID_IMAGE" || code === "VALIDATION_ERROR") return "Ảnh không hợp lệ. Chỉ hỗ trợ JPEG, PNG hoặc WebP tối đa 5 MB.";
  return "Chưa tải được ảnh. Có thể thử lại trong thư viện của từng phòng.";
}
function roomInputFromForm(form: typeof blankForm, roomCode: string): RoomInput {
  return {
    room_code: roomCode,
    default_rent: form.default_rent.trim(),
    area_m2: form.area_m2.trim(),
    default_capacity: Number(form.default_capacity),
    is_active: form.is_active,
    is_public: form.is_public,
    ...(form.public_description.trim() ? { public_description: form.public_description.trim() } : {}),
    marketplace_amenities: form.marketplace_amenities,
  };
}
function validateRoomFields(form: typeof blankForm) {
  if (!/^\d{1,18}$/.test(form.default_rent.trim())) return "Giá thuê phải là số VND nguyên không âm, tối đa 18 chữ số.";
  if (!/^(?:\d{1,6})(?:\.\d{1,2})?$/.test(form.area_m2.trim()) || Number(form.area_m2) <= 0 || Number(form.area_m2) > 999999.99) return "Diện tích phải lớn hơn 0 và có tối đa 2 chữ số thập phân.";
  const capacity = Number(form.default_capacity);
  if (!/^\d+$/.test(form.default_capacity) || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000) return "Sức chứa phải là số nguyên từ 1 đến 1.000.000.";
  if (form.public_description.length > 10000) return "Mô tả công khai không được vượt quá 10.000 ký tự.";
  return "";
}
function roomFieldErrors(form: typeof blankForm) {
  const capacity = Number(form.default_capacity);
  return {
    default_rent: /^\d{1,18}$/.test(form.default_rent.trim()) ? "" : "Nhập số VND nguyên không âm, tối đa 18 chữ số.",
    area_m2: /^(?:\d{1,6})(?:\.\d{1,2})?$/.test(form.area_m2.trim()) && Number(form.area_m2) > 0 && Number(form.area_m2) <= 999999.99 ? "" : "Diện tích phải lớn hơn 0, tối đa 2 chữ số thập phân.",
    default_capacity: /^\d+$/.test(form.default_capacity) && Number.isSafeInteger(capacity) && capacity >= 1 && capacity <= 1_000_000 ? "" : "Sức chứa từ 1 đến 1.000.000 người.",
  };
}

export default function PropertyRoomsPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [roomStatus, setRoomStatus] = useState<RoomListStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [roomCounts, setRoomCounts] = useState<{ total: number; available: number; occupied: number; inactive: number } | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [bulkBaseCode, setBulkBaseCode] = useState("");
  const [bulkQuantity, setBulkQuantity] = useState("1");
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ successCount: number; failures: BulkFailure[] } | null>(null);
  const [singleImages, setSingleImages] = useState<File[]>([]);
  const [imagePickerError, setImagePickerError] = useState("");
  const [singleImageResults, setSingleImageResults] = useState<ImageUploadOutcome[]>([]);
  const [bulkImageResults, setBulkImageResults] = useState<{ outcomes: BulkRoomImageResult[]; error?: string } | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState(blankForm);

  useDialogFocus(open, dialogRef);

  const loadRoomCounts = useCallback(async () => {
    setCountsLoading(true);
    setCountsError("");
    setRoomCounts(null);
    try {
      const [allData, availableData, occupiedData, inactiveData] = await Promise.all([
        roomApi.list(propertyId, 1, 1),
        roomApi.list(propertyId, 1, 1, "available"),
        roomApi.list(propertyId, 1, 1, "occupied"),
        roomApi.list(propertyId, 1, 1, "inactive"),
      ]);
      setRoomCounts({
        total: allData.meta.total_items,
        available: availableData.meta.total_items,
        occupied: occupiedData.meta.total_items,
        inactive: inactiveData.meta.total_items,
      });
    } catch (reason) {
      setCountsError(reason instanceof ApiError ? reason.message : "Không thể tải thống kê phòng.");
    } finally { setCountsLoading(false); }
  }, [propertyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setError("");
    try {
      const [propertyData, roomData] = await Promise.all([
        propertyApi.get(propertyId),
        roomApi.list(propertyId, page, 20, roomStatus || undefined, roomSearch),
      ]);
      setProperty(propertyData);
      setRooms(roomData.data);
      setTotalPages(roomData.meta.total_pages);
      setTotalItems(roomData.meta.total_items);
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "Không thể tải khu vực và danh sách phòng. Kiểm tra kết nối máy chủ rồi thử lại.");
    } finally { setLoading(false); }
  }, [page, propertyId, roomSearch, roomStatus]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRoomCounts(); }, [loadRoomCounts]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadRoomCounts()]);
  }, [load, loadRoomCounts]);

  function showForm(room: Room | null) {
    setEditing(room);
    setError("");
    setShowFieldErrors(false);
    setBulkResult(null);
    setSingleImages([]);
    setImagePickerError("");
    setSingleImageResults([]);
    setBulkImageResults(null);
    setBulkProgress(null);
    setCreateMode("single");
    setBulkBaseCode("");
    setBulkQuantity("1");
    setForm(room ? {
      room_code: room.room_code,
      default_rent: room.default_rent,
      area_m2: room.area_m2,
      default_capacity: String(room.default_capacity),
      is_active: room.is_active,
      is_public: room.is_public,
      public_description: room.public_description ?? "",
      marketplace_amenities: room.marketplace_amenities ?? [],
    } : { ...blankForm, default_rent: "" });
    setOpen(true);
  }

  function submitRoomSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setRoomSearch(searchInput.trim());
  }

  function clearRoomSearch() {
    setSearchInput("");
    setRoomSearch("");
    setPage(1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validationMessage = validateRoomFields(form);
    if (validationMessage) { setShowFieldErrors(true); setError(validationMessage); return; }
    if (!editing && !form.room_code.trim()) { setError("Mã phòng không được để trống."); return; }
    if (!editing && form.room_code.trim().length > 40) { setError("Mã phòng không được vượt quá 40 ký tự."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!editing) {
        const { room: created, outcomes: uploadOutcomes } = await createRoomWithImages(
          () => roomApi.create(propertyId, roomInputFromForm(form, form.room_code.trim())),
          (room) => room.room_id,
          singleImages,
          (roomId, file) => roomImageApi.upload(propertyId, roomId, file),
        );
        const outcomes: ImageUploadOutcome[] = uploadOutcomes.map((outcome) => ({ name: outcome.name, ok: outcome.ok, ...(outcome.error ? { message: imageErrorMessage(outcome.error) } : {}) }));
        const failures = outcomes.filter((outcome) => !outcome.ok);
        if (failures.length) {
          setEditing(created);
          setForm({ room_code: created.room_code, default_rent: created.default_rent, area_m2: created.area_m2, default_capacity: String(created.default_capacity), is_active: created.is_active, is_public: created.is_public, public_description: created.public_description ?? "", marketplace_amenities: created.marketplace_amenities ?? [] });
          setSingleImages([]);
          setSingleImageResults(outcomes);
          await Promise.all([load(), loadRoomCounts()]);
          return;
        }
        setNotice(singleImages.length
          ? `Phòng ${created.room_code} đã được tạo. ${outcomes.length}/${outcomes.length} ảnh tải lên thành công.`
          : `Đã tạo phòng ${created.room_code}.`);
      } else {
        const patch: RoomPatch = {};
        if (form.room_code.trim() !== editing.room_code) patch.room_code = form.room_code.trim();
        if (form.default_rent.trim() !== editing.default_rent) patch.default_rent = form.default_rent.trim();
        if (form.area_m2.trim() !== editing.area_m2) patch.area_m2 = form.area_m2.trim();
        if (Number(form.default_capacity) !== editing.default_capacity) patch.default_capacity = Number(form.default_capacity);
        if (form.is_active !== editing.is_active) patch.is_active = form.is_active;
        if (form.is_public !== editing.is_public) patch.is_public = form.is_public;
        const description = form.public_description.trim() || null;
        if (description !== editing.public_description) patch.public_description = description;
        if (JSON.stringify([...form.marketplace_amenities].sort()) !== JSON.stringify([...(editing.marketplace_amenities ?? [])].sort())) patch.marketplace_amenities = form.marketplace_amenities;
        if (Object.keys(patch).length) await roomApi.update(editing.room_id, patch);
        setNotice(Object.keys(patch).length ? "Đã cập nhật phòng." : "Không có thay đổi cần lưu.");
      }
      setOpen(false);
      await Promise.all([load(), loadRoomCounts()]);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Không thể lưu phòng. Vui lòng thử lại.");
    } finally { setSaving(false); }
  }

  const quantityNumber = /^\d+$/.test(bulkQuantity) ? Number(bulkQuantity) : NaN;
  const bulkCodes = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= 100 && bulkBaseCode.trim()
    ? Array.from({ length: quantityNumber }, (_, index) => `${bulkBaseCode.trim()}-${index + 1}`)
    : [];
  const bulkValidation = (() => {
    const baseCode = bulkBaseCode.trim();
    if (!baseCode) return "Vui lòng nhập mã phòng gốc.";
    if (!Number.isInteger(quantityNumber) || quantityNumber < 1 || quantityNumber > 100) return "Số lượng phải là số nguyên từ 1 đến 100.";
    if (bulkCodes.some((code) => code.length > 40)) return "Mã phòng được tạo không được vượt quá 40 ký tự.";
    return validateRoomFields(form);
  })();

  async function saveBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || bulkValidation || !bulkCodes.length) {
      if (bulkValidation) { setShowFieldErrors(true); setError(bulkValidation); }
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setBulkResult(null);
    try {
      const createdRooms = await createRoomsSequentially(bulkCodes, (roomCode) => roomApi.create(propertyId, roomInputFromForm(form, roomCode)), (current, total) => setBulkProgress({ current, total }));
      const successCount = createdRooms.successes.length;
      const failures: BulkFailure[] = createdRooms.failures.map(({ roomCode, error: reason }) => ({ roomCode, message: reason instanceof ApiError
        ? reason.status === 409 && /được sử dụng|đã tồn tại/i.test(reason.message) ? "Mã phòng đã tồn tại." : reason.message
        : "Không thể kết nối máy chủ." }));
      const successfulRoomIds = createdRooms.successes.map(({ room }) => room.room_id);
      setBulkResult({ successCount, failures });
      let imageResult: { outcomes: BulkRoomImageResult[]; error?: string } | null = null;
      if (successfulRoomIds.length > 0 && singleImages.length > 0) {
        try {
          const response = await attachImagesToCreatedRooms(successfulRoomIds, singleImages, (roomIds, files) => roomImageApi.bulkAttach(propertyId, roomIds, files));
          if (!response) throw new Error("Không có phòng thành công để gắn ảnh.");
          imageResult = { outcomes: response.image_results };
        } catch (reason) {
          imageResult = { outcomes: singleImages.map((_, file_index) => ({ file_index, status: "failed" })), error: imageErrorMessage(reason) };
        }
      }
      setBulkImageResults(imageResult);
      setNotice(failures.length
        ? `Đã tạo ${successCount}/${bulkCodes.length} phòng.`
        : `Đã tạo thành công ${successCount} phòng.`);
      await Promise.all([load(), loadRoomCounts()]);
    } finally {
      setBulkProgress(null);
      setSaving(false);
    }
  }

  async function deactivate(room: Room) {
    if (deactivatingId || reactivatingId) return;
    if (!window.confirm(`Ngừng hoạt động phòng ${room.room_code}? Lịch sử hợp đồng và cư trú sẽ được giữ lại.`)) return;
    setDeactivatingId(room.room_id);
    setError("");
    setNotice("");
    try {
      await roomApi.deactivate(room.room_id);
      setNotice(`Đã ngừng hoạt động phòng ${room.room_code}.`);
      await Promise.all([load(), loadRoomCounts()]);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Không thể ngừng hoạt động phòng.");
    } finally { setDeactivatingId(null); }
  }

  async function reactivate(room: Room) {
    if (deactivatingId || reactivatingId) return;
    setReactivatingId(room.room_id);
    setError("");
    setNotice("");
    try {
      await roomApi.reactivate(room.room_id);
      setNotice(`Đã bật hoạt động phòng ${room.room_code}.`);
      await Promise.all([load(), loadRoomCounts()]);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Không thể bật hoạt động phòng. Vui lòng thử lại.");
    } finally { setReactivatingId(null); }
  }

  const statusLabel: Record<RoomStatus, string> = { available: "Còn trống", occupied: "Đang thuê / có cư trú", inactive: "Ngừng hoạt động" };
  const fieldErrors = roomFieldErrors(form);

  return <AdminShell active="/admin/properties"><main className="admin-main property-room-page room-page">
    <div className="property-room-back-row"><Link className="property-room-back" href="/admin/properties"><span aria-hidden="true">←</span> Danh sách khu vực</Link><span className="property-room-breadcrumb">Khu vực <span aria-hidden="true">/</span> Phòng</span></div>
    <header className="property-room-heading room-heading-main">
      <div><p className="property-room-eyebrow">QUẢN LÝ PHÒNG</p><h1>{property?.name ?? (loading ? "Đang tải khu vực…" : "Khu vực")}</h1><p className="property-room-description">{property ? <>{property.property_code} · {property.province} · {property.address}</> : "Phòng, sức chứa và lịch sử cư trú của khu vực."}</p></div>
      <button className="button primary property-room-cta" type="button" disabled={!property || property.status === "archived"} onClick={() => showForm(null)}>+ Thêm phòng</button>
    </header>
    {property?.status === "archived" && <p className="property-room-alert" role="status">Khu vực đã ngưng hoạt động. Bạn vẫn có thể xem dữ liệu phòng và lịch sử.</p>}
    {countsError && <div className="property-room-alert property-room-stats-alert" role="alert"><p>Chưa tải được thống kê: {countsError}</p><button className="button property-room-secondary" type="button" disabled={countsLoading} onClick={() => void loadRoomCounts()}>{countsLoading ? "Đang thử lại…" : "Thử tải lại"}</button></div>}
    {property && <div className="property-room-stats room-stats" aria-label="Thống kê toàn khu vực">
      <section className="property-room-stat" data-tone="green"><span>Tổng số phòng</span><strong>{countsLoading ? "…" : roomCounts?.total ?? "—"}</strong><small>Toàn khu vực</small></section>
      <section className="property-room-stat" data-tone="orange"><span>Phòng còn trống</span><strong>{countsLoading ? "…" : roomCounts?.available ?? "—"}</strong><small>Trạng thái còn trống</small></section>
      <section className="property-room-stat" data-tone="amber"><span>Phòng đang thuê</span><strong>{countsLoading ? "…" : roomCounts?.occupied ?? "—"}</strong><small>Có hợp đồng hoặc cư trú</small></section>
      <section className="property-room-stat" data-tone="neutral"><span>Ngưng hoạt động</span><strong>{countsLoading ? "…" : roomCounts?.inactive ?? "—"}</strong><small>Phòng không hoạt động</small></section>
    </div>}
    <section className="property-room-toolbar room-toolbar" aria-label="Lọc danh sách phòng">
      <div className="room-toolbar-controls">
        <form className="room-search-form core-filter-toolbar" role="search" onSubmit={submitRoomSearch}><label className="property-room-field">Tìm theo mã phòng<input type="search" maxLength={200} placeholder="Tìm theo mã phòng" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><button className="button primary property-room-cta" type="submit" disabled={loading}>Tìm</button>{(roomSearch || searchInput) && <button className="button property-room-secondary" type="button" onClick={clearRoomSearch}>Xóa tìm kiếm</button>}</form>
        <label className="property-room-field room-status-field">Trạng thái phòng<select value={roomStatus} onChange={(event) => { setPage(1); setRoomStatus(event.target.value as RoomListStatus | ""); }}><option value="">Tất cả phòng</option><option value="available">Còn trống</option><option value="occupied">Đang thuê / có cư trú</option><option value="inactive">Ngưng hoạt động</option></select></label>
      </div>
      <span className="property-room-filter-hint">Kết quả và số trang được lọc từ máy chủ.</span>
    </section>
    {loadError && <div className="property-room-alert" role="alert"><p>{loadError}</p><button className="button property-room-secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Đang tải…" : "Thử tải lại"}</button></div>}
    {error && !open && <p className="property-room-alert" role="alert">{error}</p>}
    {notice && <p className="property-room-notice" role="status">{notice}</p>}
    <section className="property-room-table-card" aria-labelledby="room-list-title">
      <div className="property-room-card-heading"><div><h2 id="room-list-title">Phòng trong khu vực</h2><p>Sức chứa mặc định dùng cho cấu hình mới; hợp đồng hiện tại có thể áp dụng giới hạn riêng.</p></div><span className="property-room-result-count">{totalItems} kết quả</span></div>
      <div className="table-wrap property-room-table-wrap"><table className="property-room-table room-data-table"><thead><tr><th>Phòng</th><th>Diện tích</th><th>Giá thuê mặc định</th><th>Cư dân / sức chứa</th><th>Tình trạng</th><th>Hợp đồng hiện tại</th><th>Công khai</th><th>Thao tác</th></tr></thead><tbody>
        {rooms.map((room) => <tr key={room.room_id}><td><strong className="property-room-primary-cell">{room.room_code}</strong></td><td>{room.area_m2} m²</td><td><strong>{money(room.default_rent)}</strong><span className="subtext">/ tháng</span></td><td><strong>{room.occupancy_count} người đang ở</strong><span className="subtext">{room.contract_capacity ?? room.default_capacity} người theo {room.contract_capacity !== null ? "hợp đồng hiện tại" : "sức chứa mặc định"}</span></td><td><span className={`property-room-status ${room.status === "available" ? "is-active" : room.status === "occupied" ? "is-occupied" : "is-inactive"}`}><span aria-hidden="true" />{statusLabel[room.status]}</span></td><td>{room.current_contract ? <><strong>{room.current_contract.contract_no}</strong><span className="subtext">Trạng thái: {formatAdminStatus(room.current_contract.status)}</span><span className="subtext">{formatAdminDate(room.current_contract.start_date)} → {formatAdminDate(room.current_contract.end_date)}</span></> : <span className="property-room-muted">Chưa có hợp đồng hiện tại</span>}</td><td><span className={`property-room-status ${room.is_public ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{room.is_public ? "Đang đăng" : "Ẩn"}</span></td><td><div className="property-room-actions"><ResidentRoomPanel room={room} onChanged={refreshAll} /><button className="property-room-action" type="button" disabled={Boolean(deactivatingId || reactivatingId)} onClick={() => showForm(room)}>Sửa</button>{room.status === "inactive" ? <button className="property-room-action" type="button" disabled={reactivatingId === room.room_id || deactivatingId === room.room_id} onClick={() => void reactivate(room)}>{reactivatingId === room.room_id ? "Đang bật…" : "Bật hoạt động"}</button> : room.is_active && <button className="property-room-action is-danger" type="button" disabled={deactivatingId === room.room_id || reactivatingId === room.room_id} onClick={() => void deactivate(room)}>{deactivatingId === room.room_id ? "Đang ngưng…" : "Ngưng hoạt động"}</button>}</div></td></tr>)}
        {!loading && !loadError && rooms.length === 0 && <tr><td className="property-room-empty" colSpan={8}><strong>{roomSearch || roomStatus ? "Không có phòng phù hợp bộ lọc" : "Khu vực này chưa có phòng"}</strong><span>{roomSearch || roomStatus ? "Thử đổi từ khóa hoặc trạng thái để xem thêm phòng." : "Thêm phòng đầu tiên để bắt đầu quản lý."}</span></td></tr>}
        {loading && <tr><td className="property-room-empty" colSpan={8}><span className="property-room-spinner" aria-hidden="true" />Đang tải danh sách phòng…</td></tr>}
      </tbody></table></div>
      <div className="property-room-pagination"><span>{totalItems ? `Hiển thị ${(page - 1) * 20 + 1}–${Math.min(page * 20, totalItems)} trong ${totalItems} phòng` : "Không có kết quả"}</span><div><button className="button property-room-secondary" type="button" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>← Trước</button><span>Trang {totalPages ? page : 0} / {totalPages}</span><button className="button property-room-secondary" type="button" aria-label="Trang sau" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Sau →</button></div></div>
    </section>
  </main>
  {open && <div className="modal-backdrop property-room-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}><section ref={dialogRef} tabIndex={-1} className="edit-modal property-room-modal" role="dialog" aria-modal="true" aria-labelledby="room-form-title" onKeyDown={(event) => keepDialogFocus(event, () => setOpen(false), saving)}><div className="property-room-modal-heading"><div><p className="property-room-eyebrow">{editing ? "CẬP NHẬT THÔNG TIN" : "CẤU HÌNH PHÒNG"}</p><h2 id="room-form-title">{editing ? `Phòng ${editing.room_code}` : "Thêm phòng"}</h2></div><button className="modal-close" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Đóng cửa sổ">×</button></div>
    {!editing && <div className="room-create-tabs" role="tablist" aria-label="Cách thêm phòng"><button type="button" role="tab" aria-selected={createMode === "single"} className={createMode === "single" ? "room-create-tab active" : "room-create-tab"} disabled={saving} onClick={() => { setCreateMode("single"); setError(""); setBulkResult(null); }}>Thêm 1 phòng</button><button type="button" role="tab" aria-selected={createMode === "bulk"} className={createMode === "bulk" ? "room-create-tab active" : "room-create-tab"} disabled={saving} onClick={() => { setCreateMode("bulk"); setError(""); setBulkResult(null); }}>Thêm nhiều phòng</button></div>}
    <form onSubmit={editing || createMode === "single" ? save : saveBulk}>
      <fieldset className="property-room-fieldset"><legend>Thông tin phòng</legend><div className="property-room-form-grid">
        {editing || createMode === "single"
          ? <label className="property-room-field">Mã phòng<input data-dialog-autofocus="true" required maxLength={40} disabled={saving} value={form.room_code} onChange={(event) => setForm({ ...form, room_code: event.target.value })} /></label>
          : <><label className="property-room-field">Mã phòng gốc<input data-dialog-autofocus="true" required maxLength={40} disabled={saving} value={bulkBaseCode} onChange={(event) => setBulkBaseCode(event.target.value)} /></label><label className="property-room-field">Số lượng phòng<input required type="number" min="1" max="100" step="1" disabled={saving} value={bulkQuantity} onChange={(event) => setBulkQuantity(event.target.value)} /></label></>}
        <label className="property-room-field">Giá thuê mặc định <span className="property-room-optional">VND / tháng</span><input aria-invalid={showFieldErrors && Boolean(fieldErrors.default_rent)} aria-describedby={showFieldErrors && fieldErrors.default_rent ? "room-rent-error" : undefined} required type="number" min="0" max="999999999999999999" step="1" disabled={saving} value={form.default_rent} onChange={(event) => setForm({ ...form, default_rent: event.target.value })} />{showFieldErrors && fieldErrors.default_rent && <small id="room-rent-error" className="property-room-field-error" role="alert">{fieldErrors.default_rent}</small>}</label>
        <label className="property-room-field">Diện tích <span className="property-room-optional">m²</span><input aria-invalid={showFieldErrors && Boolean(fieldErrors.area_m2)} aria-describedby={showFieldErrors && fieldErrors.area_m2 ? "room-area-error" : undefined} required type="number" min="0.01" max="999999.99" step="0.01" disabled={saving} value={form.area_m2} onChange={(event) => setForm({ ...form, area_m2: event.target.value })} />{showFieldErrors && fieldErrors.area_m2 && <small id="room-area-error" className="property-room-field-error" role="alert">{fieldErrors.area_m2}</small>}</label>
        <label className="property-room-field">Sức chứa mặc định <span className="property-room-optional">người</span><input aria-invalid={showFieldErrors && Boolean(fieldErrors.default_capacity)} aria-describedby={showFieldErrors && fieldErrors.default_capacity ? "room-capacity-error" : undefined} required type="number" min="1" max="1000000" step="1" disabled={saving} value={form.default_capacity} onChange={(event) => setForm({ ...form, default_capacity: event.target.value })} />{showFieldErrors && fieldErrors.default_capacity && <small id="room-capacity-error" className="property-room-field-error" role="alert">{fieldErrors.default_capacity}</small>}</label>
      </div></fieldset>
      <fieldset className="property-room-fieldset"><legend>Trạng thái và hiển thị</legend><div className="property-room-form-grid">
        <label className="property-room-check"><input type="checkbox" disabled={saving || Boolean(editing && editing.status === "occupied" && form.is_active)} checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span><strong>Phòng đang hoạt động</strong><small>Cho phép quản lý trong khu vực.</small></span></label>
        <label className="property-room-check"><input type="checkbox" disabled={saving} checked={form.is_public} onChange={(event) => setForm({ ...form, is_public: event.target.checked })} /><span><strong>Đăng phòng công khai</strong><small>Cho phép hiển thị theo điều kiện API.</small></span></label>
        <label className="property-room-field property-room-field-wide">Mô tả công khai{!editing && createMode === "bulk" ? " mặc định" : ""}<textarea maxLength={10000} disabled={saving} value={form.public_description} onChange={(event) => setForm({ ...form, public_description: event.target.value })} /></label>
      </div></fieldset>
      <fieldset className="property-room-fieldset"><legend>Tiện ích công khai</legend><div className="property-room-form-grid">
        {marketplaceAmenityOptions.map(({ code, label }) => <label className="property-room-check" key={code}><input type="checkbox" disabled={saving} checked={form.marketplace_amenities.includes(code)} onChange={(event) => setForm({ ...form, marketplace_amenities: event.target.checked ? [...form.marketplace_amenities, code] : form.marketplace_amenities.filter((amenity) => amenity !== code) })} /><span><strong>{label}</strong><small>Chỉ chọn khi đã xác nhận cho tin phòng.</small></span></label>)}
        <p className="property-room-field-hint property-room-field-wide">Lựa chọn này được lưu riêng và dùng để lọc phòng công khai; không tự suy ra từ mô tả.</p>
      </div></fieldset>      {editing && <RoomEquipment roomId={editing.room_id} />}
      {editing && <RoomImageGallery propertyId={propertyId} roomId={editing.room_id} roomCode={editing.room_code} />}
      {!editing && createMode === "single" && <><RoomImagePicker files={singleImages} disabled={saving} onChange={(files) => { setSingleImages(files); setImagePickerError(""); }} onError={setImagePickerError} />{imagePickerError && <p className="room-image-error" role="alert">{imagePickerError}</p>}</>}
      {!editing && createMode === "bulk" && <><div className="room-bulk-image-note"><strong>Ảnh dùng chung ban đầu</strong><p>Các ảnh này sẽ được áp dụng chung cho các phòng tạo thành công.</p><small>Sau khi tạo, mỗi phòng có gallery riêng. Chỉnh sửa một phòng không làm thay đổi phòng khác.</small></div><RoomImagePicker files={singleImages} disabled={saving || Boolean(bulkResult)} onChange={(files) => { setSingleImages(files); setImagePickerError(""); }} onError={setImagePickerError} />{imagePickerError && <p className="room-image-error" role="alert">{imagePickerError}</p>}</>}
      {!editing && createMode === "bulk" && <><section className="room-bulk-preview" aria-live="polite"><strong>Preview: sẽ tạo {bulkCodes.length || (Number.isInteger(quantityNumber) && quantityNumber > 0 ? quantityNumber : 0)} phòng</strong>{bulkCodes.length ? <div className="room-bulk-code-list">{(bulkCodes.length <= 8 ? bulkCodes : [...bulkCodes.slice(0, 4), "…", ...bulkCodes.slice(-4)]).map((code, index) => <code key={`${code}-${index}`}>{code}</code>)}</div> : <p>Nhập mã phòng gốc và số lượng từ 1 đến 100 để xem mã phòng.</p>}</section>{bulkValidation && <p className="room-bulk-validation" role="alert">{bulkValidation}</p>}</>}
      {bulkProgress && <p className="room-bulk-progress" role="status" aria-live="polite">Đang tạo {bulkProgress.current} / {bulkProgress.total} phòng...</p>}
      {bulkResult && <section className="room-bulk-result" role="status"><strong>Đã tạo thành công: {bulkResult.successCount} phòng</strong>{bulkResult.failures.length > 0 && <><p>Không tạo được:</p><ul className="room-bulk-errors">{bulkResult.failures.map((failure) => <li key={failure.roomCode}><code>{failure.roomCode}</code> — {failure.message}</li>)}</ul></>}</section>}
      {bulkImageResults && <section className="room-bulk-result room-bulk-image-result" aria-label="Kết quả ảnh dùng chung"><strong>Ảnh dùng chung: {bulkImageResults.outcomes.filter((result) => result.status === "attached").length}/{bulkImageResults.outcomes.length} ảnh được gắn vào {bulkResult?.successCount ?? 0} phòng tạo thành công</strong>{bulkImageResults.error && <p role="alert">{bulkImageResults.error}</p>}<ul>{bulkImageResults.outcomes.map((result) => <li key={result.file_index} data-state={result.status}><span>Ảnh {result.file_index + 1}: {singleImages[result.file_index]?.name ?? `tệp ${result.file_index + 1}`}</span><small>{result.status === "attached" ? `Đã gắn vào ${result.association_count ?? 0} phòng` : bulkImageFailureMessage(result.code) || bulkImageResults.error}</small></li>)}</ul><p>Ảnh lỗi có thể được tải lại trong thư viện riêng của từng phòng.</p></section>}
      {singleImageResults.length > 0 && <section className="room-bulk-result room-single-image-result" aria-label="Kết quả ảnh khi tạo phòng"><strong>Phòng {editing?.room_code} đã được tạo.</strong><p>{singleImageResults.filter((result) => result.ok).length}/{singleImageResults.length} ảnh tải lên thành công; {singleImageResults.filter((result) => !result.ok).length} ảnh chưa tải được.</p><ul>{singleImageResults.map((result, index) => <li key={`${result.name}-${index}`} data-state={result.ok ? "success" : "failure"}><span>{result.ok ? "Đã tải" : "Chưa tải được"}: {result.name}</span>{!result.ok && <small>{result.message}</small>}</li>)}</ul><p>Thư viện ảnh bên dưới cho phép tải lại ảnh lỗi hoặc tiếp tục quản lý gallery.</p></section>}
      {error && <p className="property-room-alert" role="alert">{error}</p>}
      <div className="property-room-modal-actions"><button className="button property-room-secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>{bulkResult ? "Đóng" : "Hủy"}</button><button className="button primary property-room-cta" type="submit" disabled={saving || Boolean(bulkResult) || Boolean(imagePickerError) || (!editing && createMode === "bulk" && Boolean(bulkValidation)) || (!editing && createMode === "single" && Boolean(validateRoomFields(form)))}>{saving ? createMode === "bulk" ? "Đang tạo…" : "Đang lưu…" : editing ? "Lưu phòng" : createMode === "single" ? "Tạo phòng" : `Tạo ${bulkCodes.length || (Number.isInteger(quantityNumber) && quantityNumber > 0 ? quantityNumber : 0)} phòng`}</button></div>
    </form></section></div>}
  </AdminShell>;
}
