import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { contractApi } from "./contractApi";
import { clearCsrfToken } from "./apiClient";
import { ApiError } from "./errors";
import { residentApi } from "./residentApi";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

const contract = {
  contract_id: "9007199254740993", contract_no: "HD-DEV-01", room_id: "9007199254740994", property_id: "9007199254740995", owner_id: "9007199254740996",
  representative_resident_id: "9007199254740997", previous_contract_id: null, start_date: "2026-10-15", end_date: "2027-10-14", status: "active", revision: 2,
  rent_amount: "4500000000000000", deposit_amount: "5000000", resident_capacity: 2, initial_electric_kwh: null, initial_water_m3: null,
  termination_date: null, termination_reason: null, final_electric_kwh: null, final_water_m3: null, deposit_deduction: null, deposit_settlement_amount: null,
  created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-11T00:00:00.000Z",
};

test("Admin Contract V1 helpers preserve list mapping, string IDs, filters and exact lifecycle concurrency headers", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "contract-csrf" } });
    if (url.includes("/contracts?") || url.includes("/history?")) return Response.json({ data: [contract], meta: { page: 2, page_size: 20, total_items: 21, total_pages: 2 } });
    if (url.endsWith("/documents")) return Response.json({ data: [] });
    if (url.includes("/contract-documents/")) return Response.json({ data: { document_id: "81", contract_id: contract.contract_id, property_id: contract.property_id, owner_id: contract.owner_id, file_name: "hd.pdf", mime_type: "application/pdf", file_size: 22, document_type: "contract", version: 1, checksum_sha256: "a".repeat(64), status: "draft", uploaded_by_account_id: "91", signed_at: null, signature_provider: null, signature_reference: null, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z", download_url: null } });
    if (init?.method === "POST" && url.endsWith("/terminate")) return Response.json({ data: { ...contract, status: "terminated", revision: 3, termination_date: "2027-01-01" } });
    if (init?.method === "POST" && url.endsWith("/renew")) return Response.json({ data: { ...contract, contract_id: "91", contract_no: "HD-DEV-02", previous_contract_id: contract.contract_id, status: "draft", revision: 0 } }, { status: 201 });
    if (init?.method === "POST" && url.endsWith("/activate")) return Response.json({ data: contract });
    if (init?.method === "POST" && url.endsWith("/documents")) return Response.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Kho lưu trữ chưa sẵn sàng." } }, { status: 503 });
    if (init?.method === "POST") return Response.json({ data: { ...contract, status: "draft", revision: 0 } }, { status: 201 });
    if (init?.method === "PATCH") return Response.json({ data: contract });
    return Response.json({ data: contract });
  }) as typeof fetch;

  const list = await contractApi.list({ page: 2, page_size: 20, property_id: "9007199254740995", room_id: "9007199254740994", representative_resident_id: "9007199254740997", status: "active", expiring_before: "2027-01-01", contract_no: " hd-01 " });
  await contractApi.get(contract.contract_id);
  await contractApi.create({ contract_no: "HD-DEV-01", room_id: contract.room_id, representative_resident_id: contract.representative_resident_id, start_date: contract.start_date, end_date: contract.end_date, rent_amount: "4500000", deposit_amount: "5000000", resident_capacity: 2, initial_electric_kwh: null, initial_water_m3: null });
  await contractApi.activate(contract.contract_id);
  await contractApi.update(contract.contract_id, { contract_no: "HD-DRAFT", start_date: contract.start_date });
  await contractApi.update(contract.contract_id, { rent_amount: "4500000", change_reason: "Điều chỉnh theo thỏa thuận" }, 2);
  const history = await contractApi.history(contract.contract_id, 2, 20);
  await contractApi.renew(contract.contract_id, 2, { contract_no: "HD-NEW", start_date: "2027-10-15", end_date: "2028-10-14" });
  await contractApi.terminate(contract.contract_id, 2, { termination_date: "2027-01-01", termination_reason: "Thỏa thuận", final_electric_kwh: "12.500", final_water_m3: "7.000", deposit_deduction: "500000", deposit_settlement_amount: "4500000" });
  await contractApi.documents(contract.contract_id);
  await contractApi.readDocument("81");
  assert.equal(list.data[0]?.contract_id, contract.contract_id);
  assert.equal(list.meta.total_items, 21);
  assert.equal(history.meta.page, 2);

  const requests = calls.filter((call) => !call.url.endsWith("/auth/csrf"));
  assert.equal(new URL(requests[0]!.url).pathname, "/api/v1/contracts");
  assert.deepEqual([...new URL(requests[0]!.url).searchParams.entries()], [["page", "2"], ["page_size", "20"], ["property_id", contract.property_id], ["room_id", contract.room_id], ["representative_resident_id", contract.representative_resident_id], ["status", "active"], ["expiring_before", "2027-01-01"], ["contract_no", " hd-01 "]]);
  assert.equal(requests[1]!.url, `http://localhost:4000/api/v1/contracts/${contract.contract_id}`);
  assert.deepEqual(JSON.parse(String(requests[2]!.init?.body)), { contract_no: "HD-DEV-01", room_id: contract.room_id, representative_resident_id: contract.representative_resident_id, start_date: contract.start_date, end_date: contract.end_date, rent_amount: "4500000", deposit_amount: "5000000", resident_capacity: 2, initial_electric_kwh: null, initial_water_m3: null });
  assert.ok(new Headers(requests[2]!.init?.headers).get("Idempotency-Key"));
  assert.deepEqual(JSON.parse(String(requests[3]!.init?.body)), {});
  assert.ok(new Headers(requests[3]!.init?.headers).get("Idempotency-Key"));
  assert.equal(new Headers(requests[4]!.init?.headers).get("If-Match"), null, "draft PATCH has no revision precondition");
  assert.equal(new Headers(requests[5]!.init?.headers).get("If-Match"), '"2"');
  assert.deepEqual(JSON.parse(String(requests[5]!.init?.body)), { rent_amount: "4500000", change_reason: "Điều chỉnh theo thỏa thuận" });
  assert.equal(requests[6]!.url, `http://localhost:4000/api/v1/contracts/${contract.contract_id}/history?page=2&page_size=20`);
  assert.equal(new Headers(requests[7]!.init?.headers).get("If-Match"), '"2"');
  assert.deepEqual(JSON.parse(String(requests[7]!.init?.body)), { contract_no: "HD-NEW", start_date: "2027-10-15", end_date: "2028-10-14" });
  assert.equal(new Headers(requests[8]!.init?.headers).get("If-Match"), '"2"');
  assert.deepEqual(JSON.parse(String(requests[8]!.init?.body)), { termination_date: "2027-01-01", termination_reason: "Thỏa thuận", final_electric_kwh: "12.500", final_water_m3: "7.000", deposit_deduction: "500000", deposit_settlement_amount: "4500000" });
  assert.equal(requests[9]!.url, `http://localhost:4000/api/v1/contracts/${contract.contract_id}/documents`);
  assert.equal(requests[10]!.url, "http://localhost:4000/api/v1/contract-documents/81");
  for (const request of requests) {
    assert.equal(request.init?.credentials, "include");
    if (["POST", "PATCH"].includes(String(request.init?.method))) assert.equal(new Headers(request.init?.headers).get("X-CSRF-Token"), "contract-csrf");
  }
});

test("Contract document upload retains multipart boundary and surfaces 503 without claiming success", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "contract-upload-csrf" } });
    return Response.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Dịch vụ lưu trữ tệp chưa được cấu hình." } }, { status: 503 });
  }) as typeof fetch;
  const file = new File([new Uint8Array([1, 2, 3])], "contract.pdf", { type: "application/pdf" });
  await assert.rejects(contractApi.uploadDocument(contract.contract_id, file, "contract"), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === "STORAGE_UNAVAILABLE");
  const request = calls.find((item) => item.init?.method === "POST")!;
  assert.ok(request.init?.body instanceof FormData);
  assert.equal((request.init?.body as FormData).get("file"), file);
  assert.equal((request.init?.body as FormData).get("document_type"), "contract");
  assert.equal(new Headers(request.init?.headers).get("Content-Type"), null);
  assert.ok(new Headers(request.init?.headers).get("Idempotency-Key"));
});

test("Resident Contract list/detail/documents use own V1 routes and preserve backend successor omission", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    const residentContract = { ...contract, status: "active", representative_resident_id: "resident-self" };
    if (url.includes("/me/contracts")) return Response.json({ data: [residentContract], meta: { page: 1, page_size: 100, total_items: 1, total_pages: 1 } });
    if (url.endsWith("/documents")) return Response.json({ data: [] });
    if (url.includes("/contract-documents/")) return Response.json({ data: { document_id: "81", contract_id: contract.contract_id, property_id: contract.property_id, owner_id: contract.owner_id, file_name: "hd.pdf", mime_type: "application/pdf", file_size: 22, document_type: "contract", version: 1, checksum_sha256: "a".repeat(64), status: "draft", uploaded_by_account_id: "91", signed_at: null, signature_provider: null, signature_reference: null, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z", download_url: null } });
    return Response.json({ data: residentContract });
  }) as typeof fetch;
  const list = await residentApi.meContracts();
  const detail = await residentApi.contractDetail(contract.contract_id);
  await residentApi.contractDocuments(contract.contract_id);
  const document = await residentApi.contractDocument("81");
  assert.equal(list.data[0]?.successor, undefined, "the client does not derive a hidden successor");
  assert.equal(detail.contract_id, contract.contract_id);
  assert.equal(document.download_url, null);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/api/v1/me/contracts", `/api/v1/contracts/${contract.contract_id}`, `/api/v1/contracts/${contract.contract_id}/documents`, "/api/v1/contract-documents/81"]);
});

test("Resident foreign or hidden Contract keeps generic API 404 behavior", async () => {
  globalThis.fetch = (async () => Response.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu trong phạm vi tài khoản của bạn." } }, { status: 404 })) as typeof fetch;
  await assert.rejects(residentApi.contractDetail("9007199254740999"), (error: unknown) => error instanceof ApiError && error.status === 404 && error.code === "NOT_FOUND");
});
