import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, getResidentContext, requireAdmin, requireResident, type AuthDependencies } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseId, parseResidentListQuery, validateEndOccupancy, validateOccupancyCreate, validateResidentCreate, validateResidentPatch, validateResidentSearch, validateTransfer } from "./resident.validation.js";
import type { PrismaResidentOccupancyRepository } from "./resident.repository.js";
import { sendJson } from "../utils/ids.js";

type Repository = Pick<PrismaResidentOccupancyRepository, "listResidents" | "createResident" | "searchResident" | "findResident" | "updateResident" | "archiveResident" | "listRoomResidents" | "addOccupancy" | "endOccupancy" | "transfer" | "meRental">;
const dateFields = new Set(["birthDate", "startedAt", "endedAt", "startDate", "endDate", "terminationDate"]);
function serialize(value: unknown, field?: string): unknown {
  if (value instanceof Date) return dateFields.has(field ?? "") ? value.toISOString().slice(0, 10) : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (value && typeof value === "object" && !(value instanceof Prisma.Decimal)) return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), serialize(child, key)]));
  if (value instanceof Prisma.Decimal) return value.toFixed(3);
  return value;
}
function owner(request: express.Request) { return getAdminOwnerId(request.auth!); }
function requireKey(request: express.Request) {
  const value = request.get("Idempotency-Key");
  if (!value || value.length > 200 || /[\r\n]/.test(value)) throw validationError("Thiếu hoặc sai Idempotency-Key.");
  return value;
}
function conflictCode(code: string, message: string) { return new ApiError(409, code, message); }
function handlePrisma(error: unknown, next: express.NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { next(conflictCode("RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER", "CCCD đã được sử dụng trong phạm vi chủ trọ này.")); return; }
  next(error);
}

export function createResidentOccupancyRouter(auth: AuthDependencies, repository: Repository): express.Router {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];
  const resident: RequestHandler[] = [authenticateRequest(auth), requireResident];

  router.get("/residents", ...admin, async (request, response, next) => {
    try {
      const query = parseResidentListQuery(request.query as Record<string, unknown>);
      const result = await repository.listResidents(owner(request), query);
      sendJson(response, 200, { data: serialize(result.rows), meta: { page: query.page, page_size: query.page_size, total_items: result.total, total_pages: Math.ceil(result.total / query.page_size) } });
    } catch (error) { next(error); }
  });

  router.post("/residents", ...admin, async (request, response, next) => {
    try { requireKey(request); const created = await repository.createResident(owner(request), validateResidentCreate(request.body)); sendJson(response, 201, { data: serialize(created) }); }
    catch (error) { handlePrisma(error, next); }
  });

  router.post("/residents/search", ...admin, async (request, response, next) => {
    try {
      const { nationalId } = validateResidentSearch(request.body);
      const result = await repository.searchResident(owner(request), nationalId);
      if (!result) throw new ApiError(404, "RESIDENT_NOT_FOUND_IN_OWNER_SCOPE", "Không tìm thấy cư dân trong phạm vi quản lý.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.get("/residents/:resident_id", ...admin, async (request, response, next) => {
    try { const result = await repository.findResident(owner(request), parseId(request.params.resident_id)); if (!result) foreignResourceNotFound(); sendJson(response, 200, { data: serialize(result) }); }
    catch (error) { next(error); }
  });

  router.patch("/residents/:resident_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.updateResident(owner(request), parseId(request.params.resident_id), validateResidentPatch(request.body));
      if (!result) foreignResourceNotFound();
      if (result === "duplicate") throw conflictCode("RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER", "CCCD đã được sử dụng trong phạm vi chủ trọ này.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { handlePrisma(error, next); }
  });

  router.delete("/residents/:resident_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.archiveResident(owner(request), parseId(request.params.resident_id));
      if (result === "missing") foreignResourceNotFound();
      if (result === "conflict") throw conflict("Cần kết thúc hợp đồng hoặc lượt cư trú đang hoạt động trước khi lưu trữ cư dân.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.get("/rooms/:room_id/residents", ...admin, async (request, response, next) => {
    try { const result = await repository.listRoomResidents(owner(request), parseId(request.params.room_id)); if (!result) foreignResourceNotFound(); sendJson(response, 200, { data: serialize(result.rows) }); }
    catch (error) { next(error); }
  });

  router.post("/rooms/:room_id/residents", ...admin, async (request, response, next) => {
    try {
      requireKey(request);
      const input = validateOccupancyCreate(request.body);
      const result = await repository.addOccupancy(owner(request), parseId(request.params.room_id), input.residentId, input.contractId, input.startedAt);
      if (result === "missing-room" || result === "missing-resident" || result === "missing-contract") foreignResourceNotFound();
      if (result === "duplicate") throw conflict("Cư dân đã có lượt cư trú hoạt động trong phòng này.");
      if (result === "capacity") throw new ApiError(409, "ROOM_CAPACITY_EXCEEDED", "Số cư dân đang ở sẽ vượt sức chứa áp dụng cho phòng.");
      sendJson(response, 201, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.post("/occupancies/:occupancy_id/end", ...admin, async (request, response, next) => {
    try {
      requireKey(request);
      const input = validateEndOccupancy(request.body);
      const result = await repository.endOccupancy(owner(request), parseId(request.params.occupancy_id), input.endedAt);
      if (result === "missing") foreignResourceNotFound();
      if (result === "date") throw validationError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu cư trú.");
      if (result === "ended") throw conflict("Lượt cư trú đã kết thúc.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.post("/residents/:resident_id/transfer", ...admin, async (request, response, next) => {
    try {
      requireKey(request);
      const input = validateTransfer(request.body);
      const result = await repository.transfer(owner(request), parseId(request.params.resident_id), input.sourceOccupancyId, input.roomId, input.contractId, input.startedAt);
      if (["missing-source", "missing-resident", "missing-room", "missing-contract"].includes(String(result))) foreignResourceNotFound();
      if (result === "date") throw validationError("Ngày chuyển phải bằng hoặc sau ngày bắt đầu cư trú hiện tại.");
      if (result === "duplicate") throw conflict("Cư dân đã có lượt cư trú hoạt động trong phòng đích.");
      if (result === "capacity") throw new ApiError(409, "ROOM_CAPACITY_EXCEEDED", "Số cư dân đang ở sẽ vượt sức chứa áp dụng cho phòng.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.get("/me/rental", ...resident, async (request, response, next) => {
    try {
      const context = getResidentContext(request.auth!);
      const result = await repository.meRental(context.ownerId, context.residentId);
      if (!result) foreignResourceNotFound();
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  return router;
}
