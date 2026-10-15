import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { PrismaUtilityTariffManagementRepository, PublishedUtilityVersionInput, UtilityKind } from "./utility-tariff-management.repository.js";

type Repository = Pick<PrismaUtilityTariffManagementRepository, "listForProperty" | "publishVersion">;
const MAX_I64 = 9_223_372_036_854_775_807n;
function owner(request: express.Request) { return getAdminOwnerId(request.auth!); }
function id(value: unknown) { try { return parseBigIntId(value); } catch { throw validationError("ID khu vực không hợp lệ."); } }
function versionDto(version: any) {
  return {
    utility_tariff_version_id: String(version.utilityTariffVersionId), version_no: version.versionNo,
    effective_from: version.effectiveFrom.toISOString().slice(0, 10), unit: version.unit,
    calculation_mode: version.calculationMode, flat_unit_price: version.flatUnitPrice?.toString() ?? null,
    source_name: version.sourceName, source_reference: version.sourceReference,
    published_at: version.publishedAt?.toISOString() ?? null, created_at: version.createdAt?.toISOString() ?? null,
    tiers: (version.tiers ?? []).map((tier: any) => ({
      electricity_tariff_tier_id: String(tier.electricityTariffTierId), tier_no: tier.tierNo,
      lower_kwh: tier.lowerKwh.toString(), upper_kwh: tier.upperKwh?.toString() ?? null,
      unit_price: tier.unitPrice.toString(),
    })),
  };
}
function listDto(input: any) {
  return {
    property: { property_id: String(input.property.propertyId), name: input.property.name },
    tariffs: input.tariffs.map((tariff: any) => ({
      utility_tariff_id: String(tariff.utilityTariffId), utility_type: tariff.utilityType,
      code: tariff.code, name: tariff.name, status: tariff.status,
      versions: tariff.versions.map(versionDto),
    })),
  };
}
function publishedDto(version: any) { return { ...versionDto(version), tariff: { utility_tariff_id: String(version.tariff.utilityTariffId), utility_type: version.tariff.utilityType, code: version.tariff.code, name: version.tariff.name } }; }
function exactBody(body: unknown, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Dữ liệu biểu giá không hợp lệ.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw validationError("Có trường không được hỗ trợ trong dữ liệu biểu giá.");
  return value;
}
function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) throw validationError(`${label} không hợp lệ.`);
  return value.trim();
}
function effectiveDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError("Ngày hiệu lực không hợp lệ.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw validationError("Ngày hiệu lực không hợp lệ.");
  return date;
}
function price(value: unknown, label: string): bigint {
  if (!(typeof value === "string" || typeof value === "number") || !/^\d+$/.test(String(value))) throw validationError(`${label} phải là số nguyên VND không âm.`);
  const parsed = BigInt(String(value));
  if (parsed > MAX_I64) throw validationError(`${label} vượt giới hạn lưu trữ.`);
  return parsed;
}
function reading(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,3})?$/.test(value)) throw validationError(`${label} phải không âm và tối đa 3 chữ số thập phân.`);
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(3, "0")}`;
}
function validateVersion(type: UtilityKind, body: unknown): PublishedUtilityVersionInput {
  const fields = type === "ELECTRICITY" ? ["effective_from", "source_name", "source_reference", "tiers"] : ["effective_from", "source_name", "source_reference", "flat_unit_price"];
  const input = exactBody(body, fields);
  const common = { utilityType: type, effectiveFrom: effectiveDate(input.effective_from), sourceName: optionalText(input.source_name, "Tên nguồn", 200), sourceReference: optionalText(input.source_reference, "Tham chiếu nguồn", 10_000) };
  if (type === "WATER") return { ...common, flatUnitPrice: price(input.flat_unit_price, "Đơn giá nước") };
  if (!Array.isArray(input.tiers) || input.tiers.length < 1 || input.tiers.length > 20) throw validationError("Biểu giá điện cần từ 1 đến 20 bậc.");
  const tiers = input.tiers.map((row, index) => {
    const tier = exactBody(row, ["tier_no", "lower_kwh", "upper_kwh", "unit_price"]);
    if (tier.tier_no !== index + 1) throw validationError("Số thứ tự bậc giá phải liên tục bắt đầu từ 1.");
    return { tierNo: index + 1, lowerKwh: reading(tier.lower_kwh, `Ngưỡng dưới bậc ${index + 1}`), upperKwh: tier.upper_kwh === null ? null : reading(tier.upper_kwh, `Ngưỡng trên bậc ${index + 1}`), unitPrice: price(tier.unit_price, `Đơn giá bậc ${index + 1}`) };
  });
  for (let index = 0; index < tiers.length; index += 1) {
    const current = tiers[index];
    if (index === 0 && BigInt(current.lowerKwh.split(".")[0]!) * 1000n + BigInt(current.lowerKwh.split(".")[1]!) !== 0n) throw validationError("Bậc giá điện phải bắt đầu từ 0 kWh.");
    if (index < tiers.length - 1 && current.upperKwh === null) throw validationError("Chỉ bậc cuối được không giới hạn.");
    if (index === tiers.length - 1 && current.upperKwh !== null) throw validationError("Bậc cuối phải không giới hạn.");
    const scaled = (value: string) => { const [whole, fraction] = value.split("."); return BigInt(whole) * 1000n + BigInt(fraction); };
    if (current.upperKwh !== null && scaled(current.upperKwh) <= scaled(current.lowerKwh)) throw validationError("Khoảng kWh của bậc giá phải tăng dần.");
    if (index > 0 && tiers[index - 1].upperKwh !== current.lowerKwh) throw validationError("Các bậc giá điện phải liên tục, không được có khoảng trống hoặc chồng lấn.");
  }
  return { ...common, tiers };
}

export function createUtilityTariffRouter(auth: AuthDependencies, repository: Repository): express.Router {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];
  router.get("/properties/:property_id/utility-tariffs", ...admin, async (request, response, next) => {
    try {
      if (Object.keys(request.query).length) throw validationError("Truy vấn cấu hình biểu giá không nhận tham số.");
      const data = await repository.listForProperty(owner(request), id(request.params.property_id));
      if (!data) { foreignResourceNotFound(); return; }
      sendJson(response, 200, { data: listDto(data) });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/utility-tariffs/:utility_type/versions", ...admin, async (request, response, next) => {
    try {
      const pathType = request.params.utility_type;
      const pathValue = Array.isArray(pathType) ? pathType[0] : pathType;
      const rawType = pathValue.toUpperCase();
      if ((pathValue !== "electricity" && pathValue !== "water") || (rawType !== "ELECTRICITY" && rawType !== "WATER")) throw validationError("Loại biểu giá chỉ hỗ trợ electricity hoặc water.");
      const data = await repository.publishVersion(owner(request), id(request.params.property_id), request.auth!.accountId, validateVersion(rawType, request.body));
      if (!data) { foreignResourceNotFound(); return; }
      sendJson(response, 201, { data: publishedDto(data) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) { next(conflict("Phiên bản biểu giá bị trùng hoặc vừa có thao tác khác. Tải lại dữ liệu rồi thử lại.")); return; }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { next(conflict("Không thể ghi nhận nguồn giá do dữ liệu tham chiếu không hợp lệ.")); return; }
      if (error instanceof ApiError) { next(error); return; }
      next(error);
    }
  });
  return router;
}
