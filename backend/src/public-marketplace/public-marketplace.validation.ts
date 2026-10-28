import { Prisma } from "@prisma/client";
import { validationError } from "../middleware/api-error.js";
import { parseBigIntId } from "../utils/ids.js";
import { parseListQuery } from "../properties/property-room.validation.js";
import { parseMarketplaceAmenityFilter, type MarketplaceAmenityCode } from "./marketplace-amenities.js";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function scalar(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw validationError(`${key} không hợp lệ.`);
  return value;
}

function id(value: unknown, key: string): bigint {
  try { return parseBigIntId(value); }
  catch { throw validationError(`${key} phải là ID chuỗi số nguyên dương hợp lệ.`); }
}

function rent(value: string | undefined, key: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,19}$/.test(value)) throw validationError(`${key} phải là số VND nguyên không âm.`);
  const parsed = BigInt(value);
  if (parsed > 9_223_372_036_854_775_807n) throw validationError(`${key} vượt giới hạn.`);
  return parsed;
}

function area(value: string | undefined, key: string): Prisma.Decimal | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 999_999.99) throw validationError(`${key} phải là số dương, tối đa hai chữ số thập phân.`);
  return new Prisma.Decimal(value);
}

export type PublicRoomListQuery = {
  page: number; page_size: number; province?: string; address?: string;
  price_min?: bigint; price_max?: bigint; area_min?: Prisma.Decimal; area_max?: Prisma.Decimal;
  capacity_min?: number; amenities?: MarketplaceAmenityCode[]; property_facilities?: string[];
  sort: "newest" | "price_asc" | "price_desc" | "area_asc" | "area_desc";
};

function propertyFacilities(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 10 || values.some((item) => typeof item !== "string")) throw validationError("property_facilities chỉ nhận tối đa 10 tiện ích hợp lệ.");
  const names = values.map((item) => (item as string).trim());
  if (names.some((name) => !name || name.length > 150) || new Set(names.map((name) => name.toLocaleLowerCase("vi"))).size !== names.length) {
    throw validationError("property_facilities chứa tên trống, quá dài hoặc trùng lặp.");
  }
  return names;
}

export function parsePublicRoomListQuery(value: Record<string, unknown>): PublicRoomListQuery {
  const allowed = ["page", "page_size", "province", "address", "price_min", "price_max", "area_min", "area_max", "capacity_min", "amenities", "property_facilities", "sort"];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validationError(`Tham số không được hỗ trợ: ${unknown.join(", ")}.`);
  const pagination = parseListQuery({ page: value.page, page_size: value.page_size });
  const province = scalar(value, "province")?.trim();
  const address = scalar(value, "address")?.trim();
  if (province && province.length > 120) throw validationError("province không được vượt quá 120 ký tự.");
  if (address && address.length > 200) throw validationError("address không được vượt quá 200 ký tự.");
  const priceMin = rent(scalar(value, "price_min"), "price_min");
  const priceMax = rent(scalar(value, "price_max"), "price_max");
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) throw validationError("price_min không được lớn hơn price_max.");
  const areaMin = area(scalar(value, "area_min"), "area_min");
  const areaMax = area(scalar(value, "area_max"), "area_max");
  if (areaMin && areaMax && areaMin.greaterThan(areaMax)) throw validationError("area_min không được lớn hơn area_max.");
  const capacityRaw = scalar(value, "capacity_min");
  let capacityMin: number | undefined;
  if (capacityRaw !== undefined) {
    if (!/^\d+$/.test(capacityRaw)) throw validationError("capacity_min phải là số nguyên từ 1 đến 1000000.");
    capacityMin = Number(capacityRaw);
    if (!Number.isSafeInteger(capacityMin) || capacityMin < 1 || capacityMin > 1_000_000) throw validationError("capacity_min phải là số nguyên từ 1 đến 1000000.");
  }
  const sort = scalar(value, "sort") ?? "newest";
  if (!["newest", "price_asc", "price_desc", "area_asc", "area_desc"].includes(sort)) throw validationError("sort không được hỗ trợ.");
  const amenitiesRaw = value.amenities;
  const amenities = amenitiesRaw === undefined ? undefined : parseMarketplaceAmenityFilter(amenitiesRaw);
  const property_facilities = propertyFacilities(value.property_facilities);
  return {
    ...pagination,
    ...(province ? { province } : {}), ...(address ? { address } : {}),
    ...(priceMin === undefined ? {} : { price_min: priceMin }), ...(priceMax === undefined ? {} : { price_max: priceMax }),
    ...(areaMin === undefined ? {} : { area_min: areaMin }), ...(areaMax === undefined ? {} : { area_max: areaMax }),
    ...(capacityMin === undefined ? {} : { capacity_min: capacityMin }),
    ...(amenities === undefined ? {} : { amenities }),
    ...(property_facilities === undefined ? {} : { property_facilities }),
    sort: sort as PublicRoomListQuery["sort"],
  };
}

export type ContactRequestInput = {
  room_id?: bigint; property_id?: bigint; requester_name: string; phone: string; email: string | null; message: string | null;
};

export function validateContactRequest(value: unknown): ContactRequestInput {
  if (!isRecord(value)) throw validationError("Body phải là JSON object.");
  const allowed = ["room_id", "property_id", "requester_name", "phone", "email", "message"];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validationError(`Trường không được hỗ trợ: ${unknown.join(", ")}.`);
  if (value.room_id === undefined && value.property_id === undefined) throw validationError("Cần room_id hoặc property_id.");

  const requesterName = typeof value.requester_name === "string" ? value.requester_name.trim() : "";
  if (requesterName.length < 2 || requesterName.length > 200) throw validationError("requester_name phải có từ 2 đến 200 ký tự.");
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const digitCount = (phone.match(/\d/g) ?? []).length;
  if (phone.length < 8 || phone.length > 30 || digitCount < 8 || digitCount > 15 || !/^\+?[0-9](?:[0-9\s().-]*[0-9])$/.test(phone)) {
    throw validationError("phone phải có từ 8 đến 30 ký tự và chứa số điện thoại hợp lệ.");
  }
  let email: string | null = null;
  if (value.email !== undefined && value.email !== null) {
    if (typeof value.email !== "string" || value.email.trim().length > 254) throw validationError("email không hợp lệ.");
    const trimmed = value.email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw validationError("email không hợp lệ.");
    email = trimmed || null;
  }
  let message: string | null = null;
  if (value.message !== undefined && value.message !== null) {
    if (typeof value.message !== "string" || value.message.length > 2000) throw validationError("message không được vượt quá 2000 ký tự.");
    message = value.message.trim() || null;
  }
  return {
    ...(value.room_id === undefined ? {} : { room_id: id(value.room_id, "room_id") }),
    ...(value.property_id === undefined ? {} : { property_id: id(value.property_id, "property_id") }),
    requester_name: requesterName, phone, email, message,
  };
}

export function parseContactListQuery(value: Record<string, unknown>) {
  const allowed = ["page", "page_size", "property_id", "status", "created_at"];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validationError(`Tham số không được hỗ trợ: ${unknown.join(", ")}.`);
  const page = parseListQuery({ page: value.page, page_size: value.page_size });
  const propertyRaw = scalar(value, "property_id");
  const status = scalar(value, "status");
  if (status !== undefined && !["new", "contacted", "closed"].includes(status)) throw validationError("status không hợp lệ.");
  const date = scalar(value, "created_at");
  let created_at: Date | undefined;
  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw validationError("created_at phải có định dạng YYYY-MM-DD.");
    created_at = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(created_at.valueOf()) || created_at.toISOString().slice(0, 10) !== date) throw validationError("created_at không hợp lệ.");
  }
  return { ...page, ...(propertyRaw === undefined ? {} : { property_id: id(propertyRaw, "property_id") }), ...(status ? { status } : {}), ...(created_at ? { created_at } : {}) };
}

export function validateContactStatusPatch(value: unknown): "new" | "contacted" | "closed" {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.status !== "string" || !["new", "contacted", "closed"].includes(value.status)) {
    throw validationError("Body chỉ được chứa status là new, contacted hoặc closed.");
  }
  return value.status as "new" | "contacted" | "closed";
}
