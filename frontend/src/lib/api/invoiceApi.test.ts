import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { invoiceApi } from "./invoiceApi";
import type { InvoiceDetailResponse } from "./invoiceApi";
import { clearCsrfToken } from "./apiClient";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

const sampleInvoice = {
  invoice_id: "501",
  invoice_no: "INV-77-20261015",
  contract_id: "77",
  property_id: "4",
  owner_id: "101",
  period_start: "2026-10-15",
  period_end: "2026-11-14",
  due_date: null,
  finalized_at: null,
  rent_amount: "3500000",
  electricity_previous_kwh: "100.000",
  electricity_current_kwh: null,
  electricity_amount: "0",
  water_previous_m3: "20.000",
  water_current_m3: null,
  water_amount: "0",
  service_amount: "0",
  total_amount: "3500000",
  status: "draft",
  revision: 1,
  snapshot_kind: "NOT_FINALIZED",
  is_overdue: false,
  amount_provisional: true,
  contract: {
    contract_id: "77",
    contract_no: "HD-77",
    room_id: "8",
    property_id: "4",
    room_code: "A01",
    representative_resident_id: "201",
    property: { property_id: "4", name: "Khu A", province: "Đồng Nai", address: "Đồng Nai" },
  },
  payment_summary: { attempt_count: 0, successful_amount: "0", latest_status: null },
} as const;
const sampleDetail: InvoiceDetailResponse = { ...sampleInvoice, itemization_available: false, invoice_items: [] };

test("invoiceApi.list calls the versioned list endpoint and preserves API data/meta", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({
      data: [sampleInvoice],
      meta: { page: 2, page_size: 20, total_items: 21, total_pages: 2 },
    });
  }) as typeof fetch;

  try {
    const result = await invoiceApi.list({
      page: 2,
      page_size: 20,
      property_id: "4",
      room_id: "8",
      resident_id: "201",
      status: "unpaid",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
    });
    assert.equal(calls.length, 1);
    const requestUrl = new URL(calls[0]!.url);
    assert.equal(requestUrl.origin, "http://localhost:4000");
    assert.equal(requestUrl.pathname, "/api/v1/invoices");
    assert.deepEqual(Object.fromEntries(requestUrl.searchParams), {
      page: "2",
      page_size: "20",
      property_id: "4",
      room_id: "8",
      resident_id: "201",
      status: "unpaid",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
    });
    assert.equal(requestUrl.searchParams.has("owner_id"), false);
    assert.equal(result.data[0]?.invoice_id, "501");
    assert.equal(result.data[0]?.contract?.property?.name, "Khu A");
    assert.equal(result.meta.total_items, 21);
    assert.equal(result.meta.total_pages, 2);
    assert.equal(calls[0]?.init?.method ?? "GET", "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invoiceApi.list omits blank filters and never calls the unversioned route", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Response.json({ data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } });
  }) as typeof fetch;

  try {
    const result = await invoiceApi.list({ page: 1, page_size: 20, property_id: "  " });
    assert.equal(calls.length, 1);
    const requestUrl = new URL(calls[0]!);
    assert.equal(requestUrl.pathname, "/api/v1/invoices");
    assert.deepEqual(Object.fromEntries(requestUrl.searchParams), { page: "1", page_size: "20" });
    assert.equal(calls[0]!.includes("/api/invoices"), false);
    assert.equal(result.data.length, 0);
    assert.equal(result.meta.total_items, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("billingWorkspace is an owner-scoped read-only GET and preserves Vietnamese business filters", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 }, summary: {
      contracts_on_page: 0, needs_attention_on_page: 0, drafts_on_page: 0, finalized_on_page: 0, missing_data_on_page: 0, ready_to_finalize_on_page: 0,
      finalized_unpaid: 0, paid: 0, overdue: 0, unpaid_preview: [],
    } });
  }) as typeof fetch;
  const result = await invoiceApi.billingWorkspace({ page: 1, page_size: 20, property_id: "4", room_id: "8", resident_id: "21", state: "MISSING_DATA" });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/billing/workspace");
  assert.deepEqual(Object.fromEntries(new URL(calls[0]!.url).searchParams), { page: "1", page_size: "20", property_id: "4", room_id: "8", resident_id: "21", state: "MISSING_DATA" });
  assert.equal(calls[0]?.init?.method ?? "GET", "GET");
  assert.equal(calls[0]?.init?.body, undefined);
  assert.equal(new URL(calls[0]!.url).searchParams.has("owner_id"), false);
  assert.equal(result.summary.missing_data_on_page, 0);
  assert.equal(result.data.length, 0);
});

test("invoice detail, draft save and finalize use canonical routes, CSRF, fresh DTOs and idempotency", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "invoice-csrf" } });
    if (init?.method === "PATCH") return Response.json({ data: { ...sampleInvoice, electricity_current_kwh: "145.500" } });
    if (url.endsWith("/finalize")) return Response.json({ data: { ...sampleInvoice, status: "unpaid", electricity_current_kwh: "145.500", snapshot_kind: "ITEMIZED" } });
    return Response.json({ data: sampleDetail });
  }) as typeof fetch;

  const detail = await invoiceApi.getInvoiceDetail("501");
  const saved = await invoiceApi.updateDraftMeterReadings("501", { electricity_current_kwh: "145.500", water_current_m3: "22.250" });
  const finalized = await invoiceApi.finalizeInvoice("501", { electricity_current_kwh: "145.500", water_current_m3: "22.250" });
  assert.equal(detail.invoice_id, "501");
  assert.equal(detail.itemization_available, false);
  assert.deepEqual(detail.invoice_items, []);
  assert.equal(saved.electricity_current_kwh, "145.500");
  assert.equal(finalized.status, "unpaid");
  assert.equal(finalized.snapshot_kind, "ITEMIZED");
  const apiCalls = calls.filter((call) => !call.url.endsWith("/auth/csrf"));
  assert.deepEqual(apiCalls.map((call) => [call.init?.method ?? "GET", new URL(call.url).pathname]), [
    ["GET", "/api/v1/invoices/501"],
    ["PATCH", "/api/v1/invoices/501"],
    ["POST", "/api/v1/invoices/501/finalize"],
  ]);
  assert.deepEqual(JSON.parse(String(apiCalls[1]!.init?.body)), { electricity_current_kwh: "145.500", water_current_m3: "22.250" });
  assert.deepEqual(JSON.parse(String(apiCalls[2]!.init?.body)), { electricity_current_kwh: "145.500", water_current_m3: "22.250" });
  assert.ok(new Headers(apiCalls[2]!.init?.headers).get("Idempotency-Key"));
  for (const call of apiCalls.slice(1)) {
    assert.equal(new Headers(call.init?.headers).get("X-CSRF-Token"), "invoice-csrf");
    assert.equal(call.init?.credentials, "include");
  }
  assert.equal(JSON.stringify(apiCalls.map((call) => call.init?.body)).includes("owner_id"), false);
});
