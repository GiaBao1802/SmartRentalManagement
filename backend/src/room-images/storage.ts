import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ApiError } from "../middleware/api-error.js";

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";
export interface RoomImageStorage {
  put(bytes: Buffer, contentType: ImageContentType): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const extensions: Record<ImageContentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KEY_PATTERN = /^room-images\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function assertStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
}

export class LocalRoomImageStorage implements RoomImageStorage {
  private readonly root: string;
  constructor(directory = path.resolve(process.cwd(), ".local-storage", "room-images")) { this.root = path.resolve(directory); }

  async put(bytes: Buffer, contentType: ImageContentType): Promise<string> {
    const year = String(new Date().getUTCFullYear());
    const key = `room-images/${year}/${randomUUID()}.${extensions[contentType]}`;
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      try { await unlink(target); } catch { /* no file was created or filesystem is unavailable */ }
      throw error;
    }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    try { return await readFile(this.resolve(key)); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw new ApiError(503, "STORAGE_OBJECT_UNAVAILABLE", "Ảnh hiện chưa thể tải xuống.");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try { await unlink(this.resolve(key)); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return; throw error; }
  }

  private resolve(key: string): string {
    assertStorageKey(key);
    const target = path.resolve(this.root, ...key.split("/"));
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
    return target;
  }
}

export class UnconfiguredRoomImageStorage implements RoomImageStorage {
  async put(): Promise<never> { throw new ApiError(503, "STORAGE_UNAVAILABLE", "Dịch vụ lưu trữ ảnh chưa được cấu hình."); }
  async get(): Promise<never> { throw new ApiError(503, "STORAGE_UNAVAILABLE", "Dịch vụ lưu trữ ảnh chưa được cấu hình."); }
  async delete(): Promise<never> { throw new ApiError(503, "STORAGE_UNAVAILABLE", "Dịch vụ lưu trữ ảnh chưa được cấu hình."); }
}
