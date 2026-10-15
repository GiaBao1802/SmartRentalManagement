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
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "parking-routes-test-secret-with-32-bytes" });
const admin: LoginAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: { ownerId: 101n, displayName: "Owner A" }, resident: null };
const foreignAdmin: LoginAccountRecord = { ...admin, accountId: 12n, ownerId: 202n, email: "foreign@test.invalid", owner: { ownerId: 202n, displayName: "Owner B" } };
const resident: LoginAccountRecord = { accountId: 13n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
class AuthRepo implements AuthRepository { async findCandidates() { return []; } async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> { const row = [admin, foreignAdmin, resident].find((entry) => entry.accountId === accountId); if (!row) return null; const { passwordHash: _hash, ...safe } = row; return safe; } }
const auth: AuthDependencies = { config, repository: new AuthRepo(), sessions: new InMemorySessionStore() };
const calls: any[] = [];
const rows = {
  async overview(ownerId: bigint, propertyId: bigint) { calls.push(["overview", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? { property: { propertyId, name: "A" }, areas: [], slots: [], vehicles: 0, assignments: [], entitlements: [], parkingItems: [] } : null; },
  async listAreas(ownerId: bigint, propertyId: bigint) { calls.push(["listAreas", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? [] : null; },
  async createArea(ownerId: bigint, propertyId: bigint, input: any) { calls.push(["createArea", ownerId, propertyId, input]); return ownerId === 101n ? { parkingAreaId: 20n, ...input } : null; },
  async updateArea(ownerId: bigint, areaId: bigint, input: any) { calls.push(["updateArea", ownerId, areaId, input]); return ownerId === 101n && areaId === 20n ? { parkingAreaId: areaId, ...input } : null; },
  async listSlots(ownerId: bigint, areaId: bigint) { calls.push(["listSlots", ownerId, areaId]); return ownerId === 101n && areaId === 20n ? [] : null; },
  async createSlot(ownerId: bigint, areaId: bigint, code: string) { calls.push(["createSlot", ownerId, areaId, code]); return ownerId === 101n ? { parkingSlotId: 30n, slotCode: code } : null; },
  async updateSlot(ownerId: bigint, slotId: bigint, status: string) { calls.push(["updateSlot", ownerId, slotId, status]); return ownerId === 101n && slotId === 30n ? { parkingSlotId: slotId, status } : null; },
  async listResidents(ownerId: bigint, propertyId: bigint) { calls.push(["listResidents", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? [] : null; },
  async listVehicles(ownerId: bigint, propertyId: bigint) { calls.push(["listVehicles", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? [] : null; },
  async createVehicle(ownerId: bigint, propertyId: bigint, residentId: bigint, input: any) { calls.push(["createVehicle", ownerId, propertyId, residentId, input]); return ownerId === 101n ? { vehicleId: 40n, residentId, ...input } : null; },
  async listAssignments(ownerId: bigint, propertyId: bigint) { calls.push(["listAssignments", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? [] : null; },
  async createAssignment(ownerId: bigint, propertyId: bigint, input: any) { calls.push(["createAssignment", ownerId, propertyId, input]); return ownerId === 101n && propertyId === 50n ? { assignmentId: 60n, ...input } : null; },
  async classify(ownerId: bigint, propertyId: bigint, assignmentId: bigint, input: any) { calls.push(["classify", ownerId, propertyId, assignmentId, input]); return ownerId === 101n ? { assignmentId, ...input } : null; },
  async endAssignment(ownerId: bigint, assignmentId: bigint, endedAt: Date) { calls.push(["end", ownerId, assignmentId, endedAt]); return ownerId === 101n ? { assignmentId, endedAt } : null; },
  async listParkingPricing(ownerId: bigint, propertyId: bigint) { calls.push(["pricing", ownerId, propertyId]); return ownerId === 101n && propertyId === 50n ? [] : null; },
};
let server: Server; let base = ""; const tokens = new Map<bigint, { token: string; csrf: string }>();
async function install(account: LoginAccountRecord) { const token = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret); await auth.sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config)); tokens.set(account.accountId, { token, csrf }); }
async function call(account: LoginAccountRecord, path: string, method = "GET", body?: unknown) { const pair = tokens.get(account.accountId)!; const response = await fetch(`${base}${path}`, { method, headers: { Cookie: `gt_session=${pair.token}; gt_csrf=${pair.csrf}`, ...(method === "GET" ? {} : { Origin: origin, "X-CSRF-Token": pair.csrf, "Content-Type": "application/json" }) , ...(body && method !== "GET" ? {} : {}) }, ...(method === "GET" || body === undefined ? {} : { body: JSON.stringify(body) }) }); return { response, body: await response.json() as any }; }
before(async () => { await Promise.all([install(admin), install(foreignAdmin), install(resident)]); const app = express(); app.use(requestIdMiddleware); app.use(express.json()); app.use("/api/v1", createV1Router({ ...auth, parkingManagementRepository: rows as any })); app.use(errorHandler); server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`; });
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("Parking read routes are Admin-only and Owner-scoped", async () => { calls.length = 0; assert.equal((await call(admin, "/api/v1/properties/50/parking")).response.status, 200); assert.equal(calls.at(-1)[1], 101n); assert.equal((await call(foreignAdmin, "/api/v1/properties/50/parking")).response.status, 404); assert.equal((await call(resident, "/api/v1/properties/50/parking")).response.status, 403); });
test("Parking create routes validate allowlists and derive Owner from session", async () => { const area = await call(admin, "/api/v1/properties/50/parking-areas", "POST", { name: "Basement", location: "B1" }); assert.equal(area.response.status, 201); assert.equal(area.body.data.parking_area_id, "20"); assert.equal(calls.at(-1)[1], 101n); const injected = await call(admin, "/api/v1/properties/50/parking-areas", "POST", { name: "X", owner_id: "202" }); assert.equal(injected.response.status, 400); const slot = await call(admin, "/api/v1/parking-areas/20/slots", "POST", { slot_code: "P-01" }); assert.equal(slot.response.status, 201); assert.equal(slot.body.data.parking_slot_id, "30"); });
test("Assignment command accepts only explicit supported billability and relation IDs", async () => { const invalid = await call(admin, "/api/v1/properties/50/parking-assignments", "POST", { parking_slot_id: "30", room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: "40", started_at: "2026-10-15", billability: "PAID", entitlement_type: "PAID_SLOT", pricing_item_id: "500" }); assert.equal(invalid.response.status, 201, JSON.stringify(invalid.body)); assert.equal(calls.at(-1)[3].billability, "PAID"); assert.equal(calls.at(-1)[2], 50n); const bad = await call(admin, "/api/v1/properties/50/parking-assignments", "POST", { parking_slot_id: "30", room_id: "101", contract_id: "3001", resident_id: "1001", vehicle_id: "40", started_at: "2026-10-15", billability: "MAYBE", entitlement_type: "PAID_SLOT" }); assert.equal(bad.response.status, 400); });
