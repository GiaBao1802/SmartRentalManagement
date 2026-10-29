export type InvoiceLifecycleStatus = "draft" | "unpaid" | "paid";

export function invoiceLifecycleLabel(status: InvoiceLifecycleStatus) {
  if (status === "draft") return "Đang chuẩn bị";
  if (status === "paid") return "Đã thanh toán";
  return "Chưa thanh toán";
}

export function invoiceDueStateLabel(
  status: InvoiceLifecycleStatus,
  isOverdue: boolean,
  dueDate: string | null,
  asOf: string,
) {
  if (status !== "unpaid") return null;
  if (isOverdue) return "Quá hạn";
  if (!dueDate) return "Thiếu hạn thanh toán";
  if (dueDate < asOf) return "Cần kiểm tra hạn";
  if (dueDate === asOf) return "Đến hạn hôm nay";
  return "Còn hạn";
}

export function invoiceDisplayStatus(
  status: InvoiceLifecycleStatus,
  isOverdue: boolean,
  dueDate: string | null,
  asOf: string,
) {
  const lifecycle = invoiceLifecycleLabel(status);
  const dueState = invoiceDueStateLabel(status, isOverdue, dueDate, asOf);
  return dueState ? `${lifecycle} · ${dueState}` : lifecycle;
}

export function businessDateToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
