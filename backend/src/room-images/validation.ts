import { ApiError, validationError } from "../middleware/api-error.js";
import type { ImageContentType } from "./storage.js";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_BULK_FILES = 5;
export const MAX_BULK_ROOMS = 100;
export const MAX_MULTIPART_BYTES = MAX_BULK_FILES * MAX_IMAGE_BYTES + 128 * 1024;

export type ValidatedImage = { bytes: Buffer; contentType: ImageContentType };
export type MultipartFile = { fieldName: string; filename: string; contentType: string; bytes: Buffer };
export type MultipartField = { name: string; value: string };
const invalidImage = (message: string) => new ApiError(422, "VALIDATION_ERROR", message);

export async function validateImage(bytes: Buffer, declaredType: string, filename = ""): Promise<ValidatedImage> {
  if (!bytes.length) throw invalidImage("Tệp ảnh rỗng.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Mỗi ảnh không được vượt quá 5 MiB.");
  let detected: ImageContentType | null = null;
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) detected = "image/jpeg";
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR" && bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND") detected = "image/png";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) detected = "image/webp";
  if (!detected) throw invalidImage("Định dạng ảnh không được hỗ trợ hoặc nội dung không hợp lệ.");
  if (declaredType.toLowerCase() !== detected) throw invalidImage("MIME của tệp không khớp với nội dung ảnh.");
  if (/[\\/\0]/.test(filename) || /^[a-z]:/i.test(filename)) throw invalidImage("Tên tệp không hợp lệ.");
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  const allowedExtensions: Record<ImageContentType, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };
  if (extension && !allowedExtensions[detected].includes(extension)) throw invalidImage("Phần mở rộng không khớp với nội dung ảnh.");
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== (detected === "image/jpeg" ? "jpeg" : detected === "image/png" ? "png" : "webp") || !metadata.width || !metadata.height) throw new Error("invalid image metadata");
    await image.stats(); // Force full decoding; signatures alone do not establish a valid image.
  } catch { throw invalidImage("Nội dung ảnh bị lỗi hoặc không thể giải mã."); }
  return { bytes, contentType: detected };
}

/** A bounded multipart reader: the body is capped before parsing and each image has its own limit. */
export async function readMultipart(request: AsyncIterable<Uint8Array> & { headers: Record<string, string | string[] | undefined> }, maxBytes: number): Promise<{ fields: MultipartField[]; files: MultipartFile[] }> {
  const contentType = request.headers["content-type"];
  const header = Array.isArray(contentType) ? contentType[0] : contentType;
  const match = typeof header === "string" ? /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))$/i.exec(header) : null;
  if (!match) throw validationError("Yêu cầu phải dùng multipart/form-data.");
  const boundaryText = match[1] ?? match[2];
  if (!boundaryText || boundaryText.length > 70 || /[\r\n]/.test(boundaryText)) throw validationError("Multipart boundary không hợp lệ.");
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined && Number(contentLength) > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Kích thước yêu cầu vượt giới hạn.");
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.byteLength;
    if (length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Kích thước yêu cầu vượt giới hạn.");
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks, length);
  const delimiter = Buffer.from(`--${boundaryText}`);
  const separator = Buffer.from(`\r\n--${boundaryText}`);
  const fields: MultipartField[] = []; const files: MultipartFile[] = [];
  let cursor = body.indexOf(delimiter);
  if (cursor !== 0) throw validationError("Multipart body không hợp lệ.");
  cursor += delimiter.length;
  while (cursor < body.length) {
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("--"))) { cursor += 2; if (cursor < body.length && !body.subarray(cursor).equals(Buffer.from("\r\n"))) throw validationError("Multipart body không hợp lệ."); break; }
    if (!body.subarray(cursor, cursor + 2).equals(Buffer.from("\r\n"))) throw validationError("Multipart body không hợp lệ.");
    cursor += 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd < 0 || headerEnd - cursor > 8192) throw validationError("Multipart header không hợp lệ.");
    const rawHeaders = body.toString("latin1", cursor, headerEnd);
    const disposition = /^content-disposition:\s*form-data;\s*name="([^"\r\n]{1,80})"(?:;\s*filename="([^"\r\n]{0,255})")?\s*$/im.exec(rawHeaders);
    const mimeMatch = /^content-type:\s*([^\r\n]+)\s*$/im.exec(rawHeaders);
    if (!disposition) throw validationError("Multipart field không hợp lệ.");
    const dataStart = headerEnd + 4; const next = body.indexOf(separator, dataStart);
    if (next < 0) throw validationError("Multipart body thiếu kết thúc.");
    const data = body.subarray(dataStart, next); const filename = disposition[2];
    if (filename !== undefined) {
      if (data.length > MAX_IMAGE_BYTES) {
        files.push({ fieldName: disposition[1]!, filename, contentType: mimeMatch?.[1]?.trim().toLowerCase() ?? "", bytes: data });
      } else files.push({ fieldName: disposition[1]!, filename, contentType: mimeMatch?.[1]?.trim().toLowerCase() ?? "", bytes: Buffer.from(data) });
    } else {
      if (data.length > 4096) throw validationError("Giá trị multipart quá dài.");
      fields.push({ name: disposition[1]!, value: data.toString("utf8") });
    }
    cursor = next + 2 + delimiter.length;
  }
  return { fields, files };
}

export function parseBulkRoomIds(value: string): bigint[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw validationError("room_ids phải là JSON array."); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_BULK_ROOMS || parsed.some((id) => {
    if (typeof id !== "string" || !/^\d+$/.test(id)) return true;
    const numeric = BigInt(id);
    return numeric <= 0n || numeric > 9_223_372_036_854_775_807n;
  })) throw validationError("room_ids phải chứa từ 1 đến 100 ID hợp lệ.");
  const ids = parsed.map((id: string) => BigInt(id));
  if (new Set(ids.map(String)).size !== ids.length) throw validationError("room_ids không được trùng lặp.");
  return ids;
}

export function assertOnlyFields(fields: MultipartField[], allowed: string[]): void {
  if (fields.some((field) => !allowed.includes(field.name)) || allowed.some((name) => fields.filter((field) => field.name === name).length > 1)) throw validationError("Trường multipart không hợp lệ.");
}
