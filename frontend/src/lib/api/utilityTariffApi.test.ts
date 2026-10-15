import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearCsrfToken } from "./apiClient";
import { utilityTariffApi } from "./utilityTariffApi";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("utility tariff read, Electricity publish, and Water publish use Property routes and canonical payloads", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "csrf-test" } });
    return Response.json({ data: { utility_tariff_version_id: "70" } }, { status: 201 });
  }) as typeof fetch;
  await utilityTariffApi.getForProperty("property 5");
  await utilityTariffApi.publishElectricity("5", { effective_from: "2026-11-01", tiers: [{ tier_no: 1, lower_kwh: "0", upper_kwh: null, unit_price: "1984" }] });
  await utilityTariffApi.publishWater("5", { effective_from: "2026-11-01", flat_unit_price: "15000" });
  assert.match(calls[0]!.url, /\/properties\/property%205\/utility-tariffs$/);
  assert.match(calls.find((call) => call.url.includes("electricity/versions"))!.url, /\/properties\/5\/utility-tariffs\/electricity\/versions$/);
  assert.match(calls.find((call) => call.url.includes("water/versions"))!.url, /\/properties\/5\/utility-tariffs\/water\/versions$/);
  const postedBodies = calls.filter((call) => call.init?.method === "POST").map((call) => JSON.parse(String(call.init?.body)));
  assert.equal(postedBodies[0].tiers[0].unit_price, "1984");
  assert.equal(postedBodies[1].flat_unit_price, "15000");
  assert.ok(calls.filter((call) => call.init?.method === "POST").every((call) => new Headers(call.init?.headers).get("X-CSRF-Token") === "csrf-test"));
});
