import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import type { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { createSessionRecord } from "../middleware/auth.js";
import { InMemorySessionStore, hashSessionToken } from "../auth/session-store.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createPlatformPublicRouter, createPlatformRouter } from "./platform.routes.js";

test("production platform permits scoped reads and blocks undeliverable links before data changes", async () => {
  const config = loadEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://unused:unused@127.0.0.1/unused",
    FRONTEND_ORIGIN: "https://example.test", SESSION_SECRET: "production-route-test-secret-more-than-32-bytes" });
  const sessions = new InMemorySessionStore();
  const writes: string[] = [];
  const db = {
    async $queryRaw() { return []; },
    async $executeRaw(strings: TemplateStringsArray) { writes.push(strings.join("?")); return 1; },
  } as unknown as PrismaClient;
  const accounts = new Map([["1", "superadmin"], ["2", "admin"], ["3", "resident"]]);
  const repository = { async findCandidates() { return []; }, async findCurrentAccount(id: bigint) {
    const role = accounts.get(id.toString());
    if (!role) return null;
    return { accountId: id, role, status: "active", ownerId: role === "admin" ? 7n : null,
      residentId: role === "resident" ? 9n : null, email: null, phone: null,
      owner: role === "admin" ? { ownerId: 7n, displayName: "test" } : null,
      resident: role === "resident" ? { residentId: 9n, ownerId: 7n, fullName: "test" } : null };
  } };
  const deps = { config, sessions, repository };
  const app = express();
  app.use(requestIdMiddleware, express.json());
  app.use("/api/v1/platform", createPlatformRouter(db, deps));
  app.use("/api/v1/platform-neon-dev", createPlatformRouter(db, { ...deps, config: {
    ...config, nodeEnv: "development", databaseUrl: "postgresql://dummy:dummy@ep-example.neon.tech/neondb",
  } }));
  app.use("/api/v1/auth", createPlatformPublicRouter(db, deps, "auth"));
  app.use(errorHandler);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const cookies: string[] = [];
    for (const accountId of [1, 2, 3]) {
      const raw = `test-session-token-${accountId}-012345678901234567890`;
      await sessions.set(createSessionRecord(BigInt(accountId), hashSessionToken(raw, config.sessionSecret), config));
      cookies.push(`gt_session=${raw}`);
    }
    const call = async (path: string, method = "GET", cookie = "", body: object = {}) => {
      const response = await fetch(base + path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() as any };
    };
    assert.equal((await call("/platform/owners", "GET", cookies[0])).status, 200);
    assert.equal((await call("/platform/reports", "GET", cookies[0])).status, 200);
    assert.equal((await call("/platform/owners", "GET", cookies[1])).status, 403);
    assert.equal((await call("/platform/owners", "GET", cookies[2])).status, 403);
    assert.equal((await call("/platform/owners")).status, 401);
    assert.equal((await call("/platform/owners", "POST", cookies[1])).status, 403);
    assert.equal((await call("/platform/audit-events", "GET", cookies[0])).status, 403);
    assert.equal((await call("/platform/audit/recheck", "POST", cookies[0], { password: "never-used" })).status, 403);
    for (const path of ["/platform/owners", "/platform/owners/7/invitation-resend", "/platform/accounts/2/password-reset"]) {
      const result = await call(path, "POST", cookies[0]);
      assert.equal(result.status, 503);
      assert.equal(result.body.error.code, "DELIVERY_NOT_CONFIGURED");
      assert.doesNotMatch(JSON.stringify(result.body), /token=|demo_link|sent_success/);
    }
    const neonDevelopment = await call("/platform-neon-dev/owners", "POST", cookies[0]);
    assert.equal(neonDevelopment.status, 503);
    assert.equal(neonDevelopment.body.error.code, "DELIVERY_NOT_CONFIGURED");
    assert.equal((await call("/auth/operator-invitation/inspect", "POST", "", { token: "invalid" })).body.error.code, "DEMO_ONLY");
    assert.equal((await call("/auth/owner-invitation/inspect", "POST", "", { token: "invalid" })).body.error.code, "TOKEN_INVALID");
    assert.ok(writes.every((statement) => statement.includes("platform_audit_events")), "blocked commands must not create Owner or token rows");
  } finally { await new Promise<void>((resolveClose) => server.close(() => resolveClose())); }
});
