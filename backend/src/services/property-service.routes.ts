import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import { servicePriceInputIsValid, type PrismaPropertyServiceRepository, type ServiceKind, type ServicePriceInput } from "./property-service.repository.js";

type Repo = Pick<PrismaPropertyServiceRepository, "listItems" | "createItem" | "retireItem" | "publishPrice">;
function id(value: unknown, label = "ID") { try { return parseBigIntId(value); } catch { throw validationError(`${label} không hợp lệ.`); } }
function exactBody(body: unknown, fields: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Dữ liệu dịch vụ không hợp lệ.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !fields.includes(key))) throw validationError("Dữ liệu có trường không được hỗ trợ.");
  return value;
}
function text(value: unknown, label: string, max: number, required = true): string | null {
  if (value === undefined || value === null || value === "") { if (required) throw validationError(`${label} là bắt buộc.`); return null; }
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw validationError(`${label} không hợp lệ.`);
  return value.trim();
}
function kind(value: unknown): ServiceKind {
  if (value !== "FIXED_SERVICE" && value !== "FLEXIBLE_SERVICE" && value !== "PARKING") throw validationError("Loại dịch vụ không hợp lệ.");
  return value;
}
function effectiveDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError("Ngày hiệu lực không hợp lệ.");
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.valueOf()) || result.toISOString().slice(0, 10) !== value) throw validationError("Ngày hiệu lực không hợp lệ.");
  return result;
}
function money(value: unknown) {
  if (!(typeof value === "string" || typeof value === "number") || !/^\d+$/.test(String(value))) throw validationError("Đơn giá phải là số nguyên VND không âm.");
  const result = BigInt(String(value));
  if (result > 9_223_372_036_854_775_807n) throw validationError("Đơn giá vượt giới hạn lưu trữ.");
  return result;
}
function itemDto(item: any) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const current = (item.priceVersions ?? []).find((row: any) => row.effectiveFrom.toISOString().slice(0, 10) <= today);
  return { pricing_item_id: String(item.propertyPricingItemId), kind: item.kind, code: item.code, name: item.name, description: item.description, unit: item.unit, status: item.status, created_at: item.createdAt?.toISOString?.() ?? undefined, price_versions: (item.priceVersions ?? []).map(versionDto), current_price_version: current ? versionDto(current) : null };
}
function versionDto(version: any) {
  return { price_version_id: String(version.propertyPriceVersionId), version_no: version.versionNo, effective_from: version.effectiveFrom.toISOString().slice(0, 10), unit_price: version.unitPrice.toString(), source_name: version.sourceName, source_reference: version.sourceReference, reason: version.reason, published_at: version.publishedAt.toISOString() };
}
export function createPropertyServiceRouter(auth: AuthDependencies, repository: Repo): express.Router {
  const router = express.Router();
  // The transitional manual-charge screen and its exclusive API are retired.
  // Existing charge records remain inputs to Billing; no replacement workflow is introduced.
  router.use("/properties/:property_id/flexible-service-charges", (_req, res) => {
    res.status(410).json({ code: "ENDPOINT_RETIRED", error: "Công cụ ghi nhận phát sinh thủ công đã ngừng sử dụng." });
  });
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];
  router.get("/properties/:property_id/pricing-items", ...admin, async (req, res, next) => {
    try {
      const allowed = ["kind"];
      if (Object.keys(req.query).some((key) => !allowed.includes(key))) throw validationError("Tham số lọc dịch vụ không hợp lệ.");
      const requestedKind = req.query.kind === undefined ? undefined : kind(req.query.kind);
      const data = await repository.listItems(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"), requestedKind);
      if (!data) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: { property: { property_id: String(data.property.propertyId), name: data.property.name }, items: data.items.map(itemDto) } });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/pricing-items", ...admin, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["kind", "code", "name", "description", "unit"]);
      const input = { kind: kind(body.kind), code: text(body.code, "Mã dịch vụ", 60)!.toUpperCase(), name: text(body.name, "Tên dịch vụ", 150)!, description: text(body.description, "Mô tả", 10_000, false), unit: text(body.unit, "Đơn vị", 30)! };
      if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(input.code)) throw validationError("Mã dịch vụ chỉ được gồm chữ in hoa, số, dấu gạch ngang hoặc gạch dưới.");
      const result = await repository.createItem(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"), input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 201, { data: itemDto(result) });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/pricing-items/:pricing_item_id/retire", ...admin, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length !== 1 || !("kind" in req.query)) throw validationError("Cần chọn đúng loại dịch vụ để ngưng hoạt động.");
      if (req.body && Object.keys(req.body).length) throw validationError("Thao tác ngưng hoạt động không nhận dữ liệu bổ sung.");
      const requestedKind = kind(req.query.kind);
      const result = await repository.retireItem(getAdminOwnerId(req.auth!), id(req.params.property_id), id(req.params.pricing_item_id, "Dịch vụ"), requestedKind);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: itemDto(result) });
    } catch (error) { mapWriteError(error, next, "Không thể ngưng hoạt động dịch vụ."); }
  });
  router.get("/properties/:property_id/pricing-items/:pricing_item_id/price-versions", ...admin, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw validationError("Danh sách phiên bản giá không nhận tham số.");
      const data = await repository.listItems(getAdminOwnerId(req.auth!), id(req.params.property_id), undefined);
      if (!data) { foreignResourceNotFound(); return; }
      const item = data.items.find((row) => row.propertyPricingItemId === id(req.params.pricing_item_id));
      if (!item) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: { pricing_item_id: String(item.propertyPricingItemId), versions: item.priceVersions.map(versionDto) } });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/pricing-items/:pricing_item_id/price-versions", ...admin, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["effective_from", "unit_price", "source_name", "source_reference", "reason"]);
      const input: ServicePriceInput = { effectiveFrom: effectiveDate(body.effective_from), unitPrice: money(body.unit_price), sourceName: text(body.source_name, "Nguồn giá", 200, false), sourceReference: text(body.source_reference, "Tham chiếu nguồn", 10_000, false), reason: text(body.reason, "Lý do", 2_000, false) };
      if (!servicePriceInputIsValid(input)) throw validationError("Đơn giá không hợp lệ.");
      const requestedKind = kind(req.query.kind);
      const result = await repository.publishPrice(getAdminOwnerId(req.auth!), id(req.params.property_id), id(req.params.pricing_item_id), req.auth!.accountId, requestedKind, input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 201, { data: versionDto(result) });
    } catch (error) { mapWriteError(error, next, "Không thể phát hành phiên bản giá."); }
  });
  return router;
}

function mapWriteError(error: unknown, next: express.NextFunction, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) { next(conflict("Dữ liệu vừa được thay đổi hoặc bị trùng. Tải lại rồi thử lại.")); return; }
  if (error instanceof ApiError) { next(error); return; }
  next(error ?? new Error(fallback));
}
