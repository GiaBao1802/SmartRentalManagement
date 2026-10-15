import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import { Prisma } from "@prisma/client";
import type { RuntimeConfig } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createV1Router } from "../auth/v1.router.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "invoice-test-session-secret-with-32-bytes" });
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
const calls: Array<{ name: string; args: any[] }> = [];
const invoice = {
  invoiceId: 501n, invoiceNo: "INV-77-20261015", contractId: 77n, propertyId: 4n, ownerId: 101n,
  periodStart: new Date("2026-10-15T00:00:00Z"), periodEnd: new Date("2026-11-14T00:00:00Z"), status: "draft", revision: 1,
  rentAmount: 3_500_000n, electricityPreviousKwh: "100.000", electricityCurrentKwh: null, electricityAmount: 0n,
  waterPreviousM3: "20.000", waterCurrentM3: null, waterAmount: 0n, serviceAmount: 0n, totalAmount: 3_500_000n,
  finalizedAt: null, dueDate: null, createdAt: new Date("2026-10-15T00:00:00Z"), updatedAt: new Date("2026-10-15T00:00:00Z"),
  isOverdue: false, amountProvisional: true, paymentSummary: { attemptCount: 0, successfulAmount: 0n, latestStatus: null },
  contract: { contractId: 77n, contractNo: "HD-77", roomId: 8n, propertyId: 4n, representativeResidentId: 201n, roomCode: "A01", property: { propertyId: 4n, name: "A", province: "HCM", address: "address" } },
};
const repository: any = {
  async list(...args: any[]) { calls.push({ name: "list", args }); return { rows: [invoice], total: 1 }; },
  async findForOwner(...args: any[]) { calls.push({ name: "findForOwner", args }); return invoice; },
  async findForResident(...args: any[]) { calls.push({ name: "findForResident", args }); return invoice; },
  async createDraft(...args: any[]) { calls.push({ name: "createDraft", args }); return invoice; },
  async ensureNextDraft(...args: any[]) { calls.push({ name: "ensureNextDraft", args }); return invoice; },
  async patchDraft(...args: any[]) { calls.push({ name: "patchDraft", args }); return invoice; },
  async finalize(...args: any[]) { calls.push({ name: "finalize", args }); return { ...invoice, status: "unpaid", finalizedAt: new Date(), dueDate: new Date("2026-10-20T00:00:00Z"), isOverdue: false, amountProvisional: false }; },
  async listSendLogs(...args: any[]) { calls.push({ name: "listSendLogs", args }); return [{ sendLogId: 1n, invoiceId: 501n, invoiceRevision: 1, status: "queued", providerMessageId: null, createdAt: new Date() }]; },
};
const billingWorkspaceRepository: any = {
  async list(...args: any[]) {
    calls.push({ name: "workspace", args });
    return { data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 }, summary: {} };
  },
};
const pricing = { calculate: async () => null };
const zalo = { async send(...args: any[]) { calls.push({ name: "sendZalo", args }); return { sendLogId: 1n, invoiceId: 501n, invoiceRevision: 1, status: "queued", createdAt: new Date() }; } };
let server: Server; let baseUrl = "";
const cookies = new Map<string, string>();
async function install(account: LoginAccountRecord) {
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  cookies.set(account.role, `${token}|${csrf}`);
}
function headers(role: "admin" | "resident", unsafe = false, extra: Record<string, string> = {}) {
  const [token, csrf] = cookies.get(role)!.split("|");
  return { Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}), ...extra };
}
async function call(path: string, role: "admin" | "resident", options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: options.method ?? "GET", headers: headers(role, options.method !== undefined && options.method !== "GET", options.headers), ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  return { response, body: await response.json() };
}
before(async () => {
  await install(admin); await install(resident);
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, invoiceRepository: repository, billingWorkspaceRepository, invoicePricing: pricing, invoiceZalo: zalo } as any)); app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Admin invoice list passes Owner scope, supported filters and shared paging", async () => {
  calls.length = 0;
  const result = await call("/api/v1/invoices?status=unpaid&property_id=4&page=2&page_size=25", "admin");
  assert.equal(result.response.status, 200); assert.equal(result.body.meta.page, 2); assert.equal(result.body.data[0].amount_provisional, true);
  assert.equal(calls[0]!.args[0], 101n); assert.equal(calls[0]!.args[1].propertyId, 4n);
});

test("Billing workspace is Admin-only and derives Owner scope from the authenticated session", async () => {
  calls.length = 0;
  const result = await call("/api/v1/billing/workspace?property_id=4&page=2&page_size=25", "admin");
  assert.equal(result.response.status, 200);
  assert.equal(calls[0]!.name, "workspace");
  assert.equal(calls[0]!.args[0], 101n);
  assert.deepEqual(calls[0]!.args[1], {
    page: 2, pageSize: 25, propertyId: 4n, roomId: undefined, residentId: undefined,
    invoiceStatus: undefined, periodStart: undefined, periodEnd: undefined, state: undefined,
  });

  calls.length = 0;
  const residentResult = await call("/api/v1/billing/workspace", "resident");
  assert.equal(residentResult.response.status, 403);
  assert.equal(calls.length, 0);
});

test("Admin can filter invoice list by resident_id while Resident cannot set it", async () => {
  calls.length = 0;
  const adminResult = await call("/api/v1/invoices?resident_id=201", "admin");
  assert.equal(adminResult.response.status, 200);
  assert.equal(calls[0]!.args[0], 101n);
  assert.equal(calls[0]!.args[1].residentId, 201n);

  calls.length = 0;
  const residentResult = await call("/api/v1/invoices?resident_id=201", "resident");
  assert.equal(residentResult.response.status, 400);
  assert.equal(residentResult.body.error.code, "VALIDATION_ERROR");
  assert.equal(calls.length, 0);
});

test("Resident list derives own identity from session and rejects Resident role from Admin-only create", async () => {
  calls.length = 0;
  const list = await call("/api/v1/invoices?status=unpaid", "resident");
  assert.equal(list.response.status, 200); assert.equal(calls[0]!.args[0], 101n); assert.equal(calls[0]!.args[2], 201n);
  const create = await call("/api/v1/invoices", "resident", { method: "POST", headers: { "Idempotency-Key": "create" }, body: {} });
  assert.equal(create.response.status, 403);
});

test("POST draft requires idempotency, rejects client amount/status and derives Owner", async () => {
  calls.length = 0;
  const missingKey = await call("/api/v1/invoices", "admin", { method: "POST", body: { contract_id: "77", period_start: "2026-10-15", period_end: "2026-11-14" } });
  assert.equal(missingKey.response.status, 400); assert.equal(calls.length, 0);
  const rejected = await call("/api/v1/invoices", "admin", { method: "POST", headers: { "Idempotency-Key": "create-1" }, body: { contract_id: "77", period_start: "2026-10-15", period_end: "2026-11-14", total_amount: "1" } });
  assert.equal(rejected.response.status, 400); assert.equal(calls.length, 0);
  const created = await call("/api/v1/invoices", "admin", { method: "POST", headers: { "Idempotency-Key": "create-2" }, body: { contract_id: "77", period_start: "2026-10-15", period_end: "2026-11-14" } });
  assert.equal(created.response.status, 201); assert.equal(calls.at(-1)!.args[0], 101n);
});

test("generate endpoint accepts no client period or authority fields", async () => {
  calls.length = 0;
  const denied = await call("/api/v1/contracts/77/invoices/generate", "admin", { method: "POST", headers: { "Idempotency-Key": "gen" }, body: { period_start: "2026-10-01" } });
  assert.equal(denied.response.status, 400); assert.equal(calls.length, 0);
  const result = await call("/api/v1/contracts/77/invoices/generate", "admin", { method: "POST", headers: { "Idempotency-Key": "gen-2" } });
  assert.equal(result.response.status, 200); assert.equal(calls.at(-1)!.name, "ensureNextDraft");
});

test("Invoice detail is Resident-self scoped and returns foreign/missing as 404", async () => {
  calls.length = 0;
  const result = await call("/api/v1/invoices/501", "resident");
  assert.equal(result.response.status, 200); assert.equal(calls[0]!.name, "findForResident"); assert.equal(calls[0]!.args[1], 201n);
  const prior = repository.findForResident; repository.findForResident = async () => null;
  try { const missing = await call("/api/v1/invoices/999", "resident"); assert.equal(missing.response.status, 404); assert.equal(missing.body.error.code, "NOT_FOUND"); }
  finally { repository.findForResident = prior; }
});

test("Admin ITEMIZED detail returns snapshot lines and Electricity tiers while omitting internal source data", async () => {
  const prior = repository.findForOwner;
  repository.findForOwner = async (...args: any[]) => {
    calls.push({ name: "findForOwner", args });
    return {
      ...invoice, snapshotKind: "ITEMIZED", status: "unpaid", amountProvisional: false,
      invoiceItems: [
        { invoiceItemId: 1n, category: "RENT", itemKey: "rent", sourceReference: "secret-source", labelSnapshot: "Tiền phòng", descriptionSnapshot: null, quantity: "1.000", unit: "kỳ", unitPriceSnapshot: 3_500_000n, amount: 3_500_000n, electricityTiers: [] },
        { invoiceItemId: 2n, category: "ELECTRICITY", itemKey: "electricity", sourceReference: "secret-tariff", labelSnapshot: "Điện", descriptionSnapshot: "Điện năng", quantity: "50.000", unit: "kWh", unitPriceSnapshot: null, amount: 125_000n, electricityTiers: [
          { tierNo: 1, lowerKwh: "0.000", upperKwh: "50.000", quantity: "50.000", unitPriceSnapshot: 2_500n, amount: 125_000n },
        ] },
        ...["WATER", "FIXED_SERVICE", "FLEXIBLE_SERVICE", "PARKING"].map((category, index) => ({ invoiceItemId: BigInt(index + 3), category, itemKey: category.toLowerCase(), labelSnapshot: category, descriptionSnapshot: null, quantity: "1.000", unit: "lần", unitPriceSnapshot: 10n, amount: 10n, sourceReference: "private", electricityTiers: [] })),
      ],
    };
  };
  try {
    calls.length = 0;
    const result = await call("/api/v1/invoices/501", "admin");
    assert.equal(result.response.status, 200);
    assert.equal(calls[0]!.args[0], 101n, "query remains scoped by authenticated Owner");
    assert.equal(result.body.data.itemization_available, true);
    assert.deepEqual(result.body.data.invoice_items.map((item: any) => item.category), ["RENT", "ELECTRICITY", "WATER", "FIXED_SERVICE", "FLEXIBLE_SERVICE", "PARKING"]);
    assert.equal(result.body.data.invoice_items[1].amount, "125000");
    assert.deepEqual(result.body.data.invoice_items[1].electricity_tiers, [{ tier_no: 1, lower_kwh: "0.000", upper_kwh: "50.000", quantity: "50.000", unit_price: "2500", amount: "125000" }]);
    assert.equal("source_reference" in result.body.data.invoice_items[1], false);
  } finally { repository.findForOwner = prior; }
});

test("Admin legacy and draft detail return aggregate state without fabricated item rows", async () => {
  const prior = repository.findForOwner;
  try {
    for (const snapshotKind of ["LEGACY_AGGREGATE", "NOT_FINALIZED"]) {
      repository.findForOwner = async () => ({ ...invoice, snapshotKind, invoiceItems: [] });
      const result = await call("/api/v1/invoices/501", "admin");
      assert.equal(result.response.status, 200);
      assert.equal(result.body.data.itemization_available, false);
      assert.deepEqual(result.body.data.invoice_items, []);
      assert.equal(result.body.data.electricity_amount, "0");
    }
  } finally { repository.findForOwner = prior; }
});

test("Invoice detail still requires an authenticated session", async () => {
  const response = await fetch(`${baseUrl}/api/v1/invoices/501`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
});

test("draft PATCH accepts readings but never client totals or lifecycle state", async () => {
  calls.length = 0;
  const bad = await call("/api/v1/invoices/501", "admin", { method: "PATCH", body: { total_amount: "5" } });
  assert.equal(bad.response.status, 400); assert.equal(calls.length, 0);
  const good = await call("/api/v1/invoices/501", "admin", { method: "PATCH", body: { electricity_current_kwh: 120.5 } });
  assert.equal(good.response.status, 200); assert.equal(calls[0]!.name, "patchDraft");
});

test("finalize is Admin-only, requires Idempotency-Key and starts Zalo only after finalize returns", async () => {
  calls.length = 0;
  const result = await call("/api/v1/invoices/501/finalize", "admin", { method: "POST", headers: { "Idempotency-Key": "finalize-1" }, body: { electricity_current_kwh: 120, water_current_m3: 21 } });
  assert.equal(result.response.status, 200);
  assert.deepEqual(calls.map((entry) => entry.name), ["finalize", "sendZalo"]);
  const residentAttempt = await call("/api/v1/invoices/501/finalize", "resident", { method: "POST", headers: { "Idempotency-Key": "finalize-2" }, body: {} });
  assert.equal(residentAttempt.response.status, 403);
});

test("finalize maps period uniqueness separately from duplicate item source conflicts", async () => {
  const priorFinalize = repository.finalize;
  try {
    repository.finalize = async () => { throw new Prisma.PrismaClientKnownRequestError("unique conflict", { code: "P2002", clientVersion: "test", meta: { target: "invoice_items_invoice_parking_assignment_unique" } }); };
    const duplicateParking = await call("/api/v1/invoices/501/finalize", "admin", { method: "POST", headers: { "Idempotency-Key": "duplicate-parking" }, body: {} });
    assert.equal(duplicateParking.response.status, 409);
    assert.equal(duplicateParking.body.error.code, "CONFLICT");
    assert.doesNotMatch(JSON.stringify(duplicateParking.body), /invoice_items_invoice_parking_assignment_unique|unique conflict/i);

    repository.finalize = async () => { throw new Prisma.PrismaClientKnownRequestError("period conflict", { code: "P2002", clientVersion: "test", meta: { target: ["contract_id", "period_start", "period_end"] } }); };
    const duplicatePeriod = await call("/api/v1/invoices/501/finalize", "admin", { method: "POST", headers: { "Idempotency-Key": "duplicate-period" }, body: {} });
    assert.equal(duplicatePeriod.response.status, 409);
    assert.equal(duplicatePeriod.body.error.code, "INVOICE_PERIOD_CONFLICT");
  } finally { repository.finalize = priorFinalize; }
});

test("send-zalo rejects client recipient and status commands; logs expose safe history", async () => {
  calls.length = 0;
  const bad = await call("/api/v1/invoices/501/send-zalo", "admin", { method: "POST", headers: { "Idempotency-Key": "zalo-1" }, body: { resident_id: "201", phone: "0900" } });
  assert.equal(bad.response.status, 400); assert.equal(calls.length, 0);
  const result = await call("/api/v1/invoices/501/send-zalo", "admin", { method: "POST", headers: { "Idempotency-Key": "zalo-2" } });
  assert.equal(result.response.status, 202); assert.equal(result.body.data.status, "queued");
  const logs = await call("/api/v1/invoices/501/zalo-send-logs", "resident");
  assert.equal(logs.response.status, 200); assert.equal(logs.body.data[0].invoice_revision, 1); assert.equal(calls.at(-1)!.args[2], 201n);
});
