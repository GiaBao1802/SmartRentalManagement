import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthRepository } from "../auth/account-repository.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { createSessionRecord } from "../middleware/auth.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { loadEnv } from "../config/env.js";
import { createV1Router } from "../auth/v1.router.js";
import { PrismaInvoiceRepository } from "../invoices/invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "../invoices/invoice-itemized.pricing.js";
import { PrismaBillingWorkspaceRepository } from "../invoices/billing-workspace.repository.js";
import { InvoiceZaloService } from "../zalo/invoice-zalo.service.js";
import { UnconfiguredZaloProvider } from "../zalo/zalo-provider.js";
import { PrismaPropertyServiceRepository } from "./property-service.repository.js";

const databaseUrl = process.env.GOCTRO_SERVICE_PASS3_REHEARSAL_DATABASE_URL;
test("PostgreSQL V1.8 Fixed/Flexible Service API and itemized Invoice lifecycle", { skip: !databaseUrl }, async () => {
  const target = new URL(databaseUrl!);
  assert.equal(target.hostname, "127.0.0.1", "integration only accepts a loopback rehearsal");
  assert.equal(target.port, "55440", "integration only accepts the dedicated Pass 3 cluster");
  assert.equal(target.pathname, "/goctro_service_pass3_20261014", "integration refuses other databases");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const authRepository = new PrismaAuthRepository(prisma);
  const sessions = new InMemorySessionStore();
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl!, FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "service-pass3-postgres-test-secret-with-32-bytes" });
  const invoiceRepository = new PrismaInvoiceRepository(prisma);
  const pricing = new PrismaItemizedInvoicePricing();
  const serviceRepository = new PrismaPropertyServiceRepository(prisma);
  const servers: Server[] = [];
  let invoiceId: bigint | null = null;
  let rollbackInvoiceId: bigint | null = null;
  let rollbackChargeId: bigint | null = null;
  let outOfPeriodChargeId: bigint | null = null;
  const listen = async (invoicePricing: any) => {
    const app = express(); app.use(requestIdMiddleware); app.use(express.json());
    app.use("/api/v1", createV1Router({ config, repository: authRepository, sessions, propertyServiceRepository: serviceRepository, invoiceRepository, invoicePricing, billingWorkspaceRepository: new PrismaBillingWorkspaceRepository(prisma, invoicePricing), invoiceZalo: new InvoiceZaloService(invoiceRepository, new UnconfiguredZaloProvider()) } as any));
    app.use(errorHandler);
    const server = createServer(app); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string"); return `http://127.0.0.1:${address.port}`;
  };
  const admin = await authRepository.findCurrentAccount(1n);
  assert.ok(admin && admin.role === "admin" && admin.ownerId === 1n && admin.status === "active");
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(1n, hashSessionToken(token, config.sessionSecret), config));
  const headers = (unsafe = false, extra: Record<string, string> = {}) => ({ Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: config.frontendOrigin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}), ...extra });
  const send = async (base: string, path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: headers(method !== "GET", extra), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { response, body: response.status === 204 ? null : await response.json() as any };
  };
  try {
    const identity = await prisma.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.deepEqual(identity, [{ db: "goctro_service_pass3_20261014", port: 55440 }]);
    const contract = await prisma.contract.findFirstOrThrow({ where: { contractId: 3001n, ownerId: 1n } });
    const base = await listen(pricing);
    const fixedItem = await send(base, "/api/v1/properties/11/pricing-items", "POST", { kind: "FIXED_SERVICE", code: "P3-WIFI", name: "Pass 3 WiFi", unit: "phòng/kỳ" });
    assert.equal(fixedItem.response.status, 201, JSON.stringify(fixedItem.body));
    const fixedId = BigInt(fixedItem.body.data.pricing_item_id);
    const fixedPrice1 = await send(base, `/api/v1/properties/11/pricing-items/${fixedId}/price-versions?kind=FIXED_SERVICE`, "POST", { effective_from: "2026-10-01", unit_price: "45000", source_name: "Pass 3 test" });
    assert.equal(fixedPrice1.response.status, 201, JSON.stringify(fixedPrice1.body));
    const duplicateDate = await send(base, `/api/v1/properties/11/pricing-items/${fixedId}/price-versions?kind=FIXED_SERVICE`, "POST", { effective_from: "2026-10-01", unit_price: "46000" });
    assert.equal(duplicateDate.response.status, 409);

    const flexibleItem = await send(base, "/api/v1/properties/11/pricing-items", "POST", { kind: "FLEXIBLE_SERVICE", code: "P3-CARE", name: "Pass 3 Room Care", unit: "lần" });
    assert.equal(flexibleItem.response.status, 201, JSON.stringify(flexibleItem.body));
    const flexibleId = BigInt(flexibleItem.body.data.pricing_item_id);
    const flexPrice1 = await send(base, `/api/v1/properties/11/pricing-items/${flexibleId}/price-versions?kind=FLEXIBLE_SERVICE`, "POST", { effective_from: "2026-11-01", unit_price: "150000" });
    assert.equal(flexPrice1.response.status, 201, JSON.stringify(flexPrice1.body));
    const chargeResult = await send(base, "/api/v1/properties/11/flexible-service-charges", "POST", { room_id: "101", contract_id: "3001", resident_id: "1001", pricing_item_id: flexibleId.toString(), quantity: "2", occurred_at: "2026-11-20T10:00:00+07:00" }, { "Idempotency-Key": "pass3-care-charge-001" });
    assert.equal(chargeResult.response.status, 201, JSON.stringify(chargeResult.body));
    const chargeId = BigInt(chargeResult.body.data.flexible_service_charge_id);
    assert.equal(chargeResult.body.data.amount, "300000");
    assert.equal(chargeResult.body.data.status, "READY");
    const replay = await send(base, "/api/v1/properties/11/flexible-service-charges", "POST", { room_id: "101", contract_id: "3001", resident_id: "1001", pricing_item_id: flexibleId.toString(), quantity: "2", occurred_at: "2026-11-20T10:00:00+07:00" }, { "Idempotency-Key": "pass3-care-charge-001" });
    assert.equal(replay.response.status, 200); assert.equal(replay.body.meta.replayed, true); assert.equal(replay.body.data.flexible_service_charge_id, chargeId.toString());
    const reusedKey = await send(base, "/api/v1/properties/11/flexible-service-charges", "POST", { room_id: "101", contract_id: "3001", resident_id: "1001", pricing_item_id: flexibleId.toString(), quantity: "3", occurred_at: "2026-11-20T10:00:00+07:00" }, { "Idempotency-Key": "pass3-care-charge-001" });
    assert.equal(reusedKey.response.status, 409);
    const foreign = await send(base, "/api/v1/properties/21/pricing-items"); assert.equal(foreign.response.status, 404);

    const fixedPrice2 = await send(base, `/api/v1/properties/11/pricing-items/${fixedId}/price-versions?kind=FIXED_SERVICE`, "POST", { effective_from: "2026-12-01", unit_price: "75000" });
    assert.equal(fixedPrice2.response.status, 201, JSON.stringify(fixedPrice2.body));
    const flexPrice2 = await send(base, `/api/v1/properties/11/pricing-items/${flexibleId}/price-versions?kind=FLEXIBLE_SERVICE`, "POST", { effective_from: "2026-12-01", unit_price: "200000" });
    assert.equal(flexPrice2.response.status, 201, JSON.stringify(flexPrice2.body));
    const immutableVersionId = BigInt(flexPrice1.body.data.price_version_id);
    await assert.rejects(() => prisma.propertyPriceVersion.update({ where: { propertyPriceVersionId: immutableVersionId }, data: { unitPrice: 175000n } }), "published price history is immutable in the locked schema");
    const outOfPeriod = await serviceRepository.createCharge(1n, 11n, 1n, { roomId: 101n, contractId: 3001n, residentId: 1001n, itemId: flexibleId, quantity: "1", occurredAt: new Date("2026-12-20T10:00:00+07:00"), sourceEventKey: "pass3-care-out-of-period" });
    outOfPeriodChargeId = outOfPeriod!.charge.flexibleServiceChargeId;
    assert.equal(outOfPeriod!.charge.unitPriceSnapshot, 200000n, "December event selects the December price version");
    const fixedHistory = await serviceRepository.listItems(1n, 11n, "FIXED_SERVICE");
    const fixedRecord = fixedHistory?.items.find((row) => row.propertyPricingItemId === fixedId); assert.ok(fixedRecord);
    assert.deepEqual(fixedRecord.priceVersions.map((version) => [version.versionNo, version.unitPrice]), [[2, 75000n], [1, 45000n]]);
    const charge = await prisma.flexibleServiceCharge.findUniqueOrThrow({ where: { flexibleServiceChargeId: chargeId } });
    assert.equal(charge.unitPriceSnapshot, 150000n, "event retains the price effective on its Vietnam business date after a later price is published");
    assert.equal(charge.amount, 300000n);

    const invoice = await prisma.invoice.create({ data: {
      invoiceNo: "PASS3-SERVICE-ITEMIZED", contractId: contract.contractId, propertyId: contract.propertyId, ownerId: 1n,
      periodStart: new Date("2026-11-15T00:00:00Z"), periodEnd: new Date("2026-12-14T00:00:00Z"), rentAmount: contract.rentAmount, electricityPreviousKwh: "1450.000", waterPreviousM3: "81.000",
      electricityCurrentKwh: "1460.000", waterCurrentM3: "82.000", totalAmount: contract.rentAmount, status: "draft", revision: 1, snapshotKind: "NOT_FINALIZED",
    } }); invoiceId = invoice.invoiceId;
    const contractWithRoom = await prisma.contract.findUniqueOrThrow({ where: { contractId: contract.contractId }, include: { room: { include: { property: true } } } });
    const plan = await pricing.calculate(invoice, contractWithRoom as any, prisma); assert.ok(plan);
    const fixedLine = plan.items.find((row) => row.category === "FIXED_SERVICE" && row.labelSnapshot === "Pass 3 WiFi");
    const flexLine = plan.items.find((row) => row.category === "FLEXIBLE_SERVICE" && row.flexibleServiceChargeId === chargeId);
    assert.ok(fixedLine); assert.equal(fixedLine.amount, 45000n, "Invoice selects Fixed price effective at period_start, before the Dec 1 version");
    assert.ok(flexLine); assert.equal(flexLine.amount, 300000n, "Flexible Invoice line uses the stored amount and version selected on occurred_at");
    assert.equal(plan.items.some((row) => row.flexibleServiceChargeId === outOfPeriodChargeId), false, "charge on Dec 20 is outside the Nov 15-Dec 14 Invoice period");

    const finalized = await send(base, `/api/v1/invoices/${invoice.invoiceId}/finalize`, "POST", {}, { "Idempotency-Key": "pass3-service-finalize-001" });
    assert.equal(finalized.response.status, 200, JSON.stringify(finalized.body));
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: invoice.invoiceId }, include: { invoiceItems: true } });
    assert.equal(stored.status, "unpaid"); assert.equal(stored.snapshotKind, "ITEMIZED");
    assert.equal(stored.totalAmount, stored.invoiceItems.reduce((sum, row) => sum + row.amount, 0n));
    assert.equal(stored.invoiceItems.find((row) => row.labelSnapshot === "Pass 3 WiFi")?.amount, 45000n);
    assert.equal(stored.invoiceItems.find((row) => row.flexibleServiceChargeId === chargeId)?.amount, 300000n);
    const consumed = await prisma.flexibleServiceCharge.findUniqueOrThrow({ where: { flexibleServiceChargeId: chargeId } }); assert.equal(consumed.status, "INVOICED"); assert.equal(consumed.invoiceId, invoice.invoiceId);
    const outOfPeriodAfterFinalize = await prisma.flexibleServiceCharge.findUniqueOrThrow({ where: { flexibleServiceChargeId: outOfPeriodChargeId } }); assert.equal(outOfPeriodAfterFinalize.status, "READY"); assert.equal(outOfPeriodAfterFinalize.invoiceId, null);
    const immutableBefore = { total: stored.totalAmount, items: stored.invoiceItems.map((row) => [row.itemKey, row.amount, row.labelSnapshot]) };
    const reread = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: invoice.invoiceId }, include: { invoiceItems: true } });
    assert.deepEqual({ total: reread.totalAmount, items: reread.invoiceItems.map((row) => [row.itemKey, row.amount, row.labelSnapshot]) }, immutableBefore);

    const fixedPriceAfterFinalize = await send(base, `/api/v1/properties/11/pricing-items/${fixedId}/price-versions?kind=FIXED_SERVICE`, "POST", { effective_from: "2027-01-01", unit_price: "95000" });
    assert.equal(fixedPriceAfterFinalize.response.status, 201, JSON.stringify(fixedPriceAfterFinalize.body));
    const flexPriceAfterFinalize = await send(base, `/api/v1/properties/11/pricing-items/${flexibleId}/price-versions?kind=FLEXIBLE_SERVICE`, "POST", { effective_from: "2027-01-01", unit_price: "250000" });
    assert.equal(flexPriceAfterFinalize.response.status, 201, JSON.stringify(flexPriceAfterFinalize.body));
    const rereadAfterPriceChanges = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: invoice.invoiceId }, include: { invoiceItems: true } });
    assert.deepEqual({ total: rereadAfterPriceChanges.totalAmount, items: rereadAfterPriceChanges.invoiceItems.map((row) => [row.itemKey, row.amount, row.labelSnapshot]) }, immutableBefore, "publishing newer Fixed and Flexible prices cannot rewrite a finalized Invoice snapshot");

    const rollbackEvent = await serviceRepository.createCharge(1n, 11n, 1n, { roomId: 101n, contractId: 3001n, residentId: 1001n, itemId: flexibleId, quantity: "1", occurredAt: new Date("2026-12-20T10:00:00+07:00"), sourceEventKey: "pass3-care-charge-rollback" });
    rollbackChargeId = rollbackEvent!.charge.flexibleServiceChargeId;
    assert.equal(rollbackEvent!.charge.unitPriceSnapshot, 200000n, "December event selects the later effective price");
    const nextInvoice = await prisma.invoice.create({ data: {
      invoiceNo: "PASS3-SERVICE-ROLLBACK", contractId: contract.contractId, propertyId: contract.propertyId, ownerId: 1n,
      periodStart: new Date("2026-12-15T00:00:00Z"), periodEnd: new Date("2027-01-14T00:00:00Z"), rentAmount: contract.rentAmount, electricityPreviousKwh: "1460.000", waterPreviousM3: "82.000",
      electricityCurrentKwh: "1470.000", waterCurrentM3: "83.000", totalAmount: contract.rentAmount, status: "draft", revision: 1, snapshotKind: "NOT_FINALIZED",
    } }); rollbackInvoiceId = nextInvoice.invoiceId;
    const injectedPricing = { calculate: async (value: any, linkedContract: any, tx: any) => { const result = await pricing.calculate(value, linkedContract, tx); const line = result?.items.find((row: any) => row.category === "FLEXIBLE_SERVICE"); if (line) line.propertyPriceVersionId = 999999999n; return result; }, inspect: (...args: any[]) => (pricing.inspect as any)(...args) };
    const rollbackBase = await listen(injectedPricing);
    const failed = await send(rollbackBase, `/api/v1/invoices/${nextInvoice.invoiceId}/finalize`, "POST", {}, { "Idempotency-Key": "pass3-service-finalize-rollback" });
    assert.equal(failed.response.status, 500, "database item constraint forces a failure after charge consumption is attempted");
    const rollbackState = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: nextInvoice.invoiceId } }); assert.equal(rollbackState.status, "draft"); assert.equal(rollbackState.snapshotKind, "NOT_FINALIZED");
    const readyAgain = await prisma.flexibleServiceCharge.findUniqueOrThrow({ where: { flexibleServiceChargeId: rollbackChargeId } }); assert.equal(readyAgain.status, "READY"); assert.equal(readyAgain.invoiceId, null);

    const retired = await send(base, `/api/v1/properties/11/pricing-items/${fixedId}/retire?kind=FIXED_SERVICE`, "POST", {}); assert.equal(retired.response.status, 200); assert.equal(retired.body.data.status, "retired");
    const stillFixed = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: invoice.invoiceId, category: "FIXED_SERVICE", labelSnapshot: "Pass 3 WiFi" } }); assert.equal(stillFixed.amount, 45000n, "retiring catalog does not rewrite prior finalized Invoice snapshot");
  } finally {
    for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
    // Financial snapshots are intentionally not deleted by test cleanup. The enclosing disposable database is dropped after validation.
    await prisma.$disconnect();
  }
});
