import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearCsrfToken } from "./apiClient";
import { propertyServiceApi } from "./propertyServiceApi";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("service management APIs preserve scoped routes, payloads, CSRF", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), init }); if (String(input).endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "service-csrf" } }); return Response.json({ data: { pricing_item_id: "5" } }, { status: init?.method === "POST" ? 201 : 200 }); }) as typeof fetch;
  await propertyServiceApi.list("property 5", "FIXED_SERVICE");
  await propertyServiceApi.create("5", { kind: "FLEXIBLE_SERVICE", code: "CARE", name: "Room care", unit: "lần" });
  await propertyServiceApi.publishPrice("5", "7", "FLEXIBLE_SERVICE", { effective_from: "2026-11-01", unit_price: "150000" });
  await propertyServiceApi.retire("5", "7", "FLEXIBLE_SERVICE");
  assert.match(calls.find((call) => call.url.includes("pricing-items?kind"))!.url, /properties\/property%205\/pricing-items\?kind=FIXED_SERVICE$/);
  const bodies = calls.filter((call) => call.init?.method === "POST").map((call) => JSON.parse(String(call.init?.body)));
  assert.deepEqual(bodies[0], { kind: "FLEXIBLE_SERVICE", code: "CARE", name: "Room care", unit: "lần" });
  assert.equal(bodies[1].unit_price, "150000");
  assert.ok(calls.filter((call) => call.init?.method === "POST").every((call) => new Headers(call.init?.headers).get("X-CSRF-Token") === "service-csrf"));
});
