import { Prisma } from "@prisma/client";
import { validationError } from "../middleware/api-error.js";
import { parseMarketplaceAmenities } from "../public-marketplace/marketplace-amenities.js";

export type PageQuery = { page: number; page_size: number };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function body(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!isRecord(value)) throw validationError("Body phải là một JSON object.");
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validationError(`Trường không được hỗ trợ: ${unknown.join(", ")}.`);
  if (!Object.keys(value).length) throw validationError("Cần ít nhất một trường để cập nhật.");
  return value;
}
function stringField(input: Record<string, unknown>, name: string, max: number, required = false): string | undefined {
  const value = input[name];
  if (value === undefined) { if (required) throw validationError(`Thiếu trường ${name}.`); return undefined; }
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) throw validationError(`Trường ${name} không hợp lệ.`);
  return value.trim();
}
function positiveInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw validationError(`Trường ${field} phải là số nguyên từ ${min} đến ${max}.`);
  return value;
}
function money(value: unknown, field: string): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw validationError(`Trường ${field} phải là số VND nguyên.`);
  const text = String(value);
  if (!/^\d{1,18}$/.test(text)) throw validationError(`Trường ${field} phải là số VND nguyên không âm.`);
  return BigInt(text);
}
function area(value: unknown): Prisma.Decimal {
  if (typeof value !== "string" && typeof value !== "number") throw validationError("area_m2 phải là số dương.");
  const text = String(value);
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0 || Number(text) > 999999.99) throw validationError("area_m2 phải lớn hơn 0 và có tối đa 2 chữ số thập phân.");
  return new Prisma.Decimal(text);
}

export function parseListQuery(query: Record<string, unknown>, filters: string[] = []): PageQuery {
  const unknown = Object.keys(query).filter((key) => !["page", "page_size", ...filters].includes(key));
  if (unknown.length) throw validationError(`Tham số không được hỗ trợ: ${unknown.join(", ")}.`);
  const parse = (value: unknown, fallback: number, max: number, field: string) => {
    if (value === undefined) return fallback;
    const raw = Array.isArray(value) ? undefined : String(value);
    if (!raw || !/^\d+$/.test(raw)) throw validationError(`${field} phải là số nguyên dương.`);
    const number = Number(raw);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw validationError(`${field} nằm ngoài giới hạn.`);
    return number;
  };
  return { page: parse(query.page, 1, 1_000_000, "page"), page_size: parse(query.page_size, 20, 100, "page_size") };
}

export function validatePropertyCreate(value: unknown): Omit<Prisma.PropertyUncheckedCreateInput, "ownerId"> {
  const input = body(value, ["property_code", "name", "province", "address", "manager_name"]);
  const status = "active";
  if (!["active", "building", "paused", "archived"].includes(status)) throw validationError("Trạng thái khu vực không hợp lệ.");
  return {
    propertyCode: stringField(input, "property_code", 40, true)!, name: stringField(input, "name", 150, true)!,
    province: stringField(input, "province", 120, true)!, address: stringField(input, "address", 10000, true)!,
    managerName: stringField(input, "manager_name", 150) ?? null, status,
  };
}

export function validatePropertyPatch(value: unknown): Prisma.PropertyUpdateInput {
  const input = body(value, ["name", "province", "address", "manager_name", "status"]);
  const data: Prisma.PropertyUpdateInput = {};
  if ("name" in input) data.name = stringField(input, "name", 150, true)!;
  if ("province" in input) data.province = stringField(input, "province", 120, true)!;
  if ("address" in input) data.address = stringField(input, "address", 10000, true)!;
  if ("manager_name" in input) data.managerName = input.manager_name === null ? null : stringField(input, "manager_name", 150, true)!;
  if ("status" in input) {
    const status = stringField(input, "status", 20, true)!;
    if (!["active", "building", "paused", "archived"].includes(status)) throw validationError("Trạng thái khu vực không hợp lệ.");
    data.status = status;
  }
  return data;
}

export function validateRoomCreate(value: unknown): Omit<Prisma.RoomUncheckedCreateInput, "ownerId" | "propertyId" | "roomId"> {
  const input = body(value, ["room_code", "default_rent", "area_m2", "default_capacity", "is_active", "is_public", "public_description", "marketplace_amenities", "status"]);
  const isActive = input.is_active === undefined ? true : input.is_active;
  const isPublic = input.is_public === undefined ? false : input.is_public;
  if (typeof isActive !== "boolean" || typeof isPublic !== "boolean") throw validationError("is_active và is_public phải là boolean.");
  const status = stringField(input, "status", 20) ?? (isActive ? "available" : "inactive");
  if (status !== "available" && status !== "inactive") throw validationError("Phòng mới chỉ có thể ở trạng thái available hoặc inactive.");
  if ((status === "inactive") === isActive) throw validationError("status và is_active không nhất quán.");
  const description = input.public_description;
  if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 10000)) throw validationError("public_description không hợp lệ.");
  return {
    roomCode: stringField(input, "room_code", 40, true)!, defaultRent: money(input.default_rent, "default_rent"),
    areaM2: area(input.area_m2), defaultCapacity: positiveInteger(input.default_capacity, "default_capacity", 1, 1_000_000),
    isActive, isPublic, publicDescription: typeof description === "string" ? description : null, status,
    marketplaceAmenities: input.marketplace_amenities === undefined ? [] : parseMarketplaceAmenities(input.marketplace_amenities),
  };
}

export function validateRoomPatch(value: unknown): Prisma.RoomUpdateInput {
  const input = body(value, ["room_code", "default_rent", "area_m2", "default_capacity", "is_active", "is_public", "public_description", "marketplace_amenities", "status"]);
  const data: Prisma.RoomUpdateInput = {};
  if ("room_code" in input) data.roomCode = stringField(input, "room_code", 40, true)!;
  if ("default_rent" in input) data.defaultRent = money(input.default_rent, "default_rent");
  if ("area_m2" in input) data.areaM2 = area(input.area_m2);
  if ("default_capacity" in input) data.defaultCapacity = positiveInteger(input.default_capacity, "default_capacity", 1, 1_000_000);
  if ("is_active" in input) { if (typeof input.is_active !== "boolean") throw validationError("is_active phải là boolean."); data.isActive = input.is_active; }
  if ("is_public" in input) { if (typeof input.is_public !== "boolean") throw validationError("is_public phải là boolean."); data.isPublic = input.is_public; }
  if ("public_description" in input) {
    if (input.public_description !== null && (typeof input.public_description !== "string" || input.public_description.length > 10000)) throw validationError("public_description không hợp lệ.");
    data.publicDescription = input.public_description;
  }
  if ("marketplace_amenities" in input) data.marketplaceAmenities = parseMarketplaceAmenities(input.marketplace_amenities);
  if ("status" in input) {
    const status = stringField(input, "status", 20, true)!;
    if (status === "occupied") throw validationError("occupied là trạng thái dẫn xuất, không thể gửi từ client.");
    if (status !== "available" && status !== "inactive") throw validationError("Trạng thái phòng không hợp lệ.");
    data.status = status;
    data.isActive = status === "available";
  }
  if (data.isActive === false) data.status = "inactive";
  if (data.isActive === true) data.status = "available";
  return data;
}
