import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ownerReportApi } from "./ownerReportApi";
import { clearCsrfToken } from "./apiClient";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("Owner report uses the summary route and scoped Property dashboard without client-supplied Owner IDs", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { urls.push(String(input)); return Response.json({ data: { summary: {} } }); }) as typeof fetch;
  await ownerReportApi.overview();
  await ownerReportApi.overview("51 / bad");
  assert.equal(new URL(urls[0]!).pathname, "/api/v1/dashboard/summary");
  assert.equal(new URL(urls[1]!).pathname, "/api/v1/properties/51%20%2F%20bad/dashboard");
  assert.ok(urls.every((url) => !url.includes("owner_id")));
});
