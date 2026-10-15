import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import { servicePriceInputIsValid, type FlexibleChargeInput, type PrismaPropertyServiceRepository, type ServiceKind, type ServicePriceInput } from "./property-service.repository.js";

type Repo = Pick<PrismaPropertyServiceRepository, "listItems" | "createItem" | "retireItem" | "publishPrice" | "listCharges" | "createCharge">;
const KINDS: ServiceKind[] = ["FIXED_SERVICE", "FLEXIBLE_SERVICE"];
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
function dateTime(value: unknown) {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) throw validationError("Ngày giờ phát sinh phải kèm múi giờ.");
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw validationError("Ngày giờ phát sinh không hợp lệ.");
  return date;
}
function itemDto(item: any) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const current = (item.priceVersions ?? []).find((row: any) => row.effectiveFrom.toISOString().slice(0, 10) <= today);
  return { pricing_item_id: String(item.propertyPricingItemId), kind: item.kind, code: item.code, name: item.name, description: item.description, unit: item.unit, status: item.status, created_at: item.createdAt?.toISOString?.() ?? undefined, price_versions: (item.priceVersions ?? []).map(versionDto), current_price_version: current ? versionDto(current) : null };
}
function versionDto(version: any) {
  return { price_version_id: String(version.propertyPriceVersionId), version_no: version.versionNo, effective_from: version.effectiveFrom.toISOString().slice(0, 10), unit_price: version.unitPrice.toString(), source_name: version.sourceName, source_reference: version.sourceReference, reason: version.reason, published_at: version.publishedAt.toISOString() };
}
function chargeDto(row: any) {
  const charge = row.charge ?? row;
  return {
    flexible_service_charge_id: String(charge.flexibleServiceChargeId), property_id: String(charge.propertyId), room_id: String(charge.roomId), contract_id: String(charge.contractId), resident_id: charge.residentId === null ? null : String(charge.residentId),
    service: row.pricingItem ? { code: row.pricingItem.code, name: row.pricingItem.name } : undefined,
    room_code: row.room?.roomCode, contract_no: row.contract?.contractNo, resident_name: row.resident?.fullName ?? null,
    quantity: charge.quantity.toString(), unit: charge.unit, unit_price_snapshot: charge.unitPriceSnapshot.toString(), amount: charge.amount.toString(), occurred_at: charge.occurredAt.toISOString(), status: charge.status, invoice_id: charge.invoiceId === null ? null : String(charge.invoiceId), source_system: charge.sourceSystem, source_event_key: charge.sourceEventKey,
  };
}

export function createPropertyServiceRouter(auth: AuthDependencies, repository: Repo): express.Router {
  const router = express.Router();
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
  router.get("/properties/:property_id/flexible-service-charges", ...admin, async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1), pageSize = Number(req.query.page_size ?? 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || Object.keys(req.query).some((key) => !["page", "page_size"].includes(key))) throw validationError("Thông tin phân trang không hợp lệ.");
      const data = await repository.listCharges(getAdminOwnerId(req.auth!), id(req.params.property_id), page, pageSize);
      if (!data) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: data.charges.map(chargeDto), meta: { page: data.meta.page, page_size: data.meta.pageSize, total_items: data.meta.totalItems, total_pages: data.meta.totalPages } });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/flexible-service-charges", ...admin, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["room_id", "contract_id", "resident_id", "pricing_item_id", "quantity", "occurred_at"]);
      const key = req.get("Idempotency-Key")?.trim();
      if (!key || key.length < 8 || key.length > 200) throw validationError("Thiếu khóa Idempotency-Key hợp lệ để chống ghi trùng phát sinh.");
      const quantity = text(body.quantity, "Số lượng", 20)!;
      if (!/^\d+(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) throw validationError("Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân.");
      const input: FlexibleChargeInput = { roomId: id(body.room_id, "Phòng"), contractId: id(body.contract_id, "Hợp đồng"), residentId: body.resident_id === null || body.resident_id === undefined || body.resident_id === "" ? null : id(body.resident_id, "Người thuê"), itemId: id(body.pricing_item_id, "Dịch vụ"), quantity, occurredAt: dateTime(body.occurred_at), sourceEventKey: key };
      const result = await repository.createCharge(getAdminOwnerId(req.auth!), id(req.params.property_id), req.auth!.accountId, input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, result.replayed ? 200 : 201, { data: chargeDto(result), meta: { replayed: result.replayed } });
    } catch (error) { mapWriteError(error, next, "Không thể ghi nhận phát sinh dịch vụ."); }
  });
  return router;
}

function mapWriteError(error: unknown, next: express.NextFunction, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) { next(conflict("Dữ liệu vừa được thay đổi hoặc bị trùng. Tải lại rồi thử lại.")); return; }
  if (error instanceof ApiError) { next(error); return; }
  next(error ?? new Error(fallback));
}
