import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { scryptSync } from "node:crypto";
import express from "express";
import { loadEnv } from "../config/env.js";
import { createV1Router } from "../auth/v1.router.js";
import { InMemorySessionStore, hashSessionToken, createOpaqueSessionToken, type SessionStore } from "../auth/session-store.js";
import { createSessionRecord } from "../middleware/auth.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import type { AuthRepository, LoginAccountRecord } from "../auth/auth.types.js";
import type { AccountManagementRepository, AccountRecord, InvitationRecord } from "./account.types.js";
import { AccountManagementService } from "./account.service.js";

async function harness() {
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/no_database", FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "accounts-only-test-session-secret-32-bytes" });
  const password = "fixture-password-not-real";
  const salt = "00112233445566778899aabbccddeeff";
  const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  const admin: LoginAccountRecord = { accountId: 1n, ownerId: 11n, residentId: null, role: "admin", email: "admin@example.test", phone: null, passwordHash: hash, status: "active", owner: { ownerId: 11n, displayName: "Owner" }, resident: null };
  const resident: LoginAccountRecord = { ...admin, accountId: 2n, ownerId: null, residentId: 22n, role: "resident", email: "resident@example.test", owner: null, resident: { residentId: 22n, ownerId: 11n, fullName: "Fixture Resident" } };
  const foreign: LoginAccountRecord = { ...resident, accountId: 4n, residentId: 24n, email: "foreign@example.test", resident: { residentId: 24n, ownerId: 12n, fullName: "Other Owner Resident" } };
  const accounts = [admin, resident, foreign];
  const now = new Date();
  const invitations = new Map<bigint, InvitationRecord>([
    [1n, { invitationId: 1n, residentId: 22n, status: "pending", expiresAt: new Date(Date.now() + 60_000), acceptedAt: null, createdAt: now, updatedAt: now }],
    [2n, { invitationId: 2n, residentId: 22n, status: "pending", expiresAt: new Date(Date.now() - 60_000), acceptedAt: null, createdAt: now, updatedAt: now }],
    [3n, { invitationId: 3n, residentId: 22n, status: "accepted", expiresAt: new Date(Date.now() + 60_000), acceptedAt: now, createdAt: now, updatedAt: now }],
    [4n, { invitationId: 4n, residentId: 24n, status: "pending", expiresAt: new Date(Date.now() + 60_000), acceptedAt: null, createdAt: now, updatedAt: now }],
  ]);
  const effects = { revocations: 0 };
  const sessions = new InMemorySessionStore();
  const authRepo: AuthRepository = {
    async findCandidates(login) { return accounts.filter((row) => row.email === login); },
    async findCurrentAccount(id) { return accounts.find((row) => row.accountId === id) ?? null; },
  };
  const scoped = (owner: bigint, row: LoginAccountRecord) => row.role === "admin" ? row.ownerId === owner : row.resident?.ownerId === owner;
  const record = (row: LoginAccountRecord): AccountRecord => ({ ...row, lastLoginAt: null, createdAt: now, updatedAt: now });
  const repository: AccountManagementRepository = {
    async list(owner, query) { const filtered = accounts.filter((row) => scoped(owner, row) && (!query.role || row.role === query.role) && (!query.status || row.status === query.status) && (!query.residentId || row.residentId === query.residentId)); return { rows: filtered.slice((query.page - 1) * query.page_size, query.page * query.page_size).map(record), total: filtered.length }; },
    async find(owner, id) { const row = accounts.find((a) => a.accountId === id && scoped(owner, a)); return row ? record(row) : null; },
    async setResidentStatus(owner, id, status, revoke) { const row = accounts.find((a) => a.accountId === id && a.role === "resident" && scoped(owner, a)); if (!row) return null; await revoke(); row.status = status; return record(row); },
    async residentExists(owner, residentId) { return accounts.some((a) => a.residentId === residentId && a.resident?.ownerId === owner); },
    async invitations(owner, residentId, page, pageSize) { const rows = owner === 11n && residentId === 22n ? [...invitations.values()].filter((r) => r.residentId === residentId) : []; return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }; },
    async revokeInvitation(owner, id, at) { const row = invitations.get(id); if (!row || owner !== 11n || row.residentId !== 22n) return "missing"; if (row.status === "revoked") return row; if (row.status !== "pending" || row.expiresAt <= at) return "terminal"; row.status = "revoked"; effects.revocations++; return row; },
  };
  const app = express(); app.use(express.json()); app.use("/api/v1", createV1Router({ config, repository: authRepo, sessions, accountManagementRepository: repository })); app.use(errorHandler);
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const csrf = makeCsrfToken(config.sessionSecret);
  const tokens = new Map<bigint, string>();
  for (const row of accounts) { const token = createOpaqueSessionToken(); tokens.set(row.accountId, token); await sessions.set(createSessionRecord(row.accountId, hashSessionToken(token, config.sessionSecret), config)); }
  async function request(url: string, method = "GET", body?: unknown, account: bigint | null = 1n, extra: Record<string, string | undefined> = {}) {
    const headers = Object.fromEntries(Object.entries({ Origin: config.frontendOrigin, "Content-Type": "application/json", Cookie: `gt_csrf=${csrf}${account ? `; gt_session=${tokens.get(account)}` : ""}`, "X-CSRF-Token": csrf, "Idempotency-Key": "accounts-test-key", ...extra }).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const response = await fetch(`${baseUrl}/api/v1${url}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { request, repository, invitations, effects, accounts, sessions, tokens, config, password, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
type Harness = Awaited<ReturnType<typeof harness>>;
const check = (name: string, run: (h: Harness) => Promise<void>) => test(name, async () => { const h = await harness(); try { await run(h); } finally { await h.close(); } });

check("anonymous is 401 and Resident role is 403", async ({ request }) => {
  assert.equal((await request("/accounts", "GET", undefined, null)).status, 401);
  assert.equal((await request("/accounts", "GET", undefined, 2n)).status, 403);
});
check("list only own Admin and Residents; filters and pagination are not authority", async ({ request }) => {
  const result = await request("/accounts"); assert.equal(result.status, 200); assert.deepEqual(result.body.data.map((r: { account_id: string }) => r.account_id), ["1", "2"]);
  assert.deepEqual((await request("/accounts?role=resident&resident_id=22&page=1&page_size=1")).body.meta, { page: 1, page_size: 1, total_items: 1, total_pages: 1 });
  assert.equal((await request("/accounts?resident_id=24")).body.meta.total_items, 0);
  assert.equal((await request("/accounts?role=LANDLORD")).status, 400);
  assert.equal((await request("/accounts?page_size=101")).status, 400);
});
check("foreign and missing detail/mutation return identical hidden404", async ({ request }) => {
  for (const suffix of ["", "/status", "/password-reset"]) {
    const method = suffix === "/status" ? "PATCH" : suffix ? "POST" : "GET";
    const body = method === "GET" ? undefined : suffix === "/status" ? { status: "locked" } : {};
    const foreign = await request(`/accounts/4${suffix}`, method, body); const missing = await request(`/accounts/999${suffix}`, method, body);
    assert.equal(foreign.status, 404); assert.equal(missing.status, 404); assert.deepEqual(foreign.body.error, missing.body.error);
  }
});
check("DTOs never echo password/token hashes or extra repository fields", async ({ request }) => {
  for (const url of ["/accounts", "/accounts/2", "/residents/22/account-invitations"]) {
    const result = await request(url); assert.equal(result.status, 200); assert.doesNotMatch(JSON.stringify(result.body), /password|token|session|ownerId|nationalId|scrypt/i);
  }
});
check("scope forgery and unknown mutation fields are rejected", async ({ request }) => {
  assert.equal((await request("/accounts?owner_id=12")).status, 400);
  assert.equal((await request("/accounts", "GET", undefined, 1n, { "x-owner-id": "12" })).status, 400);
  assert.equal((await request("/accounts/2/status", "PATCH", { status: "locked", role: "admin" })).status, 400);
  assert.equal((await request("/accounts/2/status", "PATCH", { status: "locked", password: "forbidden" })).status, 400);
});
check("mutations require CSRF and Admin cannot lock self", async ({ request }) => {
  assert.equal((await request("/accounts/2/status", "PATCH", { status: "locked" }, 1n, { "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await request("/accounts/1/status", "PATCH", { status: "locked" })).status, 403);
});
check("lock and unlock revoke Resident sessions; lock denies login", async (h) => {
  const oldHash = hashSessionToken(h.tokens.get(2n)!, h.config.sessionSecret);
  assert.ok(await h.sessions.get(oldHash)); assert.equal((await h.request("/accounts/2/status", "PATCH", { status: "locked" })).status, 200); assert.equal(await h.sessions.get(oldHash), null);
  assert.equal((await h.request("/auth/me", "GET", undefined, 2n)).status, 401);
  assert.equal((await h.request("/auth/login", "POST", { login: "resident@example.test", password: h.password }, null)).status, 401);
  assert.equal((await h.request("/accounts/2/status", "PATCH", { status: "active" })).status, 200); assert.equal((await h.request("/auth/me", "GET", undefined, 2n)).status, 401);
});
check("unavailable provider creates no invitation and changes no existing invitation", async (h) => {
  const before = JSON.stringify([...h.invitations], (_k, v: unknown) => typeof v === "bigint" ? v.toString() : v);
  for (const path of ["/residents/22/account-invitations", "/accounts/2/password-reset"]) { const result = await h.request(path, "POST", {}); assert.equal(result.status, 503); assert.equal(result.body.error.code, "ACCOUNT_DELIVERY_UNAVAILABLE"); }
  assert.equal(JSON.stringify([...h.invitations], (_k, v: unknown) => typeof v === "bigint" ? v.toString() : v), before);
});
check("invitation history derives expiry without overwriting accepted/terminal states", async ({ request }) => {
  const result = await request("/residents/22/account-invitations"); assert.deepEqual(result.body.data.map((r: { status: string }) => r.status), ["pending", "expired", "accepted"]);
  assert.equal((await request("/account-invitations/2/revoke", "POST", {})).status, 409);
  assert.equal((await request("/account-invitations/3/revoke", "POST", {})).status, 409);
});
check("revoke is idempotent, concurrent-safe in port and cannot affect foreign invitation", async ({ request, invitations, effects }) => {
  const results = await Promise.all([request("/account-invitations/1/revoke", "POST", {}), request("/account-invitations/1/revoke", "POST", {})]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]); assert.equal(invitations.get(1n)?.status, "revoked"); assert.equal(effects.revocations, 1);
  assert.equal((await request("/account-invitations/4/revoke", "POST", {})).status, 404);
  assert.equal((await request("/residents/24/account-invitations")).status, 404);
});
check("session-store failure fails mutation rather than returning success", async (h) => {
  const broken: SessionStore = { set: h.sessions.set.bind(h.sessions), get: h.sessions.get.bind(h.sessions), touch: h.sessions.touch.bind(h.sessions), revoke: h.sessions.revoke.bind(h.sessions), revokeAccount: async () => { throw new Error("test infrastructure unavailable"); } };
  const service = new AccountManagementService(h.repository, broken);
  await assert.rejects(() => service.setStatus(11n, 2n, "locked")); assert.equal(h.accounts[1].status, "active");
});
check("V1 login → session → Accounts read works on mock auth/data ports", async ({ request, password }) => {
  const result = await request("/auth/login", "POST", { login: "admin@example.test", password }, null);
  assert.equal(result.status, 200); assert.match(result.headers.get("set-cookie") ?? "", /gt_session=/);
  const cookie = result.headers.get("set-cookie")!.match(/gt_session=[^;]+/)![0];
  assert.equal((await request("/accounts/2", "GET", undefined, null, { Cookie: cookie })).status, 200);
  const me = await request("/auth/me", "GET", undefined, null, { Cookie: cookie });
  assert.equal(me.status, 200); assert.equal(me.body.data.account.role, "admin"); assert.equal(me.body.data.profile.owner_id, "11");
});

check("revoke validates missing, empty and malformed keys before mutation", async ({ request, invitations, effects }) => {
  for (const key of [undefined, "", "   ", "has space", "x".repeat(129), "é"]) {
    const result = await request("/account-invitations/1/revoke", "POST", {}, 1n, { "Idempotency-Key": key });
    assert.equal(result.status, 400); assert.equal(result.body.error.code, "VALIDATION_ERROR");
    assert.equal(invitations.get(1n)?.status, "pending"); assert.equal(effects.revocations, 0);
  }
});
check("valid revoke and same-key retry have exactly one state transition", async ({ request, effects, invitations }) => {
  const first = await request("/account-invitations/1/revoke", "POST", {}, 1n, { "Idempotency-Key": "revoke-operation-1" });
  const retry = await request("/account-invitations/1/revoke", "POST", {}, 1n, { "Idempotency-Key": "revoke-operation-1" });
  assert.equal(first.status, 200); assert.equal(retry.status, 200); assert.deepEqual(retry.body.data, first.body.data);
  assert.equal(invitations.get(1n)?.status, "revoked"); assert.equal(effects.revocations, 1);
});
check("revoke authorization and CSRF precede key validation and preserve data", async ({ request, effects }) => {
  assert.equal((await request("/account-invitations/1/revoke", "POST", {}, null, { "Idempotency-Key": undefined })).status, 401);
  assert.equal((await request("/account-invitations/1/revoke", "POST", {}, 2n, { "Idempotency-Key": undefined })).status, 403);
  assert.equal((await request("/account-invitations/1/revoke", "POST", {}, 1n, { "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await request("/account-invitations/4/revoke", "POST", {})).status, 404);
  assert.equal(effects.revocations, 0);
});
