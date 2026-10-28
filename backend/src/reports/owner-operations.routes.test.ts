import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { RuntimeConfig } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createOwnerOperationsReportRouter } from "./owner-operations.routes.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "owner-report-test-session-secret-32" });
const admin: LoginAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: { ownerId: 101n, displayName: "Owner" }, resident: null };
const resident: LoginAccountRecord = { accountId: 12n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
class TestAuthRepository implements AuthRepository {
  async findCandidates() { return []; }
  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> {
    const row = [admin, resident].find((entry) => entry.accountId === accountId);
    if (!row) return null;
    const { passwordHash: _passwordHash, ...result } = row;
    return result;
  }
}
const auth: AuthDependencies = { config, repository: new TestAuthRepository(), sessions: new InMemorySessionStore() };
const calls: Array<[bigint, bigint | undefined]> = [];
const reportRepository: any = { getOverview: async (ownerId: bigint, propertyId?: bigint) => { calls.push([ownerId, propertyId]); return propertyId === 999n ? null : { scope: { property_id: propertyId?.toString() ?? null } }; } };
let server: Server; let baseUrl = "";
const cookies = new Map<string, string>();
async function install(account: LoginAccountRecord) {
  const token = createOpaqueSessionToken();
  await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  cookies.set(account.role, token);
}
async function call(path: string, role: "admin" | "resident") {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: `gt_session=${cookies.get(role)}` } });
  return { response, body: await response.json() };
}

before(async () => {
  await install(admin); await install(resident);
  const app = express(); app.use("/api/v1", createOwnerOperationsReportRouter(auth, reportRepository)); app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Admin dashboard derives Owner identity from session and supports its own Property scope", async () => {
  calls.length = 0;
  const all = await call("/api/v1/dashboard/summary", "admin");
  assert.equal(all.response.status, 200);
  assert.deepEqual(calls[0], [101n, undefined]);
  const property = await call("/api/v1/properties/51/dashboard", "admin");
  assert.equal(property.response.status, 200);
  assert.deepEqual(calls[1], [101n, 51n]);
});

test("Resident cannot access reports and malformed or foreign Property filters fail safely", async () => {
  calls.length = 0;
  assert.equal((await call("/api/v1/dashboard/summary", "resident")).response.status, 403);
  assert.equal((await call("/api/v1/properties/NaN/dashboard", "admin")).response.status, 400);
  assert.equal((await call("/api/v1/properties/999/dashboard", "admin")).response.status, 404);
});
