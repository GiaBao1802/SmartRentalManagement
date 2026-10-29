import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import { scryptSync } from "node:crypto";
import type { RuntimeConfig } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler } from "../middleware/error-handler.js";
import { authenticateRequest, rejectClientAuthority, requireAdmin, requireResident, createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "./auth.types.js";
import { InMemorySessionStore } from "./session-store.js";
import { createV1Router } from "./v1.router.js";
import { parseBigIntId, stringifyBigInts, sendJson } from "../utils/ids.js";

const origin = "http://localhost:3000";
const password = "a-safe-test-password";
const passwordHash = (value: string, salt: string) => `scrypt$${salt}$${scryptSync(value, salt, 64).toString("hex")}`;

const owner = { ownerId: 9001n, displayName: "Chủ trọ thử nghiệm" };
const admin: LoginAccountRecord = {
  accountId: 1001n, ownerId: 9001n, residentId: null, role: "admin", email: "admin@example.test", phone: null,
  passwordHash: passwordHash(password, "aabbccddeeff00112233445566778899"), status: "active", owner, resident: null,
};
const resident: LoginAccountRecord = {
  accountId: 1002n, ownerId: null, residentId: 2002n, role: "resident", email: "resident@example.test", phone: "+84000000002",
  passwordHash: passwordHash(password, "bbccddeeff00112233445566778899aa"), status: "active", owner: null,
  resident: { residentId: 2002n, ownerId: 9001n, fullName: "Cư dân thử nghiệm" },
};
const superadmin: LoginAccountRecord = {
  accountId: 1006n, ownerId: null, residentId: null, role: "superadmin", email: "platform@example.test", phone: null,
  passwordHash: passwordHash(password, "ccddee112233445566778899aabbccdd"), status: "active", owner: null, resident: null,
};
const locked: LoginAccountRecord = {
  ...admin, accountId: 1003n, email: "locked@example.test", status: "locked",
};
const duplicatePhone: LoginAccountRecord[] = [
  { ...resident, accountId: 1004n, residentId: 2004n, email: "duplicate-a@example.test", phone: "+84999999999", resident: { residentId: 2004n, ownerId: 9001n, fullName: "A" } },
  { ...resident, accountId: 1005n, residentId: 2005n, email: "duplicate-b@example.test", phone: "+84999999999", resident: { residentId: 2005n, ownerId: 9001n, fullName: "B" } },
];
const records = [admin, resident, superadmin, locked, ...duplicatePhone];

class MockAuthRepository implements AuthRepository {
  async findCandidates(login: string): Promise<LoginAccountRecord[]> {
    return records.filter((account) => account.email?.toLowerCase() === login.toLowerCase() || account.phone === login);
  }
  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> {
    const account = records.find((candidate) => candidate.accountId === accountId);
    if (!account) return null;
    const { passwordHash: _passwordHash, ...safe } = account;
    return safe;
  }
}

const config: RuntimeConfig = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  FRONTEND_ORIGIN: origin,
  SESSION_SECRET: "test-only-session-secret-with-more-than-32-bytes",
  AUTH_LOGIN_MAX_ATTEMPTS: "100",
});
const sessions = new InMemorySessionStore();
const deps: AuthDependencies = { config, repository: new MockAuthRepository(), sessions };
let server: Server;
let baseUrl = "";

type HttpResult = { response: Response; body: any };

async function http(path: string, options: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

function cookieFrom(response: Response, name: string): string {
  const headerValues = response.headers.getSetCookie();
  const value = headerValues.map((header) => header.split(";")[0]!).find((item) => item.startsWith(`${name}=`));
  assert.ok(value, `expected ${name} cookie`);
  return value;
}

async function csrfBootstrap() {
  const result = await http("/api/v1/auth/csrf", { headers: { Origin: origin } });
  assert.equal(result.response.status, 200);
  return { cookie: cookieFrom(result.response, "gt_csrf"), token: result.body.data.csrf_token as string };
}

async function login(loginValue: string, passwordValue = password) {
  const csrf = await csrfBootstrap();
  const result = await http("/api/v1/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", Cookie: csrf.cookie, "X-CSRF-Token": csrf.token },
    body: JSON.stringify({ login: loginValue, password: passwordValue }),
  });
  return { ...result, csrf, sessionCookie: result.response.ok ? cookieFrom(result.response, "gt_session") : null };
}

before(async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.get("/api/v1/test/admin", authenticateRequest(deps), requireAdmin, (request, response) => {
    sendJson(response, 200, { data: { owner_id: request.auth!.ownerId } });
  });
  app.get("/api/v1/test/resident", authenticateRequest(deps), requireResident, (request, response) => {
    sendJson(response, 200, { data: { owner_id: request.auth!.ownerId, resident_id: request.auth!.residentId } });
  });
  app.get("/api/v1/billing/workspace", authenticateRequest(deps), rejectClientAuthority, requireAdmin, (request, response) => {
    sendJson(response, 200, { data: { resident_id: request.query.resident_id } });
  });
  app.use("/api/v1", createV1Router(deps));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("login valid Admin returns safe profile and HttpOnly opaque cookie", async () => {
  const result = await login("ADMIN@EXAMPLE.TEST");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.account.role, "admin");
  assert.equal(result.body.data.profile.owner_id, "9001");
  assert.ok(!JSON.stringify(result.body).includes("password_hash"));
  assert.ok(!JSON.stringify(result.body).includes("session"));
  assert.ok(result.response.headers.getSetCookie().some((cookie) => cookie.startsWith("gt_session=") && cookie.includes("HttpOnly")));
});

test("login valid Resident returns profile reference and never client Owner authority", async () => {
  const result = await login("resident@example.test");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.account.role, "resident");
  assert.deepEqual(result.body.data.profile, { resident_id: "2002", full_name: "Cư dân thử nghiệm" });
});

test("Superadmin has a separate profile and is denied Admin and Resident routes", async () => {
  const authenticated = await login("platform@example.test");
  assert.equal(authenticated.response.status, 200);
  assert.equal(authenticated.body.data.account.role, "superadmin");
  assert.deepEqual(authenticated.body.data.profile, { display_name: "Superadmin" });
  const cookie = { Cookie: authenticated.sessionCookie! };
  assert.equal((await http("/api/v1/test/admin", { headers: cookie })).response.status, 403);
  assert.equal((await http("/api/v1/test/resident", { headers: cookie })).response.status, 403);
  const profile = await http("/api/v1/auth/me", { headers: cookie });
  assert.equal(profile.response.status, 200);
  assert.deepEqual(profile.body.data.profile, { display_name: "Superadmin" });
});

test("invalid credentials and unknown login have the same generic response", async () => {
  const wrong = await login("admin@example.test", "wrong-password");
  const missing = await login("nobody@example.test", "wrong-password");
  assert.equal(wrong.response.status, 401);
  assert.deepEqual(
    { code: wrong.body.error.code, message: wrong.body.error.message, details: wrong.body.error.details },
    { code: missing.body.error.code, message: missing.body.error.message, details: missing.body.error.details },
  );
  assert.equal(wrong.body.error.code, "UNAUTHENTICATED");
});

test("locked account cannot login", async () => {
  const result = await login("locked@example.test");
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("ambiguous phone login fails generically", async () => {
  const result = await login("+84999999999");
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("oversized password is rejected without truncating it to a valid prefix", async () => {
  const result = await login("admin@example.test", `${password}${"x".repeat(1100)}`);
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("auth/me resolves current Admin Account from session", async () => {
  const authenticated = await login("admin@example.test");
  const result = await http("/api/v1/auth/me", { headers: { Cookie: authenticated.sessionCookie! } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.account.account_id, "1001");
  assert.equal(result.body.data.account.role, "admin");
  assert.equal(result.body.data.profile.owner_id, "9001");
});

test("auth/me resolves Resident profile and Owner scope from database relation", async () => {
  const authenticated = await login("resident@example.test");
  const result = await http("/api/v1/auth/me", { headers: { Cookie: authenticated.sessionCookie! } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.account.role, "resident");
  assert.equal(result.body.data.profile.resident_id, "2002");
  const guarded = await http("/api/v1/test/resident", { headers: { Cookie: authenticated.sessionCookie! } });
  assert.deepEqual(guarded.body.data, { owner_id: "9001", resident_id: "2002" });
});

test("session middleware rejects an account that becomes locked after login", async () => {
  const authenticated = await login("admin@example.test");
  admin.status = "locked";
  const result = await http("/api/v1/auth/me", { headers: { Cookie: authenticated.sessionCookie! } });
  admin.status = "active";
  assert.equal(result.response.status, 401);
});

test("Admin guard allows Admin and rejects Resident", async () => {
  const adminLogin = await login("admin@example.test");
  const residentLogin = await login("resident@example.test");
  const allowed = await http("/api/v1/test/admin", { headers: { Cookie: adminLogin.sessionCookie! } });
  const denied = await http("/api/v1/test/admin", { headers: { Cookie: residentLogin.sessionCookie! } });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.data.owner_id, "9001");
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
});

test("Resident guard rejects Admin", async () => {
  const authenticated = await login("admin@example.test");
  const result = await http("/api/v1/test/resident", { headers: { Cookie: authenticated.sessionCookie! } });
  assert.equal(result.response.status, 403);
});

test("logout revokes session and clears the cookie idempotently", async () => {
  const authenticated = await login("admin@example.test");
  const result = await http("/api/v1/auth/logout", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `${authenticated.csrf.cookie}; ${authenticated.sessionCookie}`,
      "X-CSRF-Token": authenticated.csrf.token,
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.logged_out, true);
  assert.ok(result.response.headers.getSetCookie().some((cookie) => cookie.startsWith("gt_session=") && cookie.includes("Max-Age=0")));
  const revoked = await http("/api/v1/auth/me", { headers: { Cookie: authenticated.sessionCookie! } });
  assert.equal(revoked.response.status, 401);
});

test("unsafe login request without CSRF is rejected", async () => {
  const result = await http("/api/v1/auth/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ login: "admin@example.test", password }),
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error.code, "CSRF_INVALID");
});

test("CSRF bootstrap token allows same-origin login", async () => {
  const result = await login("admin@example.test");
  assert.equal(result.response.status, 200);
});

test("foreign Origin fails CSRF even when token exists", async () => {
  const csrf = await csrfBootstrap();
  const result = await http("/api/v1/auth/login", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json", Cookie: csrf.cookie, "X-CSRF-Token": csrf.token },
    body: JSON.stringify({ login: "admin@example.test", password }),
  });
  assert.equal(result.response.status, 403);
});

test("client-supplied Owner authority is rejected, not used", async () => {
  const authenticated = await login("resident@example.test");
  const result = await http("/api/v1/auth/me", {
    headers: { Cookie: authenticated.sessionCookie!, "X-Owner-Id": "1" },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, "VALIDATION_ERROR");

  const residentFilterOutsideInvoiceList = await http("/api/v1/auth/me?resident_id=2002", {
    headers: { Cookie: authenticated.sessionCookie! },
  });
  assert.equal(residentFilterOutsideInvoiceList.response.status, 400);
  assert.equal(residentFilterOutsideInvoiceList.body.error.code, "VALIDATION_ERROR");

  const adminSession = await login("admin@example.test");
  const workspaceResidentFilter = await http("/api/v1/billing/workspace?resident_id=2002", {
    headers: { Cookie: adminSession.sessionCookie! },
  });
  assert.equal(workspaceResidentFilter.response.status, 200);
  assert.equal(workspaceResidentFilter.body.data.resident_id, "2002");
});

test("BigInt IDs serialize as decimal strings", () => {
  assert.equal(stringifyBigInts({ account_id: 9_223_372_036_854_775_807n }), '{"account_id":"9223372036854775807"}');
});

test("session defaults enforce 30-minute idle and 12-hour absolute limits", () => {
  const startedAt = 1_800_000_000_000;
  const session = createSessionRecord(1001n, "hashed-session-id", config, startedAt);
  assert.equal(session.expiresAt - session.createdAt, 30 * 60 * 1000);
  assert.equal(session.absoluteExpiresAt - session.createdAt, 12 * 60 * 60 * 1000);
});

test("BigInt route ID parser rejects malformed, nonpositive and out-of-range input", () => {
  assert.equal(parseBigIntId("123"), 123n);
  for (const value of ["", "0", "-1", "1.2", "1e2", "9223372036854775808", 123]) {
    assert.throws(() => parseBigIntId(value));
  }
});

test("errors include request ID and use the shared envelope", async () => {
  const result = await http("/api/v1/auth/me");
  assert.equal(result.response.status, 401);
  assert.ok(result.body.error.request_id.startsWith("req_"));
  assert.equal(result.response.headers.get("x-request-id"), result.body.error.request_id);
});
