import assert from "node:assert/strict";
import "dotenv/config";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import express from "express";
import pg from "pg";
import { PrismaAuthRepository } from "../auth/account-repository.js";
import { PrismaPropertyRoomRepository } from "../properties/property-room.repository.js";
import { hashPassword } from "../auth/password.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { createV1Router } from "../auth/v1.router.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import type { RuntimeConfig } from "../config/env.js";

test("V1.18 Superadmin flow on disposable PostgreSQL", { skip: !process.env.DATABASE_URL }, async () => {
  const sourceUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(sourceUrl.hostname));
  assert.equal(sourceUrl.pathname, "/postgres", "Test can only create a database from local postgres maintenance DB");
  const disposableName = `goctro_platform_test_${process.pid}`;
  const admin = new pg.Client({ connectionString: sourceUrl.toString() });
  await admin.connect();
  let created = false;
  let db: PrismaClient | undefined;
  try {
    const source = await admin.query("SELECT current_database() db");
    assert.equal(source.rows[0].db, sourceUrl.pathname.slice(1));
    await admin.query(`CREATE DATABASE "${disposableName}"`);
    created = true;
    const testUrl = new URL(sourceUrl); testUrl.pathname = `/${disposableName}`;
    const setup = new pg.Client({ connectionString: testUrl.toString() });
    await setup.connect();
    try {
      await setup.query(await readFile(resolve("../database/baselines/v1.18/schema.sql"), "utf8"));
      await setup.query(await readFile(resolve("../database/baselines/v1.15/seed.sql"), "utf8"));
    } finally { await setup.end(); }
    db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
    const oldCount = await db.$queryRaw<Array<{ owners: bigint; accounts: bigint }>>`SELECT (SELECT count(*) FROM owners) owners,(SELECT count(*) FROM accounts) accounts`;
    const saPassword = "Superadmin-test-password-2026!", adminPassword = "Admin-test-password-2026!", residentPassword = "Resident-test-password-2026!";
    const sa = await db.$queryRaw<Array<{ account_id: bigint }>>`INSERT INTO accounts(role,email,password_hash) VALUES ('superadmin','sa-platform-test@example.test',${await hashPassword(saPassword)}) RETURNING account_id`;
    const owner = await db.$queryRaw<Array<{ owner_id: bigint }>>`INSERT INTO owners(display_name,contact_email) VALUES ('Fixture owner','fixture-admin-platform@example.test') RETURNING owner_id`;
    await db.$executeRaw`INSERT INTO accounts(role,owner_id,email,password_hash) VALUES ('admin',${owner[0].owner_id},'fixture-admin-platform@example.test',${await hashPassword(adminPassword)})`;
    const resident = await db.$queryRaw<Array<{ resident_id: bigint }>>`INSERT INTO residents(owner_id,full_name,email) VALUES (${owner[0].owner_id},'Fixture resident','fixture-resident-platform@example.test') RETURNING resident_id`;
    await db.$executeRaw`INSERT INTO accounts(role,resident_id,email,password_hash) VALUES ('resident',${resident[0].resident_id},'fixture-resident-platform@example.test',${await hashPassword(residentPassword)})`;
    const seedAdmins = await db.$queryRaw<Array<{ account_id: bigint; owner_id: bigint }>>`SELECT account_id,owner_id FROM accounts WHERE role='admin' AND owner_id IN (1,2) ORDER BY owner_id`;
    assert.equal(seedAdmins.length, 2);
    const seedPassword = "Seed-Admin-Platform-Test-2026!";
    for (const row of seedAdmins) await db.account.update({ where: { accountId: row.account_id }, data: { passwordHash: await hashPassword(seedPassword) } });
    const foreignProperty = await db.$queryRaw<Array<{ property_id: bigint }>>`SELECT property_id FROM properties WHERE owner_id=2 ORDER BY property_id LIMIT 1`;
    assert.equal(foreignProperty.length, 1);
    const config: RuntimeConfig = { nodeEnv: "test", port: 0, databaseUrl: testUrl.toString(), frontendOrigin: "http://localhost:3000", sessionSecret: "superadmin-runtime-test-secret-at-least-32-bytes", sessionIdleMinutes: 30, sessionAbsoluteHours: 12, loginMaxAttempts: 100, loginWindowMinutes: 15 };
    const sessions = new InMemorySessionStore();
    const app = express(); app.use(requestIdMiddleware, express.json());
    app.use("/api/v1", createV1Router({ config, repository: new PrismaAuthRepository(db), sessions, platformDb: db, propertyRoomRepository: new PrismaPropertyRoomRepository(db) }));
    app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}/api/v1`;
      const csrfResponse = await fetch(`${base}/auth/csrf`), csrfBody = await csrfResponse.json() as any;
      const csrf = csrfBody.data.csrf_token as string;
      const csrfCookie = csrfResponse.headers.getSetCookie().find(v => v.startsWith("gt_csrf="))?.split(";")[0];
      assert.ok(csrfCookie);
      let key = 0;
      async function call(path: string, body?: unknown, session = "", retryKey?: string) {
        const response = await fetch(base+path, { method: body === undefined ? "GET" : "POST", headers: { Origin: config.frontendOrigin, "Content-Type": "application/json", Cookie: `${csrfCookie}; ${session}`, "X-CSRF-Token": csrf, "Idempotency-Key": retryKey ?? `platform-test-${++key}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() as any, cookie: response.headers.getSetCookie().find(v => v.startsWith("gt_session="))?.split(";")[0] ?? "" };
      }
      const superLogin = await call("/auth/login", { login: "sa-platform-test@example.test", password: saPassword });
      const adminLogin = await call("/auth/login", { login: "fixture-admin-platform@example.test", password: adminPassword });
      const residentLogin = await call("/auth/login", { login: "fixture-resident-platform@example.test", password: residentPassword });
      const seedAdminLogin = await call("/auth/login", { login: "admin.one@example.test", password: seedPassword });
      assert.equal(seedAdminLogin.status, 200);
      const ownProperties = await call("/properties", undefined, seedAdminLogin.cookie);
      assert.equal(ownProperties.status, 200);
      assert.ok(ownProperties.body.data.length > 0);
      assert.ok(ownProperties.body.data.every((property: { owner_id: string }) => property.owner_id === "1"));
      assert.equal((await call(`/properties/${foreignProperty[0].property_id}`, undefined, seedAdminLogin.cookie)).status, 404);
      assert.equal((await call("/properties", undefined, superLogin.cookie)).status, 403);
      assert.equal(superLogin.body.data.account.role, "superadmin");
      assert.equal(adminLogin.body.data.account.role, "admin");
      assert.equal(residentLogin.body.data.account.role, "resident");
      assert.equal((await call("/platform/owners", undefined, adminLogin.cookie)).status, 403);
      assert.equal((await call("/platform/owners", undefined, residentLogin.cookie)).status, 403);
      assert.equal((await call("/platform/owners", undefined, superLogin.cookie)).status, 200);
      const ownerBody = { display_name: "Owner demo", contact_email: "owner-platform-demo@example.test", recipient_verification: { method: "phone_call", note: "Verified by test" } };
      const create = await call("/platform/owners", ownerBody, superLogin.cookie, "owner-create-once");
      assert.equal(create.status, 201);
      assert.match(create.body.data.demo_link, /owner-invitation#token=/);
      const invitationToken = new URLSearchParams(new URL(create.body.data.demo_link).hash.slice(1)).get("token");
      assert.ok(invitationToken);
      const replay = await call("/platform/owners", ownerBody, superLogin.cookie, "owner-create-once");
      assert.equal(replay.status, 201);
      assert.equal(replay.body.data.owner_id, create.body.data.owner_id);
      assert.equal(replay.body.data.demo_link, undefined);
      assert.equal((await call("/platform/owners", { ...ownerBody, display_name: "Changed" }, superLogin.cookie, "owner-create-once")).status, 409);
      const collisionBody = { display_name: "Duplicate review", contact_email: "duplicate-platform@example.test", recipient_verification: { method: "phone_call", note: "Verified by test" } };
      const collisions = await Promise.all([
        call("/platform/owners", collisionBody, superLogin.cookie),
        call("/platform/owners", { ...collisionBody, contact_email: " DUPLICATE-PLATFORM@example.test " }, superLogin.cookie),
      ]);
      assert.deepEqual(collisions.map(x => x.status).sort(), [201,409]);
      assert.equal((await call("/auth/owner-invitation/inspect", { token: invitationToken })).status, 200);
      const accepted = await Promise.all([call("/auth/accept-owner-invitation", { token: invitationToken, password: "Owner-Demo-Password-2026!" }),call("/auth/accept-owner-invitation", { token: invitationToken, password: "Owner-Demo-Password-2026!" })]);
      assert.deepEqual(accepted.map(x => x.status).sort(), [200,400]);
      assert.equal((await call("/auth/owner-invitation/inspect", { token: invitationToken })).status, 400);
      const freshLogin = await call("/auth/login", { login: "owner-platform-demo@example.test", password: "Owner-Demo-Password-2026!" });
      assert.equal(freshLogin.body.data.account.role, "admin");
      const after = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM accounts WHERE owner_id=${BigInt(create.body.data.owner_id)}`;
      assert.equal(after[0].count, 1n);
      const createdAccount = await db.$queryRaw<Array<{ account_id: bigint }>>`SELECT account_id FROM accounts WHERE owner_id=${BigInt(create.body.data.owner_id)}`;
      const reset = await call(`/platform/accounts/${createdAccount[0].account_id}/password-reset`, {}, superLogin.cookie);
      assert.equal(reset.status, 202);
      const resetToken = new URLSearchParams(new URL(reset.body.data.demo_link).hash.slice(1)).get("token"); assert.ok(resetToken);
      assert.equal((await call("/auth/owner-reset/inspect", { token: resetToken })).status, 200);
      assert.equal((await call("/auth/complete-owner-reset", { token: resetToken, password: "Owner-Changed-Password-2026!" })).status, 200);
      assert.equal((await call("/auth/owner-reset/inspect", { token: resetToken })).status, 400);
      assert.equal((await call("/auth/login", { login: "owner-platform-demo@example.test", password: "Owner-Demo-Password-2026!" })).status, 401);
      const relogin = await call("/auth/login", { login: "owner-platform-demo@example.test", password: "Owner-Changed-Password-2026!" });
      assert.equal(relogin.status, 200);
      const locked = await call(`/platform/accounts/${createdAccount[0].account_id}/lock`, { reason: `Runtime safety check https://demo.test/?token=${invitationToken}` }, superLogin.cookie);
      assert.equal(locked.status, 200);
      assert.equal((await call("/auth/me", undefined, relogin.cookie)).status, 401);
      assert.equal((await call("/auth/login", { login: "owner-platform-demo@example.test", password: "Owner-Changed-Password-2026!" })).status, 401);
      assert.equal((await call(`/platform/accounts/${createdAccount[0].account_id}/unlock`, { reason: "Runtime safety check complete" }, superLogin.cookie)).status, 200);
      assert.equal((await call("/auth/me", undefined, relogin.cookie)).status, 401);
      assert.equal((await call("/auth/login", { login: "owner-platform-demo@example.test", password: "Owner-Changed-Password-2026!" })).status, 200);
      const expired = await call(`/platform/accounts/${createdAccount[0].account_id}/password-reset`, {}, superLogin.cookie);
      await db.$executeRaw`UPDATE owner_password_resets SET expires_at=now()-interval '1 second' WHERE reset_id=${BigInt(expired.body.data.reset_id)}`;
      assert.equal((await call("/auth/owner-reset/inspect", { token: new URLSearchParams(new URL(expired.body.data.demo_link).hash.slice(1)).get("token") })).status, 400);
      const targets = await call("/public/platform-report-targets");
      assert.equal(targets.status, 200);
      const targetCode = targets.body.data[0]?.public_report_code;
      assert.ok(targetCode);
      const report = await call("/public/platform-reports", { public_report_code: targetCode, content: "Nội dung phản ánh nền tảng cần kiểm tra", anonymous: true });
      assert.equal(report.status, 201);
      const platformReport = await db.$queryRaw<Array<{ report_id: bigint }>>`SELECT report_id FROM platform_reports WHERE reference_code=${report.body.data.reference_code}`;
      const reportId = platformReport[0].report_id;
      assert.equal((await call("/platform/reports", undefined, adminLogin.cookie)).status, 403);
      const transitions = await Promise.all([
        call(`/platform/reports/${reportId}/transition`, { to_status: "IN_PROGRESS", note: "Đang xác minh" }, superLogin.cookie),
        call(`/platform/reports/${reportId}/transition`, { to_status: "IN_PROGRESS", note: "Đang xác minh" }, superLogin.cookie),
      ]);
      assert.deepEqual(transitions.map(x => x.status).sort(), [200,409]);
      assert.equal((await call(`/platform/reports/${reportId}/transition`, { to_status: "RESOLVED", note: "Đã kiểm tra" }, superLogin.cookie)).status, 200);
      assert.equal((await call("/platform/audit-events", undefined, superLogin.cookie)).status, 403);
      await db.$executeRaw`INSERT INTO platform_permissions(account_id,permission,granted_by,request_reference,reason) VALUES (${sa[0].account_id},'PLATFORM_AUDIT_READ','runtime-test','runtime-test','runtime-test')`;
      assert.equal((await call("/platform/audit/recheck", { password: saPassword }, superLogin.cookie)).status, 200);
      const auditEvents = await call("/platform/audit-events", undefined, superLogin.cookie);
      assert.equal(auditEvents.status, 200);
      assert.ok(!JSON.stringify(auditEvents.body).includes(invitationToken));
      await db.$executeRaw`UPDATE platform_audit_grants SET last_used_at=now()-interval '11 minutes' WHERE account_id=${sa[0].account_id}`;
      assert.equal((await call("/platform/audit-events", undefined, superLogin.cookie)).status, 403);
      await db.$executeRaw`UPDATE platform_permissions SET revoked_at=now(),revoked_by='runtime-test' WHERE account_id=${sa[0].account_id}`;
      assert.equal((await call("/platform/audit/recheck", { password: saPassword }, superLogin.cookie)).status, 403);
      const stored = await db.$queryRaw<Array<{ records: string }>>`SELECT string_agg(safe_response::text,' ') records FROM platform_command_requests`;
      assert.ok(!stored[0].records.includes(invitationToken));
      assert.ok(!stored[0].records.includes(resetToken));
      const auditStorage = await db.$queryRaw<Array<{ records: string }>>`SELECT string_agg(coalesce(reason,''),' ') records FROM platform_audit_events`;
      assert.ok(!auditStorage[0].records.includes(invitationToken));
      const remaining = await db.$queryRaw<Array<{ owners: bigint; accounts: bigint }>>`SELECT (SELECT count(*) FROM owners) owners,(SELECT count(*) FROM accounts) accounts`;
      assert.equal(remaining[0].owners, oldCount[0].owners + 3n);
      assert.equal(remaining[0].accounts, oldCount[0].accounts + 4n);
    } finally { await new Promise<void>(resolveClose => server.close(() => resolveClose())); }
  } finally {
    await db?.$disconnect();
    if (created) await admin.query(`DROP DATABASE "${disposableName}" WITH (FORCE)`);
    await admin.end();
  }
});
