import { validationError } from "../middleware/api-error.js";
import { parseBigIntId } from "../utils/ids.js";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const maxBigInt = 9_223_372_036_854_775_807n;
const fields = ["contract_no", "room_id", "representative_resident_id", "start_date", "end_date", "rent_amount", "deposit_amount", "resident_capacity", "initial_electric_kwh", "initial_water_m3"] as const;
const materialFields = ["representative_resident_id", "start_date", "end_date", "rent_amount", "deposit_amount", "resident_capacity", "initial_electric_kwh", "initial_water_m3"] as const;

function object(value: unknown, allowed: readonly string[], empty = false): Record<string, unknown> {
  if (!isRecord(value)) throw validationError("Body phải là một JSON object.");
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw validationError(`Trường không được hỗ trợ: ${unsupported.join(", ")}.`);
  if (!empty && Object.keys(value).length === 0) throw validationError("Cần ít nhất một trường để xử lý yêu cầu.");
  return value;
}
function text(input: Record<string, unknown>, key: string, max: number, required = false): string | undefined {
  const value = input[key];
  if (value === undefined) { if (required) throw validationError(`Thiếu trường ${key}.`); return undefined; }
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw validationError(`Trường ${key} không hợp lệ.`);
  return value.trim();
}
function id(value: unknown, key: string): bigint {
  try { return parseBigIntId(value); } catch { throw validationError(`${key} phải là chuỗi số nguyên dương hợp lệ.`); }
}
function date(input: Record<string, unknown>, key: string): Date | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError(`${key} phải có định dạng YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw validationError(`${key} không phải ngày hợp lệ.`);
  return parsed;
}
function money(input: Record<string, unknown>, key: string, required = false): bigint | undefined {
  const value = input[key];
  if (value === undefined) { if (required) throw validationError(`Thiếu trường ${key}.`); return undefined; }
  const stringValue = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof stringValue !== "string" || !/^\d+$/.test(stringValue)) throw validationError(`${key} phải là số nguyên VND không âm.`);
  const parsed = BigInt(stringValue);
  if (parsed > maxBigInt) throw validationError(`${key} vượt giới hạn lưu trữ.`);
  return parsed;
}
function decimal(input: Record<string, unknown>, key: string): string | null | undefined {
  const value = input[key];
  if (value === undefined || value === null) return value;
  const textValue = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof textValue !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(textValue)) throw validationError(`${key} phải là số không âm, tối đa 3 chữ số thập phân.`);
  return textValue;
}
function capacity(input: Record<string, unknown>, key = "resident_capacity"): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1_000_000) throw validationError(`${key} phải là số nguyên dương hợp lệ.`);
  return value;
}
function datesValid(start: Date | undefined, end: Date | undefined) {
  if (start && end && end <= start) throw validationError("end_date phải sau start_date.");
}

export type ContractInput = {
  contractNo: string; roomId: bigint; representativeResidentId: bigint; startDate: Date; endDate: Date;
  rentAmount: bigint; depositAmount: bigint; residentCapacity: number; initialElectricKwh?: string | null; initialWaterM3?: string | null;
};
export type ContractRenewalInput = { contractNo: string; startDate: Date; endDate: Date };
export function validateContractCreate(value: unknown): ContractInput {
  const input = object(value, fields);
  for (const key of ["initial_electric_kwh", "initial_water_m3"] as const) if (!(key in input)) throw validationError(`Thiếu trường ${key}.`);
  const startDate = date(input, "start_date"); const endDate = date(input, "end_date");
  datesValid(startDate, endDate);
  if (!startDate || !endDate) throw validationError("Thiếu start_date hoặc end_date.");
  const rentAmount = money(input, "rent_amount", true)!; const depositAmount = money(input, "deposit_amount", true)!;
  const residentCapacity = capacity(input);
  if (residentCapacity === undefined) throw validationError("Thiếu resident_capacity.");
  return {
    contractNo: text(input, "contract_no", 40, true)!, roomId: id(input.room_id, "room_id"),
    representativeResidentId: id(input.representative_resident_id, "representative_resident_id"), startDate, endDate,
    rentAmount, depositAmount, residentCapacity,
    initialElectricKwh: decimal(input, "initial_electric_kwh"), initialWaterM3: decimal(input, "initial_water_m3"),
  };
}

export type ContractPatch = Partial<Omit<ContractInput, "roomId">> & { changeReason?: string };
export function validateContractPatch(value: unknown, status: string): ContractPatch {
  const allowed = status === "draft" ? fields.filter((field) => field !== "room_id") : [...materialFields, "change_reason"];
  const input = object(value, allowed);
  if ("room_id" in input) throw validationError("room_id không thể được thay đổi sau khi tạo hợp đồng.");
  if (status !== "draft" && "contract_no" in input) throw validationError("contract_no không thể thay đổi sau khi kích hoạt.");
  const startDate = date(input, "start_date"); const endDate = date(input, "end_date"); datesValid(startDate, endDate);
  const out: ContractPatch = {};
  if ("contract_no" in input) out.contractNo = text(input, "contract_no", 40, true)!;
  if ("representative_resident_id" in input) out.representativeResidentId = id(input.representative_resident_id, "representative_resident_id");
  if (startDate) out.startDate = startDate;
  if (endDate) out.endDate = endDate;
  const rentAmount = money(input, "rent_amount"); if (rentAmount !== undefined) out.rentAmount = rentAmount;
  const depositAmount = money(input, "deposit_amount"); if (depositAmount !== undefined) out.depositAmount = depositAmount;
  const residentCapacity = capacity(input); if (residentCapacity !== undefined) out.residentCapacity = residentCapacity;
  if ("initial_electric_kwh" in input) out.initialElectricKwh = decimal(input, "initial_electric_kwh") as string | null;
  if ("initial_water_m3" in input) out.initialWaterM3 = decimal(input, "initial_water_m3") as string | null;
  if (status === "active") {
    const reason = text(input, "change_reason", 1000, true)!;
    if (!reason.trim()) throw validationError("change_reason không được để trống.");
    out.changeReason = reason;
  }
  return out;
}

export function validateEmptyObject(value: unknown) { return object(value ?? {}, [], true); }
export function validateRenewal(value: unknown): ContractRenewalInput {
  const input = object(value, ["contract_no", "start_date", "end_date"]);
  const startDate = date(input, "start_date"); const endDate = date(input, "end_date"); datesValid(startDate, endDate);
  if (!startDate || !endDate) throw validationError("Renewal cần start_date và end_date mới.");
  return { contractNo: text(input, "contract_no", 40, true)!, startDate, endDate };
}
export function validateTermination(value: unknown) {
  const allowed = ["termination_date", "termination_reason", "final_electric_kwh", "final_water_m3", "deposit_deduction", "deposit_settlement_amount"] as const;
  const input = object(value, allowed);
  const terminationDate = date(input, "termination_date");
  if (!terminationDate) throw validationError("Thiếu termination_date.");
  const terminationReason = text(input, "termination_reason", 1_000_000, true)!;
  const finalElectricKwh = decimal(input, "final_electric_kwh"); const finalWaterM3 = decimal(input, "final_water_m3");
  if (finalElectricKwh == null || finalWaterM3 == null) throw validationError("Thiếu chỉ số điện hoặc nước cuối kỳ.");
  const depositDeduction = money(input, "deposit_deduction", true)!;
  const depositSettlementAmount = money(input, "deposit_settlement_amount", true)!;
  return { terminationDate, terminationReason, finalElectricKwh, finalWaterM3, depositDeduction, depositSettlementAmount };
}

export type ContractListQuery = { page: number; pageSize: number; propertyId?: bigint; roomId?: bigint; representativeResidentId?: bigint; status?: string; expiringBefore?: Date; contractNo?: string };
export function validateContractListQuery(query: Record<string, unknown>): ContractListQuery {
  const allowed = new Set(["page", "page_size", "property_id", "room_id", "representative_resident_id", "status", "expiring_before", "contract_no"]);
  const unknown = Object.keys(query).filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError(`Query không được hỗ trợ: ${unknown.join(", ")}.`);
  const page = parseIntQuery(query.page, 1, 1_000_000, "page");
  const pageSize = parseIntQuery(query.page_size, 20, 100, "page_size");
  const status = query.status === undefined ? undefined : query.status;
  if (status !== undefined && (typeof status !== "string" || !["draft", "active", "expired", "terminated"].includes(status))) throw validationError("status không hợp lệ.");
  const filters = (key: string) => query[key] === undefined ? undefined : id(query[key], key);
  const expiringBefore = query.expiring_before === undefined ? undefined : date(query, "expiring_before");
  if (expiringBefore && status !== undefined && status !== "active") throw validationError("expiring_before chỉ áp dụng cho status=active.");
  const contractNo = query.contract_no === undefined ? undefined : text(query, "contract_no", 40, true);
  return { page, pageSize, propertyId: filters("property_id"), roomId: filters("room_id"), representativeResidentId: filters("representative_resident_id"), status: status as string | undefined, expiringBefore, contractNo };
}
function parseIntQuery(value: unknown, fallback: number, max: number, field: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError(`${field} phải là số nguyên hợp lệ.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw validationError(`${field} phải trong khoảng 1–${max}.`);
  return number;
}
export function parseContractId(value: unknown): bigint { return id(value, "contract_id"); }
export function parseRevisionMatch(value: unknown): number {
  if (typeof value !== "string") throw validationError('Thiếu If-Match: "<revision>".');
  const match = /^"(0|[1-9]\d*)"$/.exec(value);
  if (!match) throw validationError('If-Match phải có dạng "<revision>".');
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 0) throw validationError("Revision không hợp lệ.");
  return revision;
}
export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) throw validationError("Idempotency-Key là bắt buộc và phải gồm 1–128 ký tự ASCII hiển thị.");
  return value;
}
