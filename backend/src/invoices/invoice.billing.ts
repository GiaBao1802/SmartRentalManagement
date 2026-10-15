import { ApiError } from "../middleware/api-error.js";

export type BillingPeriod = { periodStart: Date; periodEnd: Date };
const DAY_MS = 86_400_000;
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
export function parseSqlDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "VALIDATION_ERROR", "Ngày phải có định dạng YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(400, "VALIDATION_ERROR", "Ngày không hợp lệ.");
  return date;
}
export function formatSqlDate(value: Date): string { return value.toISOString().slice(0, 10); }

export function resolveEffectiveContractEndDate(contract: { status: string; endDate: Date; terminationDate: Date | null }): Date {
  return contract.status === "terminated" && contract.terminationDate !== null
    ? contract.terminationDate
    : contract.endDate;
}

/** Calculate each monthly anniversary independently from the original contract anchor. */
export function billingAnniversary(anchor: Date, monthOffset: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthOffset;
  const first = utcDate(year, month, 1);
  const lastDay = utcDate(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getUTCDate();
  return utcDate(first.getUTCFullYear(), first.getUTCMonth(), Math.min(anchor.getUTCDate(), lastDay));
}
export function billingPeriod(anchor: Date, effectiveContractEndDate: Date, monthOffset: number): BillingPeriod | null {
  const periodStart = billingAnniversary(anchor, monthOffset);
  if (periodStart > effectiveContractEndDate) return null;
  const nextStart = billingAnniversary(anchor, monthOffset + 1);
  const normalEnd = new Date(nextStart.valueOf() - DAY_MS);
  const periodEnd = normalEnd < effectiveContractEndDate ? normalEnd : effectiveContractEndDate;
  return periodEnd < periodStart ? null : { periodStart, periodEnd };
}
export function periodMatchesAnchor(anchor: Date, effectiveContractEndDate: Date, start: Date, end: Date): boolean {
  if (start < anchor) return false;
  const months = (start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + start.getUTCMonth() - anchor.getUTCMonth();
  if (months < 0) return false;
  const expected = billingPeriod(anchor, effectiveContractEndDate, months);
  return Boolean(expected && expected.periodStart.valueOf() === start.valueOf() && expected.periodEnd.valueOf() === end.valueOf());
}
export function businessDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return parseSqlDate(`${part("year")}-${part("month")}-${part("day")}`);
}
export function dueDateFromFinalizedAt(finalizedAt: Date): Date {
  return new Date(businessDate(finalizedAt).valueOf() + 5 * DAY_MS);
}
export function isOverdue(status: string, dueDate: Date | null, now = new Date()): boolean {
  return status === "unpaid" && dueDate !== null && businessDate(now).valueOf() > dueDate.valueOf();
}
export function invoiceNumber(contractId: bigint, periodStart: Date): string {
  return `INV-${contractId}-${formatSqlDate(periodStart).replaceAll("-", "")}`;
}
