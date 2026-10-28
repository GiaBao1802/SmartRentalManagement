import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import sharp from "sharp";
import type { AuthRepository, CurrentAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { createV1Router } from "../auth/v1.router.js";
import { loadEnv } from "../config/env.js";

const origin = "http://localhost:3000";
const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "resident-avatar-test-session-secret-32-bytes" });
const admin: CurrentAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, status: "active", owner: { ownerId: 101n, displayName: "Owner" }, resident: null };
const foreignAdmin: CurrentAccountRecord = { ...admin, accountId: 13n, ownerId: 102n, owner: { ownerId: 102n, displayName: "Other Owner" } };
const resident: CurrentAccountRecord = { accountId: 12n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
const accounts = [admin, foreignAdmin, resident];
const authRepository: AuthRepository = { async findCandidates() { return []; }, async findCurrentAccount(id) { return accounts.find((account) => account.accountId === id) ?? null; } };
const sessions = new InMemorySessionStore();
const auth: AuthDependencies = { config, repository: authRepository, sessions };
const key = "resident-avatars/2026/00000000-0000-4000-8000-000000000001.jpg";
const imageBytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#e8f0ed" } }).jpeg().toBuffer();
const observed: Array<{ method: string; args: unknown[] }> = [];
const repository = {
  async find(...args: unknown[]) { observed.push({ method: "find", args }); return args[0] === 101n && args[1] === 201n ? key : null; },
  async replace(...args: unknown[]) { observed.push({ method: "replace", args }); return { previousKey: null }; },
};
const storage = {
  async put() { return key; },
  async get(input: string) { assert.equal(input, key); return imageBytes; },
  async delete() {},
};
let server: Server; let baseUrl = "";
const tokens = new Map<string, { token: string; csrf: string }>();
async function install(account: CurrentAccountRecord, name: string) {
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  tokens.set(name, { token, csrf });
}
function headers(name: string, unsafe = false, extra: Record<string, string> = {}) {
  const auth = tokens.get(name)!;
  return { Cookie: `gt_session=${auth.token}; gt_csrf=${auth.csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": auth.csrf } : {}), ...extra };
}
function multipart(bytes: Buffer, type = "image/jpeg") {
  const boundary = "resident-avatar-boundary";
  return { body: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.jpg"\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]), contentType: `multipart/form-data; boundary=${boundary}` };
}
async function call(path: string, name = "admin", init: { method?: string; body?: Buffer; contentType?: string } = {}) {
  const unsafe = init.method !== undefined && init.method !== "GET";
  const response = await fetch(`${baseUrl}${path}`, { method: init.method, headers: headers(name, unsafe, init.contentType ? { "Content-Type": init.contentType } : {}), ...(init.body ? { body: init.body as unknown as BodyInit } : {}) });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

before(async () => {
  await install(admin, "admin"); await install(foreignAdmin, "foreign-admin"); await install(resident, "resident");
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, residentAvatarRepository: repository as any, residentAvatarStorage: storage as any })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Admin reads only in-scope avatar bytes; missing and foreign profiles are hidden", async () => {
  const result = await call("/api/v1/residents/201/avatar");
  assert.equal(result.response.status, 200); assert.equal(result.response.headers.get("content-type"), "image/jpeg"); assert.equal(result.response.headers.get("cache-control"), "private, no-store"); assert.ok(result.bytes.length > 0);
  assert.equal(observed.at(-1)?.args[0], 101n); assert.equal(observed.at(-1)?.args[1], 201n);
  assert.equal((await call("/api/v1/residents/999/avatar")).response.status, 404);
  assert.equal((await call("/api/v1/residents/201/avatar", "foreign-admin")).response.status, 404);
  assert.equal((await call("/api/v1/residents/201/avatar", "resident")).response.status, 403);
});

test("Resident avatar replacement derives the Resident from session and validates image bytes", async () => {
  const valid = multipart(imageBytes);
  const result = await call("/api/v1/me/avatar", "resident", { method: "PUT", body: valid.body, contentType: valid.contentType });
  assert.equal(result.response.status, 204);
  const callData = [...observed].reverse().find((item) => item.method === "replace");
  assert.deepEqual(callData?.args.slice(0, 2), [101n, 201n]);
  const invalid = multipart(Buffer.from("not an image"), "image/jpeg");
  assert.equal((await call("/api/v1/me/avatar", "resident", { method: "PUT", body: invalid.body, contentType: invalid.contentType })).response.status, 422);
});
