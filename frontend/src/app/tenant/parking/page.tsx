"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "../../components/brand-logo";
import { useAuth } from "../../components/auth-provider";
import ResidentPrimaryNavigation from "../resident-primary-navigation";
import ResidentAccountMenu from "../resident-account-menu";
import { displayName } from "../../../lib/api/authApi";
import { ApiError } from "../../../lib/api/errors";
import { parkingApi, type ParkingRequest, type ResidentParking } from "../../../lib/api/parkingApi";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const dateTimeLabel = (value: string) => new Date(value).toLocaleString("vi-VN");
const money = (value: string | null | undefined) => value == null ? "Chưa có giá hiệu lực" : `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
const requestLabel: Record<ParkingRequest["status"], string> = { pending: "Chờ chủ trọ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối", cancelled: "Đã hủy", expired: "Hết thời gian giữ chỗ" };

function vehicleCategory(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/motor|scooter|bike|xe may|xe ga|xe so/.test(normalized)) return "MOTORCYCLE";
  if (/car|oto|o to|xe hoi|xe bon cho/.test(normalized)) return "CAR";
  if (/bicycle|xe dap|xedap/.test(normalized)) return "BICYCLE";
  return "OTHER";
}

function requestStatusClass(status: ParkingRequest["status"]) {
  return status === "pending" ? "is-pending" : status === "approved" ? "is-approved" : status === "rejected" ? "is-rejected" : "";
}

function ParkingHeroIcon() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="4" />
    <circle cx="24" cy="24" r="8.5" stroke="currentColor" strokeWidth="2.5" />
    <path d="M24 7v8m12.1-2.5-5.7 5.6m12.5 5.9h-8m1.2 14.5-5.6-5.7M24 41v-8m-12.1 2.5 5.7-5.6M5.1 24h8m-1.2-10.5 5.6 5.7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="24" cy="24" r="3" fill="#FFD27A" />
  </svg>;
}

export default function ResidentParkingPage() {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ResidentParking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contractId, setContractId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleType, setVehicleType] = useState("Xe máy");
  const [plateNumber, setPlateNumber] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await parkingApi.myParking();
      setData(result);
      setContractId((current) => current || result.contracts[0]?.contract.contract_id || "");
      setAreaId((current) => current && result.available_areas.some((area) => area.parking_area.parking_area_id === current) ? current : result.available_areas[0]?.parking_area.parking_area_id || "");
      setVehicleId((current) => current || result.vehicles.find((row) => !row.in_use)?.vehicle_id || "");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Không tải được thông tin gửi xe.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant%2Fparking");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
    else if (status === "authenticated" && user?.account.role === "resident") void load();
  }, [load, router, status, user]);

  const selectedVehicle = data?.vehicles.find((row) => row.vehicle_id === vehicleId);
  const selectedArea = data?.available_areas.find((area) => area.parking_area.parking_area_id === areaId);
  const contractOptions = data?.contracts.filter((row) => row.contract.property_id === selectedArea?.property.property_id) ?? [];
  const selectedContract = contractOptions.find((row) => row.contract.contract_id === contractId);
  const pendingRequest = data?.requests.find((row) => row.status === "pending");
  const slots = useMemo(() => (data?.available_slots ?? []).filter((slot) => slot.parking_area.parking_area_id === areaId && slot.contract.contract_id === contractId && (!slot.accepted_vehicle_type || !selectedVehicle || vehicleCategory(selectedVehicle.vehicle_type) === slot.accepted_vehicle_type)), [areaId, contractId, data, selectedVehicle]);
  const activeAssignments = (data?.assignments ?? []).filter((row) => row.status === "active");
  const activeVehicleIds = new Set(activeAssignments.map((assignment) => assignment.vehicle_id));
  const pendingVehicleIds = new Set((data?.requests ?? []).filter((request) => request.status === "pending").map((request) => request.vehicle_id));

  useEffect(() => {
    if (!selectedArea) return;
    if (!contractOptions.some((row) => row.contract.contract_id === contractId)) setContractId(contractOptions[0]?.contract.contract_id ?? "");
  }, [areaId, contractId, contractOptions, selectedArea]);

  async function refreshAfter(action: () => Promise<unknown>, success: string) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(); return true; }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Không thể hoàn tất thao tác. Vui lòng thử lại."); return false; }
    finally { setBusy(false); }
  }

  async function addVehicle(event: FormEvent) {
    event.preventDefault();
    await refreshAfter(() => parkingApi.createResidentVehicle({ vehicle_type: vehicleType, ...(plateNumber.trim() ? { plate_number: plateNumber.trim() } : {}) }), "Đã lưu phương tiện của bạn.");
    setPlateNumber("");
  }

  async function sendRequest(slotId: string) {
    if (!vehicleId || !contractId) return;
    await refreshAfter(() => parkingApi.createResidentRequest({ parking_slot_id: slotId, vehicle_id: vehicleId, contract_id: contractId, started_at: today() }), "Đã gửi yêu cầu. Chỗ đỗ được giữ tối đa 24 giờ trong lúc chờ chủ trọ duyệt.");
  }

  async function deleteVehicle(id: string) {
    const vehicle = data?.vehicles.find((row) => row.vehicle_id === id);
    if (!vehicle || vehicle.in_use || vehicle.has_history || !window.confirm("Xóa phương tiện này khỏi hồ sơ của bạn?")) return;
    const deleted = await refreshAfter(() => parkingApi.deleteResidentVehicle(id), "Đã xóa phương tiện khỏi hồ sơ.");
    if (deleted && vehicleId === id) setVehicleId("");
  }

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    try { await logout(); }
    catch { setError("Không thể kết thúc phiên. Hãy kiểm tra kết nối và thử lại."); }
    finally { setLogoutPending(false); }
  }

  if (status === "loading" || (status === "authenticated" && user?.account.role === "resident" && loading && !data)) {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải bãi xe</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  }
  if (status !== "authenticated" || user?.account.role !== "resident") {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang kiểm tra quyền truy cập</h1><p>Hệ thống đang chuyển bạn đến trang phù hợp.</p></div></main>;
  }

  const name = displayName(user);
  return <main className="tenant-page resident-parking-page">
    <header className="tenant-header resident-topbar"><a href="/tenant/parking" onClick={(e) => { e.preventDefault(); window.location.reload(); }} aria-label="Tải lại trang gửi xe"><BrandLogo /></a><ResidentPrimaryNavigation active="parking" /><div className="resident-topbar-actions"><ResidentAccountMenu name={name} email={user.account.email} logoutPending={logoutPending} onLogout={() => void handleLogout()} /></div></header>
    <div className="tenant-content resident-layout">
      <section className="resident-parking-hero" aria-labelledby="resident-parking-title">
        <div className="resident-parking-hero-copy"><span className="resident-eyebrow">DỊCH VỤ CỦA BẠN · BÃI XE</span><h1 id="resident-parking-title">Chọn chỗ gửi xe phù hợp</h1><p>Đăng ký phương tiện, xem khu vực và mã chỗ đỗ trước khi gửi yêu cầu. Chỗ đỗ được giữ trong 24 giờ; đăng ký chỉ có hiệu lực sau khi chủ trọ duyệt. Phí (nếu có) sẽ được tính trong kỳ hóa đơn, không thu tại bước gửi yêu cầu.</p><div className="resident-parking-steps"><span><b>01</b> Chọn xe</span><span><b>02</b> Chọn chỗ còn trống</span><span><b>03</b> Chờ duyệt</span></div></div>
        <div className="resident-parking-hero-art" aria-hidden="true"><span className="resident-parking-orbit orbit-one" /><span className="resident-parking-orbit orbit-two" /><span className="resident-parking-hero-icon"><ParkingHeroIcon /></span><i className="resident-parking-spark spark-one" /><i className="resident-parking-spark spark-two" /></div>
      </section>
      {error && <p className="notice resident-parking-notice" role="alert">{error}<button type="button" onClick={() => void load()}>Tải lại</button></p>}
      {notice && <p className="notice success-notice resident-parking-notice" role="status">{notice}</p>}
      {loading && data && <p className="resident-parking-refresh" role="status">Đang cập nhật dữ liệu…</p>}

      <section className="resident-section resident-parking-section"><div className="resident-section-heading"><div><span className="resident-eyebrow">HỒ SƠ PHƯƠNG TIỆN</span><h2>Xe của bạn</h2></div><p>Biển số giúp chủ trọ nhận biết xe; bạn có thể bỏ trống nếu xe chưa có biển.</p></div>
        <form className="resident-parking-vehicle-form" onSubmit={(event) => void addVehicle(event)}><label>Loại phương tiện<select value={vehicleType} disabled={busy} onChange={(event) => setVehicleType(event.target.value)}><option>Xe máy</option><option>Ô tô</option><option>Xe đạp</option><option>Khác</option></select></label><label>Biển số (không bắt buộc)<input maxLength={30} value={plateNumber} disabled={busy} placeholder="Ví dụ: 59A1-123.45" onChange={(event) => setPlateNumber(event.target.value)} /></label><button className="resident-primary-button" disabled={busy}>{busy ? "Đang lưu…" : "Thêm phương tiện"}</button></form>
        {!data?.vehicles.length ? <p className="resident-parking-empty">Bạn chưa đăng ký phương tiện.</p> : <div className="resident-parking-vehicle-list">{data.vehicles.map((vehicle) => { const assigned = activeVehicleIds.has(vehicle.vehicle_id); const pending = pendingVehicleIds.has(vehicle.vehicle_id); const stateLabel = assigned ? "Đang gửi xe" : pending ? "Chờ duyệt" : vehicle.in_use ? "Đang cập nhật trạng thái" : vehicle.has_history ? "Có lịch sử gửi xe" : "Có thể đăng ký"; return <article className="resident-parking-vehicle" key={vehicle.vehicle_id}><span className="resident-parking-vehicle-icon" aria-hidden="true">{vehicle.vehicle_type.toLowerCase().includes("ô tô") ? "🚗" : vehicle.vehicle_type.toLowerCase().includes("xe đạp") ? "🚲" : "🛵"}</span><span><strong>{vehicle.plate_number || "Chưa có biển số"}</strong><small>{vehicle.vehicle_type}</small></span><span className={`resident-parking-vehicle-state ${pending || (!assigned && vehicle.in_use) ? "is-busy" : ""}`}>{stateLabel}{vehicle.has_history && <small className="resident-parking-vehicle-note">Giữ lại để bảo toàn lịch sử</small>}</span>{!vehicle.in_use && !vehicle.has_history && <button className="resident-parking-vehicle-delete" type="button" disabled={busy} onClick={() => void deleteVehicle(vehicle.vehicle_id)}>Xóa xe</button>}</article>; })}</div>}
      </section>

      <section className="resident-section resident-parking-section"><div className="resident-section-heading"><div><span className="resident-eyebrow">CHỌN BÃI XE</span><h2>Bãi xe còn chỗ</h2></div><p>Chọn bãi xe để xem các chỗ đỗ còn trống.</p></div>
        {!data?.contracts.length ? <p className="resident-parking-empty">Tài khoản chưa có hợp đồng đang ở hiệu lực. Liên hệ chủ trọ để cập nhật thông tin cư trú trước khi đăng ký gửi xe.</p> : !data?.available_areas.length ? <p className="resident-parking-empty">Chưa có bãi xe nào được chủ trọ tạo cho khu trọ trong hợp đồng của bạn.</p> : <>
          <div className="resident-parking-controls"><label>Bãi xe<select value={areaId} disabled={busy} onChange={(event) => setAreaId(event.target.value)}>{data.available_areas.map((area) => <option key={area.parking_area.parking_area_id} value={area.parking_area.parking_area_id}>{area.property.name} · {area.parking_area.name}</option>)}</select></label>{contractOptions.length > 1 && <label>Hợp đồng áp dụng<select value={selectedContract?.contract.contract_id ?? ""} disabled={busy} onChange={(event) => setContractId(event.target.value)}>{contractOptions.map((context) => <option key={context.contract.contract_id} value={context.contract.contract_id}>{context.room.property.name} · {context.contract.contract_no}</option>)}</select></label>}<label>Phương tiện<select value={vehicleId} disabled={busy} onChange={(event) => setVehicleId(event.target.value)}><option value="">Chọn phương tiện</option>{data.vehicles.filter((vehicle) => !vehicle.in_use).map((vehicle) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.plate_number || vehicle.vehicle_type} · {vehicle.vehicle_type}</option>)}</select></label><button className="resident-parking-refresh-button" type="button" disabled={loading || busy} onClick={() => void load()}>{loading ? "Đang tải…" : "Làm mới"}</button></div>
          {pendingRequest && <p className="resident-parking-hold-note">Bạn đang có yêu cầu chờ duyệt tại chỗ đỗ {pendingRequest.parking_slot?.slot_code ?? "đã chọn"}. Hãy hủy yêu cầu hiện tại nếu muốn chọn slot khác.</p>}
          {!selectedVehicle && <p className="resident-parking-empty">Chọn hoặc thêm phương tiện phía trên để xem các chỗ đỗ phù hợp trong bãi xe này.</p>}
          {selectedArea && selectedVehicle && !slots.length && !pendingRequest && <p className="resident-parking-empty">Hiện không có chỗ đỗ phù hợp trong bãi xe {selectedArea.parking_area.name}. Hãy tải lại danh sách. Nếu vẫn chưa có chỗ, chủ trọ cần kiểm tra tình trạng chỗ đỗ, loại xe, mức phí và sức chứa gửi xe của hợp đồng.</p>}
          {selectedContract && selectedVehicle && slots.length > 0 && <div className="resident-parking-slot-grid">{slots.map((slot) => { const price = slot.entitlement.pricing_item?.price_versions.filter((version) => version.effective_from <= today()).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]; return <article className="resident-parking-slot-card" key={slot.parking_slot_id}><div className="resident-parking-slot-top"><span className="resident-parking-slot-icon" aria-hidden="true"><ParkingHeroIcon /></span><span className="resident-parking-free">Còn trống</span></div><span className="resident-eyebrow">{slot.property.name}</span><h3>{slot.parking_area.name} · {slot.slot_code}</h3><p className="resident-parking-slot-location">{slot.parking_area.location || slot.property.address}</p><dl><div><dt>Loại xe</dt><dd>{slot.accepted_vehicle_type === "MOTORCYCLE" ? "Xe máy" : slot.accepted_vehicle_type === "CAR" ? "Ô tô" : slot.accepted_vehicle_type === "BICYCLE" ? "Xe đạp" : slot.accepted_vehicle_type === "OTHER" ? "Khác" : "Mọi loại xe"}</dd></div><div><dt>Phí</dt><dd>{slot.entitlement.billability === "FREE" ? "Miễn phí" : `${money(price?.unit_price)} / ${slot.entitlement.pricing_item?.unit ?? "kỳ"}`}</dd></div></dl>{slot.entitlement.billability === "PAID" && <small className="resident-parking-price-note">Giá hiển thị là giá hiện hành tham khảo; hóa đơn áp dụng phiên bản giá theo kỳ.</small>}<button className="resident-parking-request-button" type="button" disabled={busy || Boolean(pendingRequest)} onClick={() => void sendRequest(slot.parking_slot_id)}>{busy ? "Đang gửi…" : pendingRequest ? "Đang chờ duyệt" : "Gửi yêu cầu"}</button></article>; })}</div>}
        </>}
      </section>

      <section className="resident-section resident-parking-section"><div className="resident-section-heading"><div><span className="resident-eyebrow">THEO DÕI ĐĂNG KÝ</span><h2>Lịch sử yêu cầu</h2></div><p>Yêu cầu chờ duyệt giữ chỗ đỗ trong 24 giờ. Nếu hết hạn, bạn có thể gửi yêu cầu mới.</p></div>
        {!data?.requests.length ? <p className="resident-parking-empty">Chưa có yêu cầu gửi xe nào.</p> : <div className="resident-parking-history">{data.requests.map((request) => <article className="resident-parking-history-card" key={request.request_id}><div className="resident-parking-history-main"><span className="resident-eyebrow">{request.parking_slot?.parking_area?.name ?? "Khu vực bãi xe"} · Chỗ đỗ {request.parking_slot?.slot_code ?? "đã chọn"}</span><strong>{request.vehicle?.plate_number || request.vehicle?.vehicle_type || "Phương tiện"}</strong><small>Bắt đầu {dateLabel(request.started_at)} · Gửi lúc {dateTimeLabel(request.requested_at)}</small>{request.status === "pending" && <small>Chỗ đỗ được giữ đến {dateTimeLabel(request.expires_at)}</small>}{request.review_note && <small>{request.review_note}</small>}</div><span className={`resident-parking-history-status ${requestStatusClass(request.status)}`}>{requestLabel[request.status]}</span>{request.status === "pending" && <button className="resident-parking-cancel-button" type="button" disabled={busy} onClick={() => void refreshAfter(() => parkingApi.cancelResidentRequest(request.request_id), "Đã hủy yêu cầu; slot được trả lại cho danh sách.")}>Hủy yêu cầu</button>}</article>)}</div>}
      </section>

      <section className="resident-section resident-parking-section"><div className="resident-section-heading"><div><span className="resident-eyebrow">CHỖ ĐÃ ĐƯỢC DUYỆT</span><h2>Đăng ký đang hoạt động</h2></div><p>Phí định kỳ, nếu có, được tổng hợp trong hóa đơn theo quy tắc hiện tại.</p></div>
        {!activeAssignments.length ? <p className="resident-parking-empty">Chưa có đăng ký gửi xe đang hoạt động.</p> : <div className="resident-parking-history">{activeAssignments.map((assignment) => <article className="resident-parking-history-card" key={assignment.assignment_id}><div className="resident-parking-history-main"><span className="resident-eyebrow">{assignment.parking_slot.parking_area.name} · Chỗ đỗ {assignment.parking_slot.slot_code}</span><strong>{assignment.vehicle.plate_number || assignment.vehicle.vehicle_type}</strong><small>Bắt đầu {dateLabel(assignment.started_at)} · {assignment.room.room_code} · {assignment.contract.contract_no}</small></div><span className="resident-parking-history-status is-approved">{assignment.entitlement?.billability === "FREE" ? "Đang gửi · miễn phí" : assignment.entitlement?.billability === "PAID" ? "Đang gửi · trả phí" : "Đang gửi"}</span></article>)}</div>}
      </section>
    </div>
  </main>;
}
