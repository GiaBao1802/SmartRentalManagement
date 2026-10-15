import express, { type RequestHandler } from "express";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin, type AuthDependencies } from "../middleware/auth.js";
import { ApiError, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import { RoomImageService } from "./room-image.service.js";
import type { RoomImageRepositoryPort } from "./room-image.service.js";
import type { RoomImageDtoRow } from "./room-image.repository.js";
import type { RoomImageStorage } from "./storage.js";
import { assertOnlyFields, MAX_BULK_FILES, MAX_IMAGE_BYTES, MAX_MULTIPART_BYTES, readMultipart } from "./validation.js";

function parseId(value: unknown): bigint {
  try { return parseBigIntId(value); }
  catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); }
}
function dto(row: { roomImageId: bigint; isCover: boolean; sortOrder: number; createdAt: Date }, propertyId: bigint, roomId: bigint) {
  return { image_id: row.roomImageId.toString(), url: `/api/v1/properties/${propertyId}/rooms/${roomId}/images/${row.roomImageId}/content`, is_cover: row.isCover, sort_order: row.sortOrder, created_at: row.createdAt.toISOString() };
}
function contentTypeForKey(key: string): string {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "Ảnh hiện chưa thể tải xuống.");
}

type RoomImageRoutesRepository = RoomImageRepositoryPort & {
  list(ownerId: bigint, propertyId: bigint, roomId: bigint): Promise<RoomImageDtoRow[] | null>;
  reorder(ownerId: bigint, propertyId: bigint, roomId: bigint, imageIds: bigint[]): Promise<RoomImageDtoRow[] | "missing" | "invalid">;
  setCover(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<RoomImageDtoRow | "missing">;
};

export function createRoomImageRouter(auth: AuthDependencies, repository: RoomImageRoutesRepository, storage: RoomImageStorage): express.Router {
  const router = express.Router();
  const service = new RoomImageService(repository, storage);
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];

  router.get("/public/room-images/:image_id", async (request, response, next) => {
    try {
      const association = await service.readPublic(parseId(request.params.image_id));
      if (!association) { foreignResourceNotFound(); }
      const bytes = await service.get(association.storageKey);
      response.status(200).set({ "Content-Type": contentTypeForKey(association.storageKey), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" }).end(bytes);
    } catch (error) { next(error); }
  });

  router.get("/properties/:property_id/rooms/:room_id/images", ...admin, async (request, response, next) => {
    try {
      const propertyId = parseId(request.params.property_id); const roomId = parseId(request.params.room_id);
      const images = await repository.list(getAdminOwnerId(request.auth!), propertyId, roomId);
      if (!images) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: images.map((image) => dto(image, propertyId, roomId)) });
    } catch (error) { next(error); }
  });

  router.post("/properties/:property_id/rooms/:room_id/images", ...admin, async (request, response, next) => {
    try {
      const parsed = await readMultipart(request, MAX_IMAGE_BYTES + 64 * 1024);
      assertOnlyFields(parsed.fields, []);
      if (parsed.files.length !== 1) throw validationError("Yêu cầu phải có đúng một trường file.");
      const propertyId = parseId(request.params.property_id); const roomId = parseId(request.params.room_id);
      const image = await service.upload(getAdminOwnerId(request.auth!), propertyId, roomId, parsed.files[0]!);
      if (!image) { foreignResourceNotFound(); }
      sendJson(response, 201, { data: dto(image, propertyId, roomId) });
    } catch (error) { next(error); }
  });

  router.post("/properties/:property_id/rooms/images/bulk-attach", ...admin, async (request, response, next) => {
    try {
      const parsed = await readMultipart(request, MAX_MULTIPART_BYTES);
      if (parsed.files.length > MAX_BULK_FILES) throw validationError("Bulk attach nhận tối đa 5 ảnh.");
      const propertyId = parseId(request.params.property_id);
      const result = await service.bulk(getAdminOwnerId(request.auth!), propertyId, parsed.fields, parsed.files);
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  });

  router.put("/properties/:property_id/rooms/:room_id/images/order", ...admin, async (request, response, next) => {
    try {
      if (!request.body || Object.keys(request.body).some((key) => key !== "image_ids") || !Array.isArray(request.body.image_ids) || request.body.image_ids.some((id: unknown) => typeof id !== "string")) throw validationError("Body phải chỉ chứa image_ids dạng chuỗi.");
      const propertyId = parseId(request.params.property_id); const roomId = parseId(request.params.room_id);
      const imageIds = request.body.image_ids.map(parseId);
      const result = await repository.reorder(getAdminOwnerId(request.auth!), propertyId, roomId, imageIds);
      if (result === "missing") { foreignResourceNotFound(); }
      if (result === "invalid") throw validationError("image_ids phải là hoán vị chính xác của toàn bộ ảnh trong phòng.");
      sendJson(response, 200, { data: result.map((image) => dto(image, propertyId, roomId)) });
    } catch (error) { next(error); }
  });

  router.put("/properties/:property_id/rooms/:room_id/images/:image_id/cover", ...admin, async (request, response, next) => {
    try {
      if (request.body && (typeof request.body !== "object" || Object.keys(request.body).length > 0)) throw validationError("Thao tác chọn ảnh bìa chỉ nhận body rỗng.");
      const propertyId = parseId(request.params.property_id); const roomId = parseId(request.params.room_id); const imageId = parseId(request.params.image_id);
      const result = await repository.setCover(getAdminOwnerId(request.auth!), propertyId, roomId, imageId);
      if (result === "missing") { foreignResourceNotFound(); }
      sendJson(response, 200, { data: dto(result, propertyId, roomId) });
    } catch (error) { next(error); }
  });

  router.get("/properties/:property_id/rooms/:room_id/images/:image_id/content", ...admin, async (request, response, next) => {
    try {
      const association = await service.readAdmin(getAdminOwnerId(request.auth!), parseId(request.params.property_id), parseId(request.params.room_id), parseId(request.params.image_id));
      if (!association) { foreignResourceNotFound(); }
      const bytes = await service.get(association.storageKey);
      response.status(200).set({ "Content-Type": contentTypeForKey(association.storageKey), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" }).end(bytes);
    } catch (error) { next(error); }
  });

  router.delete("/properties/:property_id/rooms/:room_id/images/:image_id", ...admin, async (request, response, next) => {
    try {
      const result = await service.remove(getAdminOwnerId(request.auth!), parseId(request.params.property_id), parseId(request.params.room_id), parseId(request.params.image_id));
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  });
  return router;
}
