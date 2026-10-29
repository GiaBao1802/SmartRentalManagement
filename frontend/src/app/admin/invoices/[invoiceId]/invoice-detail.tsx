"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import AdminShell from "../../../components/admin-shell";
import { ApiError } from "../../../../lib/api/errors";
import { invoiceApi, type DraftMeterReadings, type InvoiceDetailResponse } from "../../../../lib/api/invoiceApi";
import { residentApi } from "../../../../lib/api/residentApi";
import { formatAdminDate, formatAdminMoney } from "../../../../lib/ui/admin-presentation";
import { businessDateToday, invoiceDueStateLabel, invoiceLifecycleLabel } from "../../../../lib/invoice-status";
import { invoiceMeterUsage, invoiceReadiness, validateInvoiceMeterReadings } from "./invoice-detail.logic";
import { InvoiceBreakdown } from "./invoice-breakdown";

function statusText(invoice: InvoiceDetailResponse) {
  return invoiceLifecycleLabel(invoice.status);
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "INVOICE_DATA_INCOMPLETE") return "Hóa đơn còn thiếu dữ liệu để chốt. Kiểm tra chỉ số điện/nước và cấu hình giá.";
    if (["INVOICE_ALREADY_FINALIZED", "INVOICE_AMENDMENT_NOT_ALLOWED"].includes(error.code)) return "Hóa đơn này đã được chốt và không thể sửa chỉ số.";
    if (error.code === "INVALID_READING" || error.code === "VALIDATION_ERROR") return error.message;
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy hóa đơn trong phạm vi tài khoản của bạn.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Không thể xử lý hóa đơn. Vui lòng thử lại.";
}

export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetailResponse | null>(null);
  const [electricity, setElectricity] = useState("");
  const [water, setWater] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [residentName, setResidentName] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await invoiceApi.getInvoiceDetail(invoiceId);
      setInvoice(result);
      setElectricity(result.electricity_current_kwh ?? "");
      setWater(result.water_current_m3 ?? "");
    } catch (reason) { setError(messageFor(reason)); }
    finally { setLoading(false); }
  }, [invoiceId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = invoice?.contract?.representative_resident_id;
    if (!id) { setResidentName(""); return; }
    let current = true;
    void residentApi.get(id).then((resident) => { if (current) setResidentName(resident.full_name); }).catch(() => { if (current) setResidentName("Cư dân không còn trong danh sách"); });
    return () => { current = false; };
  }, [invoice?.contract?.representative_resident_id]);

  const editable = invoice?.status === "draft" && invoice.snapshot_kind === "NOT_FINALIZED";
  const dueState = invoice ? invoiceDueStateLabel(invoice.status, invoice.is_overdue, invoice.due_date, businessDateToday()) : null;
  const dueStateTone = dueState === "Quá hạn" || dueState === "Cần kiểm tra hạn" || dueState === "Thiếu hạn thanh toán" ? "invoice-overdue-chip" : "invoice-due-chip";
  const readiness = editable && invoice ? invoiceReadiness({
    contractNo: invoice.contract?.contract_no ?? null,
    rentAmount: invoice.rent_amount,
    electricityPrevious: invoice.electricity_previous_kwh,
    electricityCurrent: electricity,
    waterPrevious: invoice.water_previous_m3,
    waterCurrent: water,
  }) : [];
  const readingsComplete = Boolean(electricity.trim() && water.trim()) && !validateReadings(true);
  function readingsPayload(): DraftMeterReadings {
    return {
      ...(electricity !== "" ? { electricity_current_kwh: electricity } : {}),
      ...(water !== "" ? { water_current_m3: water } : {}),
    };
  }
  function validateReadings(requireBoth = false) { return validateInvoiceMeterReadings(electricity, water, invoice?.electricity_previous_kwh ?? null, invoice?.water_previous_m3 ?? null, requireBoth); }
  async function saveReadings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const invalid = validateReadings(); if (invalid) { setError(invalid); return; }
    const body = readingsPayload(); if (!Object.keys(body).length) { setError("Nhập ít nhất một chỉ số trước khi lưu."); return; }
    setSaving(true);
    try { await invoiceApi.updateDraftMeterReadings(invoiceId, body); await load(); setNotice("Đã lưu chỉ số. Hóa đơn chưa được chốt."); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  }
  async function finalize() {
    setError(""); setNotice("");
    const invalid = validateReadings(true); if (invalid) { setError(invalid); setConfirmFinalize(false); return; }
    setFinalizing(true);
    try {
      await invoiceApi.finalizeInvoice(invoiceId, { electricity_current_kwh: electricity, water_current_m3: water });
      setConfirmFinalize(false); await load(); setNotice("Đã chốt hóa đơn. Trạng thái và số liệu được tải lại từ máy chủ.");
    } catch (reason) { setConfirmFinalize(false); setError(messageFor(reason)); }
    finally { setFinalizing(false); }
  }

  return <AdminShell active="/admin/invoices"><main className="admin-main invoice-page invoice-detail-page">
    <div className="breadcrumb">Vận hành · Hóa đơn · Chi tiết</div>
    <div className="page-heading invoice-detail-heading"><div><h1>{invoice?.invoice_no || "Chi tiết hóa đơn"}</h1><p>Chi tiết hóa đơn và thao tác trong phạm vi chủ trọ hiện tại.</p></div><Link className="button" href="/admin/invoices">Quay lại danh sách</Link></div>
    {error && <div className="notice invoice-detail-alert" role="alert">{error}<button className="button" type="button" disabled={loading || saving || finalizing} onClick={() => void load()}>Tải lại</button></div>}
    {notice && <p className="notice invoice-detail-success" role="status">{notice}</p>}
    {loading && !invoice ? <section className="admin-card invoice-detail-card"><p role="status">Đang tải chi tiết hóa đơn…</p></section> : !invoice ? <section className="admin-card invoice-detail-card"><p>Không có dữ liệu hóa đơn.</p></section> : <>
      <section className="admin-card invoice-detail-card invoice-detail-summary"><div className="invoice-detail-title"><div><span className="eyebrow">HÓA ĐƠN</span><h2>{invoice.invoice_no}</h2></div><div className="invoice-detail-status" aria-label={`Trạng thái hóa đơn: ${statusText(invoice)}${dueState ? `; hạn thanh toán: ${dueState}` : ""}`}><span className={`chip ${invoice.status === "paid" ? "success" : invoice.status === "draft" ? "neutral" : "warning"}`}>{statusText(invoice)}</span>{dueState&&<span className={`chip ${dueStateTone}`}>{dueState}</span>}</div></div>
        <div className="invoice-detail-grid"><div><span>Tòa nhà / Khu trọ</span><strong>{invoice.contract?.property?.name ?? "—"}</strong></div><div><span>Phòng</span><strong>{invoice.contract?.room_code ? `Phòng ${invoice.contract.room_code}` : "—"}</strong></div><div><span>Người thuê</span><strong>{invoice.contract?.representative_resident_id ? residentName || "Đang tải thông tin người thuê…" : "Chưa gán người thuê đại diện"}</strong></div><div><span>Hợp đồng</span><strong>{invoice.contract?.contract_no ?? "—"}</strong></div><div><span>Kỳ hóa đơn</span><strong>{formatAdminDate(invoice.period_start)} – {formatAdminDate(invoice.period_end)}</strong></div><div><span>Hạn thanh toán</span><strong>{formatAdminDate(invoice.due_date)}</strong></div><div><span>Ngày chốt</span><strong>{formatAdminDate(invoice.finalized_at)}</strong></div><div><span>Tổng tiền</span><strong>{formatAdminMoney(invoice.total_amount)}{invoice.amount_provisional && <small className="invoice-detail-subtext">Tạm tính · chưa phải số tiền phải trả</small>}</strong></div></div>
        {editable && <div className="invoice-readiness"><strong>Tình trạng dữ liệu</strong><p>{readingsComplete ? "Đã nhập đủ chỉ số cuối kỳ. Các giá và khoản dịch vụ sẽ được hệ thống kiểm tra khi chốt." : "Chưa đủ dữ liệu chỉ số để gửi yêu cầu chốt hóa đơn."}</p><ul className="invoice-readiness-list">{readiness.map((item) => <li key={item.label} className={`invoice-readiness-item ${item.state}`}><span aria-hidden="true">{item.state === "known" ? "✓" : item.state === "attention" ? "!" : "i"}</span><div><b>{item.label}</b><small>{item.detail}</small></div></li>)}</ul></div>}
      </section>

      <section className="admin-card invoice-detail-card"><h2>{editable ? "Nhập chỉ số cuối kỳ" : "Chỉ số điện nước"}</h2>{editable ? <form onSubmit={saveReadings} className="invoice-meter-form" noValidate>
        <label className="invoice-meter-card">Điện <span className="invoice-meter-hint">Chỉ số đầu kỳ: {invoice.electricity_previous_kwh ?? "Chưa có"} kWh</span><input aria-label="Chỉ số điện cuối kỳ" inputMode="decimal" type="text" value={electricity} onChange={(event) => setElectricity(event.target.value)} placeholder="Nhập chỉ số cuối kỳ" /><small className="invoice-meter-usage">Sản lượng kỳ này: {invoiceMeterUsage(invoice.electricity_previous_kwh, electricity)?.toLocaleString("vi-VN") ?? "Chưa đủ dữ liệu"} kWh</small></label>
        <label className="invoice-meter-card">Nước <span className="invoice-meter-hint">Chỉ số đầu kỳ: {invoice.water_previous_m3 ?? "Chưa có"} m³</span><input aria-label="Chỉ số nước cuối kỳ" inputMode="decimal" type="text" value={water} onChange={(event) => setWater(event.target.value)} placeholder="Nhập chỉ số cuối kỳ" /><small className="invoice-meter-usage">Sản lượng kỳ này: {invoiceMeterUsage(invoice.water_previous_m3, water)?.toLocaleString("vi-VN") ?? "Chưa đủ dữ liệu"} m³</small></label>
        <p className="invoice-detail-note">Chỉ số đầu kỳ chỉ xem được. Nhập số không âm, tối đa 3 chữ số thập phân; số cuối kỳ không được nhỏ hơn đầu kỳ.</p>
        <div className="invoice-detail-actions"><button className="button" type="submit" disabled={saving || finalizing}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</button><button className="button primary" type="button" disabled={saving || finalizing} onClick={() => { const invalid = validateReadings(true); if (invalid) setError(invalid); else { setError(""); setConfirmFinalize(true); } }}>Chốt hóa đơn</button></div>
      </form> : <div className="invoice-meter-readonly"><p>Điện: đầu kỳ <strong>{invoice.electricity_previous_kwh ?? "—"} kWh</strong> · cuối kỳ <strong>{invoice.electricity_current_kwh ?? "—"} kWh</strong></p><p>Nước: đầu kỳ <strong>{invoice.water_previous_m3 ?? "—"} m³</strong> · cuối kỳ <strong>{invoice.water_current_m3 ?? "—"} m³</strong></p>{invoice.snapshot_kind === "LEGACY_AGGREGATE" && <p>Hóa đơn cũ — chỉ có dữ liệu tổng hợp.</p>}</div>}
        {confirmFinalize && <div className="invoice-finalize-confirm" role="alertdialog" aria-modal="true" aria-labelledby="invoice-finalize-title"><div><h3 id="invoice-finalize-title">Xác nhận chốt hóa đơn</h3><p>Hóa đơn <strong>{invoice.invoice_no}</strong> · Phòng {invoice.contract?.room_code ?? "—"}</p><p>Kỳ {formatAdminDate(invoice.period_start)} – {formatAdminDate(invoice.period_end)} · Điện cuối kỳ {electricity} kWh · Nước cuối kỳ {water} m³</p><p>Máy chủ sẽ kiểm tra dữ liệu tính tiền và khóa thông tin tài chính nếu chốt thành công. Hóa đơn chưa được chốt nếu máy chủ từ chối.</p><div className="invoice-detail-actions"><button className="button" type="button" disabled={finalizing} onClick={() => setConfirmFinalize(false)}>Kiểm tra lại</button><button className="button primary" type="button" disabled={finalizing} onClick={() => void finalize()}>{finalizing ? "Đang chốt…" : "Xác nhận chốt"}</button></div></div></div>}
      </section>

      <section className="admin-card invoice-detail-card"><h2>Chi tiết các khoản thu</h2><InvoiceBreakdown invoice={invoice} /></section>
    </>}
  </main></AdminShell>;
}
