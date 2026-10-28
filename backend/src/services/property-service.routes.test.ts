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
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "service-routes-test-secret-with-32-bytes" });
const admin: LoginAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: { ownerId: 101n, displayName: "Owner A" }, resident: null };
const otherAdmin: LoginAccountRecord = { ...admin, accountId: 12n, ownerId: 202n, email: "other@test.invalid", owner: { ownerId: 202n, displayName: "Owner B" } };
const resident: LoginAccountRecord = { accountId: 13n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
class TestAuthRepository implements AuthRepository {
  async findCandidates() { return []; }
  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> { const row = [admin, otherAdmin, resident].find((entry) => entry.accountId === accountId); if (!row) return null; const { passwordHash: _passwordHash, ...safe } = row; return safe; }
}
const auth: AuthDependencies = { config, repository: new TestAuthRepository(), sessions: new InMemorySessionStore() };
const calls: Array<{ method: string; ownerId: bigint; propertyId?: bigint; input?: any; residentId?: bigint; accountId?: bigint; serviceId?: bigint; bookingId?: bigint; date?: string; startTime?: string; decision?: string }> = [];
const sampleItem = { propertyPricingItemId: 5n, kind: "FIXED_SERVICE", code: "WIFI", name: "WiFi", description: null, unit: "kỳ", status: "active", createdAt: new Date("2026-10-01T00:00:00Z"), priceVersions: [{ propertyPriceVersionId: 7n, versionNo: 1, effectiveFrom: new Date("2026-10-01T00:00:00Z"), unitPrice: 50000n, sourceName: null, sourceReference: null, reason: null, publishedAt: new Date("2026-10-01T00:00:00Z") }] };
const bookingRow = { booking_id: 900n, service_name_snapshot: "Spa", property_name: "Property A", service_date: "2099-11-03", slot_start: "09:00", slot_end: "10:00", slot_duration_minutes: 60, status: "PENDING", charge_amount: 100000n, unit_snapshot: "lượt", cancelled_at: null, decision_at: null, decision_note: null, created_at: new Date("2099-11-01T00:00:00Z"), invoice_no: null, invoice_status: null, can_cancel: true, can_approve: true, resident_name: "Resident", room_code: "A101", contract_no: "HD-001" };
const repository = {
  async listFacilities(ownerId: bigint, propertyId: bigint) { calls.push({ method: "listFacilities", ownerId, propertyId }); return ownerId === 101n && propertyId === 50n ? { property: { propertyId, name: "Property A" }, items: [{ propertyFacilityId: 71n, name: "Hồ bơi", description: null, location: "Sân sau", active: true, createdAt: new Date("2026-10-28T00:00:00Z") }] } : null; },
  async createFacility(ownerId: bigint, propertyId: bigint, input: any) { calls.push({ method: "createFacility", ownerId, propertyId, input }); return ownerId === 101n && propertyId === 50n ? { propertyFacilityId: 72n, ...input, active: true, createdAt: new Date("2026-10-28T00:00:00Z") } : null; },
  async listItems(ownerId: bigint, propertyId: bigint, kind?: string) { calls.push({ method: "listItems", ownerId, propertyId }); return ownerId === 101n && propertyId === 50n ? { property: { propertyId, name: "Property A" }, items: kind ? [{ ...sampleItem, kind }] : [sampleItem] } : null; },
  async listResidentServices(ownerId: bigint, residentId: bigint) { calls.push({ method: "listResidentServices", ownerId, residentId }); return [
    { property: { propertyId: 50n, name: "Property A" }, facilities: [{ propertyFacilityId: 71n, name: "Sân vườn", description: "Khu vực nghỉ chung", location: "Sân sau" }], services: [{ ...sampleItem, kind: "FLEXIBLE_SERVICE", unit: "lượt", flexibleServiceConfiguration: { service_mode: "BOOKING", open_monday: true, open_tuesday: true, open_wednesday: true, open_thursday: true, open_friday: true, open_saturday: false, open_sunday: false, opens_at: "09:00", closes_at: "17:00", slot_duration_minutes: 60, capacity_per_slot: 2, package_duration_count: null, package_duration_unit: null } }] },
    { property: { propertyId: 51n, name: "Property B" }, facilities: [{ propertyFacilityId: 72n, name: "Phòng sinh hoạt", description: null, location: null }], services: [] },
  ]; },
  async listResidentServiceAvailability(ownerId: bigint, residentId: bigint, serviceId: bigint, serviceDate: string) { calls.push({ method: "availability", ownerId, residentId, serviceId, date: serviceDate }); return ownerId === 101n && residentId === 201n && serviceId === 5n ? { serviceId, serviceDate, unit: "lượt", unitPrice: 100000n, priceEffectiveFrom: "2099-01-01", slots: [{ start_time: "09:00", end_time: "10:00", remaining_capacity: 1 }] } : null; },
  async bookResidentService(ownerId: bigint, residentId: bigint, accountId: bigint, serviceId: bigint, input: any) { calls.push({ method: "book", ownerId, residentId, accountId, serviceId, date: input.serviceDate, startTime: input.startTime }); return ownerId === 101n && residentId === 201n && serviceId === 5n ? { booking: { ...bookingRow, booking_id: 900n, service_date: input.serviceDate, slot_start: input.startTime, status: "PENDING" }, created: true } : null; },
  async listResidentServiceBookings(ownerId: bigint, residentId: bigint) { calls.push({ method: "residentBookings", ownerId, residentId }); return [bookingRow]; },
  async cancelResidentServiceBooking(ownerId: bigint, residentId: bigint, accountId: bigint, bookingId: bigint) { calls.push({ method: "cancel", ownerId, residentId, accountId, bookingId }); return ownerId === 101n && residentId === 201n && bookingId === 900n ? { ...bookingRow, status: "CANCELLED", can_cancel: false } : null; },
  async listAdminServiceBookings(ownerId: bigint, propertyId: bigint) { calls.push({ method: "pendingBookings", ownerId, propertyId }); return ownerId === 101n && propertyId === 50n ? [bookingRow] : null; },
  async decideAdminServiceBooking(ownerId: bigint, propertyId: bigint, bookingId: bigint, accountId: bigint, input: any) { calls.push({ method: "decision", ownerId, propertyId, bookingId, accountId, decision: input.decision }); return ownerId === 101n && propertyId === 50n && bookingId === 900n ? { booking: { ...bookingRow, status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED" } } : null; },
  async createItem(ownerId: bigint, propertyId: bigint, input: any) { calls.push({ method: "createItem", ownerId, propertyId, input }); return ownerId === 101n && propertyId === 50n ? { ...sampleItem, ...input, priceVersions: [] } : null; },
  async retireItem(ownerId: bigint, propertyId: bigint, itemId: bigint, kind: string) { calls.push({ method: "retireItem", ownerId, propertyId }); return ownerId === 101n && propertyId === 50n && itemId === 5n ? { ...sampleItem, kind, status: "retired", priceVersions: [] } : null; },
  async publishPrice(ownerId: bigint, propertyId: bigint, itemId: bigint, actorId: bigint, kind: string, input: any) { calls.push({ method: "publishPrice", ownerId, propertyId, input }); return ownerId === 101n && propertyId === 50n && itemId === 5n ? { ...sampleItem.priceVersions[0], ...input, kind } : null; },
};
let server: Server; let baseUrl = ""; const cookies = new Map<string, string>();
async function install(account: LoginAccountRecord) { const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret); await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config)); cookies.set(String(account.accountId), `${token}|${csrf}`); }
function headers(account: LoginAccountRecord, unsafe = false, extra: Record<string, string> = {}) { const [token, csrf] = cookies.get(String(account.accountId))!.split("|"); return { Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}), ...extra }; }
async function call(account: LoginAccountRecord, path: string, options: { method?: string; body?: unknown; extra?: Record<string, string> } = {}) { const method = options.method ?? "GET"; const response = await fetch(`${baseUrl}${path}`, { method, headers: headers(account, method !== "GET", options.extra), ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }); return { response, body: await response.json() as any }; }
before(async () => { await Promise.all([install(admin), install(otherAdmin), install(resident)]); const app = express(); app.use(requestIdMiddleware); app.use(express.json()); app.use("/api/v1", createV1Router({ ...auth, propertyServiceRepository: repository as any, invoiceRepository: {} as any, billingWorkspaceRepository: {} as any, invoicePricing: {} as any, invoiceZalo: {} as any })); app.use(errorHandler); server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`; });
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("service catalog is Owner scoped and returns published version history", async () => { calls.length = 0; const own = await call(admin, "/api/v1/properties/50/pricing-items?kind=FIXED_SERVICE"); assert.equal(own.response.status, 200); assert.equal(own.body.data.items[0].price_versions[0].unit_price, "50000"); assert.equal(calls.at(-1)?.ownerId, 101n); const foreign = await call(otherAdmin, "/api/v1/properties/50/pricing-items"); assert.equal(foreign.response.status, 404); assert.equal(calls.at(-1)?.ownerId, 202n); });
test("free shared Facilities are Admin-only, Owner scoped and never accept client Owner authority", async () => {
  calls.length = 0;
  const listed = await call(admin, "/api/v1/properties/50/facilities");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data.items[0].facility_id, "71");
  assert.equal(calls.at(-1)?.ownerId, 101n);
  assert.equal((await call(otherAdmin, "/api/v1/properties/50/facilities")).response.status, 404);
  assert.equal((await call(resident, "/api/v1/properties/50/facilities")).response.status, 403);
  assert.equal((await call(admin, "/api/v1/properties/50/facilities?active=false")).response.status, 400);

  const created = await call(admin, "/api/v1/properties/50/facilities", { method: "POST", body: { name: "Hồ bơi", location: "Sân sau" } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.facility_id, "72");
  assert.equal(calls.at(-1)?.ownerId, 101n);
  assert.deepEqual(calls.at(-1)?.input, { name: "Hồ bơi", description: null, location: "Sân sau" });
  assert.equal((await call(admin, "/api/v1/properties/50/facilities", { method: "POST", body: { name: "Hồ bơi", owner_id: "202" } })).response.status, 400);
});
test("residents cannot manage services; Admin create derives Owner from the session", async () => { assert.equal((await call(resident, "/api/v1/properties/50/pricing-items")).response.status, 403); const created = await call(admin, "/api/v1/properties/50/pricing-items", { method: "POST", body: { kind: "FIXED_SERVICE", code: "WIFI", name: "WiFi", unit: "kỳ" } }); assert.equal(created.response.status, 201); assert.equal(calls.at(-1)?.ownerId, 101n); });
test("publish and retire routes validate business fields and use versioned statuses", async () => { const price = await call(admin, "/api/v1/properties/50/pricing-items/5/price-versions?kind=FIXED_SERVICE", { method: "POST", body: { effective_from: "2026-11-01", unit_price: "50000" } }); assert.equal(price.response.status, 201); assert.equal(price.body.data.unit_price, "50000"); const invalid = await call(admin, "/api/v1/properties/50/pricing-items/5/price-versions?kind=FLEXIBLE_SERVICE", { method: "POST", body: { effective_from: "2026-11-01", unit_price: "-1" } }); assert.equal(invalid.response.status, 400); const retired = await call(admin, "/api/v1/properties/50/pricing-items/5/retire?kind=FIXED_SERVICE", { method: "POST", body: {} }); assert.equal(retired.body.data.status, "retired"); });
test("manual charge APIs stay retired; catalog still rejects client Owner authority", async () => {
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const result = await call(admin, "/api/v1/properties/50/flexible-service-charges", { method, ...(method === "GET" ? {} : { body: {} }) });
    assert.equal(result.response.status, 410);
    assert.equal(result.body.code, "ENDPOINT_RETIRED");
  }
  const authority = await call(admin, "/api/v1/properties/50/pricing-items", { method: "POST", body: { kind: "FIXED_SERVICE", code: "X", name: "X", unit: "kỳ", owner_id: "202" } });
  assert.equal(authority.response.status, 400);
});

test("Resident booking endpoints derive identity, return availability, and keep requests pending", async () => {
  const catalog = await call(resident, "/api/v1/me/services");
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.body.data[0].services[0].service_configuration.booking.capacity_per_slot, 2);
  assert.deepEqual(catalog.body.data[0].facilities, [{ facility_id: "71", name: "Sân vườn", description: "Khu vực nghỉ chung", location: "Sân sau" }]);
  assert.deepEqual(catalog.body.data[1], { property_id: "51", property_name: "Property B", facilities: [{ facility_id: "72", name: "Phòng sinh hoạt", description: null, location: null }], services: [] });
  assert.deepEqual(calls.at(-1), { method: "listResidentServices", ownerId: 101n, residentId: 201n });

  const availability = await call(resident, "/api/v1/me/services/5/availability?date=2099-11-03");
  assert.equal(availability.response.status, 200);
  assert.equal(availability.body.data.slots[0].remaining_capacity, 1);
  assert.equal(calls.at(-1)?.residentId, 201n);

  const created = await call(resident, "/api/v1/me/services/5/bookings", { method: "POST", body: { service_date: "2099-11-03", start_time: "09:00" } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.status, "PENDING");
  assert.equal(created.body.data.amount, "100000");
  assert.deepEqual(calls.at(-1), { method: "book", ownerId: 101n, residentId: 201n, accountId: 13n, serviceId: 5n, date: "2099-11-03", startTime: "09:00" });
  assert.equal((await call(admin, "/api/v1/me/services/5/availability?date=2099-11-03")).response.status, 403);
  assert.equal((await call(resident, "/api/v1/me/services/5/bookings", { method: "POST", body: { service_date: "2099-11-03", start_time: "09:00", owner_id: "202" } })).response.status, 400);
});

test("Resident history/cancel and Admin approval endpoints enforce role and Owner scope", async () => {
  const history = await call(resident, "/api/v1/me/service-bookings");
  assert.equal(history.response.status, 200);
  assert.equal(history.body.data[0].booking_id, "900");
  const cancelled = await call(resident, "/api/v1/me/service-bookings/900/cancel", { method: "POST", body: {} });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.data.status, "CANCELLED");

  assert.equal((await call(resident, "/api/v1/properties/50/service-bookings?status=PENDING")).response.status, 403);
  const queue = await call(admin, "/api/v1/properties/50/service-bookings?status=PENDING");
  assert.equal(queue.response.status, 200);
  assert.equal(queue.body.data[0].resident_name, "Resident");
  assert.deepEqual(calls.at(-1), { method: "pendingBookings", ownerId: 101n, propertyId: 50n });
  assert.equal((await call(otherAdmin, "/api/v1/properties/50/service-bookings?status=PENDING")).response.status, 404);

  const decided = await call(admin, "/api/v1/properties/50/service-bookings/900/decision", { method: "POST", body: { decision: "APPROVE" } });
  assert.equal(decided.response.status, 200);
  assert.equal(decided.body.data.status, "APPROVED");
  assert.equal(calls.at(-1)?.accountId, 11n);
  assert.equal(calls.at(-1)?.decision, "APPROVE");
  assert.equal((await call(admin, "/api/v1/properties/50/service-bookings/900/decision", { method: "POST", body: { decision: "PAY" } })).response.status, 400);
});
