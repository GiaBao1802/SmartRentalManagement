import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { AuthRepository, CurrentAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { createV1Router } from "../auth/v1.router.js";
import { loadEnv, type RuntimeConfig } from "../config/env.js";
import sharp from "sharp";
import type { RoomImageStorage } from "./storage.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "room-image-test-session-secret-32-bytes" });
const admin: CurrentAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, status: "active", owner: { ownerId: 101n, displayName: "Owner" }, resident: null };
const resident: CurrentAccountRecord = { accountId: 12n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
const accounts = [admin, resident];
const authRepository: AuthRepository = { async findCandidates() { return []; }, async findCurrentAccount(id) { return accounts.find((account) => account.accountId === id) ?? null; } };
const sessions = new InMemorySessionStore();
const auth: AuthDependencies = { config, repository: authRepository, sessions };
const row = { roomImageId: 801n, isCover: true, sortOrder: 1, createdAt: new Date("2026-10-11T00:00:00Z") };
const observed: Array<{ method: string; args: unknown[] }> = [];
const repository: any = {
  async list(...args: unknown[]) { observed.push({ method: "list", args }); return [row]; },
  async roomExists(...args: unknown[]) { observed.push({ method: "roomExists", args }); return true; },
  async validateBulkRooms(...args: unknown[]) { observed.push({ method: "validateBulkRooms", args }); return null; },
  async add(...args: unknown[]) { observed.push({ method: "add", args }); return row; },
  async attachShared(...args: unknown[]) { observed.push({ method: "attachShared", args }); return (args[2] as bigint[]).length; },
  async reorder(...args: unknown[]) { observed.push({ method: "reorder", args }); return [row]; },
  async setCover(...args: unknown[]) { observed.push({ method: "setCover", args }); return row; },
  async adminImage(...args: unknown[]) { observed.push({ method: "adminImage", args }); return args[1] === 101n ? { storageKey: "room-images/2026/00000000-0000-4000-8000-000000000001.jpg" } : null; },
  async publicImage(...args: unknown[]) { observed.push({ method: "publicImage", args }); return { storageKey: "room-images/2026/00000000-0000-4000-8000-000000000001.jpg" }; },
  async remove(...args: unknown[]) { observed.push({ method: "remove", args }); return { deletedId: 801n, promotedId: null, cleanupKey: null }; },
};
const imageBytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer();
const storage: RoomImageStorage = { async put() { return "room-images/2026/00000000-0000-4000-8000-000000000001.jpg"; }, async get() { return imageBytes; }, async delete() {} };
let server: Server; let baseUrl = "";
const tokens = new Map<string, { token: string; csrf: string }>();
async function install(account: CurrentAccountRecord, role: string) {
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config)); tokens.set(role, { token, csrf });
}
function headers(role = "admin", unsafe = false, extra: Record<string, string> = {}) {
  const auth = tokens.get(role)!;
  return { Cookie: `gt_session=${auth.token}; gt_csrf=${auth.csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": auth.csrf } : {}), ...extra };
}
async function call(path: string, role = "admin", init: { method?: string; body?: BodyInit; contentType?: string } = {}) {
  const unsafe = init.method !== undefined && init.method !== "GET";
  const response = await fetch(`${baseUrl}${path}`, { method: init.method, headers: headers(role, unsafe, init.contentType ? { "Content-Type": init.contentType } : {}), ...(init.body === undefined ? {} : { body: init.body }) });
  const bytes = Buffer.from(await response.arrayBuffer());
  let body: any = null; try { body = JSON.parse(bytes.toString("utf8")); } catch { /* binary response */ }
  return { response, body, bytes };
}
function multipart(parts: Array<{ name: string; filename?: string; type?: string; data: Buffer | string }>) {
  const boundary = "room-image-test-boundary"; const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename === undefined ? "" : `; filename="${part.filename}"`}\r\n${part.filename === undefined ? "" : `Content-Type: ${part.type ?? "application/octet-stream"}\r\n`}\r\n`));
    chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data)); chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
}
before(async () => {
  await install(admin, "admin"); await install(resident, "resident");
  const app = express(); app.use(requestIdMiddleware); app.use(express.json()); app.use("/api/v1", createV1Router({ ...auth, roomImageRepository: repository, roomImageStorage: storage })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Admin gallery list is owner-scoped and omits storage key", async () => {
  observed.length = 0; const result = await call("/api/v1/properties/101/rooms/201/images");
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.data[0], { image_id: "801", url: "/api/v1/properties/101/rooms/201/images/801/content", is_cover: true, sort_order: 1, created_at: row.createdAt.toISOString() });
  assert.equal(observed[0]?.args[0], 101n); assert.equal(JSON.stringify(result.body).includes("storage_key"), false);
});

test("foreign Owner image content is concealed as generic 404", async () => {
  const result = await call("/api/v1/properties/999/rooms/201/images/801/content");
  assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND");
});

test("Admin upload requires CSRF, accepts a single validated file and returns safe DTO", async () => {
  const form = multipart([{ name: "file", filename: "room.jpg", type: "image/jpeg", data: imageBytes }]);
  const ok = await call("/api/v1/properties/101/rooms/201/images", "admin", { method: "POST", body: form.body, contentType: form.type });
  assert.equal(ok.response.status, 201); assert.equal(ok.body.data.image_id, "801"); assert.equal(JSON.stringify(ok.body).includes("room-images/"), false);
  const badForm = multipart([{ name: "file", filename: "fake.jpg", type: "image/jpeg", data: Buffer.from("not an image") }]);
  const invalid = await call("/api/v1/properties/101/rooms/201/images", "admin", { method: "POST", body: badForm.body, contentType: badForm.type });
  assert.equal(invalid.response.status, 422); assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
  const residentAttempt = await call("/api/v1/properties/101/rooms/201/images", "resident", { method: "POST", body: form.body, contentType: form.type });
  assert.equal(residentAttempt.response.status, 403);
  const unexpected = multipart([{ name: "description", data: "unexpected" }, { name: "file", filename: "room.jpg", type: "image/jpeg", data: imageBytes }]);
  const rejected = await call("/api/v1/properties/101/rooms/201/images", "admin", { method: "POST", body: unexpected.body, contentType: unexpected.type });
  assert.equal(rejected.response.status, 400);
});

test("Admin unsafe route rejects invalid CSRF and reorder returns dense safe DTO", async () => {
  const csrfMissing = await fetch(`${baseUrl}/api/v1/properties/101/rooms/201/images/order`, { method: "PUT", headers: { Cookie: `gt_session=${tokens.get("admin")!.token}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ image_ids: ["801"] }) });
  assert.equal(csrfMissing.status, 403);
  const response = await call("/api/v1/properties/101/rooms/201/images/order", "admin", { method: "PUT", body: JSON.stringify({ image_ids: ["801"] }), contentType: "application/json" });
  assert.equal(response.response.status, 200); assert.equal(response.body.data[0].sort_order, 1);
});

test("set-cover, delete and public content expose only safe result/bytes", async () => {
  const cover = await call("/api/v1/properties/101/rooms/201/images/801/cover", "admin", { method: "PUT", body: "{}", contentType: "application/json" });
  assert.equal(cover.response.status, 200); assert.equal(cover.body.data.image_id, "801");
  const removed = await call("/api/v1/properties/101/rooms/201/images/801", "admin", { method: "DELETE" });
  assert.equal(removed.response.status, 200); assert.equal(removed.body.data.physical_cleanup_pending, false);
  const content = await call("/api/v1/public/room-images/801");
  assert.equal(content.response.status, 200); assert.equal(content.response.headers.get("content-type"), "image/jpeg"); assert.equal(content.response.headers.get("x-content-type-options"), "nosniff"); assert.deepEqual(content.bytes, imageBytes);
  const prior = repository.publicImage; repository.publicImage = async () => null;
  try { const hidden = await call("/api/v1/public/room-images/801"); assert.equal(hidden.response.status, 404); assert.equal(hidden.body.error.code, "NOT_FOUND"); }
  finally { repository.publicImage = prior; }
});

test("bulk attach response gives each file an independent result and hides keys", async () => {
  const form = multipart([{ name: "room_ids", data: '["201","202"]' }, { name: "files", filename: "room.jpg", type: "image/jpeg", data: imageBytes }]);
  const result = await call("/api/v1/properties/101/rooms/images/bulk-attach", "admin", { method: "POST", body: form.body, contentType: form.type });
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.data.room_ids, ["201", "202"]); assert.deepEqual(result.body.data.image_results, [{ file_index: 0, status: "attached", association_count: 2 }]); assert.equal(JSON.stringify(result.body).includes("storage_key"), false);
});
