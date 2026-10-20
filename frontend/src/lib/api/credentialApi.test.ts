import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { loginTarget, passwordErrors } from "./credentialView";
import { credentialApi } from "./credentialApi";
import { accountApi, deliveryMessage } from "./accountApi";
import { clearCsrfToken } from "./apiClient";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; clearCsrfToken(); });
test("enrollment/reset helpers use real paths, safe bodies, CSRF and explicit Admin retry key", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  globalThis.fetch = (async (input, options) => { const path = String(input); calls.push({ path, options }); return Response.json({ data: path.endsWith("/auth/csrf") ? { csrf_token: "fixture-csrf" } : { requested: true } }); }) as typeof fetch;
  await accountApi.invite("22", "same-operation", true); await accountApi.invite("22", "same-operation", true); await accountApi.reset("2", "reset-operation");
  await credentialApi.accept("synthetic-token", "Synthetic-password"); await credentialApi.forgot("fixture@example.test"); await credentialApi.reset("synthetic-reset", "Synthetic-password");
  const posts = calls.filter(c => c.options?.method === "POST"); assert.equal(posts.length, 6);
  assert.deepEqual(posts.slice(0, 2).map(c => new Headers(c.options?.headers).get("Idempotency-Key")), ["same-operation", "same-operation"]);
  for (const c of posts) { assert.equal(c.options?.credentials, "include"); assert.equal(new Headers(c.options?.headers).get("X-CSRF-Token"), "fixture-csrf"); assert.doesNotMatch(c.path, /token=/); }
  assert.match(posts[3].path, /auth\/accept-invitation$/); assert.equal(posts[0].options?.body, '{"resend":true}'); assert.match(posts[5].path, /auth\/reset-password$/);
});
test("token UI clears fragment, never stores token, confirms password and prevents duplicate submission", () => {
  const source = readFileSync(new URL("../../app/components/credential-form.tsx", import.meta.url), "utf8");
  assert.match(source, /history.replaceState/); assert.match(source, /passwordErrors\(password, confirmation\)/); assert.match(source, /busy.current/); assert.doesNotMatch(source, /localStorage|console\.|analytics/);
  for (const page of ["accept-invitation", "reset-password"]) { const text = readFileSync(new URL(`../../app/${page}/page.tsx`, import.meta.url), "utf8"); assert.match(text, /force-dynamic/); assert.match(text, /no-referrer/); }
  assert.match(deliveryMessage("dev_available"), /chưa gửi Zalo thật/); assert.match(deliveryMessage("unknown"), /Không tự gửi lặp/);
});

test("password validation and login destinations preserve security boundaries", () => {
  assert.equal(passwordErrors("short", "different").password.length > 0, true);
  assert.equal(passwordErrors("valid-password-2026", "different").confirmation.length > 0, true);
  assert.deepEqual(passwordErrors("valid-password-2026", "valid-password-2026"), { password: "", confirmation: "" });
  for (const target of ["https://foreign.invalid", "//foreign.invalid", "/\\foreign.invalid"]) assert.equal(loginTarget("admin", target, "http://localhost:3002"), "/admin/properties");
  assert.equal(loginTarget("resident", "/admin/accounts", "http://localhost:3002"), "/tenant");
  assert.equal(loginTarget("admin", "/admin/accounts", "http://localhost:3002"), "/admin/accounts");
});
test("inspection is a POST with token only in body, same CSRF client and no identity fields", async () => {
  let observed: RequestInit | undefined;
  globalThis.fetch = (async (input, options) => { if (String(input).endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "fixture-csrf" } }); assert.match(String(input), /\/auth\/credential-link\/inspect$/); observed = options; return Response.json({ data: { valid: true, expires_at: "2026-10-19T00:00:00Z" } }); }) as typeof fetch;
  const result = await credentialApi.inspect("invitation", "synthetic-token");
  assert.equal(result.valid, true); assert.equal(observed?.method, "POST"); assert.deepEqual(JSON.parse(String(observed?.body)), { purpose: "invitation", token: "synthetic-token" });
});
