import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { InMemorySessionStore } from "../auth/session-store.js";
import { CredentialGate, CredentialRateLimiter, HarnessEnrollmentDelivery, invalidToken, normalizeVietnamPhone, tokenHash, UnconfiguredEnrollmentDelivery } from "./credential-infrastructure.js";
import { EnrollmentService } from "./enrollment.service.js";
import type { EnrollmentInvitation, EnrollmentRepository, ResetAccount } from "./enrollment.repository.js";

async function fixture() {
  let now = new Date("2026-10-18T01:00:00Z");
  const resident = { residentId: 2n, ownerId: 1n, phone: "0901234567", email: null, archivedAt: null };
  let account: ResetAccount | null = null; let invitation: EnrollmentInvitation & { tokenHash: string } | null = null;
  const gate = new CredentialGate(); const sessions = new InMemorySessionStore();
  const repo: EnrollmentRepository = {
    async resident(owner, id) { return owner === 1n && id === 2n ? { ...resident, hasAccount: Boolean(account) } : null; },
    async account() { return account; }, async lookup() { return account ? [account] : []; },
    async issue(_owner, _id, _actor, hash, _phone, expiresAt, resend, at) {
      if (account) throw Error("exists");
      if (invitation?.status === "pending" && invitation.expiresAt > at) { if (!resend) throw Error("pending"); return { ...invitation, created: false }; }
      invitation = { invitationId: (invitation?.invitationId ?? 0n) + 1n, residentId: 2n, tokenHash: hash, status: "pending", expiresAt, acceptedAt: null, createdAt: at, updatedAt: at, created: true };
      return invitation;
    },
    async inspectInvitation(hash, _phone, at) { return invitation && invitation.tokenHash === hash && invitation.status === "pending" && invitation.expiresAt > at && !account ? invitation.expiresAt : null; },
    async accept(hash, _phone, passwordHash, at) { await gate.run("accept", async () => { if (!invitation || invitation.tokenHash !== hash || invitation.status !== "pending" || invitation.expiresAt <= at) throw invalidToken(); account = { accountId: 5n, ownerId: null, residentId: 2n, role: "resident", phone: "+84901234567", passwordHash, status: "active", resident: { ownerId: 1n } }; invitation.status = "accepted"; invitation.acceptedAt = at; }); },
    async password(_id, hash, revoke) { await revoke(); account!.passwordHash = hash; },
  };
  const delivery = new HarnessEnrollmentDelivery("test", () => now.getTime()); const subject = "fixture-2";
  delivery.bindings.set("1:2:+84901234567", { ownerId: 1n, residentId: 2n, phone: "+84901234567", subject });
  const service = new EnrollmentService(repo, sessions, delivery, "test", () => now);
  async function accepted() { await service.issue(1n, 2n, 1n, "fixture-key", false); const raw = delivery.retrieve(subject, "invitation")!; await service.accept(raw, "First-Password-2026!"); return raw; }
  return { service, delivery, repo, sessions, subject, accepted, account: () => account!, invitation: () => invitation!, setNow: (at: Date) => { now = at; } };
}

test("normalization, purpose hashes and DEV production guards", () => {
  assert.equal(normalizeVietnamPhone("0901 234 567"), "+84901234567"); assert.equal(normalizeVietnamPhone("84901234567"), "+84901234567");
  assert.throws(() => normalizeVietnamPhone("bad")); assert.notEqual(tokenHash("reset", "same"), tokenHash("invitation", "same"));
  assert.throws(() => new HarnessEnrollmentDelivery("production"));
  assert.throws(() => new EnrollmentService({} as EnrollmentRepository, new InMemorySessionStore(), new UnconfiguredEnrollmentDelivery(), "production"));
});
test("24-hour invitation metadata has no secret; retry/resend reuse token and TTL", async () => {
  const h = await fixture(); let sends = 0; const send = h.delivery.send.bind(h.delivery); h.delivery.send = async (...args) => { sends++; return send(...args); }; const first = await h.service.issue(1n, 2n, 1n, "one-key", false); const raw = h.delivery.retrieve(h.subject, "invitation");
  const again = await h.service.issue(1n, 2n, 1n, "one-key", false); const resend = await h.service.issue(1n, 2n, 1n, "new-key", true);
  assert.equal(sends, 2); assert.deepEqual(first, again); assert.equal(first.invitation_id, resend.invitation_id); assert.equal(h.delivery.retrieve(h.subject, "invitation"), raw);
  assert.equal(h.invitation().expiresAt.getTime() - h.invitation().createdAt.getTime(), 86400000);
  assert.doesNotMatch(JSON.stringify(first), /token|hash|password/); await assert.rejects(() => h.service.issue(1n, 2n, 1n, "one-key", true), { code: "IDEMPOTENCY_KEY_REUSED" });
});
test("unconfigured delivery does not mutate existing pending invitation", async () => {
  const h = await fixture(); await h.service.issue(1n, 2n, 1n, "first", false); const before = { ...h.invitation() };
  const other = new EnrollmentService(h.repo, h.sessions, new UnconfiguredEnrollmentDelivery(), "test");
  await assert.rejects(() => other.issue(1n, 2n, 1n, "retry", true), { status: 503 }); assert.deepEqual(h.invitation(), before);
});
test("known delivery failure retries same token; timeout remains unknown without automatic redelivery", async () => {
  const h = await fixture(); h.delivery.outcome = "failed";
  assert.equal((await h.service.issue(1n, 2n, 1n, "failed-key", false)).delivery_status, "failed");
  h.delivery.outcome = "dev_available"; assert.equal((await h.service.issue(1n, 2n, 1n, "resend-key", true)).delivery_status, "dev_available");
  const k = await fixture(); k.delivery.send = async () => { throw Error("timeout"); };
  assert.equal((await k.service.issue(1n, 2n, 1n, "unknown-key", false)).delivery_status, "unknown");
  k.delivery.send = async () => { throw Error("must not redeliver"); };
  assert.equal((await k.service.issue(1n, 2n, 1n, "retry-key", true)).delivery_status, "unknown");
});
test("concurrent accept is one-use; reset purpose mismatch is rejected", async () => {
  const h = await fixture(); await h.service.issue(1n, 2n, 1n, "first", false); const raw = h.delivery.retrieve(h.subject, "invitation")!;
  const results = await Promise.allSettled([h.service.accept(raw, "First-Password-2026!"), h.service.accept(raw, "Second-Password-2026!")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  await assert.rejects(() => h.service.accept(raw, "First-Password-2026!")); await assert.rejects(() => h.service.reset(raw, "Reset-Password-2026!"), { code: "TOKEN_INVALID" });
});
test("expired and revoked invitations do not create account", async () => {
  for (const mode of ["expired", "revoked"]) { const h = await fixture(); await h.service.issue(1n, 2n, 1n, "first", false); const raw = h.delivery.retrieve(h.subject, "invitation")!; if (mode === "expired") h.setNow(new Date("2026-10-19T01:00:00Z")); else h.invitation().status = "revoked"; await assert.rejects(() => h.service.accept(raw, "First-Password-2026!"), { code: "TOKEN_INVALID" }); assert.equal(h.account(), null); }
});
test("reset TTL30m, one use, locked status preserved and old sessions revoked", async () => {
  const h = await fixture(); await h.accepted(); h.account().status = "locked";
  await h.sessions.set({ accountId: "5", tokenHash: "fixture-session", createdAt: Date.now(), lastSeenAt: Date.now(), expiresAt: Date.now() + 100000, absoluteExpiresAt: Date.now() + 100000 });
  await h.service.forgot("0901234567"); const raw = h.delivery.retrieve(h.subject, "reset")!;
  const results = await Promise.allSettled([h.service.reset(raw, "Reset-Password-2026!"), h.service.reset(raw, "Reset-Password-2026!")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(h.account().status, "locked"); assert.equal(await h.sessions.get("fixture-session"), null);
  assert.equal(await verifyPassword("First-Password-2026!", h.account().passwordHash), false); assert.equal(await verifyPassword("Reset-Password-2026!", h.account().passwordHash), true);
  await assert.rejects(() => h.service.reset(raw, "Reset-Password-2026!"));
});
test("reset expires at30minutes and failed session revocation preserves token/password", async () => {
  const h = await fixture(); await h.accepted(); await h.service.forgot("0901234567"); const raw = h.delivery.retrieve(h.subject, "reset")!; const previous = h.account().passwordHash;
  const revoke = h.sessions.revokeAccount; h.sessions.revokeAccount = async () => { throw Error("store unavailable"); };
  await assert.rejects(() => h.service.reset(raw, "Reset-Password-2026!")); assert.equal(h.account().passwordHash, previous);
  h.sessions.revokeAccount = revoke; h.setNow(new Date("2026-10-18T01:30:00Z")); await assert.rejects(() => h.service.reset(raw, "Reset-Password-2026!"), { code: "TOKEN_INVALID" });
});
test("forgot generic response, rate-limiter and credential gate serialize delayed actions", async () => {
  const h = await fixture(); const absent = await h.service.forgot("missing@example.test"); await h.accepted(); const existing = await h.service.forgot("0901234567"); assert.deepEqual(absent, existing);
  const limiter = new CredentialRateLimiter(1, 1000); limiter.consume("same", 1); assert.throws(() => limiter.consume("same", 2), { status: 429 });
  const gate = new CredentialGate(); const steps: string[] = []; await Promise.all([gate.run("account", async () => { await new Promise(r => setTimeout(r, 10)); steps.push("reset"); }), gate.run("account", async () => { steps.push("fresh-login"); })]); assert.deepEqual(steps, ["reset", "fresh-login"]);
});
test("change password checks current password and invalidates existing reset", async () => {
  const h = await fixture(); await h.accepted(); await h.service.forgot("0901234567"); const raw = h.delivery.retrieve(h.subject, "reset")!;
  await assert.rejects(() => h.service.change(5n, "wrong", "Change-Password-2026!"), { status: 401 });
  await h.service.change(5n, "First-Password-2026!", "Change-Password-2026!");
  await assert.rejects(() => h.service.reset(raw, "Reset-Password-2026!")); assert.equal(await verifyPassword("Change-Password-2026!", h.account().passwordHash), true);
});

test("non-resolving delivery is bounded and classified unknown", async () => {
  const h = await fixture(); h.delivery.send = async () => new Promise(() => {});
  const service = new EnrollmentService(h.repo, h.sessions, h.delivery, "test", () => new Date("2026-10-18T01:00:00Z"), 10);
  assert.equal((await service.issue(1n, 2n, 1n, "timeout-key", false)).delivery_status, "unknown");
});

test("inspection is read-only, hides identity and rejects used/purpose-mismatched links", async () => {
  const h = await fixture(); await h.service.issue(1n, 2n, 1n, "inspect", false);
  const raw = h.delivery.retrieve(h.subject, "invitation")!;
  const first = await h.service.inspect("invitation", raw); const second = await h.service.inspect("invitation", raw);
  assert.deepEqual(first, second); assert.equal(h.invitation().status, "pending"); assert.equal(h.account(), null);
  assert.deepEqual(Object.keys(first), ["valid", "expires_at"]);
  await assert.rejects(() => h.service.inspect("reset", raw), { code: "TOKEN_INVALID" });
  await h.service.accept(raw, "First-Password-2026!"); await assert.rejects(() => h.service.inspect("invitation", raw));
  await h.service.forgot("0901234567"); const reset = h.delivery.retrieve(h.subject, "reset")!;
  assert.equal((await h.service.inspect("reset", reset)).valid, true);
  await h.service.reset(reset, "Reset-Password-2026!"); await assert.rejects(() => h.service.inspect("reset", reset));
});
