const businessTimeZone = "Asia/Ho_Chi_Minh";

const statusLabels: Record<string, string> = {
  active: "Đang hoạt động",
  archived: "Ngưng hoạt động",
  available: "Còn trống",
  building: "Đang xây dựng",
  cancelled: "Đã hủy",
  cancellation_requested: "Đang chờ hủy",
  closed: "Đã đóng",
  completed: "Hoàn tất",
  confirmed: "Đã xác nhận",
  contacted: "Đã liên hệ",
  contract_ended: "Hợp đồng đã kết thúc",
  draft: "Nháp",
  ended: "Đã kết thúc",
  expired: "Hết hạn",
  failed: "Thất bại",
  high: "Cao",
  inactive: "Ngưng hoạt động",
  in_progress: "Đang xử lý",
  left: "Không có lượt ở hiện tại",
  living: "Đang ở",
  low: "Thấp",
  maintenance: "Đang bảo trì",
  medium: "Trung bình",
  new: "Mới",
  normal: "Bình thường",
  not_completed: "Chưa hoàn tất đăng ký lưu trú",
  occupied: "Đang có người ở",
  paid: "Đã thanh toán",
  paused: "Tạm dừng",
  pending: "Chờ xử lý",
  pending_signature: "Chờ ký",
  rejected: "Đã từ chối",
  resolved: "Đã xử lý",
  signed: "Đã ký",
  temporary_absence: "Tạm vắng",
  temporary_resident: "Tạm trú",
  terminated: "Đã chấm dứt",
  unpaid: "Chưa thanh toán",
  unavailable: "Không khả dụng",
  under_construction: "Đang xây dựng",
  used: "Đã sử dụng",
  void: "Đã hủy",
  urgent: "Khẩn cấp",
};

function validDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAdminDate(value: string | null | undefined): string {
  const date = validDate(value);
  if (!date) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value!);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: dateOnly ? "UTC" : businessTimeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatAdminTimestamp(value: string | null | undefined): string {
  const date = validDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: businessTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatAdminMoney(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const integer = typeof value === "bigint" ? value : BigInt(String(value));
    return `${new Intl.NumberFormat("vi-VN").format(integer)} ₫`;
  } catch {
    return "—";
  }
}

export function formatAdminStatus(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Chưa xác định";
  return statusLabels[value.trim().toLowerCase()] ?? "Chưa xác định";
}

export function formatOptionalText(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  if (typeof value === "number" && !Number.isFinite(value)) return fallback;
  return String(value);
}

export function residenceStatusLabel(status: "living" | "left", historyCount?: number): string {
  if (status === "living") return "Đang ở";
  if (historyCount === undefined) return "Không có lượt ở hiện tại";
  return historyCount > 0 ? "Đã rời đi" : "Chưa từng lưu trú";
}
