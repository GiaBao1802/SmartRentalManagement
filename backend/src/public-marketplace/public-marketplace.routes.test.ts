import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { AuthRepository, CurrentAccountRecord } from "../auth/auth.types.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { loadEnv, type RuntimeConfig } from "../config/env.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { createV1Router } from "../auth/v1.router.js";
import type { ContactRequestRepositoryPort } from "./public-marketplace.repository.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "public-marketplace-test-session-secret-32-bytes" });
const adminA: CurrentAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin-a@example.test", phone: null, status: "active", owner: { ownerId: 101n, displayName: "Owner A" }, resident: null };
const adminB: CurrentAccountRecord = { ...adminA, accountId: 12n, ownerId: 102n, email: "admin-b@example.test", owner: { ownerId: 102n, displayName: "Owner B" } };
const resident: CurrentAccountRecord = { accountId: 13n, ownerId: null, residentId: 201n, role: "resident", email: "resident@example.test", phone: null, status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
const accounts = [adminA, adminB, resident];
const authRepository: AuthRepository = { async findCandidates() { return []; }, async findCurrentAccount(id) { return accounts.find((account) => account.accountId === id) ?? null; } };
const sessions = new InMemorySessionStore();
const auth: AuthDependencies = { config, repository: authRepository, sessions };
const publicRoom = {
  roomId: 301n, roomCode: "A-01", defaultRent: 5_000_000n, areaM2: { toFixed: () => "25.50" }, defaultCapacity: 3, publicDescription: "Phòng sáng",
  marketplaceAmenities: ["air_conditioning", "parking"],
  property: { name: "Khu A", province: "Hà Nội", address: "Đường X" },
  images: [{ roomImageId: 801n, isCover: true, sortOrder: 1 }],
  storageKey: "must-not-leak", ownerId: 101n, internalNote: "private",
};
const lead = (ownerId: bigint, status = "new") => ({ contactRequestId: 901n, propertyId: ownerId === 101n ? 501n : 502n, roomId: 301n, requesterName: "DEV Smoke Guest", phone: "+84999990000", email: null, message: "DEV/SMOKE only", status, createdAt: new Date("2026-10-11T09:00:00Z"), updatedAt: new Date("2026-10-11T09:00:00Z"), property: { propertyId: ownerId === 101n ? 501n : 502n, name: "Khu A", province: "Hà Nội", address: "Đường X" }, room: { roomId: 301n, roomCode: "A-01" } });
const observed: Array<{ method: string; args: unknown[] }> = [];
const repository: ContactRequestRepositoryPort = {
  async listPublicRooms(...args) { observed.push({ method: "listPublicRooms", args }); return { rows: [publicRoom], total: 1 }; },
  async listPublicPropertyFacilities(...args) { observed.push({ method: "listPublicPropertyFacilities", args }); return []; },
  async findPublicRoom(...args) { observed.push({ method: "findPublicRoom", args }); return args[0] === 301n ? publicRoom : null; },
  async createContactRequest(...args) { observed.push({ method: "createContactRequest", args }); return { contactRequestId: 901n, status: "new" }; },
  async listContactRequests(...args) { observed.push({ method: "listContactRequests", args }); return { rows: [lead(args[0])], total: 1 }; },
  async findContactRequest(...args) { observed.push({ method: "findContactRequest", args }); return args[0] === 101n && args[1] === 901n ? lead(101n) : null; },
  async updateContactRequestStatus(...args) { observed.push({ method: "updateContactRequestStatus", args }); return args[0] === 101n && args[1] === 901n ? lead(101n, args[2]) : null; },
};
const tokens = new Map<string, { session: string; csrf: string }>();
async function install(account: CurrentAccountRecord, key: string) {
  const session = createOpaqueSessionToken(); const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(account.accountId, hashSessionToken(session, config.sessionSecret), config)); tokens.set(key, { session, csrf });
}
function requestHeaders(key: string, unsafe = false) {
  const pair = tokens.get(key)!;
  return { Cookie: `gt_session=${pair.session}; gt_csrf=${pair.csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": pair.csrf } : {}) };
}
let server: Server; let baseUrl = "";
async function call(path: string, key = "guest", init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: init.method, headers: { ...requestHeaders(key, !!init.method && init.method !== "GET"), ...(init.headers ?? {}), ...(init.body ? { "Content-Type": "application/json" } : {}) }, ...(init.body === undefined ? {} : { body: init.body }) });
  return { response, body: await response.json() as any };
}
function reset() { observed.length = 0; }

before(async () => {
  await install(adminA, "admin-a"); await install(adminB, "admin-b"); await install(resident, "resident");
  // Guest has a valid double-submit CSRF token but no authenticated session.
  const csrf = makeCsrfToken(config.sessionSecret); tokens.set("guest", { session: "", csrf });
  const app = express(); app.use(requestIdMiddleware); app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1", createV1Router({ ...auth, publicMarketplaceRepository: repository })); app.use(errorHandler);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("public list accepts canonical filters and emits only the public allowlist", async () => {
  reset();
  const result = await call("/api/v1/public/rooms?province=H%C3%A0%20N%E1%BB%99i&address=Duong%20X&price_min=1000000&price_max=6000000&area_min=20&area_max=30&capacity_min=2&amenities=air_conditioning%2Cparking&sort=price_asc&page=2&page_size=15");
  assert.equal(result.response.status, 200); assert.equal(result.body.meta.page, 2); assert.equal(result.body.meta.page_size, 15);
  const query = observed[0]?.args[0] as any;
  assert.equal(query.page, 2); assert.equal(query.page_size, 15); assert.equal(query.province, "Hà Nội"); assert.equal(query.address, "Duong X");
  assert.equal(query.price_min, 1_000_000n); assert.equal(query.price_max, 6_000_000n); assert.equal(query.area_min.toString(), "20"); assert.equal(query.area_max.toString(), "30"); assert.equal(query.capacity_min, 2); assert.equal(query.sort, "price_asc");
  assert.deepEqual(query.amenities, ["air_conditioning", "parking"]);
  const dto = result.body.data[0]; assert.equal(dto.room_id, "301"); assert.equal(dto.cover_image.url, "/api/v1/public/room-images/801");
  assert.deepEqual(dto.amenities, ["air_conditioning", "parking"]);
  assert.equal(JSON.stringify(result.body).includes("storageKey"), false); assert.equal(JSON.stringify(result.body).includes("ownerId"), false); assert.equal(JSON.stringify(result.body).includes("internalNote"), false);
});

test("public list rejects unsupported Property-name search and invalid ranges", async () => {
  assert.equal((await call("/api/v1/public/rooms?search=Khu%20A")).response.status, 400);
  assert.equal((await call("/api/v1/public/rooms?price_min=700&price_max=2")).response.status, 400);
  assert.equal((await call("/api/v1/public/rooms?amenities=air_conditioning%2Cunknown")).response.status, 400);
  assert.equal((await call("/api/v1/public/rooms?amenities=parking%2Cparking")).response.status, 400);
});

test("public detail uses generic not-found and ordered safe image DTO", async () => {
  const detail = await call("/api/v1/public/rooms/301"); assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body.data.images, [{ image_id: "801", url: "/api/v1/public/room-images/801", is_cover: true, sort_order: 1, is_illustrative: false }]);
  assert.equal(JSON.stringify(detail.body).includes("storageKey"), false);
  for (const id of ["999", "9901", "9902", "9903", "9904", "9905"]) {
    const hidden = await call(`/api/v1/public/rooms/${id}`); assert.equal(hidden.response.status, 404); assert.equal(hidden.body.error.code, "NOT_FOUND");
  }
});

test("guest creates contact without account and server derives target while rejecting authority injection", async () => {
  reset();
  const created = await call("/api/v1/public/contact-requests", "guest", { method: "POST", body: JSON.stringify({ room_id: "301", requester_name: " DEV Smoke Guest ", phone: "+84 999 990 000", message: "DEV/SMOKE only" }) });
  assert.equal(created.response.status, 201); assert.deepEqual(created.body.data, { contact_request_id: "901", status: "new" });
  assert.equal((observed[0]?.args[0] as any).requester_name, "DEV Smoke Guest"); assert.equal(JSON.stringify(created.body).includes("999"), false);
  const injected = await call("/api/v1/public/contact-requests", "guest", { method: "POST", body: JSON.stringify({ property_id: "501", owner_id: "101", requester_name: "Guest", phone: "+84999990000" }) });
  assert.equal(injected.response.status, 400);
  const invalidBodies = [
    { room_id: "301", requester_name: "G", phone: "+84999990000" },
    { room_id: "301", requester_name: "Guest", phone: "123" },
    { room_id: "301", requester_name: "Guest", phone: "+84999990000", message: "x".repeat(2001) },
    { requester_name: "Guest", phone: "+84999990000" },
  ];
  for (const body of invalidBodies) {
    const invalid = await call("/api/v1/public/contact-requests", "guest", { method: "POST", body: JSON.stringify(body) });
    assert.equal(invalid.response.status, 400); assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
  }
  const csrfMissing = await fetch(`${baseUrl}/api/v1/public/contact-requests`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ room_id: "301", requester_name: "Guest", phone: "+84999990000" }) });
  assert.equal(csrfMissing.status, 403);
});

test("admin inbox derives owner from session, hides foreign leads and restricts status patch", async () => {
  reset();
  const own = await call("/api/v1/contact-requests?property_id=501&status=new&created_at=2026-10-11&page=1&page_size=20", "admin-a");
  assert.equal(own.response.status, 200); assert.equal((observed[0]?.args[0]), 101n); assert.equal(own.body.data[0].phone, "+84999990000");
  assert.equal((await call("/api/v1/contact-requests/901", "admin-b")).response.status, 404);
  const residentDenied = await call("/api/v1/contact-requests", "resident"); assert.equal(residentDenied.response.status, 403);
  const unauthenticated = await call("/api/v1/contact-requests", "guest"); assert.equal(unauthenticated.response.status, 401);
  const changed = await call("/api/v1/contact-requests/901", "admin-a", { method: "PATCH", body: JSON.stringify({ status: "contacted" }) });
  assert.equal(changed.response.status, 200); assert.equal(changed.body.data.status, "contacted");
  assert.equal((await call("/api/v1/contact-requests/901", "admin-a", { method: "PATCH", body: JSON.stringify({ status: "closed", phone: "rewrite" }) })).response.status, 400);
  const noCsrf = await fetch(`${baseUrl}/api/v1/contact-requests/901`, { method: "PATCH", headers: { Cookie: requestHeaders("admin-a").Cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) });
  assert.equal(noCsrf.status, 403);
});

test("oversized JSON is rejected with a safe 413 response", async () => {
  const tooLarge = await fetch(`${baseUrl}/api/v1/public/contact-requests`, { method: "POST", headers: { ...requestHeaders("guest", true), "Content-Type": "application/json" }, body: JSON.stringify({ room_id: "301", requester_name: "Guest", phone: "+84999990000", message: "x".repeat(1_050_000) }) });
  assert.equal(tooLarge.status, 413); assert.equal((await tooLarge.json() as any).error.code, "PAYLOAD_TOO_LARGE");
});

test("public contact endpoint applies an IP rate limit", async () => {
  let rateLimited = false;
  for (let index = 0; index < config.loginMaxAttempts + 2; index++) {
    const result = await call("/api/v1/public/contact-requests", "guest", { method: "POST", body: JSON.stringify({ room_id: "301", requester_name: "Guest", phone: "+84999990000" }) });
    if (result.response.status === 429) { rateLimited = true; assert.equal(result.body.error.code, "RATE_LIMITED"); assert.ok(Number(result.response.headers.get("retry-after")) > 0); break; }
  }
  assert.equal(rateLimited, true);
});
