import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID, scryptSync, createHash } from "node:crypto";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthRepository } from "../auth/account-repository.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { createV1Router } from "../auth/v1.router.js";
import { loadEnv } from "../config/env.js";
import { errorHandler } from "../middleware/error-handler.js";
import { PrismaAccountManagementRepository } from "./account.repository.js";
import { AccountManagementService } from "./account.service.js";

const url = process.env.GOCTRO_ACCOUNTS_TEST_DATABASE_URL;
test("Accounts authenticated PostgreSQL V1.8 disposable smoke", { skip: !url }, async (t) => {
  const target = new URL(url!);
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "55449"); assert.equal(target.username, "v18_smoke"); assert.equal(target.pathname, "/goctro_accounts_phase2_20261016");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const identity = await prisma.$queryRaw<Array<{ db: string; port: number; tables: number }>>`SELECT current_database() AS db, inet_server_port() AS port, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`;
  assert.deepEqual(identity, [{ db: "goctro_accounts_phase2_20261016", port: 55449, tables: 40 }]);
  const password = "Disposable-Accounts-Test-Only!";
  const salt = "00112233445566778899aabbccddeeff";
  const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  const suffix = randomUUID();
  const owner = await prisma.owner.create({ data: { displayName: "Accounts disposable Owner" } });
  const otherOwner = await prisma.owner.create({ data: { displayName: "Other disposable Owner" } });
  const resident = await prisma.resident.create({ data: { ownerId: owner.ownerId, fullName: "Accounts disposable Resident" } });
  const otherResident = await prisma.resident.create({ data: { ownerId: otherOwner.ownerId, fullName: "Foreign disposable Resident" } });
  const admin = await prisma.account.create({ data: { ownerId: owner.ownerId, role: "admin", email: `admin-${suffix}@example.test`, passwordHash } });
  const account = await prisma.account.create({ data: { residentId: resident.residentId, role: "resident", email: `resident-${suffix}@example.test`, passwordHash } });
  const foreign = await prisma.account.create({ data: { residentId: otherResident.residentId, role: "resident", email: `other-${suffix}@example.test`, passwordHash } });
  const invitation = await prisma.accountInvitation.create({ data: { ownerId: owner.ownerId, residentId: resident.residentId, createdByAccountId: admin.accountId, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const expired = await prisma.accountInvitation.create({ data: { ownerId: owner.ownerId, residentId: resident.residentId, createdByAccountId: admin.accountId, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), status: "expired", createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) } });
  const repository = new PrismaAccountManagementRepository(prisma);
  const sessions = new InMemorySessionStore();
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: url, FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "accounts-runtime-test-session-secret-32-bytes" });
  const app = express(); app.use(express.json()); app.use("/api/v1", createV1Router({ config, repository: new PrismaAuthRepository(prisma), sessions, accountManagementRepository: repository })); app.use(errorHandler);
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  const bootstrap = await fetch(`${origin}/api/v1/auth/csrf`); const csrf = (await bootstrap.json()).data.csrf_token as string;
  async function request(path: string, method = "GET", body?: unknown, cookie = "") {
    const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { Origin: config.frontendOrigin, "Content-Type": "application/json", Cookie: `gt_csrf=${csrf}; ${cookie}`, "X-CSRF-Token": csrf, "Idempotency-Key": "runtime-test-only" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.match(/gt_session=[^;]+/)?.[0] ?? "" };
  }
  try {
    const login = await request("/auth/login", "POST", { login: admin.email, password }); assert.equal(login.status, 200); assert.ok(login.cookie);
    const residentLogin = await request("/auth/login", "POST", { login: account.email, password }); assert.equal(residentLogin.status, 200);
    await t.test("real login/session/owner context and scoped list/detail/filter", async () => {
      const me = await request("/auth/me", "GET", undefined, login.cookie); assert.equal(me.body.data.profile.owner_id, owner.ownerId.toString());
      const list = await request("/accounts?role=resident&page_size=1", "GET", undefined, login.cookie); assert.equal(list.status, 200); assert.equal(list.body.meta.total_items, 1); assert.equal(list.body.data[0].account_id, account.accountId.toString());
      const missing = await request(`/accounts/${foreign.accountId}`, "GET", undefined, login.cookie); assert.equal(missing.status, 404);
      assert.doesNotMatch(JSON.stringify(list.body), /password_hash|passwordHash|tokenHash|token_hash|scrypt/);
    });
    await t.test("store failure rolls back actual PostgreSQL status update", async () => {
      class FailingStore extends InMemorySessionStore { override async revokeAccount() { throw Error("fixture session store failure"); } }
      await assert.rejects(() => new AccountManagementService(repository, new FailingStore()).setStatus(owner.ownerId, account.accountId, "locked"));
      assert.equal((await prisma.account.findUniqueOrThrow({ where: { accountId: account.accountId } })).status, "active");
    });
    await t.test("lock and unlock persist and old session cannot return", async () => {
      assert.equal((await request(`/accounts/${account.accountId}/status`, "PATCH", { status: "locked" }, login.cookie)).status, 200);
      assert.equal((await request("/auth/me", "GET", undefined, residentLogin.cookie)).status, 401);
      assert.equal((await prisma.account.findUniqueOrThrow({ where: { accountId: account.accountId } })).status, "locked");
      assert.equal((await request(`/accounts/${account.accountId}/status`, "PATCH", { status: "active" }, login.cookie)).status, 200);
      assert.equal((await request("/auth/me", "GET", undefined, residentLogin.cookie)).status, 401);
      assert.equal((await request("/auth/login", "POST", { login: account.email, password })).status, 200);
    });
    await t.test("provider unavailability leaves pending invitation intact", async () => {
      assert.equal((await request(`/residents/${resident.residentId}/account-invitations`, "POST", {}, login.cookie)).status, 503);
      assert.equal((await request(`/accounts/${account.accountId}/password-reset`, "POST", {}, login.cookie)).status, 503);
      assert.equal((await prisma.accountInvitation.findUniqueOrThrow({ where: { invitationId: invitation.invitationId } })).status, "pending");
    });
    await t.test("actual row locks serialize concurrent revokes and preserve terminal history", async () => {
      const results = await Promise.all([repository.revokeInvitation(owner.ownerId, invitation.invitationId, new Date()), repository.revokeInvitation(owner.ownerId, invitation.invitationId, new Date())]);
      assert.ok(results.every((row) => typeof row !== "string" && row.status === "revoked"));
      assert.equal(await repository.revokeInvitation(otherOwner.ownerId, invitation.invitationId, new Date()), "missing");
      assert.equal(await repository.revokeInvitation(owner.ownerId, expired.invitationId, new Date()), "terminal");
      const history = await request(`/residents/${resident.residentId}/account-invitations`, "GET", undefined, login.cookie); assert.equal(history.status, 200); assert.equal(history.body.meta.total_items, 2); assert.doesNotMatch(JSON.stringify(history.body), /token_hash|tokenHash|password/);
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.$disconnect(); }
});
