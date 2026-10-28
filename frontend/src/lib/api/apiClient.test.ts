import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { apiRequest, clearCsrfToken, setUnauthorizedHandler } from "./apiClient";
import { authApi } from "./authApi";
import { ApiError, loginErrorMessage } from "./errors";
import { propertyApi } from "./propertyApi";
import { roomApi } from "./roomApi";
import { residentApi } from "./residentApi";
import { occupancyApi } from "./occupancyApi";
import { roomImageApi } from "./roomImageApi";
import { adminContactRequestApi, createPublicContactRequest, getPublicRoom, listPublicRooms, publicRoomApi, resolvePublicRoomImageUrl, serializePublicRoomFilters } from "./publicRoomApi";
import { createSingleFlightGate } from "../singleFlight";
import { publicContactErrorMessage, validatePublicContactInput } from "../publicContact";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearCsrfToken();
  setUnauthorizedHandler(null);
});

test("public Room list preserves V1 data/meta and routes backend covers through the same-origin image proxy", async () => {
  let requestUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return Response.json({
      data: [{ room_id: "248", room_code: "KH", property: { name: "DEV-SMOKE-PROP-01", province: "Đồng Nai", address: "DEV-SMOKE-PROP-01, Đồng Nai" }, default_rent: "1", area_m2: "1.00", default_capacity: 1, status: "available", public_description: null, cover_image: { image_id: "22", url: "/api/v1/public/room-images/22" } }],
      meta: { page: 1, page_size: 20, total_items: 5, total_pages: 1 },
    });
  }) as typeof fetch;

  const result = await publicRoomApi.list({ page: 1, page_size: 20 });
  assert.equal(new URL(requestUrl).pathname, "/api/v1/public/rooms");
  assert.equal(new URL(requestUrl).searchParams.get("page_size"), "20");
  assert.equal(result.data[0]?.room_id, "248");
  assert.equal(result.meta.total_items, 5);
  assert.equal(resolvePublicRoomImageUrl(result.data[0]?.cover_image?.url), "/api/public/room-images/22");
  assert.equal(resolvePublicRoomImageUrl("http://localhost:4000/api/v1/public/room-images/23"), "/api/public/room-images/23");
  assert.equal(resolvePublicRoomImageUrl("https://example.test/api/v1/public/room-images/23"), null);
  assert.equal(resolvePublicRoomImageUrl(null), null);
});

test("public Room list serializes only canonical filters and uses backend pagination", async () => {
  const query = serializePublicRoomFilters({ province: " Đồng Nai ", address: " Đường Mẫu ", location: "Biên Hòa", price_min: "1000000", price_max: "5000000", area_min: "20", area_max: "40", capacity_min: "2", sort: "price_asc", page: 3, page_size: 12, property_name: "must not send" } as never);
  assert.deepEqual([...query.entries()], [["page", "3"], ["page_size", "12"], ["province", "Đồng Nai"], ["address", "Đường Mẫu"], ["location", "Biên Hòa"], ["price_min", "1000000"], ["price_max", "5000000"], ["area_min", "20"], ["area_max", "40"], ["capacity_min", "2"], ["sort", "price_asc"]]);
  let url = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => { url = String(input); return Response.json({ data: [], meta: { page: 3, page_size: 12, total_items: 0, total_pages: 0 } }); }) as typeof fetch;
  const response = await listPublicRooms({ page: 3, page_size: 12, province: "Đồng Nai", sort: "price_asc" });
  assert.equal(new URL(url).pathname, "/api/v1/public/rooms");
  assert.equal(new URL(url).searchParams.get("sort"), "price_asc");
  assert.equal(new URL(url).searchParams.has("location"), false, "location is a bounded client-side handoff filter, not a backend API parameter");
  assert.equal(response.meta.page, 3);
});

test("Cloudy all-results location handoff scans bounded API pages and paginates every match", async () => {
  const calls: URL[] = [];
  const row = (id: number, province: string, address: string) => ({
    room_id: String(id), room_code: `R${id}`, property: { name: `Property ${id}`, province, address },
    default_rent: "3000000", area_m2: "24.00", default_capacity: 2, status: "available" as const,
    public_description: null, cover_image: null,
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); calls.push(url);
    const page = Number(url.searchParams.get("page"));
    const data = page === 1
      ? [row(1, "Đồng Nai", "Biên Hòa"), ...Array.from({ length: 99 }, (_, i) => row(i + 2, "TP. Hồ Chí Minh", "Quận 1"))]
      : [row(101, "Đồng Nai", "Long Thành")];
    return Response.json({ data, meta: { page, page_size: 100, total_items: 101, total_pages: 2 } });
  }) as typeof fetch;

  const result = await listPublicRooms({ location: "Dong Nai", price_max: "3999999", sort: "price_asc", page: 2, page_size: 1 });
  assert.deepEqual(result.data.map(room => room.room_id), ["101"]);
  assert.deepEqual(result.meta, { page: 2, page_size: 1, total_items: 2, total_pages: 2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.searchParams.has("location"), false);
  assert.equal(calls[0]?.searchParams.get("price_max"), "3999999");
  assert.equal(calls[0]?.searchParams.get("page_size"), "100");
});

test("public Room detail uses a string route ID and detail DTO", async () => {
  let url = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => { url = String(input); return Response.json({ data: { room_id: "9007199254740993", room_code: "A/1", property: { name: "Khu", province: "Đồng Nai", address: "Đường A" }, default_rent: "4500000", area_m2: "20.00", default_capacity: 2, status: "available", public_description: null, cover_image: null, images: [{ image_id: "8", url: "/api/v1/public/room-images/8", is_cover: true, sort_order: 0 }] } }); }) as typeof fetch;
  const detail = await getPublicRoom("9007199254740993");
  assert.equal(url, "http://localhost:4000/api/v1/public/rooms/9007199254740993");
  assert.equal(detail.room_id, "9007199254740993");
  assert.equal(detail.images[0]?.sort_order, 0);
});

test("guest Contact Request bootstraps CSRF and posts canonical fields without authentication", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "guest-csrf" } });
    return Response.json({ data: { contact_request_id: "71", status: "new" } }, { status: 201 });
  }) as typeof fetch;
  const ack = await createPublicContactRequest({ room_id: "248", requester_name: "Khách thử", phone: "+84999990000", email: "", message: "" });
  assert.equal(calls[0]?.url, "http://localhost:4000/api/v1/auth/csrf");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[1]?.url, "http://localhost:4000/api/v1/public/contact-requests");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal(new Headers(calls[1]?.init?.headers).get("X-CSRF-Token"), "guest-csrf");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { room_id: "248", requester_name: "Khách thử", phone: "+84999990000", email: "", message: "" });
  assert.deepEqual(ack, { contact_request_id: "71", status: "new" });
});

test("Admin Contact Request list/detail/status helpers retain supported filters and CSRF", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "admin-csrf" } });
    if (url.includes("/contact-requests?")) return Response.json({ data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } });
    return Response.json({ data: { contact_request_id: "71", property_id: "12", room_id: "248", requester_name: "Guest", phone: "+84999990000", email: null, message: null, status: "contacted", created_at: "2026-10-11T00:00:00.000Z", updated_at: "2026-10-11T00:00:00.000Z", property: { property_id: "12", name: "Khu", province: "Đồng Nai", address: "Đường A" }, room: { room_id: "248", room_code: "A01" } } });
  }) as typeof fetch;
  await adminContactRequestApi.list({ page: 1, page_size: 20, property_id: "12", status: "new", created_at: "2026-10-11", extra: "unsupported" } as never);
  await adminContactRequestApi.get("71");
  const updated = await adminContactRequestApi.updateStatus("71", "contacted");
  assert.match(calls[0]!.url, /\/contact-requests\?page=1&page_size=20&property_id=12&status=new&created_at=2026-10-11$/);
  assert.equal(calls[1]?.url, "http://localhost:4000/api/v1/contact-requests/71");
  assert.equal(calls[2]?.url, "http://localhost:4000/api/v1/auth/csrf");
  assert.equal(calls[3]?.url, "http://localhost:4000/api/v1/contact-requests/71");
  assert.equal(new Headers(calls[3]?.init?.headers).get("X-CSRF-Token"), "admin-csrf");
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { status: "contacted" });
  assert.equal(updated.status, "contacted");
});

test("single-flight gate prevents duplicate concurrent contact submissions", async () => {
  const gate = createSingleFlightGate();
  let release!: () => void;
  let calls = 0;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const first = gate(async () => { calls++; await wait; });
  const second = await gate(async () => { calls++; });
  assert.equal(second, false);
  release();
  assert.equal(await first, true);
  assert.equal(calls, 1);
});

test("public Contact Request validation and safe API error messages cover field and server states", () => {
  assert.equal(validatePublicContactInput({ room_id: "1", requester_name: "A", phone: "+84999990000" }), "Vui lòng nhập họ tên từ 2 đến 200 ký tự.");
  assert.equal(validatePublicContactInput({ room_id: "1", requester_name: "Khách thử", phone: "123" }), "Vui lòng nhập số điện thoại hợp lệ.");
  assert.equal(validatePublicContactInput({ room_id: "1", requester_name: "Khách thử", phone: "+84999990000", email: "not-email" }), "Vui lòng kiểm tra địa chỉ email.");
  assert.equal(validatePublicContactInput({ room_id: "1", requester_name: "Khách thử", phone: "+84999990000", message: "x".repeat(2001) }), "Lời nhắn không được vượt quá 2.000 ký tự.");
  assert.equal(validatePublicContactInput({ room_id: "1", requester_name: "Khách thử", phone: "+84999990000" }), null);
  assert.equal(publicContactErrorMessage(new ApiError("backend details", 404, "NOT_FOUND")), "Phòng này hiện không còn khả dụng. Vui lòng chọn phòng khác.");
  assert.match(publicContactErrorMessage(new ApiError("private backend detail", 429, "RATE_LIMITED")), /chờ một chút/);
  assert.match(publicContactErrorMessage(new ApiError("private backend detail", 500, "DB_FAILURE")), /Chưa gửi được/);
  assert.doesNotMatch(publicContactErrorMessage(new ApiError("private backend detail", 500, "DB_FAILURE")), /private backend detail/);
});

test("login uses the V1 login shape and includes the server-owned cookie credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-test" } });
    return Response.json({ data: {
      account: { account_id: "9007199254740993", role: "admin", email: "admin@example.test", phone: null, status: "active" },
      profile: { owner_id: "44", display_name: "Chủ trọ mẫu" }, expires_at: "2026-10-09T00:00:00Z",
    } });
  }) as typeof fetch;

  const current = await authApi.login("admin@example.test", "secret");
  assert.equal(current.account.account_id, "9007199254740993");
  assert.equal(current.account.role, "admin");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/v1\/auth\/csrf$/);
  assert.equal(calls[1].url, "http://localhost:4000/api/v1/auth/login");
  assert.equal(calls[1].init?.credentials, "include");
  assert.equal(new Headers(calls[1].init?.headers).get("X-CSRF-Token"), "csrf-test");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { login: "admin@example.test", password: "secret" });
});

test("property and room operations use V1 routes, snake_case payloads, and no owner identity", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-test" } });
    return Response.json({ data: { property_id: "15", room_id: "22" } });
  }) as typeof fetch;

  await propertyApi.list({ page: 2, page_size: 20, search: "Biên Hòa", status: "active", province: "Đồng Nai" });
  await propertyApi.create({ property_code: "BH-01", name: "Khu A", province: "Đồng Nai", address: "12 Đường Mẫu" });
  await propertyApi.update("15", { manager_name: null, name: "Khu A mới" });
  await propertyApi.archive("15");
  await roomApi.list("15", 1);
  await roomApi.create("15", { room_code: "A101", default_rent: "3500000", area_m2: "25.50", default_capacity: 3, is_active: true, is_public: false });
  await roomApi.update("22", { default_capacity: 4 });
  await roomApi.deactivate("22");
  await roomApi.list("15", 2, 20, "available");
  await roomApi.list("15", 3, 15, "inactive", "  A01  ");

  const requests = calls.filter((call) => !call.url.endsWith("/auth/csrf"));
  assert.match(requests[0].url, /\/properties\?page=2&page_size=20&status=active&province=.*&search=/);
  assert.equal(requests[0].init?.credentials, "include");
  assert.equal(requests[1].url, "http://localhost:4000/api/v1/properties");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { property_code: "BH-01", name: "Khu A", province: "Đồng Nai", address: "12 Đường Mẫu" });
  assert.equal(requests[2].url, "http://localhost:4000/api/v1/properties/15");
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { manager_name: null, name: "Khu A mới" });
  assert.equal(requests[3].init?.method, "DELETE");
  assert.equal(requests[4].url, "http://localhost:4000/api/v1/properties/15/rooms?page=1&page_size=20");
  assert.deepEqual(JSON.parse(String(requests[5].init?.body)), { room_code: "A101", default_rent: "3500000", area_m2: "25.50", default_capacity: 3, is_active: true, is_public: false });
  assert.deepEqual(JSON.parse(String(requests[6].init?.body)), { default_capacity: 4 });
  assert.equal(requests[7].init?.method, "DELETE");
  assert.equal(requests[8].url, "http://localhost:4000/api/v1/properties/15/rooms?page=2&page_size=20&status=available");
  assert.equal(requests[9].url, "http://localhost:4000/api/v1/properties/15/rooms?page=3&page_size=15&status=inactive&search=A01");
  for (const request of requests.slice(1).filter((item) => ["POST", "PATCH", "DELETE"].includes(String(item.init?.method)))) {
    const body = request.init?.body ? String(request.init.body) : "";
    assert.doesNotMatch(body, /owner_id|resident_id|created_at|updated_at/);
    assert.equal(new Headers(request.init?.headers).get("X-CSRF-Token"), "csrf-test", request.url);
  }
});

test("central API errors retain backend codes and 401 clears auth state", async () => {
  let invalidated = false;
  setUnauthorizedHandler(() => { invalidated = true; });
  globalThis.fetch = (async () => Response.json({ error: { code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập." } }, { status: 401 })) as typeof fetch;
  await assert.rejects(apiRequest("/properties"), (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED");
  assert.equal(invalidated, true);

  globalThis.fetch = (async () => Response.json({ error: { code: "CONFLICT", message: "Khu vực còn hợp đồng." } }, { status: 409 })) as typeof fetch;
  await assert.rejects(apiRequest("/properties/15", { method: "DELETE" }), (error: unknown) => error instanceof ApiError && error.status === 409 && error.message === "Khu vực còn hợp đồng.");
});

test("failed login is mapped to the backend's generic invalid-or-unavailable account message", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-test" } });
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập để tiếp tục." } }, { status: 401 });
  }) as typeof fetch;
  await assert.rejects(authApi.login("missing@example.test", "wrong"), (error: unknown) => {
    assert.equal(loginErrorMessage(error), "Thông tin đăng nhập không hợp lệ hoặc tài khoản chưa thể đăng nhập.");
    return error instanceof ApiError && error.status === 401;
  });
});

test("Resident and Occupancy helpers use exact V1 routes, filters, payloads, and idempotency headers", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-test" } });
    return Response.json({ data: { resident_id: "9007199254740993", occupancy_id: "9007199254740995" } });
  }) as typeof fetch;

  await residentApi.list({ page: 2, page_size: 20, residence_status: "living", residence_registration_status: "temporary_absence", property_id: "9007199254740993", room_id: "9007199254740995" });
  await residentApi.searchByNationalId("079123456789");
  await residentApi.create({ full_name: "Nguyễn An", national_id: "079123456789" });
  await residentApi.update("9007199254740993", { full_name: "An Nguyễn" });
  await residentApi.archive("9007199254740993");
  await occupancyApi.listForRoom("9007199254740995");
  await occupancyApi.add("9007199254740995", { resident_id: "9007199254740993", started_at: "2026-10-09" });
  await occupancyApi.end("9007199254740996", "2026-10-09");
  await occupancyApi.transfer("9007199254740993", { source_occupancy_id: "9007199254740996", room_id: "9007199254740997", contract_id: null, started_at: "2026-10-09" });
  await residentApi.meContracts();
  await residentApi.contractDetail("9007199254740998");

  const requests = calls.filter((call) => !call.url.endsWith("/auth/csrf"));
  assert.equal(requests[0].url, "http://localhost:4000/api/v1/residents?page=2&page_size=20&residence_status=living&residence_registration_status=temporary_absence&property_id=9007199254740993&room_id=9007199254740995");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { national_id: "079123456789" });
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { full_name: "Nguyễn An", national_id: "079123456789" });
  assert.ok(new Headers(requests[2].init?.headers).get("Idempotency-Key"));
  assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { full_name: "An Nguyễn" });
  assert.equal(requests[4].init?.method, "DELETE");
  assert.equal(requests[5].url, "http://localhost:4000/api/v1/rooms/9007199254740995/residents");
  assert.deepEqual(JSON.parse(String(requests[6].init?.body)), { resident_id: "9007199254740993", started_at: "2026-10-09" });
  assert.deepEqual(JSON.parse(String(requests[7].init?.body)), { ended_at: "2026-10-09" });
  assert.deepEqual(JSON.parse(String(requests[8].init?.body)), { source_occupancy_id: "9007199254740996", room_id: "9007199254740997", contract_id: null, started_at: "2026-10-09" });
  assert.equal(requests[9].url, "http://localhost:4000/api/v1/me/contracts?page=1&page_size=20");
  assert.equal(requests[10].url, "http://localhost:4000/api/v1/contracts/9007199254740998");
  for (const request of requests) {
    assert.equal(request.init?.credentials, "include", request.url);
    if (["POST", "PATCH", "DELETE"].includes(String(request.init?.method))) assert.equal(new Headers(request.init?.headers).get("X-CSRF-Token"), "csrf-test", request.url);
  }
  for (const index of [6, 7, 8]) assert.ok(new Headers(requests[index].init?.headers).get("Idempotency-Key"));
});

test("Room Images helpers keep multipart boundaries, exact route shapes and CSRF credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-images" } });
    if (url.endsWith("/bulk-attach")) return Response.json({ data: { room_ids: ["22", "23"], image_results: [{ file_index: 0, status: "attached", association_count: 2 }] } });
    if (url.endsWith("/order")) return Response.json({ data: [] });
    if (url.endsWith("/cover")) return Response.json({ data: { image_id: "88" } });
    if (init?.method === "DELETE") return Response.json({ data: { deleted_image_id: "88", promoted_cover_image_id: null, physical_cleanup_pending: false } });
    if (init?.method === "POST") return Response.json({ data: { image_id: "88" } }, { status: 201 });
    return Response.json({ data: [] });
  }) as typeof fetch;

  const first = new File([new Uint8Array([1, 2, 3])], "room-front.jpg", { type: "image/jpeg" });
  const second = new File([new Uint8Array([4, 5, 6])], "room-back.webp", { type: "image/webp" });
  await roomImageApi.list("15", "22");
  await roomImageApi.upload("15", "22", first);
  await roomImageApi.bulkAttach("15", ["22", "23"], [first, second]);
  await roomImageApi.reorder("15", "22", ["88", "89"]);
  await roomImageApi.setCover("15", "22", "88");
  await roomImageApi.delete("15", "22", "88");

  const requests = calls.filter((call) => !call.url.endsWith("/auth/csrf"));
  assert.equal(requests[0].url, "http://localhost:4000/api/v1/properties/15/rooms/22/images");
  assert.equal(requests[1].init?.method, "POST");
  assert.equal(requests[1].url, requests[0].url);
  assert.ok(requests[1].init?.body instanceof FormData);
  assert.equal((requests[1].init?.body as FormData).get("file"), first);
  assert.equal(new Headers(requests[1].init?.headers).get("Content-Type"), null, "browser must add the multipart boundary");
  assert.equal(requests[2].url, "http://localhost:4000/api/v1/properties/15/rooms/images/bulk-attach");
  const bulk = requests[2].init?.body as FormData;
  assert.equal(bulk.get("room_ids"), '["22","23"]');
  assert.deepEqual(bulk.getAll("files"), [first, second]);
  assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { image_ids: ["88", "89"] });
  assert.equal(requests[3].url.endsWith("/images/order"), true);
  assert.deepEqual(JSON.parse(String(requests[4].init?.body)), {});
  assert.equal(requests[4].url.endsWith("/images/88/cover"), true);
  assert.equal(requests[5].init?.method, "DELETE");
  for (const request of requests) {
    assert.equal(request.init?.credentials, "include");
    if (["POST", "PUT", "DELETE"].includes(String(request.init?.method))) assert.equal(new Headers(request.init?.headers).get("X-CSRF-Token"), "csrf-images");
  }
});
