import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { scryptSync } from "node:crypto";
import express from "express";
import type { AuthRepository } from "../auth/auth.types.js";
import type { AuthDependencies } from "../middleware/auth.js";
import { createV1Router } from "../auth/v1.router.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { loadEnv, type RuntimeConfig } from "../config/env.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import type { PropertyRoomRepository } from "./property-room.routes.js";
import { validatePropertyCreate, validatePropertyPatch, validateRoomCreate, validateRoomPatch, parseListQuery } from "./property-room.validation.js";

const origin = "http://localhost:3000";
const password = "safe-test-password";
const account = { accountId: 7n, ownerId: 11n, residentId: null, role: "admin", email: "owner@example.test", phone: null, passwordHash: `scrypt$00112233445566778899aabbccddeeff$${scryptSync(password, "00112233445566778899aabbccddeeff", 64).toString("hex")}`, status: "active", owner: { ownerId: 11n, displayName: "Owner 11" }, resident: null };
const residentAccount = { accountId: 8n, ownerId: null, residentId: 99n, role: "resident", email: "resident@example.test", phone: null, passwordHash: account.passwordHash, status: "active", owner: null, resident: { residentId: 99n, ownerId: 11n, fullName: "Resident" } };
const repositoryCalls: Array<{ method: string; ownerId?: bigint; propertyId?: bigint; roomId?: bigint; data?: any }> = [];
let behavior: Record<string, unknown> = {};
const repository = {
  async listProperties(ownerId: bigint, query: any) { repositoryCalls.push({ method: "listProperties", ownerId }); return { rows: [{ propertyId: 101n, ownerId, propertyCode: "P-1", ...query }], total: 1 }; },
  async createProperty(ownerId: bigint, data: any) { repositoryCalls.push({ method: "createProperty", ownerId, data }); return { propertyId: 101n, ownerId, ...data }; },
  async findProperty(ownerId: bigint, propertyId: bigint) { repositoryCalls.push({ method: "findProperty", ownerId, propertyId }); return behavior.propertyFound === false ? null : { propertyId: 101n, ownerId }; },
  async updateProperty(ownerId: bigint, propertyId: bigint, data: any) { repositoryCalls.push({ method: "updateProperty", ownerId, propertyId, data }); return behavior.propertyFound === false ? null : { propertyId, ownerId, ...data }; },
  async archiveProperty(ownerId: bigint, propertyId: bigint) { repositoryCalls.push({ method: "archiveProperty", ownerId, propertyId }); return behavior.propertyArchive ?? { propertyId, ownerId, status: "archived" }; },
  async listRooms(ownerId: bigint, propertyId: bigint, query: any) { repositoryCalls.push({ method: "listRooms", ownerId, propertyId, data: query }); return behavior.propertyFound === false ? null : { rows: behavior.roomRows === undefined ? [{ roomId: 201n, ownerId, propertyId, ...query }] : behavior.roomRows as unknown[], total: behavior.roomTotal === undefined ? 1 : behavior.roomTotal as number }; },
  async createRoom(ownerId: bigint, propertyId: bigint, data: any) { repositoryCalls.push({ method: "createRoom", ownerId, propertyId, data }); return behavior.propertyFound === false ? null : { roomId: 201n, ownerId, propertyId, ...data }; },
  async findRoom(ownerId: bigint, roomId: bigint) { repositoryCalls.push({ method: "findRoom", ownerId, roomId }); return behavior.roomFound === false ? null : { roomId, ownerId, status: "available", areaM2: "25.50" }; },
  async updateRoom(ownerId: bigint, roomId: bigint, data: any) { repositoryCalls.push({ method: "updateRoom", ownerId, roomId, data }); return behavior.roomFound === false ? null : behavior.roomUpdate ?? { roomId, ownerId, ...data }; },
  async deactivateRoom(ownerId: bigint, roomId: bigint) { repositoryCalls.push({ method: "deactivateRoom", ownerId, roomId }); return behavior.roomDeactivate ?? { roomId, ownerId, status: "inactive", isActive: false }; },
} as unknown as PropertyRoomRepository;
const authRepository: AuthRepository = {
  async findCandidates(login) { return login === account.email ? [account] : login === residentAccount.email ? [residentAccount] : []; },
  async findCurrentAccount(accountId) { return accountId === account.accountId ? account : accountId === residentAccount.accountId ? residentAccount : null; },
};
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "test-session-secret-that-is-long-enough-for-tests" });
const sessions = new InMemorySessionStore();
const auth: AuthDependencies = { config, repository: authRepository, sessions };
let server: Server;
let baseUrl = "";
let sessionCookie = "";
let csrfCookie = "";
let csrfToken = "";

async function http(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (sessionCookie && !headers.has("Cookie")) headers.set("Cookie", sessionCookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  return { response, body: await response.json() };
}
function cookie(response: Response, name: string) {
  const value = response.headers.getSetCookie().map((line) => line.split(";")[0]!).find((line) => line.startsWith(`${name}=`));
  assert.ok(value); return value;
}
async function unsafe(path: string, method: string, body: unknown) {
  return http(path, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: `${sessionCookie}; ${csrfCookie}`, "X-CSRF-Token": csrfToken }, body: JSON.stringify(body) });
}
function reset() { behavior = {}; repositoryCalls.length = 0; }

before(async () => {
  const app = express();
  app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, propertyRoomRepository: repository }));
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
  const csrf = await http("/api/v1/auth/csrf"); csrfCookie = cookie(csrf.response, "gt_csrf"); csrfToken = csrf.body.data.csrf_token;
  const login = await unsafe("/api/v1/auth/login", "POST", { login: account.email, password });
  assert.equal(login.response.status, 200); sessionCookie = cookie(login.response, "gt_session");
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("property list scopes Owner from session and maps bigint to string", async () => {
  reset(); const result = await http("/api/v1/properties");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.ownerId, 11n); assert.equal(result.body.data[0].property_id, "101");
});
test("property list accepts documented filters and pagination", async () => {
  reset(); const result = await http("/api/v1/properties?status=active&province=Hanoi&search=abc&page=2&page_size=15");
  assert.equal(result.response.status, 200); assert.equal(result.body.meta.page, 2); assert.equal(repositoryCalls[0]?.ownerId, 11n);
});
test("property list rejects unsupported query fields", async () => { assert.equal((await http("/api/v1/properties?sort=secret")).response.status, 400); });
test("property create derives owner and accepts physical-schema fields", async () => {
  reset(); const result = await unsafe("/api/v1/properties", "POST", { property_code: "A1", name: "Khu A", province: "Hà Nội", address: "Địa chỉ" });
  assert.equal(result.response.status, 201); assert.equal(repositoryCalls[0]?.ownerId, 11n); assert.equal(repositoryCalls[0]?.data.ownerId, undefined);
});
test("property create rejects client owner authority", async () => {
  const result = await unsafe("/api/v1/properties", "POST", { owner_id: "999", property_code: "A1", name: "A", province: "HN", address: "x" });
  assert.equal(result.response.status, 400);
});
test("property create validates required fields", async () => { assert.equal((await unsafe("/api/v1/properties", "POST", { name: "A" })).response.status, 400); });
test("foreign property detail is indistinguishable 404", async () => {
  reset(); behavior.propertyFound = false; const result = await http("/api/v1/properties/999");
  assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND"); assert.equal(repositoryCalls[0]?.ownerId, 11n);
});
test("invalid property ID is validation error", async () => { assert.equal((await http("/api/v1/properties/1x")).response.status, 400); });
test("property patch allowlists fields and ignores no identity values", async () => {
  reset(); const result = await unsafe("/api/v1/properties/101", "PATCH", { name: "Updated" });
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.ownerId, 11n);
});
test("foreign property update returns same 404", async () => {
  behavior.propertyFound = false; const result = await unsafe("/api/v1/properties/999", "PATCH", { name: "x" });
  assert.equal(result.response.status, 404); reset();
});
test("property patch rejects owner transfer and unknown fields", async () => {
  assert.equal((await unsafe("/api/v1/properties/101", "PATCH", { owner_id: "99" })).response.status, 400);
});
test("property delete archives without hard delete", async () => {
  reset(); const result = await unsafe("/api/v1/properties/101", "DELETE", {});
  assert.equal(result.response.status, 200); assert.equal(result.body.data.status, "archived");
});
test("property archive with active operations returns conflict", async () => {
  behavior.propertyArchive = "conflict"; const result = await unsafe("/api/v1/properties/101", "DELETE", {});
  assert.equal(result.response.status, 409); reset();
});
test("room list scopes the parent property before listing", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?page=1&page_size=15&is_public=true");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.ownerId, 11n); assert.equal(repositoryCalls[0]?.propertyId, 101n);
});
test("Marketplace amenities are structured, owner-editable Room fields with a strict code allowlist", async () => {
  reset();
  const updated = await unsafe("/api/v1/rooms/201", "PATCH", { marketplace_amenities: ["air_conditioning", "parking"] });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(repositoryCalls[0]?.data, { marketplaceAmenities: ["air_conditioning", "parking"] });
  assert.equal((await unsafe("/api/v1/rooms/201", "PATCH", { marketplace_amenities: ["aircon"] })).response.status, 400);
  assert.equal((await unsafe("/api/v1/rooms/201", "PATCH", { marketplace_amenities: ["parking", "parking"] })).response.status, 400);
});
test("room search accepts an exact room_code keyword", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=DEV-SMOKE-R01");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "DEV-SMOKE-R01");
});
test("room search accepts a partial room_code keyword", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=A01");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "A01");
});
test("room search can return an empty result without changing response shape", async () => {
  reset(); behavior.roomRows = []; behavior.roomTotal = 0;
  const result = await http("/api/v1/properties/101/rooms?search=NOT-FOUND");
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.data, []); assert.equal(result.body.meta.total_items, 0);
});
test("empty room search is passed as empty and leaves the ordinary list unfiltered", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=%20%20");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "");
});
test("room search trims surrounding whitespace", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=%20%20A01%20%20");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "A01");
});
test("room search combines with available status", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=A01&status=available");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "A01"); assert.equal(repositoryCalls[0]?.data?.status, "available");
});
test("room search combines with inactive status", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=A01&status=inactive");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "A01"); assert.equal(repositoryCalls[0]?.data?.status, "inactive");
});
test("room search preserves server pagination", async () => {
  reset(); const result = await http("/api/v1/properties/101/rooms?search=A01&page=2&page_size=15");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.data?.search, "A01"); assert.equal(repositoryCalls[0]?.data?.page, 2); assert.equal(repositoryCalls[0]?.data?.page_size, 15); assert.equal(result.body.meta.page, 2);
});
test("foreign Owner cannot see searched Rooms", async () => {
  reset(); behavior.propertyFound = false; const result = await http("/api/v1/properties/999/rooms?search=A01");
  assert.equal(result.response.status, 404); assert.equal(repositoryCalls.length, 1); assert.equal(repositoryCalls[0]?.method, "listRooms"); reset();
});
test("search remains scoped to the Property ID in the route", async () => {
  reset(); const result = await http("/api/v1/properties/102/rooms?search=A01");
  assert.equal(result.response.status, 200); assert.equal(repositoryCalls[0]?.propertyId, 102n); assert.equal(repositoryCalls[0]?.data?.search, "A01");
});
test("room search rejects excessively long keywords", async () => {
  reset(); const result = await http(`/api/v1/properties/101/rooms?search=${"x".repeat(201)}`);
  assert.equal(result.response.status, 400); assert.equal(repositoryCalls.length, 0);
});
test("foreign property room list returns 404", async () => { behavior.propertyFound = false; assert.equal((await http("/api/v1/properties/999/rooms")).response.status, 404); reset(); });
test("room list rejects invalid boolean filter", async () => { assert.equal((await http("/api/v1/properties/101/rooms?is_active=yes")).response.status, 400); });
test("room create derives property and owner from scoped route and session", async () => {
  reset(); const result = await unsafe("/api/v1/properties/101/rooms", "POST", { room_code: "101", default_rent: "5000000", area_m2: "25.50", default_capacity: 3 });
  assert.equal(result.response.status, 201); assert.equal(repositoryCalls[0]?.ownerId, 11n); assert.equal(repositoryCalls[0]?.propertyId, 101n); assert.equal(repositoryCalls[0]?.data.ownerId, undefined);
});
test("room create rejects client room/property identity", async () => {
  assert.equal((await unsafe("/api/v1/properties/101/rooms", "POST", { room_id: "1", room_code: "101", default_rent: "10", area_m2: "2", default_capacity: 1 })).response.status, 400);
});
test("room create rejects non-positive capacity and unsafe money input", async () => {
  assert.throws(() => validateRoomCreate({ room_code: "x", default_rent: "1.5", area_m2: "20", default_capacity: 0 }));
});
test("foreign room detail returns scoped 404", async () => {
  behavior.roomFound = false; const result = await http("/api/v1/rooms/999"); assert.equal(result.response.status, 404); reset();
});
test("room detail serializes decimal area deterministically", async () => {
  const result = await http("/api/v1/rooms/201"); assert.equal(result.response.status, 200); assert.equal(result.body.data.area_m2, "25.50");
});
test("room patch cannot set derived occupied status", async () => {
  assert.equal((await unsafe("/api/v1/rooms/201", "PATCH", { status: "occupied" })).response.status, 400);
});
test("foreign room update returns 404", async () => {
  behavior.roomFound = false; assert.equal((await unsafe("/api/v1/rooms/999", "PATCH", { default_capacity: 4 })).response.status, 404); reset();
});
test("room restore conflict remains 409 while occupied", async () => {
  behavior.roomUpdate = "conflict"; assert.equal((await unsafe("/api/v1/rooms/201", "PATCH", { status: "available" })).response.status, 409); reset();
});
test("room delete deactivates and preserves row", async () => {
  const result = await unsafe("/api/v1/rooms/201", "DELETE", {}); assert.equal(result.response.status, 200); assert.equal(result.body.data.status, "inactive");
});
test("room deactivate conflict while active occupancy/contract exists", async () => {
  behavior.roomDeactivate = "conflict"; assert.equal((await unsafe("/api/v1/rooms/201", "DELETE", {})).response.status, 409); reset();
});
test("missing auth session is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/v1/properties`);
  assert.equal(response.status, 401);
});

test("property validator rejects empty patch", () => { assert.throws(() => validatePropertyPatch({})); });
test("property validator enforces status set", () => { assert.throws(() => validatePropertyCreate({ property_code: "X", name: "X", province: "X", address: "X", status: "deleted" })); });
test("room validator rejects legacy aliases", () => { assert.throws(() => validateRoomCreate({ roomNumber: "1", default_rent: "10", area_m2: "20", default_capacity: 1 })); });
test("room patch validates decimal precision", () => { assert.throws(() => validateRoomPatch({ area_m2: "12.345" })); });
test("pagination enforces page size ceiling", () => { assert.throws(() => parseListQuery({ page_size: "101" })); });
test("Resident role cannot call Admin Property/Room routes", async () => {
  const login = await unsafe("/api/v1/auth/login", "POST", { login: residentAccount.email, password });
  assert.equal(login.response.status, 200);
  const residentCookie = cookie(login.response, "gt_session");
  const response = await fetch(`${baseUrl}/api/v1/properties`, { headers: { Cookie: residentCookie } });
  assert.equal(response.status, 403);
});
