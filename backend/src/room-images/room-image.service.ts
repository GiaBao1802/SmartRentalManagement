import { ApiError, validationError } from "../middleware/api-error.js";
import type { RoomImageDtoRow } from "./room-image.repository.js";
import type { ImageContentType, RoomImageStorage } from "./storage.js";
import { assertOnlyFields, parseBulkRoomIds, validateImage, type MultipartFile } from "./validation.js";

function failedCode(error: unknown): string {
  if (!(error instanceof ApiError)) return "ATTACHMENT_FAILED";
  if (error.code === "VALIDATION_ERROR") return "INVALID_IMAGE";
  return error.code;
}

export class RoomImageService {
  constructor(private readonly repository: RoomImageRepositoryPort, private readonly storage: RoomImageStorage) {}

  async upload(ownerId: bigint, propertyId: bigint, roomId: bigint, file: MultipartFile): Promise<RoomImageDtoRow | null> {
    if (file.fieldName !== "file") throw validationError("Tệp ảnh phải nằm trong trường file.");
    if (!await this.repository.roomExists(ownerId, propertyId, roomId)) return null;
    const valid = await validateImage(file.bytes, file.contentType, file.filename);
    const key = await this.put(valid.bytes, valid.contentType);
    try {
      const result = await this.repository.add(ownerId, propertyId, roomId, key);
      if (result === "missing") { await this.cleanup(key, roomId.toString()); return null; }
      if (result === "limit") throw new ApiError(409, "ROOM_IMAGE_LIMIT_REACHED", "Phòng đã có đủ 5 ảnh.");
      return result;
    } catch (error) { await this.cleanup(key, roomId.toString()); throw error; }
  }

  async bulk(ownerId: bigint, propertyId: bigint, fields: Array<{ name: string; value: string }>, files: MultipartFile[]) {
    assertOnlyFields(fields, ["room_ids"]);
    if (files.length < 1 || files.length > 5 || files.some((file) => file.fieldName !== "files")) throw validationError("Bulk attach nhận từ 1 đến 5 trường files.");
    const field = fields.find((item) => item.name === "room_ids");
    if (!field) throw validationError("Thiếu trường room_ids.");
    const roomIds = parseBulkRoomIds(field.value);
    const roomState = await this.repository.validateBulkRooms(ownerId, propertyId, roomIds);
    if (roomState === "missing") return null;
    if (roomState === "not_empty") throw validationError("Bulk attach chỉ áp dụng cho các phòng có thư viện ảnh đang trống.");

    const results: Array<{ file_index: number; status: "attached" | "failed"; association_count?: number; code?: string }> = [];
    let successfulFiles = 0;
    for (const [fileIndex, file] of files.entries()) {
      let key: string | null = null;
      try {
        const valid = await validateImage(file.bytes, file.contentType, file.filename);
        key = await this.put(valid.bytes, valid.contentType);
        const attached = await this.repository.attachShared(ownerId, propertyId, roomIds, key, successfulFiles);
        if (attached === "missing") { await this.cleanup(key, propertyId.toString()); results.push({ file_index: fileIndex, status: "failed", code: "NOT_FOUND" }); continue; }
        if (attached === "not_empty") { await this.cleanup(key, propertyId.toString()); results.push({ file_index: fileIndex, status: "failed", code: "ROOM_GALLERY_CHANGED" }); continue; }
        if (attached === "limit") { await this.cleanup(key, propertyId.toString()); results.push({ file_index: fileIndex, status: "failed", code: "ROOM_IMAGE_LIMIT_REACHED" }); continue; }
        results.push({ file_index: fileIndex, status: "attached", association_count: attached });
        successfulFiles++;
      } catch (error) {
        if (key) await this.cleanup(key, propertyId.toString());
        results.push({ file_index: fileIndex, status: "failed", code: failedCode(error) });
      }
    }
    return { room_ids: roomIds.map(String), image_results: results };
  }

  async readAdmin(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint) {
    return this.repository.adminImage(ownerId, propertyId, roomId, imageId);
  }
  async readPublic(imageId: bigint) { return this.repository.publicImage(imageId); }
  async get(key: string) { return this.storage.get(key); }
  async delete(key: string) { return this.storage.delete(key); }

  async remove(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint) {
    const result = await this.repository.remove(ownerId, propertyId, roomId, imageId);
    if (result === "missing") return null;
    let pending = false;
    if (result.cleanupKey) {
      try { await this.storage.delete(result.cleanupKey); }
      catch { pending = true; console.error(JSON.stringify({ event: "room_image_physical_cleanup_failed", request_scope: "admin_image_delete" })); }
    }
    return { deleted_image_id: result.deletedId.toString(), promoted_cover_image_id: result.promotedId?.toString() ?? null, physical_cleanup_pending: pending };
  }

  private async put(bytes: Buffer, type: ImageContentType): Promise<string> {
    try { return await this.storage.put(bytes, type); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "STORAGE_UNAVAILABLE", "Không thể lưu ảnh lúc này."); }
  }
  private async cleanup(key: string, requestScope: string) {
    try { await this.storage.delete(key); }
    catch { console.error(JSON.stringify({ event: "room_image_upload_cleanup_failed", request_scope: requestScope })); }
  }
}

export type RoomImageRepositoryPort = {
  roomExists(ownerId: bigint, propertyId: bigint, roomId: bigint): Promise<boolean>;
  validateBulkRooms(ownerId: bigint, propertyId: bigint, roomIds: bigint[]): Promise<"missing" | "not_empty" | null>;
  add(ownerId: bigint, propertyId: bigint, roomId: bigint, key: string): Promise<RoomImageDtoRow | "missing" | "limit">;
  attachShared(ownerId: bigint, propertyId: bigint, roomIds: bigint[], key: string, expectedCount: number): Promise<number | "missing" | "not_empty" | "limit">;
  adminImage(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<{ storageKey: string } | null>;
  publicImage(imageId: bigint): Promise<{ storageKey: string } | null>;
  remove(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<{ deletedId: bigint; promotedId: bigint | null; cleanupKey: string | null } | "missing">;
};
