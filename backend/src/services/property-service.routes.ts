import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, getResidentContext, requireAdmin, requireResident } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import { servicePriceInputIsValid, type FlexibleServiceConfigurationInput, type PrismaPropertyServiceRepository, type PropertyFacilityInput, type ResidentServiceBookingDecisionInput, type ResidentServiceBookingInput, type ServiceKind, type ServicePriceInput } from "./property-service.repository.js";

type Repo = Pick<PrismaPropertyServiceRepository, "listFacilities" | "createFacility" | "listItems" | "listResidentServices" | "listResidentServiceAvailability" | "bookResidentService" | "listResidentServiceBookings" | "cancelResidentServiceBooking" | "listAdminServiceBookings" | "decideAdminServiceBooking" | "createItem" | "saveFlexibleConfiguration" | "retireItem" | "publishPrice">;
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
function serviceConfiguration(value: unknown): FlexibleServiceConfigurationInput {
  const body = exactBody(value, ["service_mode", "available_weekdays", "opens_at", "closes_at", "booking", "subscription"]);
  if (body.service_mode !== "BOOKING" && body.service_mode !== "SUBSCRIPTION") throw validationError("Chọn đặt lịch hoặc gói đăng ký.");
  if (!Array.isArray(body.available_weekdays) || body.available_weekdays.length < 1 || body.available_weekdays.length > 7
    || body.available_weekdays.some((day) => !Number.isInteger(day) || Number(day) < 1 || Number(day) > 7)
    || new Set(body.available_weekdays).size !== body.available_weekdays.length) {
    throw validationError("Chọn ít nhất một ngày mở cửa hợp lệ.");
  }
  const parseTime = (input: unknown, label: string) => {
    if (typeof input !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input)) throw validationError(`${label} không hợp lệ.`);
    const [hours, minutes] = input.split(":").map(Number);
    return { value: input, minutes: hours * 60 + minutes };
  };
  const opensAt = parseTime(body.opens_at, "Giờ mở cửa");
  const closesAt = parseTime(body.closes_at, "Giờ đóng cửa");
  if (opensAt.minutes >= closesAt.minutes) throw validationError("Giờ đóng cửa phải sau giờ mở cửa trong cùng ngày.");

  if (body.service_mode === "BOOKING") {
    if (body.subscription !== undefined || body.booking === undefined) throw validationError("Cấu hình đặt lịch cần thời lượng và sức chứa mỗi lượt.");
    const booking = exactBody(body.booking, ["slot_duration_minutes", "capacity_per_slot"]);
    const duration = booking.slot_duration_minutes;
    const capacity = booking.capacity_per_slot;
    if (!Number.isSafeInteger(duration) || Number(duration) < 1 || Number(duration) > closesAt.minutes - opensAt.minutes) throw validationError("Thời lượng một lượt phải vừa trong khung giờ mở cửa.");
    if (!Number.isSafeInteger(capacity) || Number(capacity) < 1 || Number(capacity) > 2_147_483_647) throw validationError("Sức chứa mỗi lượt phải là số nguyên dương.");
    return { serviceMode: "BOOKING", availableWeekdays: (body.available_weekdays as number[]).slice().sort((a, b) => a - b), opensAt: opensAt.value, closesAt: closesAt.value, slotDurationMinutes: Number(duration), capacityPerSlot: Number(capacity), packageDurationCount: null, packageDurationUnit: null };
  }

  if (body.booking !== undefined || body.subscription === undefined) throw validationError("Cấu hình gói cần thời hạn theo tháng hoặc năm.");
  const subscription = exactBody(body.subscription, ["duration_count", "duration_unit"]);
  const durationCount = subscription.duration_count;
  if (!Number.isSafeInteger(durationCount) || Number(durationCount) < 1 || Number(durationCount) > 2_147_483_647) throw validationError("Thời hạn gói phải là số nguyên dương.");
  if (subscription.duration_unit !== "MONTH" && subscription.duration_unit !== "YEAR") throw validationError("Thời hạn gói chỉ được tính theo tháng hoặc năm.");
  return { serviceMode: "SUBSCRIPTION", availableWeekdays: (body.available_weekdays as number[]).slice().sort((a, b) => a - b), opensAt: opensAt.value, closesAt: closesAt.value, slotDurationMinutes: null, capacityPerSlot: null, packageDurationCount: Number(durationCount), packageDurationUnit: subscription.duration_unit };
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
function serviceDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError("Ngày sử dụng không hợp lệ.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw validationError("Ngày sử dụng không hợp lệ.");
  return value;
}
function serviceTime(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw validationError("Khung giờ không hợp lệ.");
  return value;
}
function bookingDto(booking: any) {
  return {
    booking_id: String(booking.booking_id),
    service_name: booking.service_name_snapshot,
    property_name: booking.property_name ?? undefined,
    service_date: booking.service_date,
    start_time: booking.slot_start,
    end_time: booking.slot_end,
    duration_minutes: booking.slot_duration_minutes,
    status: booking.status,
    amount: booking.charge_amount === null || booking.charge_amount === undefined ? null : String(booking.charge_amount),
    unit: booking.unit_snapshot ?? null,
    invoice_no: booking.invoice_no ?? null,
    invoice_status: booking.invoice_status ?? null,
    decision_note: booking.decision_note ?? null,
    resident_name: booking.resident_name ?? undefined,
    room_code: booking.room_code ?? undefined,
    contract_no: booking.contract_no ?? undefined,
    can_approve: booking.can_approve ?? false,
    can_cancel: booking.can_cancel ?? false,
    cancelled_at: booking.cancelled_at?.toISOString?.() ?? null,
    created_at: booking.created_at?.toISOString?.() ?? undefined,
  };
}
function itemDto(item: any) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const current = (item.priceVersions ?? []).find((row: any) => row.effectiveFrom.toISOString().slice(0, 10) <= today);
  const config = item.flexibleServiceConfiguration;
  const configurationDto = config ? {
    service_mode: config.service_mode,
    available_weekdays: [config.open_monday, config.open_tuesday, config.open_wednesday, config.open_thursday, config.open_friday, config.open_saturday, config.open_sunday].flatMap((open: boolean, index: number) => open ? [index + 1] : []),
    opens_at: config.opens_at,
    closes_at: config.closes_at,
    booking: config.service_mode === "BOOKING" ? { slot_duration_minutes: config.slot_duration_minutes, capacity_per_slot: config.capacity_per_slot } : null,
    subscription: config.service_mode === "SUBSCRIPTION" ? { duration_count: config.package_duration_count, duration_unit: config.package_duration_unit } : null,
  } : null;
  return { pricing_item_id: String(item.propertyPricingItemId), kind: item.kind, code: item.code, name: item.name, description: item.description, unit: item.unit, status: item.status, created_at: item.createdAt?.toISOString?.() ?? undefined, price_versions: (item.priceVersions ?? []).map(versionDto), current_price_version: current ? versionDto(current) : null, service_configuration: configurationDto };
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
  const resident: RequestHandler[] = [authenticateRequest(auth), requireResident];
  router.get("/properties/:property_id/facilities", ...admin, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw validationError("Danh sách tiện ích chung không nhận tham số.");
      const result = await repository.listFacilities(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"));
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: { property: { property_id: String(result.property.propertyId), name: result.property.name }, items: result.items.map((item) => ({ facility_id: String(item.propertyFacilityId), name: item.name, description: item.description, location: item.location, active: item.active, created_at: item.createdAt.toISOString() })) } });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/facilities", ...admin, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["name", "description", "location"]);
      const input: PropertyFacilityInput = { name: text(body.name, "Tên tiện ích", 150)!, description: text(body.description, "Mô tả", 10_000, false), location: text(body.location, "Vị trí", 200, false) };
      const result = await repository.createFacility(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"), input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 201, { data: { facility_id: String(result.propertyFacilityId), name: result.name, description: result.description, location: result.location, active: result.active, created_at: result.createdAt.toISOString() } });
    } catch (error) { mapWriteError(error, next, "Không thể tạo tiện ích chung."); }
  });
  router.get("/me/services", ...resident, async (req, res, next) => {
    try {
      const context = getResidentContext(req.auth!);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const groups = await repository.listResidentServices(context.ownerId, context.residentId, new Date(`${today}T00:00:00.000Z`));
      sendJson(res, 200, { data: groups.map(({ property, services }) => ({
        property_id: String(property.propertyId),
        property_name: property.name,
        services: services.map((item) => ({
          service_id: String(item.propertyPricingItemId),
          name: item.name,
          description: item.description,
          unit: item.unit,
          current_price: item.priceVersions[0] ? {
            unit_price: item.priceVersions[0].unitPrice.toString(),
            effective_from: item.priceVersions[0].effectiveFrom.toISOString().slice(0, 10),
          } : null,
          service_configuration: item.flexibleServiceConfiguration ? {
            service_mode: item.flexibleServiceConfiguration.service_mode,
            available_weekdays: [item.flexibleServiceConfiguration.open_monday, item.flexibleServiceConfiguration.open_tuesday, item.flexibleServiceConfiguration.open_wednesday, item.flexibleServiceConfiguration.open_thursday, item.flexibleServiceConfiguration.open_friday, item.flexibleServiceConfiguration.open_saturday, item.flexibleServiceConfiguration.open_sunday].flatMap((open, index) => open ? [index + 1] : []),
            opens_at: item.flexibleServiceConfiguration.opens_at,
            closes_at: item.flexibleServiceConfiguration.closes_at,
            booking: item.flexibleServiceConfiguration.service_mode === "BOOKING" ? { slot_duration_minutes: item.flexibleServiceConfiguration.slot_duration_minutes, capacity_per_slot: item.flexibleServiceConfiguration.capacity_per_slot } : null,
            subscription: item.flexibleServiceConfiguration.service_mode === "SUBSCRIPTION" ? { duration_count: item.flexibleServiceConfiguration.package_duration_count, duration_unit: item.flexibleServiceConfiguration.package_duration_unit } : null,
          } : null,
        })),
      })) });
    } catch (error) { next(error); }
  });
  router.get("/me/services/:service_id/availability", ...resident, async (req, res, next) => {
    try {
      if (Object.keys(req.query).some((key) => key !== "date")) throw validationError("Chỉ hỗ trợ lọc lịch theo ngày.");
      const date = serviceDate(req.query.date);
      const context = getResidentContext(req.auth!);
      const result = await repository.listResidentServiceAvailability(context.ownerId, context.residentId, id(req.params.service_id, "Tiện ích"), date);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: { service_id: String(result.serviceId), service_date: result.serviceDate, timezone: "Asia/Ho_Chi_Minh", unit: result.unit, unit_price: result.unitPrice?.toString() ?? null, price_effective_from: result.priceEffectiveFrom, slots: result.slots } });
    } catch (error) { next(error); }
  });
  router.get("/me/service-bookings", ...resident, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw validationError("Danh sách lịch đã đặt không nhận bộ lọc.");
      const context = getResidentContext(req.auth!);
      const bookings = await repository.listResidentServiceBookings(context.ownerId, context.residentId);
      sendJson(res, 200, { data: bookings.map(bookingDto) });
    } catch (error) { next(error); }
  });
  router.post("/me/services/:service_id/bookings", ...resident, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["service_date", "start_time"]);
      const input: ResidentServiceBookingInput = { serviceDate: serviceDate(body.service_date), startTime: serviceTime(body.start_time) };
      const context = getResidentContext(req.auth!);
      const result = await repository.bookResidentService(context.ownerId, context.residentId, req.auth!.accountId, id(req.params.service_id, "Tiện ích"), input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, result.created ? 201 : 200, { data: bookingDto(result.booking) });
    } catch (error) { mapWriteError(error, next, "Không thể đặt lịch tiện ích."); }
  });
  router.post("/me/service-bookings/:booking_id/cancel", ...resident, async (req, res, next) => {
    try {
      if (req.body && Object.keys(req.body).length) throw validationError("Hủy lịch không nhận dữ liệu bổ sung.");
      const context = getResidentContext(req.auth!);
      const booking = await repository.cancelResidentServiceBooking(context.ownerId, context.residentId, req.auth!.accountId, id(req.params.booking_id, "Lịch đã đặt"));
      if (!booking) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: bookingDto(booking) });
    } catch (error) { mapWriteError(error, next, "Không thể hủy lịch tiện ích."); }
  });

  router.get("/properties/:property_id/service-bookings", ...admin, async (req, res, next) => {
    try {
      if (Object.keys(req.query).some((key) => key !== "status") || (req.query.status !== undefined && req.query.status !== "PENDING")) throw validationError("Chỉ hỗ trợ xem yêu cầu đặt lịch đang chờ duyệt.");
      const bookings = await repository.listAdminServiceBookings(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"));
      if (!bookings) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: bookings.map(bookingDto) });
    } catch (error) { next(error); }
  });
  router.post("/properties/:property_id/service-bookings/:booking_id/decision", ...admin, async (req, res, next) => {
    try {
      const body = exactBody(req.body, ["decision", "reason"]);
      if (body.decision !== "APPROVE" && body.decision !== "REJECT") throw validationError("Quyết định phải là APPROVE hoặc REJECT.");
      const input: ResidentServiceBookingDecisionInput = {
        decision: body.decision,
        reason: text(body.reason, "Lý do", 1000, false),
      };
      const result = await repository.decideAdminServiceBooking(
        getAdminOwnerId(req.auth!),
        id(req.params.property_id, "Khu vực"),
        id(req.params.booking_id, "Yêu cầu đặt tiện ích"),
        req.auth!.accountId,
        input,
      );
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: bookingDto(result.booking) });
    } catch (error) { mapWriteError(error, next, "Không thể xử lý yêu cầu đặt tiện ích."); }
  });

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
      const body = exactBody(req.body, ["kind", "code", "name", "description", "unit", "service_configuration"]);
      const itemKind = kind(body.kind);
      const config = itemKind === "FLEXIBLE_SERVICE" ? serviceConfiguration(body.service_configuration) : undefined;
      if (itemKind !== "FLEXIBLE_SERVICE" && body.service_configuration !== undefined) throw validationError("Chỉ tiện ích phát sinh mới nhận cấu hình lịch hoặc gói.");
      if (itemKind === "FLEXIBLE_SERVICE" && body.unit !== undefined) throw validationError("Đơn vị của tiện ích phát sinh được xác định theo kiểu sử dụng.");
      const unit = config ? (config.serviceMode === "BOOKING" ? "lượt" : "gói") : text(body.unit, "Đơn vị", 30)!;
      const input = { kind: itemKind, code: text(body.code, "Mã dịch vụ", 60)!.toUpperCase(), name: text(body.name, "Tên dịch vụ", 150)!, description: text(body.description, "Mô tả", 10_000, false), unit, ...(config ? { serviceConfiguration: config } : {}) };
      if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(input.code)) throw validationError("Mã dịch vụ chỉ được gồm chữ in hoa, số, dấu gạch ngang hoặc gạch dưới.");
      const result = await repository.createItem(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"), input);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 201, { data: itemDto(result) });
    } catch (error) { next(error); }
  });
  router.put("/properties/:property_id/pricing-items/:pricing_item_id/service-configuration", ...admin, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length !== 1 || req.query.kind !== "FLEXIBLE_SERVICE") throw validationError("Cần chọn đúng loại tiện ích phát sinh.");
      const config = serviceConfiguration(req.body);
      const result = await repository.saveFlexibleConfiguration(getAdminOwnerId(req.auth!), id(req.params.property_id, "Khu vực"), id(req.params.pricing_item_id, "Dịch vụ"), config);
      if (!result) { foreignResourceNotFound(); return; }
      sendJson(res, 200, { data: itemDto(result) });
    } catch (error) { mapWriteError(error, next, "Không thể lưu cấu hình tiện ích phát sinh."); }
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
