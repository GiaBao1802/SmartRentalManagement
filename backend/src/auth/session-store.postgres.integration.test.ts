import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler } from "../middleware/error-handler.js";
import { authenticateRequest } from "../middleware/auth.js";
import { csrfProtection } from "../middleware/csrf.js";
import { createAuthRouter } from "./auth.routes.js";
import { PrismaAuthRepository } from "./account-repository.js";
import { hashPassword } from "./password.js";
import { PostgresSessionStore, createSessionStore, hashSessionToken } from "./session-store.js";

const testUrl = process.env.GOCTRO_AUTH_SESSION_TEST_DATABASE_URL;

test("PostgreSQL sessions survive another backend instance and revoke on logout, expiry, and lock", { skip: !testUrl }, async () => {
  const url = new URL(testUrl!);
  assert.match(decodeURIComponent(url.pathname), /^\/goctro_auth_session_test_[a-z0-9]+$/);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const config = loadEnv({
    NODE_ENV: "production", DATABASE_URL: testUrl, FRONTEND_ORIGIN: "http://localhost:3000",
    SESSION_SECRET: "session-integration-only-secret-over-32-bytes",
  });
  const repository = new PrismaAuthRepository(db);
  const first = createSessionStore("production", db);
  const second = new PostgresSessionStore(db);
  assert.ok(first instanceof PostgresSessionStore);

  const app = express();
  app.use(requestIdMiddleware, express.json(), csrfProtection(config));
  app.use("/api/v1/auth", createAuthRouter({ config, repository, sessions: first }));
  app.get("/api/v1/other/me", authenticateRequest({ config, repository, sessions: second }), (request, response) => {
    response.json({ account_id: request.auth!.accountId.toString() });
  });
  app.use(errorHandler);
  const server = createServer(app);
  try {
    await db.account.update({ where: { accountId: 1n }, data: { passwordHash: await hashPassword("session-test-password"), status: "active" } });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const cookie = (response: Response, name: string) => {
      const found = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
      assert.ok(found);
      return found.split(";")[0]!;
    };
    const login = async () => {
      const csrf = await fetch(`${base}/api/v1/auth/csrf`);
      assert.equal(csrf.status, 200);
      const body = await csrf.json();
      const csrfCookie = cookie(csrf, "gt_csrf");
      const response = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST", headers: { Origin: config.frontendOrigin, "Content-Type": "application/json", Cookie: csrfCookie, "X-CSRF-Token": body.data.csrf_token },
        body: JSON.stringify({ login: "admin.one@example.test", password: "session-test-password" }),
      });
      assert.equal(response.status, 200);
      return { sessionCookie: cookie(response, "gt_session"), csrfCookie, csrfToken: body.data.csrf_token };
    };
    const me = (sessionCookie: string) => fetch(`${base}/api/v1/other/me`, { headers: { Cookie: sessionCookie } });

    const session1 = await login();
    const fromOtherInstance = await me(session1.sessionCookie);
    assert.equal(fromOtherInstance.status, 200);
    assert.match(fromOtherInstance.headers.get("set-cookie") ?? "", /gt_session=.*Max-Age=/);
    const rawToken = decodeURIComponent(session1.sessionCookie.slice("gt_session=".length));
    const hash = hashSessionToken(rawToken, config.sessionSecret);
    const stored = await db.$queryRaw<Array<{ token_hash: string }>>`SELECT token_hash FROM auth_sessions WHERE token_hash = ${hash}`;
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]!.token_hash.trim(), rawToken);

    const logout = await fetch(`${base}/api/v1/auth/logout`, {
      method: "POST", headers: { Origin: config.frontendOrigin, Cookie: `${session1.csrfCookie}; ${session1.sessionCookie}`, "X-CSRF-Token": session1.csrfToken },
    });
    assert.equal(logout.status, 200);
    assert.equal((await me(session1.sessionCookie)).status, 401);

    const session2 = await login();
    const token2 = decodeURIComponent(session2.sessionCookie.slice("gt_session=".length));
    await db.$executeRaw`UPDATE auth_sessions
      SET created_at = now() - interval '1 hour', last_seen_at = now() - interval '2 seconds', expires_at = now() - interval '1 second'
      WHERE token_hash = ${hashSessionToken(token2, config.sessionSecret)}`;
    assert.equal((await me(session2.sessionCookie)).status, 401);

    const session3 = await login();
    await db.account.update({ where: { accountId: 1n }, data: { status: "locked" } });
    assert.equal((await me(session3.sessionCookie)).status, 401);
    await db.account.update({ where: { accountId: 1n }, data: { status: "active" } });
    assert.equal((await me(session3.sessionCookie)).status, 401);

    const session4 = await login();
    await second.revokeAccount("1");
    assert.equal((await me(session4.sessionCookie)).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
