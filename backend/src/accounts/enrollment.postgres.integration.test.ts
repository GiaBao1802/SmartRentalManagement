import { randomInt, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthRepository } from "../auth/account-repository.js";
import { createV1Router } from "../auth/v1.router.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { RuntimeConfig } from "../config/env.js";
import { errorHandler } from "../middleware/error-handler.js";
import { PrismaAccountManagementRepository } from "./account.repository.js";
import { HarnessEnrollmentDelivery, tokenHash } from "./credential-infrastructure.js";
import { PrismaEnrollmentRepository } from "./enrollment.repository.js";
import { EnrollmentService } from "./enrollment.service.js";

const url = process.env.GOCTRO_ENROLLMENT_TEST_DATABASE_URL;
test("V1.8 disposable PostgreSQL enrollment/reset HTTP closure", { skip: !url }, async t => {
  const target = new URL(url!);
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "55450"); assert.equal(target.username, "v18_smoke"); assert.equal(target.pathname, "/goctro_enrollment_20261018");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const identity = await prisma.$queryRaw<Array<{ db: string; port: number; role: string; tables: number }>>`SELECT current_database() AS db, inet_server_port() AS port, current_user AS role, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`;
  assert.deepEqual(identity, [{ db: "goctro_enrollment_20261018", port: 55450, role: "v18_smoke", tables: 40 }]);
  const runId = randomUUID(), phonePrefix = String(randomInt(1000, 9999));
  const owner = await prisma.owner.create({ data: { displayName: "Synthetic Enrollment Owner" } });
  const foreignOwner = await prisma.owner.create({ data: { displayName: "Synthetic Foreign Owner" } });
  const password = "Enrollment-Smoke-2026!", newPassword = "Reset-Smoke-2026!";
  const admin = await prisma.account.create({ data: { role: "admin", ownerId: owner.ownerId, email: `enrollment-admin-${runId}@example.test`, passwordHash: await hashPassword(password) } });
  const sessions = new InMemorySessionStore(), delivery = new HarnessEnrollmentDelivery("test");
  const repo = new PrismaEnrollmentRepository(prisma), service = new EnrollmentService(repo, sessions, delivery, "test");
  const config: RuntimeConfig = { nodeEnv: "test", port: 0, databaseUrl: url!, frontendOrigin: "http://localhost:3002", sessionSecret: "synthetic-enrollment-session-secret-only-2026", sessionIdleMinutes: 30, sessionAbsoluteHours: 12, loginMaxAttempts: 100, loginWindowMinutes: 15 };
  const app = express(); app.use(express.json()); app.use("/api/v1", createV1Router({ config, repository: new PrismaAuthRepository(prisma), sessions, enrollment: service, accountManagementRepository: new PrismaAccountManagementRepository(prisma) })); app.use(errorHandler);
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const csrfResult = await fetch(`${origin}/api/v1/auth/csrf`); const csrf = (await csrfResult.json()).data.csrf_token;
  async function call(path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { Origin: config.frontendOrigin, "Content-Type": "application/json", Cookie: `gt_csrf=${csrf}; ${cookie}`, "X-CSRF-Token": csrf, "Idempotency-Key": "runtime-operation", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.match(/gt_session=[^;]+/)?.[0] ?? "", headers: response.headers };
  }
  const login = await call("/auth/login", { login: admin.email, password }); assert.equal(login.status, 200); const adminCookie = login.cookie;
  let sequence = 0;
  async function fresh(ownerId = owner.ownerId) {
    const phone = "+849" + phonePrefix + String(++sequence).padStart(4, "0");
    const resident = await prisma.resident.create({ data: { ownerId, fullName: "Synthetic Resident " + sequence, phone } });
    const subject = `synthetic-${resident.residentId}`;
    delivery.bindings.set(`${ownerId}:${resident.residentId}:${phone}`, { ownerId, residentId: resident.residentId, phone, subject });
    return { resident, subject, path: `/residents/${resident.residentId}/account-invitations` };
  }
  async function enrolled() {
    const f = await fresh(); assert.equal((await call(f.path, {}, adminCookie)).status, 202);
    const raw = delivery.retrieve(f.subject, "invitation")!; assert.ok(raw);
    assert.equal((await call("/auth/accept-invitation", { token: raw, password })).status, 200);
    const account = await prisma.account.findUniqueOrThrow({ where: { residentId: f.resident.residentId } });
    return { ...f, account, raw };
  }
  try {
    await t.test("Admin scope, CSRF, key and unknown-authority checks precede writes", async () => {
      const f = await fresh(), other = await fresh(foreignOwner.ownerId);
      assert.equal((await call(f.path, {})).status, 401); assert.equal((await call(other.path, {}, adminCookie)).status, 404);
      const foreignAccount = await prisma.account.create({ data: { role: "resident", residentId: other.resident.residentId, phone: other.resident.phone, passwordHash: await hashPassword(password) } });
      const foreignReset = await call(`/accounts/${foreignAccount.accountId}/password-reset`, {}, adminCookie);
      const missingReset = await call("/accounts/999999999/password-reset", {}, adminCookie);
      assert.equal(foreignReset.status, 404); assert.deepEqual(foreignReset.body, missingReset.body);
      assert.equal((await call(f.path, {}, adminCookie, { "Idempotency-Key": "" })).status, 400);
      assert.equal((await call(f.path, {}, adminCookie, { "Idempotency-Key": "bad key" })).status, 400);
      assert.equal((await call(f.path, {}, adminCookie, { "X-CSRF-Token": "wrong" })).status, 403);
      assert.equal((await call(f.path, { owner_id: "99" }, adminCookie)).status, 400);
      assert.equal(await prisma.accountInvitation.count({ where: { residentId: f.resident.residentId } }), 0);
    });
    await t.test("issuance/retry/resend persist only hash, safe audit and24h lifetime", async () => {
      const f = await fresh(); const issued = await call(f.path, {}, adminCookie); assert.equal(issued.status, 202);
      const raw = delivery.retrieve(f.subject, "invitation")!; assert.ok(raw);
      const row = await prisma.accountInvitation.findFirstOrThrow({ where: { residentId: f.resident.residentId } });
      assert.equal(row.tokenHash, tokenHash("invitation", raw)); assert.equal(row.expiresAt.getTime() - row.createdAt.getTime(), 86400000);
      assert.doesNotMatch(JSON.stringify(issued.body), new RegExp(raw + "|token_hash|tokenHash|password"));
      assert.equal((await call(f.path, {}, adminCookie)).body.data.invitation_id, row.invitationId.toString());
      assert.equal((await call(f.path, {}, adminCookie, { "Idempotency-Key": "different-key" })).status, 409);
      assert.equal((await call(f.path, { resend: true }, adminCookie, { "Idempotency-Key": "resend-key" })).status, 202);
      assert.equal(await prisma.accountInvitation.count({ where: { residentId: f.resident.residentId } }), 1);
      const audit = await call(f.path, undefined, adminCookie); assert.doesNotMatch(JSON.stringify(audit.body), /token|hash|password/);
    });
    await t.test("credential link inspection is read-only, CSRF protected and invalid after use", async () => {
      const f = await fresh(); await call(f.path, {}, adminCookie); const raw = delivery.retrieve(f.subject, "invitation")!;
      const input = { purpose: "invitation", token: raw };
      assert.equal((await call("/auth/credential-link/inspect", input, "", { "X-CSRF-Token": "wrong" })).status, 403);
      for (let i = 0; i < 2; i++) {
        const result = await call("/auth/credential-link/inspect", input);
        assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.body.data).sort(), ["expires_at", "valid"]);
        assert.equal(result.headers.get("Cache-Control"), "no-store"); assert.equal(result.headers.get("Referrer-Policy"), "no-referrer");
      }
      assert.equal(await prisma.account.count({ where: { residentId: f.resident.residentId } }), 0);
      assert.equal((await prisma.accountInvitation.findFirstOrThrow({ where: { residentId: f.resident.residentId } })).status, "pending");
      assert.equal((await call("/auth/credential-link/inspect", { ...input, purpose: "reset" })).status, 400);
      assert.equal((await call("/auth/accept-invitation", { token: raw, password })).status, 200);
      assert.equal((await call("/auth/credential-link/inspect", input)).status, 400);
      await call("/auth/forgot-password", { login: f.resident.phone }); const reset = delivery.retrieve(f.subject, "reset")!;
      assert.equal((await call("/auth/credential-link/inspect", { purpose: "reset", token: reset })).status, 200);
      assert.equal((await call("/auth/reset-password", { token: reset, password: newPassword })).status, 200);
      assert.equal((await call("/auth/credential-link/inspect", { purpose: "reset", token: reset })).status, 400);
    });
    await t.test("GET cannot consume; concurrent accepts create exactly one linked Resident account", async () => {
      const f = await fresh(); await call(f.path, {}, adminCookie); const raw = delivery.retrieve(f.subject, "invitation")!;
      assert.equal((await call("/auth/accept-invitation")).status, 404); assert.equal(await prisma.account.count({ where: { residentId: f.resident.residentId } }), 0);
      const results = await Promise.all([call("/auth/accept-invitation", { token: raw, password }), call("/auth/accept-invitation", { token: raw, password })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); assert.equal(await prisma.account.count({ where: { residentId: f.resident.residentId } }), 1);
      const row = await prisma.accountInvitation.findFirstOrThrow({ where: { residentId: f.resident.residentId } }); assert.equal(row.status, "accepted"); assert.ok(row.acceptedAt);
      assert.equal((await call(f.path, { resend: true }, adminCookie, { "Idempotency-Key": "new-invitation" })).status, 409);
    });
    await t.test("revoked/expired/invalid tokens and client identity cannot accept", async () => {
      for (const state of ["revoked", "expired"] as const) {
        const f = await fresh(); await call(f.path, {}, adminCookie); const raw = delivery.retrieve(f.subject, "invitation")!;
        const row = await prisma.accountInvitation.findFirstOrThrow({ where: { residentId: f.resident.residentId } });
        if (state === "revoked") assert.equal((await call(`/account-invitations/${row.invitationId}/revoke`, {}, adminCookie)).status, 200);
        else await prisma.accountInvitation.update({ where: { invitationId: row.invitationId }, data: { status: "expired" } });
        assert.equal((await call("/auth/accept-invitation", { token: raw, password })).status, 400);
        assert.equal(await prisma.account.count({ where: { residentId: f.resident.residentId } }), 0);
      }
      const old = await fresh(); const oldAt = new Date(Date.now() - 86400000 * 2);
      await prisma.accountInvitation.create({ data: { ownerId: owner.ownerId, residentId: old.resident.residentId, createdByAccountId: admin.accountId, tokenHash: tokenHash("invitation", "expired-" + randomUUID()), status: "pending", createdAt: oldAt, expiresAt: new Date(oldAt.getTime() + 86400000) } });
      assert.equal((await call(old.path, { resend: true }, adminCookie)).status, 202);
      assert.deepEqual((await prisma.accountInvitation.findMany({ where: { residentId: old.resident.residentId }, orderBy: { createdAt: "asc" } })).map(i => i.status), ["expired", "pending"]);
      assert.equal((await call("/auth/accept-invitation", { token: "x".repeat(43), password })).status, 400);
      assert.equal((await call("/auth/accept-invitation", { token: "x".repeat(43), password, resident_id: "1" })).status, 400);
    });
    await t.test("unique-phone conflict rolls back account creation and accepted state", async () => {
      const first = await enrolled(); const f = await fresh(); await prisma.resident.update({ where: { residentId: f.resident.residentId }, data: { phone: first.resident.phone } });
      delivery.bindings.set(`${owner.ownerId}:${f.resident.residentId}:${first.resident.phone}`, { ownerId: owner.ownerId, residentId: f.resident.residentId, phone: first.resident.phone!, subject: f.subject });
      await call(f.path, {}, adminCookie); const raw = delivery.retrieve(f.subject, "invitation")!;
      assert.equal((await call("/auth/accept-invitation", { token: raw, password })).status, 409);
      assert.equal((await prisma.accountInvitation.findFirstOrThrow({ where: { residentId: f.resident.residentId } })).status, "pending");
      assert.equal(await prisma.account.count({ where: { residentId: f.resident.residentId } }), 0);
    });
    await t.test("Resident phone login, real cookie/me and Admin role denial", async () => {
      const f = await enrolled(); const logged = await call("/auth/login", { login: "0" + f.resident.phone!.slice(3), password }); assert.equal(logged.status, 200); assert.ok(logged.cookie);
      const me = await call("/auth/me", undefined, logged.cookie); assert.equal(me.status, 200); assert.equal(me.body.data.account.role, "resident");
      assert.equal((await call(f.path, {}, logged.cookie)).status, 403);
    });
    await t.test("forgot response is identical; reset issuance does not change password", async () => {
      const f = await enrolled(); const absent = await call("/auth/forgot-password", { login: "missing@example.test" }); const existing = await call("/auth/forgot-password", { login: f.resident.phone });
      assert.equal(absent.status, 202); assert.deepEqual(absent.body, existing.body); assert.ok(delivery.retrieve(f.subject, "reset"));
      assert.equal(await verifyPassword(password, (await prisma.account.findUniqueOrThrow({ where: { accountId: f.account.accountId } })).passwordHash), true);
    });
    await t.test("reset is atomic/one-use, old password/session denied, new login works", async () => {
      const f = await enrolled(); const oldLogin = await call("/auth/login", { login: f.resident.phone, password });
      assert.equal((await call(`/accounts/${f.account.accountId}/password-reset`, {}, adminCookie)).status, 202); const raw = delivery.retrieve(f.subject, "reset")!;
      assert.equal((await call("/auth/reset-password", { token: f.raw, password: newPassword })).status, 400);
      const results = await Promise.all([call("/auth/reset-password", { token: raw, password: newPassword }), call("/auth/reset-password", { token: raw, password: newPassword })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      assert.equal((await call("/auth/me", undefined, oldLogin.cookie)).status, 401); assert.equal((await call("/auth/login", { login: f.resident.phone, password })).status, 401);
      assert.equal((await call("/auth/login", { login: f.resident.phone, password: newPassword })).status, 200);
    });
    await t.test("session-store failure rolls back DB password and preserves usable reset", async () => {
      const f = await enrolled(); await call("/auth/forgot-password", { login: f.resident.phone }); const raw = delivery.retrieve(f.subject, "reset")!;
      const original = sessions.revokeAccount.bind(sessions); sessions.revokeAccount = async () => { throw Error("synthetic revocation failure"); };
      const failed = await call("/auth/reset-password", { token: raw, password: newPassword }); assert.equal(failed.status, 500);
      assert.equal(await verifyPassword(password, (await prisma.account.findUniqueOrThrow({ where: { accountId: f.account.accountId } })).passwordHash), true);
      sessions.revokeAccount = original; assert.equal((await call("/auth/reset-password", { token: raw, password: newPassword })).status, 200);
    });
    await t.test("concurrent old-password login cannot resurrect a session after reset", async () => {
      const f = await enrolled(); await call("/auth/forgot-password", { login: f.resident.phone }); const raw = delivery.retrieve(f.subject, "reset")!;
      const [reset, oldLogin] = await Promise.all([call("/auth/reset-password", { token: raw, password: newPassword }), call("/auth/login", { login: f.resident.phone, password })]);
      assert.equal(reset.status, 200); assert.ok([200, 401].includes(oldLogin.status)); if (oldLogin.cookie) assert.equal((await call("/auth/me", undefined, oldLogin.cookie)).status, 401);
    });
    await t.test("reset keeps locked account locked; Admin/foreign scope remains blocked", async () => {
      const f = await enrolled(); await prisma.account.update({ where: { accountId: f.account.accountId }, data: { status: "locked" } });
      await call("/auth/forgot-password", { login: f.resident.phone }); const raw = delivery.retrieve(f.subject, "reset")!;
      assert.equal((await call("/auth/reset-password", { token: raw, password: newPassword })).status, 200);
      assert.equal((await prisma.account.findUniqueOrThrow({ where: { accountId: f.account.accountId } })).status, "locked"); assert.equal((await call("/auth/login", { login: f.resident.phone, password: newPassword })).status, 401);
      assert.equal((await call(`/accounts/${admin.accountId}/password-reset`, {}, adminCookie)).status, 403);
    });
    await t.test("delivery rejection/timeout leave one pending invitation and no false sent claim", async () => {
      for (const outcome of ["rejected", "failed", "unknown"] as const) { const f = await fresh(); delivery.outcome = outcome; const issued = await call(f.path, {}, adminCookie); assert.equal(issued.body.data.delivery_status, outcome); assert.equal(await prisma.accountInvitation.count({ where: { residentId: f.resident.residentId, status: "pending" } }), 1); }
      delivery.outcome = "dev_available";
    });
    await t.test("phone binding changes reject stale link without identity reassignment", async () => {
      const f = await fresh(); await call(f.path, {}, adminCookie); const raw = delivery.retrieve(f.subject, "invitation")!;
      await prisma.resident.update({ where: { residentId: f.resident.residentId }, data: { phone: "+84999999999" } });
      assert.equal((await call("/auth/accept-invitation", { token: raw, password })).status, 400);
    });
    await t.test("public reset requests are rate limited with Retry-After", async () => {
      let result; for (let i = 0; i < 105; i++) { result = await call("/auth/forgot-password", { login: "missing@example.test" }); if (result.status === 429) break; }
      assert.equal(result?.status, 429); assert.ok(Number(result?.headers.get("Retry-After")) > 0);
    });
  } finally { delivery.clear(); await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); }
});
