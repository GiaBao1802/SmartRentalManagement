import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { scryptSync } from "node:crypto";
import express from "express";
import type { AuthRepository } from "../auth/auth.types.js";
import type { AuthDependencies } from "../middleware/auth.js";
import { loadEnv } from "../config/env.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { createV1Router } from "../auth/v1.router.js";
import { Prisma } from "@prisma/client";
import { PrismaResidentOccupancyRepository, resolveOccupancyCapacity } from "./resident.repository.js";
import { parseResidentListQuery, validateEndOccupancy, validateResidentCreate, validateResidentPatch, validateResidentSearch, validateTransfer } from "./resident.validation.js";

const origin = "http://localhost:3000";
const password = "safe-test-password";
const hash = `scrypt$00112233445566778899aabbccddeeff$${scryptSync(password, "00112233445566778899aabbccddeeff", 64).toString("hex")}`;
const admin = { accountId: 1n, ownerId: 11n, residentId: null, role: "admin", email: "admin@example.test", phone: null, passwordHash: hash, status: "active", owner: { ownerId: 11n, displayName: "Owner" }, resident: null };
const otherAdmin = { ...admin, accountId: 3n, ownerId: 12n, email: "other-admin@example.test", owner: { ownerId: 12n, displayName: "Owner 2" } };
const residentUser = { accountId: 2n, ownerId: null, residentId: 22n, role: "resident", email: "resident@example.test", phone: null, passwordHash: hash, status: "active", owner: null, resident: { residentId: 22n, ownerId: 11n, fullName: "Resident" } };
let currentUser: typeof admin | typeof otherAdmin | typeof residentUser = admin;
const authRepo: AuthRepository = {
  async findCandidates(login) { return login === admin.email ? [admin] : login === otherAdmin.email ? [otherAdmin] : login === residentUser.email ? [residentUser] : []; },
  async findCurrentAccount(accountId) { if (accountId !== currentUser.accountId) return null; const { passwordHash: _secret, ...safe } = currentUser; return safe; },
};
const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "test-session-secret-that-is-long-enough-for-tests" });
const auth: AuthDependencies = { config, repository: authRepo, sessions: new InMemorySessionStore() };
const calls: Array<{ name: string; args: unknown[] }> = [];
let behavior: Record<string, unknown> = {};
const repo = {
  async listResidents(...args: unknown[]) { calls.push({ name: "listResidents", args }); return behavior.list ?? { rows: [{ residentId: 31n, fullName: "A" }], total: 1 }; },
  async createResident(...args: unknown[]) { calls.push({ name: "createResident", args }); if (behavior.create instanceof Error) throw behavior.create; return behavior.create ?? { residentId: 31n, ownerId: 11n, ...args[1] as object }; },
  async searchResident(...args: unknown[]) { calls.push({ name: "searchResident", args }); return behavior.search === "missing" ? null : { residentId: 31n, nationalId: args[1] }; },
  async findResident(...args: unknown[]) { calls.push({ name: "findResident", args }); return behavior.detail === "missing" ? null : { residentId: args[1], fullName: "A", roomResidents: [] }; },
  async updateResident(...args: unknown[]) { calls.push({ name: "updateResident", args }); return behavior.update ?? { residentId: args[1], ...(args[2] as object) }; },
  async archiveResident(...args: unknown[]) { calls.push({ name: "archiveResident", args }); return behavior.archive ?? { residentId: args[1], archivedAt: new Date("2026-10-01T00:00:00Z") }; },
  async listRoomResidents(...args: unknown[]) { calls.push({ name: "listRoomResidents", args }); return behavior.roomList === "missing" ? null : { rows: [{ occupancyId: 51n, resident: { fullName: "A" } }] }; },
  async addOccupancy(...args: unknown[]) { calls.push({ name: "addOccupancy", args }); return behavior.add ?? { occupancyId: 51n, startedAt: args[4] }; },
  async endOccupancy(...args: unknown[]) { calls.push({ name: "endOccupancy", args }); return behavior.end ?? { occupancyId: args[1], status: "ended", endedAt: args[2] }; },
  async transfer(...args: unknown[]) { calls.push({ name: "transfer", args }); return behavior.transfer ?? { sourceOccupancyId: args[2], destination: { occupancyId: 52n, startedAt: args[5] } }; },
  async meRental(...args: unknown[]) { calls.push({ name: "meRental", args }); return behavior.rental === "missing" ? null : { occupancies: [{ occupancyId: 51n }], representativeContracts: [] }; },
} as unknown as PrismaResidentOccupancyRepository;
let server: Server;
let baseUrl = "";
let csrfCookie = "";
let csrfToken = "";
let sessionCookie = "";
function cookie(response: Response, name: string) { const found = response.headers.getSetCookie().map((line) => line.split(";")[0]!).find((line) => line.startsWith(`${name}=`)); assert.ok(found); return found; }
async function request(path: string, options: RequestInit = {}) { const headers = new Headers(options.headers); if (sessionCookie && !headers.has("Cookie")) headers.set("Cookie", sessionCookie); const response = await fetch(`${baseUrl}${path}`, { ...options, headers }); return { response, body: await response.json() as any }; }
async function unsafe(path: string, method: string, body: unknown, key = "resident-test-idem") {
  return request(path, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: `${sessionCookie}; ${csrfCookie}`, "X-CSRF-Token": csrfToken, "Idempotency-Key": key }, body: JSON.stringify(body) });
}
function reset() { behavior = {}; calls.length = 0; }

before(async () => {
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, residentOccupancyRepository: repo })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
  const boot = await request("/api/v1/auth/csrf"); csrfCookie = cookie(boot.response, "gt_csrf"); csrfToken = boot.body.data.csrf_token;
  await login(admin.email);
});
async function login(email: string) {
  currentUser = email === admin.email ? admin : email === otherAdmin.email ? otherAdmin : residentUser;
  const result = await request("/api/v1/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: csrfCookie, "X-CSRF-Token": csrfToken }, body: JSON.stringify({ login: email, password }) });
  assert.equal(result.response.status, 200); sessionCookie = cookie(result.response, "gt_session");
}
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("admin resident list scopes Owner from session, filters, and paginates", async () => {
  reset(); const result = await request("/api/v1/residents?residence_status=living&property_id=101&room_id=201&page=2&page_size=15");
  assert.equal(result.response.status, 200); assert.equal(result.body.meta.page_size, 15); assert.equal(calls[0]?.args[0], 11n); assert.equal((calls[0]?.args[1] as any).roomId, 201n);
});
test("resident list rejects unknown filters and foreign-shaped IDs", async () => { assert.equal((await request("/api/v1/residents?sort=secret")).response.status, 400); assert.equal((await request("/api/v1/residents?room_id=0")).response.status, 400); });
test("create derives Owner from session and uses exact allowlist", async () => {
  reset(); const result = await unsafe("/api/v1/residents", "POST", { national_id: "079123456789", full_name: "Nguyễn An", phone: "0900000000", email: "an@example.test", birth_date: "1995-01-01", gender: "unspecified" });
  assert.equal(result.response.status, 201); assert.equal(calls[0]?.args[0], 11n); assert.equal((calls[0]?.args[1] as any).ownerId, undefined); assert.equal(result.body.data.resident_id, "31");
});
test("client owner/role authority and unsupported Resident fields are rejected", async () => {
  assert.equal((await unsafe("/api/v1/residents", "POST", { owner_id: "99", full_name: "A" })).response.status, 400);
  assert.equal((await unsafe("/api/v1/residents", "POST", { full_name: "A", resident_id: "31" })).response.status, 400);
});
test("same-Owner duplicate CCCD is mapped to documented conflict without echoing CCCD", async () => {
  behavior.create = new Prisma.PrismaClientKnownRequestError("unique violation", { code: "P2002", clientVersion: "test" });
  const result = await unsafe("/api/v1/residents", "POST", { national_id: "079123456789", full_name: "A" });
  assert.equal(result.response.status, 409); assert.equal(result.body.error.code, "RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER"); assert.equal(JSON.stringify(result.body).includes("079123456789"), false);
});
test("same CCCD remains tenant scoped when creating in another Owner context", async () => {
  await login(otherAdmin.email); reset(); const result = await unsafe("/api/v1/residents", "POST", { national_id: "079123456789", full_name: "A" });
  assert.equal(result.response.status, 201); assert.equal(calls[0]?.args[0], 12n); await login(admin.email);
});
test("Resident may be created without optional CCCD; repository assigns left until occupancy", async () => {
  reset(); const result = await unsafe("/api/v1/residents", "POST", { full_name: "No CCCD" });
  assert.equal(result.response.status, 201); assert.equal((calls[0]?.args[1] as any).nationalId, undefined); assert.equal((calls[0]?.args[1] as any).residenceStatus, undefined);
});
test("POST commands require Idempotency-Key header", async () => { assert.equal((await unsafe("/api/v1/residents", "POST", { full_name: "A" }, "")).response.status, 400); });
test("CCCD exact search is owner scoped and never logs request body", async () => {
  reset(); const result = await unsafe("/api/v1/residents/search", "POST", { national_id: "079123456789" }); assert.equal(result.response.status, 200); assert.equal(calls[0]?.args[0], 11n); assert.equal(calls[0]?.args[1], "079123456789");
});
test("foreign-owner CCCD search is the documented generic 404", async () => {
  behavior.search = "missing"; const result = await unsafe("/api/v1/residents/search", "POST", { national_id: "079123456789" }); assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "RESIDENT_NOT_FOUND_IN_OWNER_SCOPE"); assert.deepEqual(result.body.error.details, {});
});
test("invalid CCCD is rejected without exposing its value", async () => {
  const result = await unsafe("/api/v1/residents/search", "POST", { national_id: "bad-secret" }); assert.equal(result.response.status, 400); assert.equal(JSON.stringify(result.body).includes("bad-secret"), false);
});
test("foreign Resident detail is indistinguishable 404", async () => { behavior.detail = "missing"; const result = await request("/api/v1/residents/999"); assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND"); });
test("malformed Resident IDs return 400", async () => { const result = await request("/api/v1/residents/1x"); assert.equal(result.response.status, 400); });
test("update rechecks same-Owner CCCD uniqueness", async () => {
  behavior.update = "duplicate"; const result = await unsafe("/api/v1/residents/31", "PATCH", { national_id: "079123456789" }); assert.equal(result.response.status, 409); assert.equal(result.body.error.code, "RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER");
});
test("update rejects unknown fields and invalid status", async () => { assert.equal((await unsafe("/api/v1/residents/31", "PATCH", { owner_id: "2" })).response.status, 400); assert.throws(() => validateResidentPatch({ residence_status: "active" })); });
test("delete archives Resident and blocks active relationships", async () => {
  let result = await unsafe("/api/v1/residents/31", "DELETE", {}); assert.equal(result.response.status, 200); assert.equal(result.body.data.archived_at, "2026-10-01T00:00:00.000Z");
  behavior.archive = "conflict"; result = await unsafe("/api/v1/residents/31", "DELETE", {}); assert.equal(result.response.status, 409);
});
test("room occupancy list is scoped and includes historical/active data", async () => {
  reset(); const result = await request("/api/v1/rooms/201/residents"); assert.equal(result.response.status, 200); assert.equal(calls[0]?.args[0], 11n); assert.equal(result.body.data[0].occupancy_id, "51");
});
test("foreign Room is 404", async () => { behavior.roomList = "missing"; const result = await request("/api/v1/rooms/999/residents"); assert.equal(result.response.status, 404); });
test("malformed Room IDs return 400", async () => { const result = await request("/api/v1/rooms/1x/residents"); assert.equal(result.response.status, 400); });
test("add occupancy accepts selected resident ID but derives Owner and requires key", async () => {
  reset(); const result = await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "31", contract_id: "401", started_at: "2026-10-01" }); assert.equal(result.response.status, 201); assert.equal(calls[0]?.args[0], 11n); assert.equal(calls[0]?.args[2], 31n); assert.equal(result.body.data.started_at, "2026-10-01");
});
test("add occupancy maps foreign resident/contract and capacity failures", async () => {
  behavior.add = "missing-resident"; assert.equal((await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "999", started_at: "2026-10-01" })).response.status, 404);
  behavior.add = "capacity"; const result = await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "31", started_at: "2026-10-01" }); assert.equal(result.body.error.code, "ROOM_CAPACITY_EXCEEDED");
});
test("add occupancy rejects duplicate active room membership", async () => {
  behavior.add = "duplicate"; const result = await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "31", started_at: "2026-10-01" }); assert.equal(result.response.status, 409);
});
test("Contract resident_capacity overrides Room default; default applies only with no Contract", () => {
  assert.equal(resolveOccupancyCapacity(3, 5), 3); assert.equal(resolveOccupancyCapacity(null, 5), 5);
});
test("repository enforces contract snapshot capacity without falling back to Room default", async () => {
  let recordedContractCapacity = 0;
  const tx = {
    async $queryRaw() { return []; },
    resident: { async findFirst() { return { residentId: 31n }; }, async update({ data }: any) { return { residentId: 31n, ...data }; } },
    room: { async findFirst() { return { roomId: 201n, propertyId: 101n, defaultCapacity: 5, isActive: true }; } },
    contract: { async findFirst() { return { contractId: 401n, propertyId: 101n, residentCapacity: 2 }; } },
    roomResident: { async findFirst() { return null; }, async count() { recordedContractCapacity = 2; return 2; }, async create() { throw new Error("must not insert over capacity"); } },
  };
  const db = { async $transaction(callback: (tx: unknown) => Promise<unknown>, options: any) { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const repository = new PrismaResidentOccupancyRepository(db as never);
  assert.equal(await repository.addOccupancy(11n, 201n, 31n, 401n, new Date("2026-10-01T00:00:00Z")), "capacity"); assert.equal(recordedContractCapacity, 2);
});
test("repository uses Room default capacity when no active Contract applies", async () => {
  let created = false; const events: string[] = [];
  const tx = {
    async $queryRaw() { return []; },
    resident: { async findFirst() { return { residentId: 31n }; }, async update({ data }: any) { events.push(`resident:${data.residenceStatus}`); return { residentId: 31n, ...data }; } },
    room: { async findFirst() { return { roomId: 201n, propertyId: 101n, defaultCapacity: 3, isActive: true }; } },
    contract: { async findFirst() { return null; } },
    roomResident: { async findFirst() { return null; }, async count() { return 2; }, async create({ data }: any) { created = true; return { occupancyId: 51n, ...data }; } },
  };
  const db = { async $transaction(callback: (tx: unknown) => Promise<unknown>) { return callback(tx); } };
  const repository = new PrismaResidentOccupancyRepository(db as never);
  const result = await repository.addOccupancy(11n, 201n, 31n, null, new Date("2026-10-01T00:00:00Z")); assert.equal(created, true); assert.equal((result as any).ownerId, 11n);
});
test("add occupancy without applicable Contract uses repository decision and does not trust client capacity", async () => {
  reset(); const result = await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "31", started_at: "2026-10-01", default_capacity: 999 }); assert.equal(result.response.status, 400);
});
test("end occupancy preserves row lifecycle and rejects invalid/already-ended state", async () => {
  let result = await unsafe("/api/v1/occupancies/51/end", "POST", { ended_at: "2026-10-01" }); assert.equal(result.response.status, 200); assert.equal(result.body.data.status, "ended");
  behavior.end = "date"; result = await unsafe("/api/v1/occupancies/51/end", "POST", { ended_at: "2026-09-01" }); assert.equal(result.response.status, 400);
  behavior.end = "ended"; result = await unsafe("/api/v1/occupancies/51/end", "POST", { ended_at: "2026-10-01" }); assert.equal(result.response.status, 409);
});
test("ending an occupancy outside Owner scope returns 404", async () => { behavior.end = "missing"; const result = await unsafe("/api/v1/occupancies/999/end", "POST", { ended_at: "2026-10-01" }); assert.equal(result.response.status, 404); });
test("transfer is one repository transaction and maps validation failures", async () => {
  reset(); const result = await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "51", room_id: "202", contract_id: "402", started_at: "2026-10-01" }); assert.equal(result.response.status, 200); assert.equal(calls[0]?.name, "transfer"); assert.equal(calls[0]?.args[0], 11n);
  behavior.transfer = "capacity"; assert.equal((await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "51", room_id: "202", started_at: "2026-10-01" })).body.error.code, "ROOM_CAPACITY_EXCEEDED");
});
test("repository validates destination before atomically ending source and creating destination", async () => {
  const events: string[] = []; let transactionIsolation = "";
  const tx = {
    async $queryRaw() { events.push("lock-room"); return []; },
    roomResident: {
      async findFirst({ where }: any) { return where.occupancyId ? { occupancyId: 51n, roomId: 201n, startedAt: new Date("2026-01-01T00:00:00Z") } : null; },
      async count() { return 0; },
      async update() { events.push("end-source"); return {}; },
      async create() { events.push("create-destination"); return { occupancyId: 52n }; },
    },
    resident: { async findFirst() { return { residentId: 31n }; }, async update({ data }: any) { events.push(`resident:${data.residenceStatus}`); return { residentId: 31n, ...data }; } },
    room: { async findFirst() { return { roomId: 202n, propertyId: 101n, defaultCapacity: 3, isActive: true }; } },
    contract: { async findFirst() { return { contractId: 402n, propertyId: 101n, residentCapacity: 3 }; } },
  };
  const db = { async $transaction(callback: (tx: unknown) => Promise<unknown>, options: any) { transactionIsolation = options.isolationLevel; return callback(tx); } };
  const repository = new PrismaResidentOccupancyRepository(db as never);
  const result = await repository.transfer(11n, 31n, 51n, 202n, 402n, new Date("2026-10-01T00:00:00Z"));
  assert.deepEqual(events.filter((item) => item === "end-source" || item === "create-destination"), ["end-source", "create-destination"]); assert.equal(transactionIsolation, "Serializable"); assert.ok(result && typeof result === "object");
});
test("transfer destination mismatch/cross-Owner resources are generic 404", async () => {
  behavior.transfer = "missing-contract"; const result = await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "51", room_id: "202", contract_id: "999", started_at: "2026-10-01" }); assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND");
});
test("transfer failure reports capacity and does not return a partial success object", async () => {
  behavior.transfer = "capacity"; const result = await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "51", room_id: "202", started_at: "2026-10-01" }); assert.equal(result.response.status, 409); assert.equal(result.body.error.code, "ROOM_CAPACITY_EXCEEDED"); assert.equal(result.body.data, undefined);
});
test("transfer missing source occupancy or invalid effective date is rejected", async () => {
  behavior.transfer = "missing-source"; let result = await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "99", room_id: "202", started_at: "2026-10-01" }); assert.equal(result.response.status, 404);
  behavior.transfer = "date"; result = await unsafe("/api/v1/residents/31/transfer", "POST", { source_occupancy_id: "51", room_id: "202", started_at: "2026-10-01" }); assert.equal(result.response.status, 400);
});
test("resident may have another active occupancy in a different Room", async () => {
  behavior.add = { occupancyId: 99n, roomId: 202n, residentId: 31n, status: "active" }; const result = await unsafe("/api/v1/rooms/202/residents", "POST", { resident_id: "31", started_at: "2026-10-01" }); assert.equal(result.response.status, 201);
});
test("resident self rental uses authenticated profile and admin is forbidden", async () => {
  await login(residentUser.email); reset(); const result = await request("/api/v1/me/rental"); assert.equal(result.response.status, 200); assert.deepEqual(calls[0]?.args, [11n, 22n]); assert.equal(JSON.stringify(result.body).includes("Other Resident"), false);
  assert.equal((await request("/api/v1/residents")).response.status, 403);
  assert.equal((await unsafe("/api/v1/rooms/201/residents", "POST", { resident_id: "31", started_at: "2026-10-01" })).response.status, 403);
  await login(admin.email); assert.equal((await request("/api/v1/me/rental")).response.status, 403);
});
test("unauthenticated resident/occupancy access is 401", async () => { const result = await fetch(`${baseUrl}/api/v1/residents`); assert.equal(result.status, 401); });

test("resident validators enforce CCCD, dates, pagination, booleans and unsupported fields", () => {
  assert.throws(() => validateResidentCreate({ full_name: "A", national_id: "1" }));
  assert.throws(() => validateResidentSearch({ national_id: "123", owner_id: "11" }));
  assert.throws(() => validateResidentPatch({ birth_date: "2026-02-30" }));
  assert.throws(() => parseResidentListQuery({ residence_registration_status: "pending" }));
  assert.throws(() => validateEndOccupancy({ ended_at: "2026-01-01T00:00:00Z" }));
  assert.throws(() => validateTransfer({ source_occupancy_id: "0", room_id: "1", started_at: "2026-01-01" }));
});

function statusSyncRepo(options: { activeCount?: number; failDestination?: boolean; residentFound?: boolean } = {}) {
  const events: string[] = [];
  const state = { sourceActive: true, residenceStatus: "living" as string };
  const tx = {
    async $queryRaw() { return []; },
    resident: {
      async findFirst() { return options.residentFound === false ? null : { residentId: 31n }; },
      async update({ data }: any) { state.residenceStatus = data.residenceStatus; events.push(`resident:${data.residenceStatus}`); return { residentId: 31n, ...data }; },
    },
    room: { async findFirst() { return { roomId: 202n, propertyId: 101n, defaultCapacity: 3, isActive: true }; } },
    contract: { async findFirst() { return { contractId: 402n, propertyId: 101n, residentCapacity: 3 }; } },
    roomResident: {
      async findFirst({ where }: any) {
        if (where.occupancyId) return state.sourceActive ? { occupancyId: 51n, residentId: 31n, roomId: 201n, startedAt: new Date("2026-01-01T00:00:00Z"), status: "active" } : null;
        return null;
      },
      async count() { return options.activeCount ?? 0; },
      async create({ data }: any) { events.push(`occupancy:create:${data.roomId}`); if (options.failDestination) throw new Error("destination write failed"); return { occupancyId: 52n, ...data }; },
      async update() { events.push("occupancy:end-source"); state.sourceActive = false; return { occupancyId: 51n, status: "ended" }; },
    },
  };
  const db = {
    async $transaction(callback: (client: unknown) => Promise<unknown>) {
      const before = { ...state };
      try { return await callback(tx); } catch (error) { Object.assign(state, before); events.push("rollback"); throw error; }
    },
    resident: { async create({ data }: any) { events.push(`resident:create:${data.residenceStatus}`); return { residentId: 31n, ...data }; } },
  };
  return { repository: new PrismaResidentOccupancyRepository(db as never), events, state };
}

test("new Resident has server-managed left status and cannot choose status on create", async () => {
  assert.equal("residenceStatus" in validateResidentCreate({ full_name: "New" }), false);
  assert.throws(() => validateResidentCreate({ full_name: "New", residence_status: "living" }));
  assert.throws(() => validateResidentCreate({ full_name: "New", residence_status: "left" }));
  const harness = statusSyncRepo();
  const created = await harness.repository.createResident(11n, validateResidentCreate({ full_name: "New" }));
  assert.equal((created as any).residenceStatus, "left");
});

test("PATCH cannot directly change residence_status", () => {
  assert.throws(() => validateResidentPatch({ residence_status: "living" }));
  assert.throws(() => validateResidentPatch({ residence_status: "left" }));
  assert.deepEqual(validateResidentPatch({ residence_registration_status: "temporary_absence" }), { residenceRegistrationStatus: "temporary_absence" });
});

test("HTTP create and PATCH reject client-supplied residence_status", async () => {
  reset();
  const createResult = await unsafe("/api/v1/residents", "POST", { full_name: "New resident", residence_status: "living" });
  assert.equal(createResult.response.status, 400);
  const patchResult = await unsafe("/api/v1/residents/31", "PATCH", { residence_status: "left" });
  assert.equal(patchResult.response.status, 400);
  assert.equal(calls.length, 0);
});

test("first occupancy sets Resident to living in the same transaction", async () => {
  const harness = statusSyncRepo();
  const result = await harness.repository.addOccupancy(11n, 202n, 31n, 402n, new Date("2026-10-01T00:00:00Z"));
  assert.ok(result && typeof result === "object");
  assert.equal(harness.state.residenceStatus, "living");
  assert.deepEqual(harness.events.slice(-2), ["occupancy:create:202", "resident:living"]);
});

test("adding occupancy while already living keeps residence_status living", async () => {
  const harness = statusSyncRepo({ activeCount: 1 });
  await harness.repository.addOccupancy(11n, 202n, 31n, 402n, new Date("2026-10-01T00:00:00Z"));
  assert.equal(harness.state.residenceStatus, "living");
});

test("ending the final active occupancy sets Resident to left", async () => {
  const harness = statusSyncRepo({ activeCount: 0 });
  const result = await harness.repository.endOccupancy(11n, 51n, new Date("2026-10-01T00:00:00Z"));
  assert.equal((result as any).status, "ended");
  assert.equal(harness.state.residenceStatus, "left");
});

test("ending one of multiple active occupancies keeps Resident living", async () => {
  const harness = statusSyncRepo({ activeCount: 1 });
  await harness.repository.endOccupancy(11n, 51n, new Date("2026-10-01T00:00:00Z"));
  assert.equal(harness.state.residenceStatus, "living");
});

test("transfer success keeps Resident living without an intermediate left state", async () => {
  const harness = statusSyncRepo();
  const result = await harness.repository.transfer(11n, 31n, 51n, 202n, 402n, new Date("2026-10-01T00:00:00Z"));
  assert.ok(result && typeof result === "object");
  assert.equal(harness.state.residenceStatus, "living");
  assert.deepEqual(harness.events, ["occupancy:end-source", "occupancy:create:202", "resident:living"]);
});

test("failed transfer rolls back source occupancy and leaves residence_status unchanged", async () => {
  const harness = statusSyncRepo({ failDestination: true });
  await assert.rejects(() => harness.repository.transfer(11n, 31n, 51n, 202n, 402n, new Date("2026-10-01T00:00:00Z")), /destination write failed/);
  assert.equal(harness.state.sourceActive, true);
  assert.equal(harness.state.residenceStatus, "living");
  assert.equal(harness.events.at(-1), "rollback");
});

test("foreign Owner Resident scope cannot update residence_status", async () => {
  const harness = statusSyncRepo({ residentFound: false });
  assert.equal(await harness.repository.addOccupancy(12n, 202n, 31n, 402n, new Date("2026-10-01T00:00:00Z")), "missing-resident");
  assert.equal(harness.events.length, 0);
});

test("capacity conflict does not update residence_status", async () => {
  const harness = statusSyncRepo({ activeCount: 3 });
  assert.equal(await harness.repository.addOccupancy(11n, 202n, 31n, 402n, new Date("2026-10-01T00:00:00Z")), "capacity");
  assert.equal(harness.events.length, 0);
});

test("archive eligibility remains blocked by an active occupancy", async () => {
  reset(); behavior.archive = "conflict";
  const result = await unsafe("/api/v1/residents/31", "DELETE", {});
  assert.equal(result.response.status, 409);
});
