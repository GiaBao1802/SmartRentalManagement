import { validationError } from "../middleware/api-error.js";
import { parseBigIntId } from "../utils/ids.js";
import { parseSqlDate } from "./invoice.billing.js";

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError("Body phải là một JSON object.");
  return value as Record<string, unknown>;
};
function exactObject(value: unknown, allowed: readonly string[], requireOne = true): Record<string, unknown> {
  const input = record(value);
  const extra = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extra.length) throw validationError(`Trường không được hỗ trợ: ${extra.join(", ")}.`);
  if (requireOne && !Object.keys(input).length) throw validationError("Cần ít nhất một trường để xử lý yêu cầu.");
  return input;
}
function id(value: unknown, key: string): bigint {
  try { return parseBigIntId(value); } catch { throw validationError(`${key} phải là chuỗi số nguyên dương hợp lệ.`); }
}
function date(value: unknown, key: string): Date {
  if (typeof value !== "string") throw validationError(`${key} phải có định dạng YYYY-MM-DD.`);
  try { return parseSqlDate(value); } catch { throw validationError(`${key} phải là ngày hợp lệ theo định dạng YYYY-MM-DD.`); }
}
function reading(value: unknown, key: string): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(text)) throw validationError(`${key} phải là số không âm, tối đa 3 chữ số thập phân.`);
  return text;
}
export type CreateInvoiceInput = { contractId: bigint; periodStart: Date; periodEnd: Date };
export type DraftInvoicePatch = { electricityCurrentKwh?: string; waterCurrentM3?: string };
export function validateCreateInvoice(value: unknown): CreateInvoiceInput {
  const input = exactObject(value, ["contract_id", "period_start", "period_end"]);
  if (input.contract_id === undefined || input.period_start === undefined || input.period_end === undefined) throw validationError("Cần contract_id, period_start và period_end.");
  const periodStart = date(input.period_start, "period_start");
  const periodEnd = date(input.period_end, "period_end");
  if (periodEnd < periodStart) throw validationError("period_end phải bằng hoặc sau period_start.");
  return { contractId: id(input.contract_id, "contract_id"), periodStart, periodEnd };
}
export function validateDraftPatch(value: unknown, requireOne = true): DraftInvoicePatch {
  const input = exactObject(value ?? {}, ["electricity_current_kwh", "water_current_m3"], requireOne);
  const result: DraftInvoicePatch = {};
  if ("electricity_current_kwh" in input) result.electricityCurrentKwh = reading(input.electricity_current_kwh, "electricity_current_kwh");
  if ("water_current_m3" in input) result.waterCurrentM3 = reading(input.water_current_m3, "water_current_m3");
  return result;
}
export function validateIdempotencyKey(value: string | undefined): void {
  if (value === undefined || value.length < 1 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) throw validationError("Idempotency-Key phải có từ 1 đến 128 ký tự ASCII hiển thị.");
}
export function validateEmptyInvoiceCommand(value: unknown): void { exactObject(value ?? {}, [], false); }
export function validateInvoicePageQuery(query: Record<string, unknown>, role: "admin" | "resident") {
  const allowed = new Set(["page", "page_size", "property_id", "room_id", "contract_id", "resident_id", "status", "period_start", "period_end"]);
  const extra = Object.keys(query).filter((key) => !allowed.has(key));
  if (extra.length) throw validationError(`Query không được hỗ trợ: ${extra.join(", ")}.`);
  const integer = (value: unknown, fallback: number, max: number, key: string) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError(`${key} không hợp lệ.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw validationError(`${key} không hợp lệ.`);
    return number;
  };
  const status = query.status;
  if (status !== undefined && (typeof status !== "string" || !["draft", "unpaid", "paid"].includes(status))) throw validationError("status không hợp lệ.");
  const periodStart = query.period_start === undefined ? undefined : date(query.period_start, "period_start");
  const periodEnd = query.period_end === undefined ? undefined : date(query.period_end, "period_end");
  if (periodStart && periodEnd && periodEnd < periodStart) throw validationError("period_end phải bằng hoặc sau period_start.");
  const idFilters = (key: string) => query[key] === undefined ? undefined : id(query[key], key);
  if (role === "resident" && (query.property_id !== undefined || query.room_id !== undefined || query.contract_id !== undefined || query.resident_id !== undefined)) throw validationError("Cư dân chỉ được lọc hóa đơn theo trạng thái và kỳ.");
  return {
    page: integer(query.page, 1, 1_000_000, "page"), pageSize: integer(query.page_size, 20, 100, "page_size"),
    propertyId: idFilters("property_id"), roomId: idFilters("room_id"), contractId: idFilters("contract_id"), residentId: idFilters("resident_id"),
    status: status as string | undefined, periodStart, periodEnd,
  };
}

const workspaceStates = ["UPCOMING", "IN_PROGRESS", "REMINDER_DUE", "MISSING_DRAFT", "MISSING_DATA", "READY_TO_FINALIZE", "FINALIZED_UNPAID", "OVERDUE", "PAID"] as const;
export function validateBillingWorkspaceQuery(query: Record<string, unknown>) {
  const allowed = new Set(["page", "page_size", "property_id", "room_id", "resident_id", "invoice_status", "period_start", "period_end", "state"]);
  const extra = Object.keys(query).filter((key) => !allowed.has(key));
  if (extra.length) throw validationError(`Query không được hỗ trợ: ${extra.join(", ")}.`);
  const integer = (value: unknown, fallback: number, max: number, key: string) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError(`${key} không hợp lệ.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw validationError(`${key} không hợp lệ.`);
    return number;
  };
  const id = (key: string) => {
    if (query[key] === undefined) return undefined;
    try { return parseBigIntId(query[key]); } catch { throw validationError(`${key} không hợp lệ.`); }
  };
  const invoiceStatus = query.invoice_status;
  if (invoiceStatus !== undefined && (typeof invoiceStatus !== "string" || !["draft", "unpaid", "paid"].includes(invoiceStatus))) throw validationError("invoice_status không hợp lệ.");
  const state = query.state;
  if (state !== undefined && (typeof state !== "string" || !workspaceStates.includes(state as typeof workspaceStates[number]))) throw validationError("state không hợp lệ.");
  const periodStart = query.period_start === undefined ? undefined : date(query.period_start, "period_start");
  const periodEnd = query.period_end === undefined ? undefined : date(query.period_end, "period_end");
  if (periodStart && periodEnd && periodEnd < periodStart) throw validationError("period_end phải bằng hoặc sau period_start.");
  return {
    page: integer(query.page, 1, 1_000_000, "page"),
    pageSize: integer(query.page_size, 20, 50, "page_size"),
    propertyId: id("property_id"), roomId: id("room_id"), residentId: id("resident_id"),
    invoiceStatus: invoiceStatus as "draft" | "unpaid" | "paid" | undefined,
    periodStart, periodEnd, state: state as string | undefined,
  };
}
