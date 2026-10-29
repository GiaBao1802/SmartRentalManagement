"use client";

import BrandLogo from "../components/brand-logo";
import ResidentPrimaryNavigation from "./resident-primary-navigation";
import ResidentAccountMenu from "./resident-account-menu";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/auth-provider";
import { displayName } from "../../lib/api/authApi";
import { ApiError } from "../../lib/api/errors";
import type { ContractDocument, ContractDocumentRead } from "../../lib/api/contractApi";
import { contractStatusLabel, effectiveContractEnd, formatContractMoney } from "../../lib/api/contractView";
import { residentApi, type MeRental, type ResidentContractDetail, type ResidentContractSummary } from "../../lib/api/residentApi";

const residenceLabels = { living: "Đang ở", left: "Đã rời đi" } as const;
const registrationLabels = { not_completed: "Chưa hoàn tất đăng ký lưu trú", temporary_resident: "Đã đăng ký tạm trú", temporary_absence: "Đăng ký tạm vắng" } as const;
const contractLabels: Record<string, string> = { draft: contractStatusLabel("draft"), active: contractStatusLabel("active"), expired: contractStatusLabel("expired"), terminated: contractStatusLabel("terminated") };
const showDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const showMoney = formatContractMoney;

type ResidentIconName = "phone" | "email" | "home" | "registration" | "pin" | "calendar" | "document" | "people" | "shield";

function ResidentIcon({ name }: { name: ResidentIconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === "phone" && <><path d="M6.6 3.8h2.8l1.3 4.1-1.8 1.7a15 15 0 0 0 5.5 5.5l1.7-1.8 4.1 1.3v2.8a2 2 0 0 1-2.2 2A16.7 16.7 0 0 1 4.6 6a2 2 0 0 1 2-2.2Z" /></>}
    {name === "email" && <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7 7.5 6 7.5-6" /></>}
    {name === "home" && <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" /></>}
    {name === "registration" && <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h2m4 0h2M8 12h2m4 0h2M8 16h2m4 0h2" /></>}
    {name === "pin" && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>}
    {name === "calendar" && <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17" /></>}
    {name === "document" && <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v5h5M10 13h5m-5 3h5" /></>}
    {name === "people" && <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.4-3.1 2.2-4.7 5.5-4.7s5.1 1.6 5.5 4.7M16 5.5a3 3 0 0 1 0 5.8m1 3c2.2.5 3.4 2 3.6 4.7" /></>}
    {name === "shield" && <><path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>}
  </svg>;
}

function ResidentRoomPhoto({ occupancy }: { occupancy: MeRental["occupancies"][number] }) {
  const [failed, setFailed] = useState(false);
  const photo = occupancy.room?.cover_image;
  return <div className="resident-room-photo">
    {photo && !failed ? <><img src={`/api/me/room-images/${encodeURIComponent(photo.room_image_id)}`} alt={`Ảnh phòng ${occupancy.room?.room_code ?? "đang thuê"}`} loading="lazy" onError={() => setFailed(true)} />{photo.is_illustrative && <span>Ảnh minh họa</span>}</> : <div className="resident-room-photo-placeholder"><ResidentIcon name="home" /><small>{failed ? "Ảnh chưa tải được" : "Chưa có ảnh phòng"}</small></div>}
  </div>;
}

function ResidentHeroScene({ occupancy }: { occupancy: MeRental["occupancies"][number] | undefined }) {
  const roomImages = occupancy?.room?.images?.length
    ? occupancy.room.images
    : occupancy?.room?.cover_image ? [occupancy.room.cover_image] : [];
  const coverIndex = Math.max(0, roomImages.findIndex((image) => image.is_cover));
  const galleryKey = roomImages.map((image) => image.room_image_id).join(",");
  const [activeIndex, setActiveIndex] = useState(coverIndex);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [demoFailed, setDemoFailed] = useState(false);
  useEffect(() => { setActiveIndex(coverIndex); setFailedImages([]); setDemoFailed(false); }, [occupancy?.occupancy_id, galleryKey, coverIndex]);
  const availableImages = roomImages.filter((image) => !failedImages.includes(image.room_image_id));
  const selectedImage = roomImages.length
    ? roomImages.slice(activeIndex).concat(roomImages.slice(0, activeIndex)).find((image) => !failedImages.includes(image.room_image_id))
    : undefined;
  const imageUrl = selectedImage
    ? `/api/me/room-images/${encodeURIComponent(selectedImage.room_image_id)}`
    : !demoFailed ? "/api/public/room-images/101" : null;
  const moveImage = (direction: -1 | 1) => {
    if (roomImages.length < 2) return;
    setActiveIndex((current) => (current + direction + roomImages.length) % roomImages.length);
  };
  return <div className="resident-art-scene">
    {imageUrl ? <>
      <img src={imageUrl} alt={selectedImage ? `Ảnh ${activeIndex + 1} phòng ${occupancy?.room?.room_code ?? "đang thuê"}` : "Ảnh minh họa phòng trọ"} onError={() => selectedImage ? setFailedImages((current) => [...current, selectedImage.room_image_id]) : setDemoFailed(true)} />
      {(!selectedImage || selectedImage.is_illustrative) && <span className="resident-art-photo-label">Ảnh minh họa</span>}
      {availableImages.length > 1 && <>
        <button className="resident-art-photo-control is-previous" type="button" aria-label="Xem ảnh phòng trước" onClick={() => moveImage(-1)}>‹</button>
        <button className="resident-art-photo-control is-next" type="button" aria-label="Xem ảnh phòng tiếp theo" onClick={() => moveImage(1)}>›</button>
        <span className="resident-art-photo-count" aria-live="polite">{availableImages.indexOf(selectedImage!) + 1}/{availableImages.length}</span>
      </>}
    </> : <svg aria-hidden="true" viewBox="0 0 360 220" fill="none"><path d="M42 182c28-28 67-42 118-42 65 0 113 21 159 57v23H42v-38Z" fill="#D7E8DE"/><path d="m101 115 75-65 82 65v84H101v-84Z" fill="#F3F5F2"/><path d="m86 119 90-78 96 78" stroke="#FFB020" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/><path d="M101 116h157" stroke="#0B2B2A" strokeOpacity=".15" strokeWidth="2"/><rect x="126" y="128" width="34" height="31" rx="5" fill="#C7DED4"/><rect x="196" y="128" width="34" height="31" rx="5" fill="#C7DED4"/><path d="M164 199v-46c0-8 6-14 14-14s14 6 14 14v46" fill="#0E5A4F"/><rect x="177" y="169" width="6" height="6" rx="3" fill="#FFB020"/><path d="M47 199h264" stroke="#0B2B2A" strokeOpacity=".22" strokeWidth="3" strokeLinecap="round"/><path d="M61 113c0-17 14-31 31-31v31H61Zm203 20c0-17 14-31 31-31v31h-31Z" fill="#0E5A4F" fillOpacity=".65"/></svg>}
  </div>;
}

export default function TenantPortal() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const [data, setData] = useState<MeRental | null>(null);
  const [contracts, setContracts] = useState<ResidentContractSummary[]>([]);
  const [contractPage, setContractPage] = useState(1);
  const [contractMeta, setContractMeta] = useState({ page: 1, page_size: 20, total_items: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [contractDetails, setContractDetails] = useState<Record<string, ResidentContractDetail>>({});
  const [contractDocuments, setContractDocuments] = useState<Record<string, ContractDocument[]>>({});
  const [contractLoadingId, setContractLoadingId] = useState<string | null>(null);
  const [contractError, setContractError] = useState("");
  const [contractDocumentErrors, setContractDocumentErrors] = useState<Record<string, string>>({});
  const [documentReadResults, setDocumentReadResults] = useState<Record<string, ContractDocumentRead | null>>({});
  const [documentLoadingId, setDocumentLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [rental, contractsResult] = await Promise.all([residentApi.meRental(), residentApi.meContracts(contractPage, 20)]); setData(rental); setContracts(contractsResult.data); setContractMeta(contractsResult.meta); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không tải được thông tin nơi ở."); }
    finally { setLoading(false); }
  }, [contractPage]);

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try {
      await logout();
    } catch {
      setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy kiểm tra kết nối và thử lại.");
    } finally {
      setLogoutPending(false);
    }
  }

  async function toggleContractDetail(contractId: string) {
    if (contractDetails[contractId]) { setContractDetails((current) => { const next = { ...current }; delete next[contractId]; return next; }); return; }
    if (contractLoadingId) return;
    setContractLoadingId(contractId); setContractError("");
    try {
      const detail = await residentApi.contractDetail(contractId);
      setContractDetails((current) => ({ ...current, [contractId]: detail }));
    } catch (reason) { setContractError(reason instanceof ApiError ? reason.message : "Không tải được chi tiết hợp đồng trong phạm vi hồ sơ của bạn."); }
    try {
      const documents = await residentApi.contractDocuments(contractId);
      setContractDocuments((current) => ({ ...current, [contractId]: documents }));
      setContractDocumentErrors((current) => { const next = { ...current }; delete next[contractId]; return next; });
    } catch (reason) {
      setContractDocumentErrors((current) => ({ ...current, [contractId]: reason instanceof ApiError ? reason.message : "Chưa thể tải danh sách tài liệu hợp đồng. Vui lòng thử lại." }));
    }
    finally { setContractLoadingId(null); }
  }

  async function readResidentDocument(documentId: string) {
    if (documentLoadingId) return;
    setDocumentLoadingId(documentId);
    try {
      const result = await residentApi.contractDocument(documentId);
      setDocumentReadResults((current) => ({ ...current, [documentId]: result }));
      if (result.download_url) window.open(result.download_url, "_blank", "noopener,noreferrer");
      else setContractError("Tài liệu này hiện chưa thể mở. Vui lòng liên hệ chủ trọ để được hỗ trợ.");
    } catch (reason) {
      setContractError(reason instanceof ApiError ? reason.message : "Không thể đọc tài liệu trong phạm vi hợp đồng của bạn.");
    } finally { setDocumentLoadingId(null); }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
    else if (status === "authenticated" && user?.account.role === "resident") void load();
  }, [load, router, status, user]);

  if (status === "loading" || loading) return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ResidentIcon name="home" /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải thông tin cư trú</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  if (status !== "authenticated" || user?.account.role !== "resident") return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ResidentIcon name="shield" /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang chuyển đến trang phù hợp</h1><p>Hệ thống đang kiểm tra phiên đăng nhập của bạn.</p><span className="resident-progress" aria-label="Đang chuyển trang" /></div></main>;
  if (error) return <main className="tenant-page resident-state-page"><section className="resident-state-card"><span className="resident-state-symbol is-warning"><ResidentIcon name="home" /></span><span className="resident-eyebrow">CHƯA TẢI ĐƯỢC DỮ LIỆU</span><h1>Thông tin cư trú chưa sẵn sàng</h1><p role="alert">{error}</p>{logoutError && <p role="alert">{logoutError}</p>}<div className="resident-state-actions"><button className="resident-primary-button" type="button" onClick={() => void load()}>Thử tải lại</button><button className="resident-secondary-button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div></section></main>;
  if (!data) return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ResidentIcon name="home" /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Chưa có thông tin nơi ở</h1><p>Hồ sơ của bạn hiện chưa có dữ liệu cư trú để hiển thị.</p></div></main>;

  const name = displayName(user) || data.resident.full_name;
  const activeOccupancy = data.occupancies.find((occupancy) => occupancy.status === "active");
  const currentPlace = activeOccupancy ? `${activeOccupancy.room?.property?.name ?? "Khu trọ"} · Phòng ${activeOccupancy.room?.room_code ?? activeOccupancy.room_id}` : "Chưa có nơi ở hiện tại";
  return <main className="tenant-page resident-home">
    <header className="tenant-header resident-topbar">
      <a href="/" aria-label="Trang chủ Góc trọ"><BrandLogo /></a>
      <ResidentPrimaryNavigation active="overview" />
      <div className="resident-topbar-actions"><ResidentAccountMenu name={name} email={user.account.email} logoutPending={logoutPending} onLogout={() => void handleLogout()} /></div>
    </header>
    {logoutError && <p className="notice resident-top-notice" role="alert">{logoutError}</p>}
    <div className="tenant-content resident-layout">
      <section className="resident-hero" aria-labelledby="resident-welcome-title">
        <div className="resident-hero-copy"><span className="resident-eyebrow">CỔNG CƯ DÂN <span aria-hidden="true">·</span> TÌM DỄ, Ở YÊN</span><h1 id="resident-welcome-title">Xin chào,<br /><span>{name}</span></h1><p>Chào mừng bạn trở về góc nhỏ của mình. Thông tin nơi ở và hợp đồng được đồng bộ từ hồ sơ cư dân.</p><div className="resident-trust-note"><span><ResidentIcon name="shield" /></span><span>Thông tin riêng tư, chỉ dành cho tài khoản cư dân của bạn.</span></div></div>
        <div className="resident-hero-art">
          <div className="resident-art-grid"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><span className="resident-art-sun" />
          <div className="resident-art-window"><div className="resident-art-window-bar"><span className="resident-art-lights"><i /><i /><i /></span><span>Góc Trọ <b>·</b> Không gian của bạn</span></div><ResidentHeroScene key={activeOccupancy?.occupancy_id ?? "no-occupancy"} occupancy={activeOccupancy} /></div>
          <div className="resident-art-location"><span className="resident-art-pin"><ResidentIcon name="pin" /></span><span><small>NƠI Ở CỦA BẠN</small><strong>{currentPlace}</strong></span><span className="resident-art-status"><i />{activeOccupancy ? "Đang ở" : "Hồ sơ"}</span></div>
        </div>
      </section>

      <section className="resident-section resident-profile-section" aria-labelledby="tenant-profile-heading">
        <div className="resident-section-heading"><div><span className="resident-eyebrow">HỒ SƠ CỦA BẠN</span><h2 id="tenant-profile-heading">Thông tin cư trú</h2></div><p>Thông tin liên hệ và trạng thái được đồng bộ từ hồ sơ cư dân.</p></div>
        <div className="resident-profile-grid">
          <article className="resident-info-card"><span className="resident-info-icon"><ResidentIcon name="phone" /></span><div><span className="resident-field-label">Điện thoại</span><strong>{data.resident.phone ?? "Chưa cập nhật"}</strong></div><span className="resident-info-accent" aria-hidden="true" /></article>
          <article className="resident-info-card"><span className="resident-info-icon"><ResidentIcon name="email" /></span><div><span className="resident-field-label">Email</span><strong>{data.resident.email ?? "Chưa cập nhật"}</strong></div><span className="resident-info-accent" aria-hidden="true" /></article>
          <article className="resident-info-card"><span className="resident-info-icon"><ResidentIcon name="home" /></span><div><span className="resident-field-label">Trạng thái cư trú</span><strong><span className={`chip ${data.resident.residence_status === "living" ? "success" : "neutral"}`}>{residenceLabels[data.resident.residence_status]}</span></strong></div><span className="resident-info-accent" aria-hidden="true" /></article>
          <article className="resident-info-card"><span className="resident-info-icon"><ResidentIcon name="registration" /></span><div><span className="resident-field-label">Đăng ký lưu trú</span><strong><span className={`chip ${data.resident.residence_registration_status === "not_completed" ? "warning" : data.resident.residence_registration_status === "temporary_resident" ? "success" : "neutral"}`}>{registrationLabels[data.resident.residence_registration_status]}</span></strong></div><span className="resident-info-accent" aria-hidden="true" /></article>
        </div>
      </section>

      <section className="resident-panel" aria-labelledby="resident-occupancy-heading">
        <div className="resident-section-heading"><div><span className="resident-eyebrow">KHÔNG GIAN CỦA BẠN</span><h2 id="resident-occupancy-heading">Nơi ở &amp; lịch sử cư trú</h2></div><span className="resident-count-pill"><ResidentIcon name="home" />{data.occupancies.length} lượt ở</span></div>
        <div className="resident-record-list">{data.occupancies.length ? data.occupancies.map((occupancy) => <article className="resident-occupancy-card" key={occupancy.occupancy_id}>
          <ResidentRoomPhoto occupancy={occupancy} /><div className="resident-record-main"><div className="resident-record-title"><div><span className="resident-field-label">{occupancy.room?.property?.name ?? "Khu trọ"}</span><h3>Phòng {occupancy.room?.room_code ?? occupancy.room_id}</h3></div><span className={`resident-status-pill ${occupancy.status === "active" ? "is-active" : "is-history"}`}><i />{occupancy.status === "active" ? "Đang hoạt động" : "Đã kết thúc"}</span></div>
          <p className="resident-record-address"><ResidentIcon name="pin" />{occupancy.room?.property?.address ?? occupancy.room?.property?.province ?? "Chưa có địa chỉ"}</p>
          <div className="resident-facts"><div><span><ResidentIcon name="calendar" />Thời gian cư trú</span><strong>{showDate(occupancy.started_at)} – {showDate(occupancy.ended_at)}</strong></div><div><span><ResidentIcon name="document" />Hợp đồng liên kết</span><strong>{occupancy.contract ? `${occupancy.contract.contract_no} · ${contractLabels[occupancy.contract.status] ?? occupancy.contract.status}` : "Không có"}</strong></div></div>
        </div></article>) : <div className="resident-empty-state"><span className="resident-empty-icon"><ResidentIcon name="home" /></span><div><h3>Chưa có lượt cư trú</h3><p>Thông tin nơi ở sẽ xuất hiện ở đây khi được liên kết với hồ sơ của bạn.</p></div></div>}</div>
      </section>

      <section className="resident-panel resident-contracts-panel" aria-labelledby="resident-contract-heading">
        <div className="resident-section-heading"><div><span className="resident-eyebrow">THỎA THUẬN THUÊ NHÀ</span><h2 id="resident-contract-heading">Hợp đồng của bạn</h2></div><span className="resident-count-pill"><ResidentIcon name="document" />{contractMeta.total_items} hợp đồng</span></div>
        {contractError && <p className="notice resident-inline-notice" role="alert">{contractError}</p>}
        <div className="resident-contract-list">{contracts.length ? contracts.map((contract) => {
          const detail = contractDetails[contract.contract_id]; const docs = contractDocuments[contract.contract_id] ?? [];
          return <article className="resident-contract-card" key={contract.contract_id}>
            <div className="resident-contract-top"><span className="resident-record-icon"><ResidentIcon name="document" /></span><div className="resident-contract-identity"><span className="resident-field-label">MÃ HỢP ĐỒNG</span><strong>{contract.contract_no}</strong></div><span className={`resident-contract-status ${contract.status === "active" ? "is-active" : contract.status === "draft" ? "is-draft" : "is-neutral"}`}>{contractLabels[contract.status] ?? contract.status}</span><button className="resident-detail-button" type="button" aria-expanded={Boolean(detail)} disabled={contractLoadingId !== null} onClick={() => void toggleContractDetail(contract.contract_id)}>{contractLoadingId === contract.contract_id ? "Đang tải…" : detail ? "Ẩn chi tiết" : "Xem chi tiết"}<span aria-hidden="true">{detail ? "−" : "+"}</span></button></div>
            <div className="resident-contract-facts"><div><span><ResidentIcon name="calendar" />Thời hạn hợp đồng</span><strong>{showDate(contract.start_date)} – {showDate(contract.end_date)}</strong></div><div><span><ResidentIcon name="people" />Sức chứa</span><strong>{contract.resident_capacity} người</strong></div><div><span className="resident-rent-label">Tiền thuê / tháng</span><strong className="resident-rent-value">{showMoney(contract.rent_amount)}</strong></div>{contract.successor && <div><span><ResidentIcon name="document" />Hợp đồng kế tiếp</span><strong>{contract.successor.contract_no} · {contractLabels[contract.successor.status] ?? contract.successor.status}</strong></div>}</div>
            {detail && <div className="resident-contract-detail">
              <div className="resident-detail-heading"><div><span className="resident-eyebrow">CHI TIẾT</span><h3>Điều khoản hợp đồng</h3></div><span className={`resident-contract-status ${detail.status === "active" ? "is-active" : detail.status === "draft" ? "is-draft" : "is-neutral"}`}>{contractLabels[detail.status] ?? detail.status}</span></div>
              <div className="resident-detail-facts"><p><span>Khu vực / phòng</span><strong>{detail.room?.property?.name ?? "Khu trọ"} · {detail.room?.room_code ?? "—"}{detail.room?.property?.province ? ` · ${detail.room.property.province}` : ""}</strong></p><p><span>Ngày bắt đầu</span><strong>{showDate(detail.start_date)}</strong></p><p><span>Ngày hết hạn theo hợp đồng</span><strong>{showDate(detail.end_date)}</strong></p>{detail.termination_date && <p><span>Ngày chấm dứt hiệu lực</span><strong>{showDate(detail.termination_date)}{detail.termination_reason ? ` · ${detail.termination_reason}` : ""}</strong></p>}<p><span>Ngày kết thúc hiệu lực</span><strong>{showDate(effectiveContractEnd(detail))}</strong></p><p><span>Tiền thuê / tháng</span><strong>{showMoney(detail.rent_amount)}</strong></p><p><span>Tiền cọc</span><strong>{showMoney(detail.deposit_amount)}</strong></p><p><span>Sức chứa</span><strong>{detail.resident_capacity} người</strong></p>{detail.deposit_deduction !== null && <p><span>Quyết toán cọc</span><strong>Khấu trừ {showMoney(detail.deposit_deduction)} · hoàn lại {showMoney(detail.deposit_settlement_amount)}</strong></p>}{detail.successor && <p><span>Hợp đồng kế tiếp</span><strong>{detail.successor.contract_no} · {contractLabels[detail.successor.status] ?? detail.successor.status}</strong></p>}</div>
              <section className="resident-contract-documents"><div className="resident-documents-heading"><h4>Tài liệu hợp đồng</h4><span>{docs.length} tài liệu</span></div>{contractDocumentErrors[contract.contract_id] && <p className="notice resident-inline-notice" role="alert">{contractDocumentErrors[contract.contract_id]}</p>}{docs.length ? docs.map((document) => {
                const readResult = documentReadResults[document.document_id];
                return <div className="resident-contract-document" key={document.document_id}><span className="resident-document-icon"><ResidentIcon name="document" /></span><span className="resident-document-copy"><strong>{document.file_name}</strong><small>{document.document_type} · phiên bản {document.version}</small></span><button className="resident-document-button" type="button" disabled={documentLoadingId !== null} onClick={() => void readResidentDocument(document.document_id)}>{documentLoadingId === document.document_id ? "Đang mở…" : "Mở tài liệu"}</button>{readResult && !readResult.download_url && <small className="resident-document-note">Tài liệu hiện chưa thể mở. Vui lòng liên hệ chủ trọ.</small>}</div>;
              }) : <p className="resident-empty-copy">Chưa có tài liệu nào được chia sẻ cho hợp đồng này.</p>}</section>
            </div>}
          </article>;
        }) : <div className="resident-empty-state"><span className="resident-empty-icon"><ResidentIcon name="document" /></span><div><h3>Chưa có hợp đồng liên kết</h3><p>Hợp đồng của bạn sẽ được hiển thị tại đây.</p></div></div>}</div>
        {contractMeta.total_pages > 1 && <div className="resident-pagination"><span>Trang {contractMeta.page} / {contractMeta.total_pages}<small>{contractMeta.total_items} hợp đồng</small></span><div><button className="resident-page-button" type="button" disabled={loading || contractPage <= 1} onClick={() => setContractPage((value) => value - 1)}>← <span>Trước</span></button><button className="resident-page-button" type="button" disabled={loading || contractPage >= contractMeta.total_pages} onClick={() => setContractPage((value) => value + 1)}><span>Sau</span> →</button></div></div>}
      </section>
      <footer className="resident-footer"><span className="resident-footer-mark"><ResidentIcon name="shield" /></span><span>Góc Trọ <b>·</b> Cổng cư dân</span><span className="resident-footer-caption">Một góc yên tâm.</span></footer>
    </div>
  </main>;
}
