import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ApiError } from "../middleware/api-error.js";
import type { ImageContentType } from "../room-images/storage.js";

const extensions: Record<ImageContentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const keyPattern = /^resident-avatars\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export class LocalResidentAvatarStorage {
  private readonly root: string;
  constructor(directory = path.resolve(process.cwd(), ".local-storage", "resident-avatars")) { this.root = path.resolve(directory); }

  async put(bytes: Buffer, contentType: ImageContentType): Promise<string> {
    const key = `resident-avatars/${new Date().getUTCFullYear()}/${randomUUID()}.${extensions[contentType]}`;
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { try { await unlink(target); } catch { /* no file was created or filesystem is unavailable */ } throw error; }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    try { return await readFile(this.resolve(key)); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "Ảnh hồ sơ hiện chưa thể tải xuống.");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try { await unlink(this.resolve(key)); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return; throw error; }
  }

  private resolve(key: string) {
    if (!keyPattern.test(key)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh hồ sơ.");
    const target = path.resolve(this.root, ...key.split("/"));
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh hồ sơ.");
    return target;
  }
}
