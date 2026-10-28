import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { RuntimeConfig } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { createV1Router } from "../auth/v1.router.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "notification-routes-test-secret-with-32-bytes" });
const admin: LoginAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: { ownerId: 101n, displayName: "Owner A" }, resident: null };
const otherAdmin: LoginAccountRecord = { ...admin, accountId: 12n, ownerId: 202n, email: "other@test.invalid", owner: { ownerId: 202n, displayName: "Owner B" } };
const resident: LoginAccountRecord = { accountId: 13n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
class TestAuthRepository implements AuthRepository {
  async findCandidates() { return []; }
  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> {
    const row = [admin, otherAdmin, resident].find((entry) => entry.accountId === accountId);
    if (!row) return null;
    const { passwordHash: _passwordHash, ...safe } = row;
    return safe;
  }
}
const auth: AuthDependencies = { config, repository: new TestAuthRepository(), sessions: new InMemorySessionStore() };
const calls: Array<{ ownerId: bigint; propertyId: bigint; roomId: bigint; message: string }> = [];
const notificationRepository = {
  async sendRoomReminder(ownerId: bigint, propertyId: bigint, roomId: bigint, message: string) {
    calls.push({ ownerId, propertyId, roomId, message });
    return ownerId === 101n && propertyId === 50n && roomId === 302n ? { roomCode: "302", propertyName: "Khu A", recipientCount: 2 } : null;
  },
};
let server: Server; let baseUrl = ""; const cookies = new Map<string, string>();
async function install(account: LoginAccountRecord) {
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  cookies.set(String(account.accountId), `${token}|${csrf}`);
}
function headers(account: LoginAccountRecord, unsafe = false) {
  const [token, csrf] = cookies.get(String(account.accountId))!.split("|");
  return { Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}) };
}
async function call(account: LoginAccountRecord, body: unknown) {
  return fetch(`${baseUrl}/api/v1/notifications/room-reminders`, { method: "POST", headers: headers(account, true), body: JSON.stringify(body) });
}

before(async () => {
  await Promise.all([install(admin), install(otherAdmin), install(resident)]);
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, notificationRepository: notificationRepository as any })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Owner may send a confirmed room reminder; backend derives Owner scope and returns no resident identity", async () => {
  calls.length = 0;
  const response = await call(admin, { property_id: "50", room_id: "302", message: "Vui lòng khóa cửa khi ra ngoài.", confirmed: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { room_code: "302", property_name: "Khu A", recipient_count: 2, delivery: "in_app" } });
  assert.deepEqual(calls, [{ ownerId: 101n, propertyId: 50n, roomId: 302n, message: "Vui lòng khóa cửa khi ra ngoài." }]);
});

test("room reminders require confirmation, valid content, and an Admin account", async () => {
  const valid = { property_id: "50", room_id: "302", message: "Nhớ khóa cửa.", confirmed: true };
  assert.equal((await call(admin, { ...valid, confirmed: false })).status, 400);
  assert.equal((await call(admin, { ...valid, message: "   " })).status, 400);
  assert.equal((await call(admin, { ...valid, message: "x".repeat(501) })).status, 400);
  assert.equal((await call(admin, { ...valid, owner_id: "101" })).status, 400);
  assert.equal((await call(resident, valid)).status, 403);
});

test("another Owner cannot target this room; no recipient list is exposed", async () => {
  const response = await call(otherAdmin, { property_id: "50", room_id: "302", message: "Nhớ khóa cửa.", confirmed: true });
  assert.equal(response.status, 404);
});
