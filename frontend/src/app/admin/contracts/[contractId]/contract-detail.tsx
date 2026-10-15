"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import AdminShell from "../../../components/admin-shell";
import { ApiError } from "../../../../lib/api/errors";
import { contractApi, type ContractDocument, type ContractDocumentRead, type ContractHistoryEntry, type ContractPatch, type ContractResource, type ContractStatus } from "../../../../lib/api/contractApi";
import { contractErrorMessage, contractHistoryChangeLabel, contractHistoryChangeRows, contractStatusLabel, effectiveContractEnd, formatContractDate, formatContractMoney, formatContractTimestamp } from "../../../../lib/api/contractView";
import { residentApi, type Resident } from "../../../../lib/api/residentApi";
import { formatAdminStatus } from "../../../../lib/ui/admin-presentation";

const statusLabels: Record<ContractStatus, string> = { draft: contractStatusLabel("draft"), active: contractStatusLabel("active"), expired: contractStatusLabel("expired"), terminated: contractStatusLabel("terminated") };
const documentLabels: Record<string, string> = { contract: "Hợp đồng", renewal: "Gia hạn", termination: "Chấm dứt", attachment: "Tệp đính kèm" };
const businessToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
const safeMessage = contractErrorMessage;
const displayStatus = (status: ContractStatus) => statusLabels[status] ?? "Chưa xác định";

type EditForm = { contract_no: string; representative_resident_id: string; start_date: string; end_date: string; rent_amount: string; deposit_amount: string; resident_capacity: string; initial_electric_kwh: string; initial_water_m3: string; change_reason: string };
function editForm(contract: ContractResource): EditForm { return { contract_no: contract.contract_no, representative_resident_id: contract.representative_resident_id, start_date: contract.start_date, end_date: contract.end_date, rent_amount: contract.rent_amount, deposit_amount: contract.deposit_amount, resident_capacity: String(contract.resident_capacity), initial_electric_kwh: contract.initial_electric_kwh ?? "", initial_water_m3: contract.initial_water_m3 ?? "", change_reason: "" }; }

function ConfirmDialog({ title, children, busy, onCancel, onConfirm }: { title: string; children: ReactNode; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop contract-dialog-backdrop" role="presentation"><section className="edit-modal contract-confirm" role="alertdialog" aria-modal="true" aria-labelledby="contract-confirm-title"><div className="modal-heading"><h2 id="contract-confirm-title">{title}</h2></div><div className="contract-confirm-body">{children}</div><div className="modal-actions"><button className="button" type="button" disabled={busy} onClick={onCancel}>Hủy</button><button className="button primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? "Đang xử lý…" : "Xác nhận"}</button></div></section></div>;
}

export default function ContractDetail({ contractId }: { contractId: string }) {
  const [contract, setContract] = useState<ContractResource | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [history, setHistory] = useState<ContractHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState({ page: 1, page_size: 20, total_items: 0, total_pages: 0 });
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renew, setRenew] = useState({ contract_no: "", start_date: "", end_date: "" });
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [termination, setTermination] = useState({ termination_date: "", termination_reason: "", final_electric_kwh: "", final_water_m3: "", deposit_deduction: "", deposit_settlement_amount: "" });
  const [documentType, setDocumentType] = useState<ContractDocument["document_type"]>("contract");
  const [readResults, setReadResults] = useState<Record<string, ContractDocumentRead | null>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(""); setHistoryError(""); setDocumentError("");
    const [recordResult, historyResult, documentsResult, residentsResult] = await Promise.allSettled([
      contractApi.get(contractId), contractApi.history(contractId, historyPage, 20), contractApi.documents(contractId),
      (async () => { const first = await residentApi.list({ page: 1, page_size: 100 }); const all = [...first.data]; for (let page = 2; page <= first.meta.total_pages; page += 1) all.push(...(await residentApi.list({ page, page_size: 100 })).data); return all; })(),
    ]);
    if (recordResult.status === "fulfilled") setContract(recordResult.value);
    else {
      setContract(null);
      setError(safeMessage(recordResult.reason, "Không tải được hồ sơ hợp đồng trong phạm vi tài khoản."));
    }
    if (historyResult.status === "fulfilled") { setHistory(historyResult.value.data); setHistoryMeta(historyResult.value.meta); }
    else setHistoryError(safeMessage(historyResult.reason, "Không tải được lịch sử hợp đồng."));
    if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value);
    else setDocumentError(safeMessage(documentsResult.reason, "Không tải được metadata tài liệu."));
    if (residentsResult.status === "fulfilled") setResidents(residentsResult.value);
    setLoading(false);
  }, [contractId, historyPage]);

  useEffect(() => { void load(); }, [load]);

  async function refreshContract() {
    const [recordResult, historyResult, documentsResult] = await Promise.allSettled([contractApi.get(contractId), contractApi.history(contractId, historyPage, 20), contractApi.documents(contractId)]);
    if (recordResult.status === "fulfilled") setContract(recordResult.value);
    else setError(safeMessage(recordResult.reason, "Không tải được hợp đồng mới nhất."));
    if (historyResult.status === "fulfilled") { setHistory(historyResult.value.data); setHistoryMeta(historyResult.value.meta); }
    else setHistoryError(safeMessage(historyResult.reason, "Không tải được lịch sử hợp đồng."));
    if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value);
    else setDocumentError(safeMessage(documentsResult.reason, "Không tải được metadata tài liệu."));
  }

  async function activate() {
    if (saving || !contract) return;
    setSaving(true); setError(""); setNotice("");
    try { await contractApi.activate(contract.contract_id); setConfirmActivate(false); setNotice("Đã kích hoạt hợp đồng. Phiên bản chính thức bắt đầu từ 1."); await refreshContract(); }
    catch (reason) { setError(safeMessage(reason, "Không thể kích hoạt hợp đồng. Hãy kiểm tra phòng, cư dân, thời hạn và sức chứa.")); }
    finally { setSaving(false); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !contract || !edit) return;
    if (edit.end_date <= edit.start_date) { setError("Ngày kết thúc phải sau ngày bắt đầu."); return; }
    if (!/^\d+$/.test(edit.rent_amount) || !/^\d+$/.test(edit.deposit_amount) || !Number.isInteger(Number(edit.resident_capacity)) || Number(edit.resident_capacity) < 1) { setError("Tiền thuê, tiền cọc hoặc sức chứa không hợp lệ."); return; }
    if (contract.status === "active" && !changeReason.trim()) { setError("Vui lòng nhập lý do thay đổi để ghi vào lịch sử hợp đồng."); return; }
    const patch: ContractPatch = {
      representative_resident_id: edit.representative_resident_id,
      start_date: edit.start_date, end_date: edit.end_date,
      rent_amount: edit.rent_amount, deposit_amount: edit.deposit_amount,
      resident_capacity: Number(edit.resident_capacity),
      initial_electric_kwh: edit.initial_electric_kwh.trim() || null,
      initial_water_m3: edit.initial_water_m3.trim() || null,
      ...(contract.status === "draft" ? { contract_no: edit.contract_no.trim() } : { change_reason: changeReason.trim() }),
    };
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await contractApi.update(contract.contract_id, patch, contract.status === "active" ? contract.revision : undefined);
      setContract(updated); setEditOpen(false); setEdit(null); setChangeReason(""); setNotice(contract.status === "active" ? "Đã cập nhật hợp đồng và ghi nhận revision mới." : "Đã cập nhật bản nháp.");
      await refreshContract();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "CONTRACT_REVISION_CONFLICT") {
        setEditOpen(false); setEdit(null);
        try { await refreshContract(); } catch { /* keep the conflict message visible */ }
        setError("Hợp đồng đã được thay đổi ở nơi khác. Đã tải lại dữ liệu mới nhất; hãy mở sửa lại nếu vẫn cần cập nhật.");
      } else setError(safeMessage(reason, "Không thể cập nhật hợp đồng."));
    } finally { setSaving(false); }
  }

  async function renewContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !contract) return;
    if (renew.end_date <= renew.start_date) { setError("Ngày kết thúc hợp đồng kế tiếp phải sau ngày bắt đầu."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const successor = await contractApi.renew(contract.contract_id, contract.revision, renew);
      setRenewOpen(false); setNotice(`Đã tạo hợp đồng kế tiếp ${successor.contract_no} ở trạng thái Nháp.`);
      window.location.assign(`/admin/contracts/${encodeURIComponent(successor.contract_id)}`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "CONTRACT_REVISION_CONFLICT") {
        try { await refreshContract(); } catch { /* preserve conflict state */ }
        setError("Hợp đồng đã được thay đổi ở nơi khác. Đã tải dữ liệu mới; hãy kiểm tra lại trước khi gia hạn.");
      } else setError(safeMessage(reason, "Không thể tạo hợp đồng kế tiếp."));
    } finally { setSaving(false); }
  }

  async function terminateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !contract) return;
    if (termination.termination_date > businessToday()) { setError("Ngày chấm dứt không được lớn hơn ngày hiện tại."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await contractApi.terminate(contract.contract_id, contract.revision, termination);
      setTerminateOpen(false); setNotice("Đã chấm dứt hợp đồng. Bản ghi lịch sử và ngày hiệu lực được giữ lại."); await refreshContract();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "CONTRACT_REVISION_CONFLICT") {
        try { await refreshContract(); } catch { /* preserve conflict state */ }
        setError("Hợp đồng đã được thay đổi ở nơi khác. Đã tải dữ liệu mới; hãy kiểm tra lại trước khi chấm dứt.");
      } else setError(safeMessage(reason, "Không thể chấm dứt hợp đồng. Kiểm tra hóa đơn chưa thanh toán, ngày và số liệu quyết toán."));
    } finally { setSaving(false); }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !contract) return;
    const form = event.currentTarget;
    const file = (form.elements.namedItem("contract-file") as HTMLInputElement | null)?.files?.[0];
    if (!file) { setDocumentError("Chọn tệp cần gửi."); return; }
    setSaving(true); setDocumentError(""); setNotice("");
    try { const uploaded = await contractApi.uploadDocument(contract.contract_id, file, documentType); setDocuments((current) => [uploaded, ...current]); setNotice("Đã lưu metadata phiên bản tài liệu."); form.reset(); }
    catch (reason) { setDocumentError(safeMessage(reason, "Không thể tải tài liệu lên.")); }
    finally { setSaving(false); }
  }

  async function readDocument(documentId: string) {
    setDocumentError("");
    try {
      const result = await contractApi.readDocument(documentId);
      setReadResults((current) => ({ ...current, [documentId]: result }));
      if (result.download_url) window.open(result.download_url, "_blank", "noopener,noreferrer");
      else setDocumentError("Thông tin tài liệu có sẵn nhưng tệp chưa thể đọc/tải vì kho lưu trữ chưa được cấu hình.");
    } catch (reason) { setDocumentError(safeMessage(reason, "Không thể đọc tài liệu trong phạm vi tài khoản.")); }
  }

  if (loading) return <AdminShell active="/admin/contracts"><main className="admin-main contract-detail-page"><p role="status">Đang tải hồ sơ hợp đồng…</p></main></AdminShell>;
  if (!contract) return <AdminShell active="/admin/contracts"><main className="admin-main contract-detail-page"><Link className="button" href="/admin/contracts">Quay lại danh sách hợp đồng</Link><p className="notice" role="alert">{error || "Không tìm thấy hợp đồng trong phạm vi tài khoản."}</p></main></AdminShell>;
  const effectiveEnd = effectiveContractEnd(contract);
  const canEdit = contract.status === "draft" || contract.status === "active";
  const canRenew = (contract.status === "active" || contract.status === "expired") && !contract.successor;
  const canTerminate = contract.status === "active";

  return <AdminShell active="/admin/contracts"><main className="admin-main contract-detail-page">
    <div className="breadcrumb">Quản lý hợp đồng · Chi tiết</div><div className="contract-detail-top"><Link className="button" href="/admin/contracts">← Danh sách hợp đồng</Link><button className="button" type="button" disabled={loading || saving} onClick={() => void load()}>Tải lại dữ liệu</button></div>
    <div className="page-heading contract-detail-heading"><div><span className="eyebrow">HỒ SƠ HỢP ĐỒNG</span><h1>{contract.contract_no}</h1><p>{contract.room?.property.name ?? "Khu vực chưa có thông tin"} · {contract.room?.room_code ? `Phòng ${contract.room.room_code}` : "Phòng chưa có mã"}</p></div><div className="contract-heading-status"><span className={`chip ${contract.status === "active" ? "success" : contract.status === "draft" ? "warning" : "neutral"}`}>{displayStatus(contract.status)}</span><span>Phiên bản {contract.revision}</span></div></div>
    {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice success-notice" role="status">{notice}</p>}
    <div className="contract-detail-grid">
      <section className="admin-card"><h2>Thông tin hợp đồng</h2><dl className="contract-data-grid"><div><dt>Mã hợp đồng</dt><dd>{contract.contract_no}</dd></div><div><dt>Trạng thái</dt><dd>{displayStatus(contract.status)}</dd></div><div><dt>Khu vực</dt><dd>{contract.room?.property.name ?? "Chưa có thông tin khu vực"}</dd></div><div><dt>Địa chỉ</dt><dd>{contract.room?.property.address ?? contract.room?.property.province ?? "Chưa cập nhật"}</dd></div><div><dt>Phòng</dt><dd>{contract.room?.room_code ? `Phòng ${contract.room.room_code}` : "Chưa có mã phòng"}</dd></div><div><dt>Người đứng tên hợp đồng</dt><dd>{contract.representative_resident?.full_name ?? residents.find((resident) => resident.resident_id === contract.representative_resident_id)?.full_name ?? "Chưa có thông tin cư dân"}</dd></div><div><dt>Số người tối đa theo hợp đồng</dt><dd>{contract.resident_capacity} người</dd></div><div><dt>Phiên bản hiện tại</dt><dd>{contract.revision}</dd></div></dl></section>
      <section className="admin-card" id="meter-source"><h2>Nguồn chỉ số đầu kỳ</h2><p>Chỉ số ban đầu là nguồn mở đầu cho hóa đơn đầu tiên của hợp đồng này. Hợp đồng kế tiếp cần số đọc riêng; các hóa đơn đã chốt giữ snapshot lịch sử bất biến.</p><dl className="contract-data-grid"><div><dt>Điện ban đầu</dt><dd>{contract.initial_electric_kwh ?? "Chưa nhập"} kWh</dd></div><div><dt>Nước ban đầu</dt><dd>{contract.initial_water_m3 ?? "Chưa nhập"} m³</dd></div></dl>{(contract.status === "draft" || contract.status === "active") && <button className="button primary" type="button" onClick={() => { setEdit(editForm(contract)); setEditOpen(true); }}>Cập nhật chỉ số đầu kỳ</button>}</section>
      <section className="admin-card"><h2>Thời hạn và quyết toán</h2><dl className="contract-data-grid"><div><dt>Ngày bắt đầu</dt><dd>{formatContractDate(contract.start_date)}</dd></div><div><dt>Ngày hết hạn theo hợp đồng</dt><dd>{formatContractDate(contract.end_date)}</dd></div><div><dt>Ngày chấm dứt</dt><dd>{formatContractDate(contract.termination_date)}</dd></div><div><dt>Ngày kết thúc hiệu lực</dt><dd>{formatContractDate(effectiveEnd)}</dd></div><div><dt>Tiền thuê / tháng</dt><dd>{formatContractMoney(contract.rent_amount)}</dd></div><div><dt>Tiền cọc</dt><dd>{formatContractMoney(contract.deposit_amount)}</dd></div><div><dt>Khấu trừ tiền cọc</dt><dd>{formatContractMoney(contract.deposit_deduction)}</dd></div><div><dt>Tiền cọc quyết toán</dt><dd>{formatContractMoney(contract.deposit_settlement_amount)}</dd></div><div className="contract-data-wide"><dt>Lý do chấm dứt</dt><dd>{contract.termination_reason ?? "Chưa có"}</dd></div></dl></section>
      <section className="admin-card contract-actions-card"><h2>Thao tác</h2><p>Thao tác sẽ được kiểm tra lại theo quyền và trạng thái mới nhất ở máy chủ.</p><div className="contract-action-row">
        {contract.status === "draft" && <button className="button primary" type="button" disabled={saving} onClick={() => setConfirmActivate(true)}>Kích hoạt</button>}
        {canEdit && <button className="button" type="button" disabled={saving} onClick={() => { setEdit(editForm(contract)); setChangeReason(""); setError(""); setEditOpen(true); }}>Sửa điều khoản</button>}
        {canRenew && <button className="button" type="button" disabled={saving} onClick={() => { setRenew({ contract_no: "", start_date: "", end_date: "" }); setRenewOpen(true); }}>Tạo hợp đồng gia hạn</button>}
        {canTerminate && <button className="button danger-button" type="button" disabled={saving} onClick={() => { setTermination({ termination_date: "", termination_reason: "", final_electric_kwh: "", final_water_m3: "", deposit_deduction: "", deposit_settlement_amount: "" }); setTerminateOpen(true); }}>Chấm dứt hợp đồng</button>}
        {!canEdit && !canRenew && !canTerminate && <span>Không có thao tác vòng đời khả dụng cho trạng thái này.</span>}
      </div><Link className="contract-room-link" href={`/admin/properties/${encodeURIComponent(contract.property_id)}/rooms`}>Mở danh sách phòng để xem trạng thái hiện tại →</Link></section>
      <section className="admin-card contract-history-card"><div className="contract-section-heading"><div><h2>Lịch sử thay đổi hợp đồng</h2><p>Các thay đổi được lưu theo từng phiên bản.</p></div><span>{historyMeta.total_items} sự kiện</span></div>{historyError && <p className="notice" role="alert">{historyError}</p>}{history.length ? <ol className="contract-history-list">{history.map((entry, index) => { const changes = contractHistoryChangeRows(entry, { contract, residents }); const eventStatus = entry.after_data?.status ?? entry.before_data?.status ?? contract.status; const safeEventStatus = eventStatus === "draft" || eventStatus === "active" || eventStatus === "expired" || eventStatus === "terminated" ? eventStatus : contract.status; return <li key={`${entry.revision}-${entry.change_type}-${entry.created_at}-${index}`}><div className="contract-history-title"><strong>Phiên bản {entry.revision} · {contractHistoryChangeLabel(entry.change_type, safeEventStatus)}</strong><time dateTime={entry.created_at}>{formatContractTimestamp(entry.created_at)}</time></div>{entry.change_reason && <p><b>Lý do:</b> {entry.change_reason}</p>}<p><b>Người thực hiện:</b> Tài khoản quản trị</p>{changes.length > 0 ? <><p className="contract-history-summary"><b>Thay đổi chính</b></p><ul className="contract-history-changes">{changes.map((change) => <li key={change.field}><strong>{change.label}</strong><span>{change.before} <span aria-hidden="true">→</span> {change.after}</span></li>)}</ul></> : <p className="contract-empty-note">Không có thông tin thay đổi để hiển thị.</p>}</li>; })}</ol> : <p className="contract-empty-note">{historyError ? "Không tải được lịch sử. Hãy thử tải lại hồ sơ." : contract.status === "draft" ? "Bản nháp chưa có lịch sử chính thức. Lịch sử sẽ bắt đầu khi hợp đồng được kích hoạt." : "Chưa có thay đổi hợp đồng được ghi nhận."}</p>}{historyMeta.total_pages > 1 && <div className="table-footer pagination"><span>Trang {historyMeta.page} / {historyMeta.total_pages}</span><div><button className="button" type="button" disabled={historyPage <= 1 || saving} onClick={() => setHistoryPage((value) => value - 1)}>Trước</button><button className="button" type="button" disabled={historyPage >= historyMeta.total_pages || saving} onClick={() => setHistoryPage((value) => value + 1)}>Sau</button></div></div>}</section>
      <section className="admin-card contract-documents-card"><div className="contract-section-heading"><div><h2>Tài liệu hợp đồng</h2><p>Thông tin phiên bản được lưu riêng; tệp đính kèm chưa có kho lưu trữ hoạt động.</p></div><span>{documents.length} tài liệu</span></div>
        {documentError && <p className="notice" role="alert">{documentError}</p>}
        <form className="contract-upload-form" onSubmit={(event) => void uploadDocument(event)}><label>Loại tài liệu<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={saving}><option value="contract">Hợp đồng</option><option value="renewal">Gia hạn</option><option value="termination">Chấm dứt</option><option value="attachment">Tệp đính kèm</option></select></label><label>Tệp<input name="contract-file" type="file" disabled={saving} /></label><button className="button" type="submit" disabled={saving}>{saving ? "Đang xử lý…" : "Tải tài liệu lên"}</button></form>
        <p className="contract-storage-note">Tải tệp lên phụ thuộc kho lưu trữ. Nếu chưa cấu hình, hệ thống sẽ báo rõ và không giả lập tải thành công.</p>
        {documents.length ? <div className="contract-document-list">{documents.map((document) => <article key={document.document_id}><div><strong>{document.file_name || "Tài liệu chưa có tên"}</strong><span>{documentLabels[document.document_type] ?? "Tài liệu đính kèm"} · phiên bản {document.version} · {formatSize(document.file_size)}</span><span>{document.mime_type.split("/").at(-1)?.toUpperCase() ?? "Tệp"} · {formatAdminStatus(document.status)} · {formatContractTimestamp(document.created_at)}</span></div><button className="button" type="button" disabled={saving} onClick={() => void readDocument(document.document_id)}>{readResults[document.document_id]?.download_url ? "Mở lại tài liệu" : "Đọc / tải"}</button>{readResults[document.document_id] && !readResults[document.document_id]?.download_url && <small>Thông tin tài liệu có sẵn nhưng tệp chưa thể mở vì kho lưu trữ chưa được cấu hình.</small>}</article>)}</div> : <p className="contract-empty-note">{documentError ? "Metadata chưa tải được. Thử tải lại hồ sơ." : "Chưa có tài liệu hợp đồng."}</p>}
      </section>
      <section className="admin-card contract-lineage-card"><h2>Hợp đồng gia hạn</h2><p>{contract.previous_contract_id ? <>Hợp đồng này được gia hạn từ <Link href={`/admin/contracts/${encodeURIComponent(contract.previous_contract_id)}`}>hợp đồng trước</Link>.</> : "Đây là hợp đồng ban đầu, không có hợp đồng trước."}</p>{contract.successor ? <p>Hợp đồng kế tiếp: <Link href={`/admin/contracts/${encodeURIComponent(contract.successor.contract_id)}`}>{contract.successor.contract_no}</Link> · {displayStatus(contract.successor.status)} · phiên bản {contract.successor.revision}</p> : <p>Chưa có hợp đồng gia hạn.</p>}</section>
    </div>
  </main>

  {confirmActivate && <ConfirmDialog title="Kích hoạt hợp đồng?" busy={saving} onCancel={() => setConfirmActivate(false)} onConfirm={() => void activate()}><p>Hợp đồng sẽ chuyển từ Nháp sang Đang hiệu lực ở revision 1. Hệ thống sẽ kiểm tra phòng, cư dân, thời hạn và sức chứa trước khi ghi nhận.</p></ConfirmDialog>}
  {editOpen && edit && <div className="modal-backdrop" role="presentation"><section className="edit-modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-edit-title"><div className="modal-heading"><div><h2 id="contract-edit-title">Sửa {contract.status === "draft" ? "bản nháp" : "điều khoản hợp đồng"}</h2><p>{contract.status === "active" ? `Hệ thống sẽ kiểm tra phiên bản hiện tại trước khi lưu để tránh ghi đè thay đổi mới.` : "Thay đổi bản nháp sẽ không xuất hiện trong lịch sử chính thức."}</p></div><button className="modal-close" type="button" aria-label="Đóng" disabled={saving} onClick={() => setEditOpen(false)}>×</button></div><form onSubmit={(event) => void saveEdit(event)}><div className="edit-form-grid contract-form-grid">
    {contract.status === "draft" && <label>Mã hợp đồng *<input required maxLength={40} value={edit.contract_no} disabled={saving} onChange={(event) => setEdit({ ...edit, contract_no: event.target.value })} /></label>}
    <label>Cư dân đại diện *<select required value={edit.representative_resident_id} disabled={saving} onChange={(event) => setEdit({ ...edit, representative_resident_id: event.target.value })}>{residents.map((resident) => <option key={resident.resident_id} value={resident.resident_id}>{resident.full_name}</option>)}</select></label>
    <label>Ngày bắt đầu *<input type="date" required value={edit.start_date} disabled={saving} onChange={(event) => setEdit({ ...edit, start_date: event.target.value })} /></label><label>Ngày kết thúc *<input type="date" required min={edit.start_date} value={edit.end_date} disabled={saving} onChange={(event) => setEdit({ ...edit, end_date: event.target.value })} /></label>
    <label>Tiền thuê tháng (VND) *<input type="number" min="0" step="1" required value={edit.rent_amount} disabled={saving} onChange={(event) => setEdit({ ...edit, rent_amount: event.target.value })} /></label><label>Tiền cọc (VND) *<input type="number" min="0" step="1" required value={edit.deposit_amount} disabled={saving} onChange={(event) => setEdit({ ...edit, deposit_amount: event.target.value })} /></label><label>Sức chứa hợp đồng *<input type="number" min="1" step="1" required value={edit.resident_capacity} disabled={saving} onChange={(event) => setEdit({ ...edit, resident_capacity: event.target.value })} /></label>
    {contract.status === "active" && <p className="contract-form-note wide-field">Việc thay đổi sức chứa sau khi hợp đồng có hiệu lực sẽ được ghi nhận vào lịch sử hợp đồng. Sức chứa này độc lập với sức chứa mặc định của phòng và không được thấp hơn số cư dân hoặc slot xe đang sử dụng.</p>}
    <label>Chỉ số đầu kỳ của hợp đồng mới · điện (kWh)<input value={edit.initial_electric_kwh} disabled={saving} onChange={(event) => setEdit({ ...edit, initial_electric_kwh: event.target.value })} /></label><label>Chỉ số đầu kỳ của hợp đồng mới · nước (m³)<input value={edit.initial_water_m3} disabled={saving} onChange={(event) => setEdit({ ...edit, initial_water_m3: event.target.value })} /></label>
    {contract.status === "active" && <label className="wide-field">Lý do thay đổi *<textarea required maxLength={1000} value={changeReason} disabled={saving} onChange={(event) => setChangeReason(event.target.value)} placeholder="Nêu lý do nghiệp vụ của lần thay đổi này" /></label>}
    </div>{error && <p className="notice" role="alert">{error}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setEditOpen(false)}>Hủy</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div></form></section></div>}
  {renewOpen && <div className="modal-backdrop" role="presentation"><section className="edit-modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-renew-title"><div className="modal-heading"><div><h2 id="contract-renew-title">Tạo hợp đồng gia hạn</h2><p>Hệ thống tạo hợp đồng gia hạn ở trạng thái Nháp và sao chép các điều khoản hiện tại. Mã mới và thời hạn mới là bắt buộc; số đọc ban đầu cũ không được sao chép.</p></div><button className="modal-close" type="button" aria-label="Đóng" disabled={saving} onClick={() => setRenewOpen(false)}>×</button></div><form onSubmit={(event) => void renewContract(event)}><div className="edit-form-grid contract-form-grid"><label>Mã hợp đồng mới *<input required maxLength={40} value={renew.contract_no} disabled={saving} onChange={(event) => setRenew({ ...renew, contract_no: event.target.value })} /></label><label>Ngày bắt đầu mới *<input type="date" required value={renew.start_date} disabled={saving} onChange={(event) => setRenew({ ...renew, start_date: event.target.value })} /></label><label>Ngày kết thúc mới *<input type="date" required min={renew.start_date} value={renew.end_date} disabled={saving} onChange={(event) => setRenew({ ...renew, end_date: event.target.value })} /></label></div><p className="contract-form-note">Chỉ số đầu kỳ của hợp đồng mới được lấy từ số chốt hoặc hóa đơn đã finalize gần nhất của hợp đồng trước. Nếu chưa có số liệu có thẩm quyền, hãy nhập số đọc vào bản nháp trước khi kích hoạt.</p>{error && <p className="notice" role="alert">{error}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setRenewOpen(false)}>Hủy</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo hợp đồng nháp"}</button></div></form></section></div>}
  {terminateOpen && <div className="modal-backdrop" role="presentation"><section className="edit-modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-terminate-title"><div className="modal-heading"><div><h2 id="contract-terminate-title">Chấm dứt hợp đồng</h2><p>Hồ sơ lịch sử được giữ nguyên. Không thể đặt ngày chấm dứt trong tương lai.</p></div><button className="modal-close" type="button" aria-label="Đóng" disabled={saving} onClick={() => setTerminateOpen(false)}>×</button></div><form onSubmit={(event) => void terminateContract(event)}><div className="edit-form-grid contract-form-grid"><label>Ngày chấm dứt *<input type="date" required min={contract.start_date} max={contract.end_date < businessToday() ? contract.end_date : businessToday()} value={termination.termination_date} disabled={saving} onChange={(event) => setTermination({ ...termination, termination_date: event.target.value })} /></label><label className="wide-field">Lý do chấm dứt *<textarea required maxLength={1000000} value={termination.termination_reason} disabled={saving} onChange={(event) => setTermination({ ...termination, termination_reason: event.target.value })} /></label><label>Chỉ số điện cuối (kWh) *<input required inputMode="decimal" value={termination.final_electric_kwh} disabled={saving} onChange={(event) => setTermination({ ...termination, final_electric_kwh: event.target.value })} /></label><label>Chỉ số nước cuối (m³) *<input required inputMode="decimal" value={termination.final_water_m3} disabled={saving} onChange={(event) => setTermination({ ...termination, final_water_m3: event.target.value })} /></label><label>Khấu trừ tiền cọc (VND) *<input required type="number" min="0" step="1" value={termination.deposit_deduction} disabled={saving} onChange={(event) => setTermination({ ...termination, deposit_deduction: event.target.value })} /></label><label>Tiền cọc quyết toán (VND) *<input required type="number" min="0" step="1" value={termination.deposit_settlement_amount} disabled={saving} onChange={(event) => setTermination({ ...termination, deposit_settlement_amount: event.target.value })} /></label></div><p className="contract-form-note">Số tiền quyết toán phải bằng tiền cọc trừ khoản khấu trừ. Hệ thống kiểm tra chỉ số, hóa đơn chưa thanh toán và trạng thái trước khi xử lý.</p>{error && <p className="notice" role="alert">{error}</p>}<div className="modal-actions"><button className="button" type="button" disabled={saving} onClick={() => setTerminateOpen(false)}>Hủy</button><button className="button danger-button" type="submit" disabled={saving}>{saving ? "Đang chấm dứt…" : "Xác nhận chấm dứt"}</button></div></form></section></div>}
  </AdminShell>;
}

