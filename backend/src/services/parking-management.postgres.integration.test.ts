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
import { PrismaParkingBillingRepository } from "../invoices/parking-billing.repository.js";
import { resolveParkingBilling } from "../invoices/parking-billing.resolver.js";
import { InvoiceZaloService } from "../zalo/invoice-zalo.service.js";
import { UnconfiguredZaloProvider } from "../zalo/zalo-provider.js";
import { PrismaPropertyServiceRepository } from "./property-service.repository.js";
import { PrismaParkingManagementRepository } from "./parking-management.repository.js";

const databaseUrl = process.env.GOCTRO_PARKING_PASS4_REHEARSAL_DATABASE_URL;
test("PostgreSQL V1.8 Parking operations, entitlement and Billing integration", { skip: !databaseUrl }, async () => {
  const target = new URL(databaseUrl!);
  assert.equal(target.hostname, "127.0.0.1", "integration refuses non-loopback targets");
  assert.equal(target.port, "55441", "integration only accepts the dedicated disposable Pass 4 cluster");
  assert.equal(target.pathname, "/goctro_parking_pass4_20261015", "integration refuses non-Pass-4 rehearsal databases");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const authRepository = new PrismaAuthRepository(prisma); const sessions = new InMemorySessionStore();
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl!, FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "parking-pass4-postgres-test-secret-32-bytes" });
  const parkingRepo = new PrismaParkingManagementRepository(prisma); const serviceRepo = new PrismaPropertyServiceRepository(prisma);
  const invoiceRepo = new PrismaInvoiceRepository(prisma); const invoicePricing = new PrismaItemizedInvoicePricing();
  const servers: Server[] = [];
  const admin = await authRepository.findCurrentAccount(1n);
  assert.ok(admin && admin.role === "admin" && admin.ownerId === 1n && admin.status === "active");
  const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(1n, hashSessionToken(token, config.sessionSecret), config));
  const cookie = `gt_session=${token}; gt_csrf=${csrf}`;
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ config, repository: authRepository, sessions, parkingManagementRepository: parkingRepo, propertyServiceRepository: serviceRepo, invoiceRepository: invoiceRepo, invoicePricing, billingWorkspaceRepository: new PrismaBillingWorkspaceRepository(prisma, invoicePricing), invoiceZalo: new InvoiceZaloService(invoiceRepo, new UnconfiguredZaloProvider()) } as any)); app.use(errorHandler);
  const server = createServer(app); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const send = async (path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => { const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie, ...(method === "GET" ? {} : { Origin: config.frontendOrigin, "X-CSRF-Token": csrf, "Content-Type": "application/json" }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { response, body: await response.json() as any }; };
  try {
    const identity = await prisma.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.deepEqual(identity, [{ db: "goctro_parking_pass4_20261015", port: 55441 }]);

    // A: Area create/list. B: Slot create/list, availability and inactive state.
    const suffix = Date.now().toString(36).toUpperCase();
    const areaResponse = await send("/api/v1/properties/11/parking-areas", "POST", { name: `P4 Area ${suffix}`, location: "Tầng hầm B1" });
    assert.equal(areaResponse.response.status, 201, JSON.stringify(areaResponse.body)); const areaId = BigInt(areaResponse.body.data.parking_area_id);
    const areas = await send("/api/v1/properties/11/parking-areas"); assert.equal(areas.response.status, 200); assert.ok(areas.body.data.some((row: any) => row.parking_area_id === areaId.toString()));
    const slotAResponse = await send(`/api/v1/parking-areas/${areaId}/slots`, "POST", { slot_code: `P4-A-${suffix}` }); assert.equal(slotAResponse.response.status, 201, JSON.stringify(slotAResponse.body)); const slotA = BigInt(slotAResponse.body.data.parking_slot_id);
    const slotBResponse = await send(`/api/v1/parking-areas/${areaId}/slots`, "POST", { slot_code: `P4-B-${suffix}` }); assert.equal(slotBResponse.response.status, 201); const slotB = BigInt(slotBResponse.body.data.parking_slot_id);
    const slots = await send(`/api/v1/parking-areas/${areaId}/slots`); assert.equal(slots.response.status, 200); assert.equal(slots.body.data.length, 2);
    const inactiveSlot = await send(`/api/v1/parking-slots/${slotB}`, "PATCH", { status: "inactive" }); assert.equal(inactiveSlot.response.status, 200); assert.equal(inactiveSlot.body.data.status, "inactive");
    assert.equal((await send(`/api/v1/parking-slots/${slotB}`, "PATCH", { status: "active" })).response.status, 200);

    // C: Vehicle create/list using a resident actually occupying this Property.
    const vehicleOne = await send("/api/v1/properties/11/vehicles", "POST", { resident_id: "1001", vehicle_type: "Xe máy", plate_number: `P4-${suffix}-1` }); assert.equal(vehicleOne.response.status, 201, JSON.stringify(vehicleOne.body)); const vehicleId = BigInt(vehicleOne.body.data.vehicle_id);
    const vehicleTwo = await send("/api/v1/properties/11/vehicles", "POST", { resident_id: "1001", vehicle_type: "Xe máy", plate_number: `P4-${suffix}-2` }); assert.equal(vehicleTwo.response.status, 201); const vehicleTwoId = BigInt(vehicleTwo.body.data.vehicle_id);
    assert.ok((await send("/api/v1/properties/11/vehicles")).body.data.some((row: any) => row.vehicle_id === vehicleId.toString()));

    // H/M: use the established Property PARKING price authority; old versions append, never update.
    const oldPrice = await prisma.propertyPriceVersion.findFirstOrThrow({ where: { propertyPricingItemId: 11006n, effectiveFrom: new Date("2026-01-01T00:00:00Z") } }); assert.equal(oldPrice.unitPrice, 80000n);
    const newVersion = await send("/api/v1/properties/11/pricing-items/11006/price-versions?kind=PARKING", "POST", { effective_from: "2026-11-01", unit_price: "100000", reason: "Pass 4 recurring price test" }); assert.equal(newVersion.response.status, 201, JSON.stringify(newVersion.body));

    // D/E: create PAID assignment atomically with an explicit paid entitlement.
    // The V1.8 seed already fills Contract 3001's capacity (three active assignments).
    // End one seeded assignment through the Admin operation first; its finalized Invoice snapshot must remain immutable.
    const atCapacity = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotA.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleId.toString(), started_at: "2026-10-15", entitlement_type: "PAID_SLOT", billability: "PAID", pricing_item_id: "11006" });
    assert.equal(atCapacity.response.status, 409); assert.equal(atCapacity.body.error.message, "Số đăng ký gửi xe đã đạt sức chứa hợp đồng.");
    const releaseCapacity = await send("/api/v1/parking-assignments/8404/end", "POST", { ended_at: "2026-10-15" }); assert.equal(releaseCapacity.response.status, 200, JSON.stringify(releaseCapacity.body));
    const paidResponse = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotA.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleId.toString(), started_at: "2026-10-15", entitlement_type: "PAID_SLOT", billability: "PAID", pricing_item_id: "11006" });
    assert.equal(paidResponse.response.status, 201, JSON.stringify(paidResponse.body)); const assignmentId = BigInt(paidResponse.body.data.assignment_id); assert.equal(paidResponse.body.data.entitlement.billability, "PAID");
    // I/J: partial unique conflicts are reported in Vietnamese and do not write a second row.
    const slotConflict = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotA.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleTwoId.toString(), started_at: "2026-10-15", entitlement_type: "PAID_SLOT", billability: "PAID", pricing_item_id: "11006" });
    assert.equal(slotConflict.response.status, 409); assert.equal(slotConflict.body.error.message, "Slot này đang được sử dụng.");
    const vehicleConflict = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotB.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleId.toString(), started_at: "2026-10-15", entitlement_type: "PAID_SLOT", billability: "PAID", pricing_item_id: "11006" });
    assert.equal(vehicleConflict.response.status, 409); assert.equal(vehicleConflict.body.error.message, "Phương tiện này đã có đăng ký gửi xe đang hoạt động.");
    const assignmentRows = await send("/api/v1/properties/11/parking-assignments"); assert.equal(assignmentRows.response.status, 200); assert.ok(assignmentRows.body.data.some((row: any) => row.assignment_id === assignmentId.toString()));

    // L/M: same assignment resolves on two separate Invoice periods using each period-start price.
    const billingRepository = new PrismaParkingBillingRepository(prisma);
    const resolve = (periodStart: string) => resolveParkingBilling(billingRepository, { ownerId: 1n, propertyId: 11n, contractId: 3001n, roomId: 101n, periodStart: new Date(`${periodStart}T00:00:00.000Z`) });
    const october = await resolve("2026-10-15"); assert.equal(october.status, "RESOLVED"); if (october.status !== "RESOLVED") throw new Error("October Parking resolution failed");
    assert.equal(october.entitlements.find((row) => row.assignmentId === assignmentId)?.unitPrice, 80000n);
    const november = await resolve("2026-11-15"); assert.equal(november.status, "RESOLVED"); if (november.status !== "RESOLVED") throw new Error("November Parking resolution failed");
    assert.equal(november.entitlements.find((row) => row.assignmentId === assignmentId)?.unitPrice, 100000n);
    // Finalize a complete itemized Invoice from V1.8 sources; the newly managed assignment must be present.
    const contract = await prisma.contract.findUniqueOrThrow({ where: { contractId: 3001n }, include: { room: { include: { property: true } } } });
    const invoice = await prisma.invoice.create({ data: { invoiceNo: `P4-${suffix}`, contractId: 3001n, propertyId: 11n, ownerId: 1n, periodStart: new Date("2026-11-15T00:00:00Z"), periodEnd: new Date("2026-12-14T00:00:00Z"), rentAmount: contract.rentAmount, electricityPreviousKwh: "1450.000", electricityCurrentKwh: "1460.000", waterPreviousM3: "81.000", waterCurrentM3: "82.000", totalAmount: contract.rentAmount, status: "draft", revision: 1, snapshotKind: "NOT_FINALIZED" } });
    const finalized = await send(`/api/v1/invoices/${invoice.invoiceId}/finalize`, "POST", {}, { "Idempotency-Key": `pass4-finalize-${suffix}` });
    const finalizeResponse = finalized.response;
    assert.equal(finalizeResponse.status, 200, JSON.stringify(finalized.body));
    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: invoice.invoiceId }, include: { invoiceItems: true } });
    const newParkingLine = finalInvoice.invoiceItems.find((row) => row.category === "PARKING" && row.parkingAssignmentId === assignmentId);
    assert.ok(newParkingLine); assert.equal(newParkingLine.amount, 100000n); assert.equal(finalInvoice.totalAmount, finalInvoice.invoiceItems.reduce((sum, row) => sum + row.amount, 0n));
    const oldSnapshot = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: 5010n, parkingAssignmentId: 8404n } }); assert.equal(oldSnapshot.amount, 80000n, "published future price did not rewrite finalized Invoice snapshot");
    await assert.rejects(() => prisma.invoiceItem.create({ data: { invoiceId: 5010n, ownerId: oldSnapshot.ownerId, propertyId: oldSnapshot.propertyId, contractId: oldSnapshot.contractId, itemKey: `P4-DUP-${suffix}`, category: "PARKING", sourceType: oldSnapshot.sourceType, sourceReference: oldSnapshot.sourceReference, propertyPriceVersionId: oldSnapshot.propertyPriceVersionId, pricingKind: oldSnapshot.pricingKind, parkingAssignmentId: 8404n, parkingEntitlementId: oldSnapshot.parkingEntitlementId, labelSnapshot: oldSnapshot.labelSnapshot, descriptionSnapshot: oldSnapshot.descriptionSnapshot, quantity: oldSnapshot.quantity, unit: oldSnapshot.unit, unitPriceSnapshot: oldSnapshot.unitPriceSnapshot, amount: oldSnapshot.amount, calculationRuleVersion: oldSnapshot.calculationRuleVersion, applicablePeriodStart: oldSnapshot.applicablePeriodStart, applicablePeriodEnd: oldSnapshot.applicablePeriodEnd } }), "same Invoice cannot receive duplicate item for the assignment");

    // K/E/FREE/UNCLASSIFIED: preserve records, class clearly, emit no free/unclassified items and stop future eligibility after end.
    const endPaid = await send(`/api/v1/parking-assignments/${assignmentId}/end`, "POST", { ended_at: "2026-11-15" }); assert.equal(endPaid.response.status, 200, JSON.stringify(endPaid.body)); assert.equal(endPaid.body.data.status, "ended");
    const free = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotA.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleId.toString(), started_at: "2026-11-16", entitlement_type: "FREE_SLOT", billability: "FREE", pricing_item_id: null }); assert.equal(free.response.status, 201, JSON.stringify(free.body));
    const freeId = BigInt(free.body.data.assignment_id); const freeResolved = await resolve("2026-12-15"); assert.equal(freeResolved.status, "RESOLVED"); if (freeResolved.status === "RESOLVED") assert.equal(freeResolved.entitlements.find((row) => row.assignmentId === freeId)?.status, "RESOLVED_FREE");
    const endFree = await send(`/api/v1/parking-assignments/${freeId}/end`, "POST", { ended_at: "2026-11-16" }); assert.equal(endFree.response.status, 200);
    const unknown = await send("/api/v1/properties/11/parking-assignments", "POST", { parking_slot_id: slotA.toString(), room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: vehicleId.toString(), started_at: "2026-11-17", entitlement_type: "LEGACY_UNCLASSIFIED", billability: "UNCLASSIFIED", pricing_item_id: null }); assert.equal(unknown.response.status, 201, JSON.stringify(unknown.body));
    const unknownId = BigInt(unknown.body.data.assignment_id); const unknownResolved = await resolve("2026-12-15"); assert.equal(unknownResolved.status, "RESOLVED"); if (unknownResolved.status === "RESOLVED") assert.equal(unknownResolved.entitlements.find((row) => row.assignmentId === unknownId)?.status, "RESOLVED_UNCLASSIFIED");
    const classifiedFree = await send(`/api/v1/properties/11/parking-assignments/${unknownId}/entitlement`, "PATCH", { entitlement_type: "FREE_SLOT", billability: "FREE", pricing_item_id: null }); assert.equal(classifiedFree.response.status, 200); assert.equal(classifiedFree.body.data.entitlement.billability, "FREE");
    const endUnknown = await send(`/api/v1/parking-assignments/${unknownId}/end`, "POST", { ended_at: "2026-11-17" }); assert.equal(endUnknown.response.status, 200);

    // O: foreign Owner cannot inspect or mutate the other Property.
    assert.equal((await send("/api/v1/properties/21/parking")).response.status, 404);
    assert.equal((await send("/api/v1/properties/21/parking-areas", "POST", { name: `P4-FOREIGN-${suffix}` })).response.status, 404);
    const overview = await send("/api/v1/properties/11/parking"); assert.equal(overview.response.status, 200); assert.ok(overview.body.data.slots.some((row: any) => row.parking_slot_id === slotA.toString()));
  } finally { for (const running of servers) await new Promise<void>((resolve) => running.close(() => resolve())); await prisma.$disconnect(); }
});
