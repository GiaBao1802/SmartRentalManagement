import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountApi, createInvitationRevoker, type AccountResource } from "./accountApi";
import { clearCsrfToken } from "./apiClient";
import { AccountsTable } from "../../app/admin/accounts/accounts-content";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });
test("Account list preserves V1 data/meta, string IDs and server filters", async () => {
  const calls: string[] = [];
  const payload = { data: [{ account_id: "9007199254740993", role: "resident", status: "active" }], meta: { page: 2, page_size: 20, total_items: 21, total_pages: 2 } };
  globalThis.fetch = (async (input) => { calls.push(String(input)); return Response.json(payload); }) as typeof fetch;
  const result = await accountApi.list({ page: 2, role: "resident", status: "active", resident_id: "22" });
  assert.deepEqual(result, payload); assert.match(calls[0], /\/api\/v1\/accounts\?/);
  const url = new URL(calls[0]); assert.equal(url.searchParams.get("resident_id"), "22"); assert.equal(url.searchParams.get("role"), "resident"); assert.equal(url.searchParams.get("page"), "2");
});
test("Account status and invitation revoke reuse apiClient session/CSRF", async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  globalThis.fetch = (async (input, options) => { const url = String(input); calls.push({ url, options }); return url.endsWith("/auth/csrf") ? Response.json({ data: { csrf_token: "fixture-csrf" } }) : Response.json({ data: { account_id: "2", status: "locked" } }); }) as typeof fetch;
  await accountApi.setStatus("2", "locked"); await accountApi.revokeInvitation("3", "revoke-test-key");
  const updates = calls.filter((call) => call.options?.method === "PATCH" || call.options?.method === "POST");
  assert.equal(updates.length, 2); assert.match(updates[0].url, /\/accounts\/2\/status$/); assert.match(updates[1].url, /\/account-invitations\/3\/revoke$/);
  assert.equal(new Headers(updates[1].options?.headers).get("Idempotency-Key"), "revoke-test-key");
  assert.equal(updates[0].options?.body, '{"status":"locked"}');
  assert.ok(updates.every((call) => call.options?.credentials === "include" && new Headers(call.options.headers).get("X-CSRF-Token") === "fixture-csrf"));
});
test("Account read/history use exact V1 paths and reject malformed IDs", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input) => { calls.push(String(input)); return Response.json({ data: {} }); }) as typeof fetch;
  await accountApi.detail("2"); await accountApi.invitations("22", 2);
  assert.match(calls[0], /\/accounts\/2$/); assert.match(calls[1], /\/residents\/22\/account-invitations\?page=2&page_size=20$/);
  assert.throws(() => accountApi.detail("../other"));
});
test("Account 403/409 errors remain visible; no demo fallback rows", async () => {
  globalThis.fetch = (async (input) => String(input).endsWith("/auth/csrf") ? Response.json({ data: { csrf_token: "fixture" } }) : Response.json({ error: { code: "INVITATION_NOT_PENDING", message: "Lời mời không còn hiệu lực." } }, { status: 409 })) as typeof fetch;
  await assert.rejects(() => accountApi.revokeInvitation("3", "revoke-test-key"), /Lời mời không còn hiệu lực/);
});
test("Account table does not offer own Admin lock or expose credential fields", () => {
  const base: AccountResource = { account_id: "1", resident_id: null, role: "admin", email: "admin@example.test", phone: null, status: "active", last_login_at: null, created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", resident: null };
  const admin = renderToStaticMarkup(<AccountsTable rows={[base]} pending={false} onDetail={() => {}} onStatus={() => {}} />);
  assert.doesNotMatch(admin, /Khóa tài khoản|Admin toàn hệ thống|LANDLORD|TENANT|password/);
  const resident = renderToStaticMarkup(<AccountsTable rows={[{ ...base, account_id: "2", role: "resident", resident_id: "22", resident: { resident_id: "22", full_name: "Test Resident" } }]} pending onDetail={() => {}} onStatus={() => {}} />);
  assert.match(resident, /Khóa tài khoản/); assert.match(resident, /disabled/);
});
test("Accounts source has no demo fetch/password form and guards duplicate mutations", () => {
  const source = readFileSync(new URL("../../app/admin/accounts/accounts-content.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\/api\/admin\/accounts|\/api\/tenants|type="password"|LANDLORD|TENANT|Admin toàn hệ thống|fetch\(/);
  assert.match(source, /mutation\.current/); assert.match(source, /accountApi\.list/); assert.match(source, /chưa khả dụng/);
});

test("revoke retry retains operation key after ambiguous failure; new operation rotates key", async () => {
  const keys: string[] = []; let attempts = 0; let sequence = 0;
  globalThis.fetch = (async (input, options) => {
    if (String(input).endsWith("/auth/csrf")) return Response.json({ data: { csrf_token: "fixture-csrf" } });
    keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
    if (++attempts === 1) throw new TypeError("simulated lost response");
    return Response.json({ data: { invitation_id: "3", status: "revoked" } });
  }) as typeof fetch;
  const revoke = createInvitationRevoker(() => "operation-" + ++sequence);
  await assert.rejects(() => revoke("3"));
  await revoke("3"); await revoke("4"); await revoke("3");
  assert.deepEqual(keys, ["operation-1", "operation-1", "operation-2", "operation-3"]);
  const source = readFileSync(new URL("../../app/admin/accounts/accounts-content.tsx", import.meta.url), "utf8");
  assert.match(source, /revokeOperation.current!\(row.invitation_id\)/);
});
