import { Prisma } from "@prisma/client";
import { validationError } from "../middleware/api-error.js";
import { parseBigIntId } from "../utils/ids.js";
import { parseListQuery } from "../properties/property-room.validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function body(value: unknown, allowed: string[], allowEmpty = false) {
  if (!isRecord(value)) throw validationError("Body phải là một JSON object.");
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw validationError(`Trường không được hỗ trợ: ${unsupported.join(", ")}.`);
  if (!allowEmpty && Object.keys(value).length === 0) throw validationError("Cần ít nhất một trường để xử lý yêu cầu.");
  return value;
}
export function parseId(value: unknown): bigint {
  try { return parseBigIntId(value); } catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); }
}
function text(input: Record<string, unknown>, field: string, max: number, nullable = false, required = false): string | null | undefined {
  const value = input[field];
  if (value === undefined) { if (required) throw validationError(`Thiếu trường ${field}.`); return undefined; }
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw validationError(`Trường ${field} không hợp lệ.`);
  return value.trim();
}
function date(input: Record<string, unknown>, field: string, nullable = false): Date | null | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError(`Trường ${field} phải có định dạng YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw validationError(`Trường ${field} không phải ngày hợp lệ.`);
  return parsed;
}
function email(input: Record<string, unknown>) {
  const value = text(input, "email", 254, true);
  if (typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw validationError("Email không hợp lệ.");
  return value;
}
function phone(input: Record<string, unknown>) {
  const value = text(input, "phone", 30, true);
  if (typeof value === "string" && !/^\+?[0-9][0-9 .()\-]{5,28}[0-9]$/.test(value)) throw validationError("Số điện thoại không hợp lệ.");
  return value;
}
function nationalId(input: Record<string, unknown>, required = false) {
  const value = text(input, "national_id", 12, true, required);
  if (typeof value === "string" && !/^\d{12}$/.test(value)) throw validationError("CCCD phải gồm đúng 12 chữ số.");
  return value;
}
function gender(input: Record<string, unknown>) {
  const value = text(input, "gender", 40, true);
  return value;
}
const residentFields = ["national_id", "full_name", "phone", "email", "birth_date", "gender", "residence_registration_status"];
export type ResidentCreate = Omit<Prisma.ResidentUncheckedCreateInput, "ownerId" | "residentId" | "archivedAt" | "createdAt" | "updatedAt" | "residenceStatus">;
export function validateResidentCreate(value: unknown): ResidentCreate {
  const input = body(value, residentFields);
  const name = text(input, "full_name", 200, false, true)! as string;
  const registrationStatus = text(input, "residence_registration_status", 32) ?? "not_completed";
  if (!["not_completed", "temporary_resident", "temporary_absence"].includes(registrationStatus as string)) throw validationError("residence_registration_status không hợp lệ.");
  return { nationalId: nationalId(input) as string | null ?? undefined, fullName: name, phone: phone(input) as string | null ?? undefined, email: email(input) as string | null ?? undefined, birthDate: date(input, "birth_date", true) as Date | null ?? undefined, gender: gender(input) as string | null ?? undefined, residenceRegistrationStatus: registrationStatus as string };
}
export function validateResidentPatch(value: unknown): Prisma.ResidentUncheckedUpdateInput {
  const input = body(value, residentFields);
  const data: Prisma.ResidentUncheckedUpdateInput = {};
  if ("full_name" in input) data.fullName = text(input, "full_name", 200, false, true) as string;
  if ("national_id" in input) data.nationalId = nationalId(input) as string | null;
  if ("phone" in input) data.phone = phone(input) as string | null;
  if ("email" in input) data.email = email(input) as string | null;
  if ("birth_date" in input) data.birthDate = date(input, "birth_date", true) as Date | null;
  if ("gender" in input) data.gender = gender(input) as string | null;
  if ("residence_registration_status" in input) {
    const value = text(input, "residence_registration_status", 32, false, true) as string;
    if (!["not_completed", "temporary_resident", "temporary_absence"].includes(value)) throw validationError("residence_registration_status không hợp lệ.");
    data.residenceRegistrationStatus = value;
  }
  return data;
}
export function validateResidentSearch(value: unknown) {
  const input = body(value, ["national_id"]);
  return { nationalId: nationalId(input, true) as string };
}
export function parseResidentListQuery(query: Record<string, unknown>) {
  const filters = ["residence_status", "residence_registration_status", "property_id", "room_id"];
  const page = parseListQuery(query, filters);
  const residenceStatus = query.residence_status === undefined ? undefined : String(query.residence_status);
  const registrationStatus = query.residence_registration_status === undefined ? undefined : String(query.residence_registration_status);
  if (residenceStatus !== undefined && !["living", "left"].includes(residenceStatus)) throw validationError("residence_status không hợp lệ.");
  if (registrationStatus !== undefined && !["not_completed", "temporary_resident", "temporary_absence"].includes(registrationStatus)) throw validationError("residence_registration_status không hợp lệ.");
  return { ...page, residenceStatus, registrationStatus, propertyId: query.property_id === undefined ? undefined : parseId(String(query.property_id)), roomId: query.room_id === undefined ? undefined : parseId(String(query.room_id)) };
}
export function validateOccupancyCreate(value: unknown) {
  const input = body(value, ["resident_id", "contract_id", "started_at"]);
  return { residentId: parseId(input.resident_id), contractId: input.contract_id === undefined || input.contract_id === null ? null : parseId(input.contract_id), startedAt: date(input, "started_at") as Date };
}
export function validateEndOccupancy(value: unknown) {
  const input = body(value, ["ended_at"]);
  return { endedAt: date(input, "ended_at") as Date };
}
export function validateTransfer(value: unknown) {
  const input = body(value, ["source_occupancy_id", "room_id", "contract_id", "started_at"]);
  return { sourceOccupancyId: parseId(input.source_occupancy_id), roomId: parseId(input.room_id), contractId: input.contract_id === undefined || input.contract_id === null ? null : parseId(input.contract_id), startedAt: date(input, "started_at") as Date };
}
