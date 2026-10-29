import express, { type RequestHandler } from "express";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, getResidentContext, requireAdmin, requireResident, type AuthDependencies } from "../middleware/auth.js";
import { ApiError, validationError } from "../middleware/api-error.js";
import { parseBigIntId } from "../utils/ids.js";
import { MAX_IMAGE_BYTES, readMultipart, validateImage } from "../room-images/validation.js";
import type { ImageContentType } from "../room-images/storage.js";
import { PrismaResidentAvatarRepository } from "./resident-avatar.repository.js";
import { LocalResidentAvatarStorage } from "./resident-avatar.storage.js";

function id(value: unknown) {
  try { return parseBigIntId(value); } catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); }
}
function mime(key: string): ImageContentType {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "Ảnh hồ sơ hiện chưa thể tải xuống.");
}

export function createResidentAvatarRouter(auth: AuthDependencies, repository: PrismaResidentAvatarRepository, storage: LocalResidentAvatarStorage) {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];
  const resident: RequestHandler[] = [authenticateRequest(auth), requireResident];

  async function get(key: string | null, response: express.Response) {
    if (!key) { foreignResourceNotFound(); }
    const bytes = await storage.get(key);
    response.status(200).set({ "Content-Type": mime(key), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" }).end(bytes);
  }

  async function replace(ownerId: bigint, residentId: bigint, request: express.Request) {
    const parsed = await readMultipart(request, MAX_IMAGE_BYTES + 64 * 1024);
    if (parsed.fields.length !== 0 || parsed.files.length !== 1 || parsed.files[0]!.fieldName !== "file") throw validationError("Yêu cầu phải có đúng một tệp ảnh trong trường file.");
    const file = parsed.files[0]!;
    const valid = await validateImage(file.bytes, file.contentType, file.filename);
    const key = await storage.put(valid.bytes, valid.contentType);
    try {
      const replaced = await repository.replace(ownerId, residentId, key);
      if (replaced === null) { await storage.delete(key); return false; }
      if (replaced.previousKey) { try { await storage.delete(replaced.previousKey); } catch { console.error(JSON.stringify({ event: "resident_avatar_cleanup_failed" })); } }
      return true;
    } catch (error) { try { await storage.delete(key); } catch { /* retain only opaque cleanup diagnostics */ } throw error; }
  }

  router.use(["/residents", "/me/avatar"], (_request, response, next) => { response.setHeader("Cache-Control", "private, no-store"); next(); });
  router.get("/residents/:resident_id/avatar", ...admin, async (request, response, next) => {
    try { await get(await repository.find(getAdminOwnerId(request.auth!), id(request.params.resident_id)), response); }
    catch (error) { next(error); }
  });
  router.get("/me/avatar", ...resident, async (request, response, next) => {
    try { const context = getResidentContext(request.auth!); await get(await repository.find(context.ownerId, context.residentId), response); }
    catch (error) { next(error); }
  });
  router.put("/me/avatar", ...resident, async (request, response, next) => {
    try { const context = getResidentContext(request.auth!); if (!await replace(context.ownerId, context.residentId, request)) foreignResourceNotFound(); response.status(204).end(); }
    catch (error) { next(error); }
  });
  return router;
}
