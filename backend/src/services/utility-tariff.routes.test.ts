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
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "utility-routes-test-secret-with-32-bytes" });
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
const scopes: bigint[] = [];
const writes: Array<{ ownerId: bigint; propertyId: bigint; actorId: bigint; input: unknown }> = [];
const utilityTariffRepository = {
  async listForProperty(ownerId: bigint, propertyId: bigint) { scopes.push(ownerId); return propertyId === 50n && ownerId === 101n ? { property: { propertyId, name: "Property A" }, tariffs: [] } : null; },
  async publishVersion(ownerId: bigint, propertyId: bigint, actorId: bigint, input: any) { scopes.push(ownerId); writes.push({ ownerId, propertyId, actorId, input }); return propertyId === 50n && ownerId === 101n ? { utilityTariffVersionId: 71n, effectiveFrom: input.effectiveFrom, publishedAt: new Date("2026-10-14T00:00:00Z"), flatUnitPrice: input.flatUnitPrice ?? null, tiers: (input.tiers ?? []).map((tier: any, index: number) => ({ electricityTariffTierId: BigInt(31 + index), tierNo: tier.tierNo, lowerKwh: tier.lowerKwh, upperKwh: tier.upperKwh, unitPrice: tier.unitPrice })), tariff: { utilityTariffId: 70n, utilityType: input.utilityType, code: "V1", name: "Biểu giá" } } : null; },
} as any;
let server: Server; let baseUrl = "";
const cookies = new Map<string, string>();
async function install(account: LoginAccountRecord) {
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  cookies.set(account.email ?? account.phone ?? String(account.accountId), `${token}|${csrf}`);
}
function headers(account: LoginAccountRecord, unsafe = false, extra: Record<string, string> = {}) {
  const [token, csrf] = cookies.get(account.email ?? account.phone ?? String(account.accountId))!.split("|");
  return { Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}), ...extra };
}
async function call(account: LoginAccountRecord, path: string, options: { method?: string; body?: unknown; extra?: Record<string, string> } = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(`${baseUrl}${path}`, { method, headers: headers(account, method !== "GET", options.extra), ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  return { response, body: await response.json() as any };
}
before(async () => {
  await Promise.all([install(admin), install(otherAdmin), install(resident)]);
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, utilityTariffRepository,
    // Keep the Invoice router mounted here to guard against its unsupported-path
    // fallback swallowing utility tariff routes.
    invoiceRepository: {} as any, billingWorkspaceRepository: {} as any,
    invoicePricing: {} as any, invoiceZalo: {} as any,
  })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Admin tariff list is scoped to the Owner from the session; foreign Property is hidden", async () => {
  scopes.length = 0;
  const own = await call(admin, "/api/v1/properties/50/utility-tariffs");
  assert.equal(own.response.status, 200); assert.equal(scopes.at(-1), 101n);
  const foreign = await call(otherAdmin, "/api/v1/properties/50/utility-tariffs");
  assert.equal(foreign.response.status, 404); assert.equal(scopes.at(-1), 202n);
});

test("Resident cannot read utility configuration", async () => {
  const result = await call(resident, "/api/v1/properties/50/utility-tariffs");
  assert.equal(result.response.status, 403);
});

test("Electricity version accepts a contiguous progressive tier set and derives authority from session", async () => {
  writes.length = 0;
  const result = await call(admin, "/api/v1/properties/50/utility-tariffs/electricity/versions", { method: "POST", body: {
    effective_from: "2026-11-01", source_name: "Nguồn công bố", source_reference: "REF-1",
    tiers: [
      { tier_no: 1, lower_kwh: "0", upper_kwh: "50", unit_price: "1984" },
      { tier_no: 2, lower_kwh: "50", upper_kwh: null, unit_price: "2050" },
    ],
  } });
  assert.equal(result.response.status, 201); assert.equal(result.body.data.utility_tariff_version_id, "71");
  assert.equal(writes[0]?.ownerId, 101n); assert.equal(writes[0]?.actorId, 11n);
  assert.equal((writes[0]?.input as any).tiers[1].upperKwh, null);
});

test("Water version accepts flat rate, rejects unsupported fields and gaps in Electricity tiers", async () => {
  writes.length = 0;
  const water = await call(admin, "/api/v1/properties/50/utility-tariffs/water/versions", { method: "POST", body: { effective_from: "2026-11-01", flat_unit_price: "15000" } });
  assert.equal(water.response.status, 201); assert.equal((writes[0]?.input as any).flatUnitPrice, 15000n);
  const extra = await call(admin, "/api/v1/properties/50/utility-tariffs/water/versions", { method: "POST", body: { effective_from: "2026-11-01", flat_unit_price: "15000", owner_id: "202" } });
  assert.equal(extra.response.status, 400);
  const gap = await call(admin, "/api/v1/properties/50/utility-tariffs/electricity/versions", { method: "POST", body: { effective_from: "2026-11-01", tiers: [
    { tier_no: 1, lower_kwh: "0", upper_kwh: "50", unit_price: "1984" },
    { tier_no: 2, lower_kwh: "51", upper_kwh: null, unit_price: "2050" },
  ] } });
  assert.equal(gap.response.status, 400); assert.equal(writes.length, 1);
});

test("tariff writes require CSRF and reject client-supplied tenant authority", async () => {
  const noCsrf = await fetch(`${baseUrl}/api/v1/properties/50/utility-tariffs/water/versions`, { method: "POST", headers: { Cookie: `gt_session=${cookies.get(String(admin.email))!.split("|")[0]}`, "Content-Type": "application/json" }, body: JSON.stringify({ effective_from: "2026-11-01", flat_unit_price: "15000" }) });
  assert.equal(noCsrf.status, 403);
  const authority = await call(admin, "/api/v1/properties/50/utility-tariffs/water/versions", { method: "POST", body: { effective_from: "2026-11-01", flat_unit_price: "15000" }, extra: { "X-Owner-Id": "202" } });
  assert.equal(authority.response.status, 400);
});
