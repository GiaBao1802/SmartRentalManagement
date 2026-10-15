import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin, type AuthDependencies } from "../middleware/auth.js";
import { conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import { validatePropertyCreate, validatePropertyPatch, validateRoomCreate, validateRoomPatch, parseListQuery, type PageQuery } from "./property-room.validation.js";

export type PropertyRoomRepository = {
  listProperties(ownerId: bigint, query: PageQuery & { status?: string; province?: string; search?: string }): Promise<{ rows: unknown[]; total: number }>;
  createProperty(ownerId: bigint, data: Omit<Prisma.PropertyUncheckedCreateInput, "ownerId">): Promise<unknown>;
  findProperty(ownerId: bigint, propertyId: bigint): Promise<unknown | null>;
  updateProperty(ownerId: bigint, propertyId: bigint, data: Prisma.PropertyUpdateInput): Promise<unknown | null>;
  archiveProperty(ownerId: bigint, propertyId: bigint): Promise<"missing" | "conflict" | unknown>;
  listRooms(ownerId: bigint, propertyId: bigint, query: PageQuery & { status?: string; is_active?: boolean; is_public?: boolean; search?: string }): Promise<{ rows: unknown[]; total: number } | null>;
  createRoom(ownerId: bigint, propertyId: bigint, data: Omit<Prisma.RoomUncheckedCreateInput, "ownerId" | "propertyId" | "roomId">): Promise<unknown | null>;
  findRoom(ownerId: bigint, roomId: bigint): Promise<unknown | null>;
  updateRoom(ownerId: bigint, roomId: bigint, data: Prisma.RoomUpdateInput): Promise<unknown | null>;
  deactivateRoom(ownerId: bigint, roomId: bigint): Promise<"missing" | "conflict" | unknown>;
};

function owner(request: express.Request): bigint { return getAdminOwnerId(request.auth!); }
function id(value: unknown): bigint { try { return parseBigIntId(value); } catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); } }
function serialize(value: unknown, key?: string): unknown {
  if (value instanceof Date) return ["startDate", "endDate"].includes(key ?? "") ? value.toISOString().slice(0, 10) : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (value && typeof value === "object" && !(value instanceof Prisma.Decimal)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([field, item]) => [field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), serialize(item, field)]));
  }
  return value instanceof Prisma.Decimal ? value.toFixed(2) : value;
}
function pageResponse(rows: unknown[], total: number, query: PageQuery) {
  return { data: serialize(rows), meta: { page: query.page, page_size: query.page_size, total_items: total, total_pages: Math.ceil(total / query.page_size) } };
}
function handlePrisma(error: unknown, next: express.NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { next(conflict("Mã khu vực hoặc phòng đã được sử dụng trong phạm vi này.")); return; }
  next(error);
}

export function createPropertyRoomRouter(auth: AuthDependencies, repository: PropertyRoomRepository): express.Router {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];

  router.get("/properties", ...admin, async (request, response, next) => {
    try {
      const query = parseListQuery(request.query, ["status", "province", "search"]);
      const status = request.query.status === undefined ? undefined : String(request.query.status);
      const province = request.query.province === undefined ? undefined : String(request.query.province);
      const search = request.query.search === undefined ? undefined : String(request.query.search).trim();
      if (status !== undefined && !["active", "building", "paused", "archived"].includes(status)) throw validationError("Trạng thái khu vực không hợp lệ.");
      if (province !== undefined && province.length > 120) throw validationError("Tỉnh/thành không được vượt quá 120 ký tự.");
      if (search !== undefined && search.length > 200) throw validationError("Từ khóa tìm kiếm quá dài.");
      const result = await repository.listProperties(owner(request), { ...query, status, province, search });
      sendJson(response, 200, pageResponse(result.rows, result.total, query));
    } catch (error) { next(error); }
  });

  router.post("/properties", ...admin, async (request, response, next) => {
    try {
      const input = validatePropertyCreate(request.body);
      const data = await repository.createProperty(owner(request), input);
      sendJson(response, 201, { data: serialize(data) });
    } catch (error) { handlePrisma(error, next); }
  });

  router.get("/properties/:property_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.findProperty(owner(request), id(request.params.property_id));
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.patch("/properties/:property_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.updateProperty(owner(request), id(request.params.property_id), validatePropertyPatch(request.body));
      if (!result) { foreignResourceNotFound(); }
      if (result === "conflict") throw conflict("Không thể lưu trữ khu vực đang có hợp đồng hoặc cư trú hoạt động.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { handlePrisma(error, next); }
  });

  router.delete("/properties/:property_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.archiveProperty(owner(request), id(request.params.property_id));
      if (result === "missing") foreignResourceNotFound();
      if (result === "conflict") throw conflict("Không thể lưu trữ khu vực đang có hợp đồng hoặc cư trú hoạt động.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.get("/properties/:property_id/rooms", ...admin, async (request, response, next) => {
    try {
      const query = parseListQuery(request.query, ["status", "is_active", "is_public", "search"]);
      const status = request.query.status === undefined ? undefined : String(request.query.status);
      const search = request.query.search === undefined ? undefined : String(request.query.search).trim();
      if (status !== undefined && !["available", "occupied", "inactive"].includes(status)) throw validationError("Trạng thái phòng không hợp lệ.");
      if (search !== undefined && search.length > 200) throw validationError("Từ khóa tìm kiếm quá dài.");
      const is_active = parseOptionalBoolean(request.query.is_active, "is_active");
      const is_public = parseOptionalBoolean(request.query.is_public, "is_public");
      const result = await repository.listRooms(owner(request), id(request.params.property_id), { ...query, status, is_active, is_public, search });
      if (!result) foreignResourceNotFound();
      sendJson(response, 200, pageResponse(result.rows, result.total, query));
    } catch (error) { next(error); }
  });

  router.post("/properties/:property_id/rooms", ...admin, async (request, response, next) => {
    try {
      const result = await repository.createRoom(owner(request), id(request.params.property_id), validateRoomCreate(request.body));
      if (!result) foreignResourceNotFound();
      sendJson(response, 201, { data: serialize(result) });
    } catch (error) { handlePrisma(error, next); }
  });

  router.get("/rooms/:room_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.findRoom(owner(request), id(request.params.room_id));
      if (!result) foreignResourceNotFound();
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });

  router.patch("/rooms/:room_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.updateRoom(owner(request), id(request.params.room_id), validateRoomPatch(request.body));
      if (!result) foreignResourceNotFound();
      if (result === "conflict") throw conflict("Không thể khôi phục phòng khi còn hợp đồng hoặc cư trú hoạt động.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { handlePrisma(error, next); }
  });

  router.delete("/rooms/:room_id", ...admin, async (request, response, next) => {
    try {
      const result = await repository.deactivateRoom(owner(request), id(request.params.room_id));
      if (result === "missing") foreignResourceNotFound();
      if (result === "conflict") throw conflict("Không thể ngừng hoạt động phòng đang có hợp đồng hoặc cư trú hoạt động.");
      sendJson(response, 200, { data: serialize(result) });
    } catch (error) { next(error); }
  });
  return router;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw validationError(`${field} phải là true hoặc false.`);
}
