"use client";

import BrandLogo from "../components/brand-logo";
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
      setContractDocumentErrors((current) => ({ ...current, [contractId]: reason instanceof ApiError ? reason.message : "Không tải được metadata tài liệu hợp đồng." }));
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
      else setContractError("Metadata tài liệu đã tải; tệp binary chưa có URL đọc vì kho lưu trữ chưa được cấu hình.");
    } catch (reason) {
      setContractError(reason instanceof ApiError ? reason.message : "Không thể đọc tài liệu trong phạm vi hợp đồng của bạn.");
    } finally { setDocumentLoadingId(null); }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
    else if (status === "authenticated" && user?.account.role === "resident") void load();
  }, [load, router, status, user]);

  if (status === "loading" || loading) return <main className="tenant-loading">Đang tải thông tin cư trú…</main>;
  if (status !== "authenticated" || user?.account.role !== "resident") return <main className="tenant-loading">Đang chuyển đến trang phù hợp…</main>;
  if (error) return <main className="tenant-loading"><p role="alert">{error}</p>{logoutError && <p role="alert">{logoutError}</p>}<button className="button primary" type="button" onClick={() => void load()}>Thử tải lại</button><button className="button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></main>;
  if (!data) return <main className="tenant-loading">Không có dữ liệu nơi ở.</main>;

  const name = displayName(user) || data.resident.full_name;
  return <main className="tenant-page"><header className="tenant-header"><a href="/" aria-label="Trang chủ Góc trọ"><BrandLogo /></a><div><span>{name}</span><button className="button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div></header>{logoutError && <p className="notice" role="alert">{logoutError}</p>}<div className="tenant-content">
    <div className="tenant-welcome"><span className="eyebrow">CỔNG CƯ DÂN</span><h1>Xin chào, {name}</h1><p>Thông tin nơi ở được tải từ hồ sơ của bạn; trạng thái cư trú do hệ thống đồng bộ từ các lượt ở.</p></div>
    <section className="tenant-profile"><div><span>Điện thoại</span><strong>{data.resident.phone ?? "Chưa cập nhật"}</strong></div><div><span>Email</span><strong>{data.resident.email ?? "Chưa cập nhật"}</strong></div><div><span>Trạng thái cư trú</span><strong><span className={`chip ${data.resident.residence_status === "living" ? "success" : "neutral"}`}>{residenceLabels[data.resident.residence_status]}</span></strong></div><div><span>Trạng thái đăng ký lưu trú</span><strong><span className={`chip ${data.resident.residence_registration_status === "not_completed" ? "warning" : data.resident.residence_registration_status === "temporary_resident" ? "success" : "neutral"}`}>{registrationLabels[data.resident.residence_registration_status]}</span></strong></div></section>
    <section className="tenant-card"><h2>Nơi ở hiện tại và lịch sử cư trú</h2>{data.occupancies.length ? data.occupancies.map((occupancy) => <article className="tenant-contract" key={occupancy.occupancy_id}><div><strong>{occupancy.room?.property?.name ?? "Khu trọ"} · Phòng {occupancy.room?.room_code ?? occupancy.room_id}</strong><span>{occupancy.room?.property?.address ?? occupancy.room?.property?.province ?? ""}</span></div><div><span>Thời gian cư trú</span><strong>{showDate(occupancy.started_at)} – {showDate(occupancy.ended_at)}</strong></div><div><span>Trạng thái lượt ở</span><strong><span className={`chip ${occupancy.status === "active" ? "success" : "neutral"}`}>{occupancy.status === "active" ? "Đang hoạt động" : "Đã kết thúc"}</span></strong></div><div><span>Hợp đồng liên kết</span><strong>{occupancy.contract ? `${occupancy.contract.contract_no} · ${contractLabels[occupancy.contract.status] ?? occupancy.contract.status}` : "Không có"}</strong></div></article>) : <p>Chưa có lượt cư trú trong hồ sơ.</p>}</section>
    <section className="tenant-card"><h2>Hợp đồng của bạn</h2>{contractError && <p className="notice" role="alert">{contractError}</p>}{contracts.length ? contracts.map((contract) => {
      const detail = contractDetails[contract.contract_id]; const docs = contractDocuments[contract.contract_id] ?? [];
      return <article className="tenant-contract resident-contract-card" key={contract.contract_id}>
        <div><span>Mã hợp đồng</span><strong>{contract.contract_no}</strong></div>
        <div><span>Thời hạn ghi trong hợp đồng</span><strong>{showDate(contract.start_date)} – {showDate(contract.end_date)}</strong></div>
        <div><span>Trạng thái</span><strong><span className={`chip ${contract.status === "active" ? "success" : contract.status === "draft" ? "warning" : "neutral"}`}>{contractLabels[contract.status] ?? contract.status}</span></strong></div>
        <div><span>Tiền thuê / tháng</span><strong>{showMoney(contract.rent_amount)}</strong></div>
        <div><span>Sức chứa theo hợp đồng</span><strong>{contract.resident_capacity} người</strong></div>
        {contract.successor && <div><span>Hợp đồng kế tiếp</span><strong>{contract.successor.contract_no} · {contractLabels[contract.successor.status] ?? contract.successor.status}</strong></div>}
        <div><button className="button" type="button" aria-expanded={Boolean(detail)} disabled={contractLoadingId !== null} onClick={() => void toggleContractDetail(contract.contract_id)}>{contractLoadingId === contract.contract_id ? "Đang tải…" : detail ? "Ẩn chi tiết" : "Xem chi tiết"}</button></div>
        {detail && <div className="wide-field resident-contract-detail">
          <h3>Điều khoản hợp đồng</h3><p><strong>{detail.contract_no} · {contractLabels[detail.status] ?? detail.status}</strong></p>
          <p>Khu vực / phòng: {detail.room?.property?.name ?? "Khu trọ"} · {detail.room?.room_code ?? "—"}{detail.room?.property?.province ? ` · ${detail.room.property.province}` : ""}</p>
          <p>Ngày bắt đầu: {showDate(detail.start_date)} · Ngày hết hạn theo hợp đồng: {showDate(detail.end_date)}</p>
          {detail.termination_date && <p>Ngày chấm dứt hiệu lực: {showDate(detail.termination_date)}{detail.termination_reason ? ` · ${detail.termination_reason}` : ""}</p>}
          <p>Ngày kết thúc hiệu lực: {showDate(effectiveContractEnd(detail))}</p>
          <p>Tiền thuê / tháng: {showMoney(detail.rent_amount)} · Tiền cọc: {showMoney(detail.deposit_amount)} · Sức chứa: {detail.resident_capacity} người</p>
          {detail.deposit_deduction !== null && <p>Quyết toán cọc: khấu trừ {showMoney(detail.deposit_deduction)} · hoàn lại {showMoney(detail.deposit_settlement_amount)}</p>}
          {detail.successor && <p>Hợp đồng kế tiếp được API cho phép xem: {detail.successor.contract_no} · {contractLabels[detail.successor.status] ?? detail.successor.status}</p>}
          <section className="resident-contract-documents"><h4>Tài liệu</h4>{contractDocumentErrors[contract.contract_id] && <p role="alert">{contractDocumentErrors[contract.contract_id]}</p>}{docs.length ? docs.map((document) => {
            const readResult = documentReadResults[document.document_id];
            return <div className="resident-contract-document" key={document.document_id}><span><strong>{document.file_name}</strong><small>{document.document_type} · phiên bản {document.version} · {document.mime_type} · {document.file_size} bytes</small></span><button className="button" type="button" disabled={documentLoadingId !== null} onClick={() => void readResidentDocument(document.document_id)}>{documentLoadingId === document.document_id ? "Đang mở…" : "Đọc / tải"}</button>{readResult && !readResult.download_url && <small>Metadata khả dụng; tệp chưa có URL đọc.</small>}</div>;
          }) : <p>Không có metadata tài liệu được chia sẻ cho hợp đồng này.</p>}</section>
        </div>}
      </article>;
    }) : <p>Không có hợp đồng được liên kết với hồ sơ cư trú của bạn.</p>}{contractMeta.total_pages > 1 && <div className="table-footer pagination"><span>Trang {contractMeta.page} / {contractMeta.total_pages} · {contractMeta.total_items} hợp đồng</span><div><button className="button" type="button" disabled={loading || contractPage <= 1} onClick={() => setContractPage((value) => value - 1)}>Trước</button><button className="button" type="button" disabled={loading || contractPage >= contractMeta.total_pages} onClick={() => setContractPage((value) => value + 1)}>Sau</button></div></div>}</section>
  </div></main>;
}
