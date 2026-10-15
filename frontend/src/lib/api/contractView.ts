import { ApiError } from "./errors";
import type { ContractHistoryEntry, ContractResource, ContractStatus } from "./contractApi";
import { formatAdminDate, formatAdminMoney, formatAdminTimestamp } from "../ui/admin-presentation";

const labels: Record<ContractStatus, string> = {
  draft: "Nháp",
  active: "Đang hiệu lực",
  expired: "Hết hạn",
  terminated: "Đã chấm dứt",
};

export function contractStatusLabel(status: ContractStatus) {
  return labels[status];
}

export function effectiveContractEnd(contract: Pick<ContractResource, "status" | "end_date" | "termination_date">) {
  return contract.status === "terminated" && contract.termination_date ? contract.termination_date : contract.end_date;
}

export function formatContractMoney(value: string | null) {
  return formatAdminMoney(value);
}

export { formatAdminDate as formatContractDate, formatAdminTimestamp as formatContractTimestamp };

export type ContractHistoryDisplayContext = {
  contract: ContractResource;
  residents: Array<{ resident_id: string; full_name: string }>;
};

const historyFieldLabels: Record<string, string> = {
  contract_no: "Mã hợp đồng",
  room_id: "Phòng",
  representative_resident_id: "Người đứng tên hợp đồng",
  previous_contract_id: "Hợp đồng trước",
  start_date: "Ngày bắt đầu",
  end_date: "Ngày kết thúc",
  rent_amount: "Tiền thuê",
  deposit_amount: "Tiền cọc",
  resident_capacity: "Số người tối đa theo hợp đồng",
  initial_electric_kwh: "Chỉ số điện đầu kỳ",
  initial_water_m3: "Chỉ số nước đầu kỳ",
  status: "Trạng thái hợp đồng",
  termination_date: "Ngày chấm dứt",
  termination_reason: "Lý do chấm dứt",
  final_electric_kwh: "Chỉ số điện cuối kỳ",
  final_water_m3: "Chỉ số nước cuối kỳ",
  deposit_deduction: "Khoản khấu trừ tiền cọc",
  deposit_settlement_amount: "Tiền cọc quyết toán",
};

function formatHistoryValue(field: string, value: unknown, context: ContractHistoryDisplayContext): string {
  if (field === "previous_contract_id") return value === null || value === undefined ? "Không có" : "Có hợp đồng trước";
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status" && typeof value === "string" && value in labels) return contractStatusLabel(value as ContractStatus);
  if (field === "room_id") {
    return String(value) === context.contract.room_id && context.contract.room?.room_code
      ? `Phòng ${context.contract.room.room_code}`
      : "Thông tin phòng chưa có trong hồ sơ";
  }
  if (field === "representative_resident_id") {
    const resident = context.residents.find((item) => item.resident_id === String(value))
      ?? (context.contract.representative_resident?.resident_id === String(value) ? context.contract.representative_resident : undefined);
    return resident?.full_name ?? "Thông tin người đứng tên chưa có trong hồ sơ";
  }
  if (["start_date", "end_date", "termination_date"].includes(field) && typeof value === "string") return formatAdminDate(value);
  if (["rent_amount", "deposit_amount", "deposit_deduction", "deposit_settlement_amount"].includes(field)) return formatAdminMoney(String(value));
  if (field === "resident_capacity") return `${String(value)} người`;
  if (field === "initial_electric_kwh" || field === "final_electric_kwh") return `${String(value)} kWh`;
  if (field === "initial_water_m3" || field === "final_water_m3") return `${String(value)} m³`;
  return String(value);
}

export function contractHistoryChangeRows(entry: ContractHistoryEntry, context: ContractHistoryDisplayContext) {
  const before = entry.before_data ?? {};
  const after = entry.after_data ?? {};
  return changedContractFields(entry)
    .filter((field) => Boolean(historyFieldLabels[field]))
    .map((field) => ({
      field,
      label: historyFieldLabels[field]!,
      before: formatHistoryValue(field, before[field], context),
      after: formatHistoryValue(field, after[field], context),
    }));
}

export function contractHistoryChangeLabel(changeType: string, status: ContractStatus): string {
  if (changeType === "activation") return "Kích hoạt hợp đồng";
  if (changeType === "material_update") return "Điều chỉnh điều khoản";
  if (changeType === "status_transition") {
    if (status === "terminated") return "Chấm dứt hợp đồng";
    if (status === "expired") return "Hợp đồng hết hạn";
    return "Cập nhật trạng thái hợp đồng";
  }
  return "Cập nhật hợp đồng";
}

export function contractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === "IDEMPOTENCY_KEY_REUSED") return "Yêu cầu này đã được sử dụng với dữ liệu khác. Vui lòng tải lại và thử lại.";
    if (error.code === "CONTRACT_REVISION_CONFLICT") return "Hợp đồng đã được thay đổi ở nơi khác. Vui lòng tải lại dữ liệu mới nhất.";
    if (error.code === "CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED") return "Chưa xác định được chỉ số đầu kỳ của hợp đồng mới. Vui lòng bổ sung chỉ số trước khi kích hoạt.";
    if (error.code === "STORAGE_UNAVAILABLE") return "Dịch vụ lưu trữ tệp chưa được cấu hình. Metadata hiện có vẫn được giữ nguyên.";
    if (error.code === "CONTRACT_HAS_UNPAID_INVOICES") return "Hợp đồng còn hóa đơn chưa thanh toán nên chưa thể chấm dứt.";
    if (error.code === "ROOM_CAPACITY_EXCEEDED") return "Sức chứa hợp đồng thấp hơn số cư dân đang ở trong phòng.";
    if (error.code === "PARKING_CAPACITY_EXCEEDED") return "Sức chứa hợp đồng thấp hơn số slot xe đang được cấp.";
    if (error.code === "CONTRACT_DATE_OVERLAP") return "Thời hạn bị trùng với một hợp đồng đang hiệu lực của phòng này.";
    if (error.code === "VALIDATION_ERROR") return error.message;
    if (error.status === 400) return "Thông tin hợp đồng chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Tài khoản không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy hợp đồng trong phạm vi tài khoản.";
    if (error.status === 409) return "Thao tác đang xung đột với dữ liệu hợp đồng hiện tại. Hãy tải lại hồ sơ rồi thử lại.";
    if (error.status >= 500) return "Máy chủ chưa thể xử lý yêu cầu. Vui lòng thử lại sau.";
    return fallback;
  }
  return fallback;
}

export function changedContractFields(entry: ContractHistoryEntry) {
  const before = entry.before_data ?? {};
  const after = entry.after_data ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}
