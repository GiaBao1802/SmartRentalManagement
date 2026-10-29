import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { loadEnv } from "../config/env.js";
import { createOpaqueSessionToken, hashSessionToken, InMemorySessionStore } from "../auth/session-store.js";
import { authenticateRequest, createSessionRecord, requireAdmin } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createResidentAssistantRouter } from "./assistant.routes.js";
import { createCloudyFeedbackRouter } from "./cloudy-feedback.routes.js";
import { CLOUDY_FEEDBACK_RETENTION_DAYS, cloudyFeedbackDigest, PrismaCloudyFeedbackRepository, sanitizeCloudyFeedbackMessage, validateCloudyFeedbackReviewInput, type CloudyFeedbackRepository } from "./cloudy-feedback.repository.js";

test("Cloudy feedback removes contact and national identity values before storage", () => {
  const sanitized = sanitizeCloudyFeedbackMessage("Gọi tôi +84 912 345 678, mail minh@example.com, CCCD 079999999999 nhé");
  assert.equal(sanitized, "Gọi tôi [đã ẩn số điện thoại], mail [đã ẩn email], CCCD [đã ẩn số định danh] nhé");
  assert.equal(sanitizeCloudyFeedbackMessage("   "), null);
  assert.throws(() => sanitizeCloudyFeedbackMessage(42));
});

test("Cloudy feedback digest is deterministic and keyed", () => {
  const message = "Không hiểu câu hỏi";
  assert.equal(cloudyFeedbackDigest(message, "a-safe-test-secret-with-at-least-32-bytes"), cloudyFeedbackDigest(message, "a-safe-test-secret-with-at-least-32-bytes"));
  assert.notEqual(cloudyFeedbackDigest(message, "a-safe-test-secret-with-at-least-32-bytes"), cloudyFeedbackDigest(message, "another-safe-secret-with-at-least-32-bytes"));
  assert.throws(() => cloudyFeedbackDigest(message, "short"));
});

test("review input accepts curated changes and rejects client reviewer identity", () => {
  const input = validateCloudyFeedbackReviewInput({ expected_updated_at: "2026-10-29T12:00:00.000Z", intent: "services" });
  assert.equal(input.intent, "services");
  assert.throws(() => validateCloudyFeedbackReviewInput({ expected_updated_at: "2026-10-29T12:00:00.000Z", reviewer_account_id: "1", status: "reviewed" }));
});

test("capture writes only for an opted-in Resident and never extends the first-seen retention clock", async () => {
  const message = "Liên hệ 0912345678 về tiện ích";
  const now = new Date("2026-10-29T12:00:00.000Z");
  const writes: any[] = [];
  let optedIn = false;
  const prisma: any = {
    account: { findFirst: async (args: any) => { assert.equal(args.where.role, "resident"); return optedIn ? { accountId: 7n } : null; } },
    cloudyUnresolvedFeedback: { upsert: async (args: any) => { writes.push(args); return {}; } },
  };
  const repository = new PrismaCloudyFeedbackRepository(prisma, "a-safe-test-secret-with-at-least-32-bytes", () => now);
  assert.equal(await repository.capture(7n, message), false);
  assert.equal(writes.length, 0);
  optedIn = true;
  assert.equal(await repository.capture(7n, message), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].create.sanitizedMessage, "Liên hệ [đã ẩn số điện thoại] về tiện ích");
  assert.equal("accountId" in writes[0].create, false);
  assert.deepEqual(writes[0].update, { occurrenceCount: { increment: 1 }, lastSeenAt: now, updatedAt: now });
  assert.equal(CLOUDY_FEEDBACK_RETENTION_DAYS, 30);
});

test("retention deletes feedback older than 30 days and enables audit cascade only inside transaction", async () => {
  const now = new Date("2026-10-29T12:00:00.000Z");
  let deleteArgs: any;
  let transactionLocalSetting = false;
  const prisma: any = { $transaction: async (run: (tx: any) => Promise<number>) => run({
    $executeRaw: async () => { transactionLocalSetting = true; },
    cloudyUnresolvedFeedback: { deleteMany: async (args: any) => { deleteArgs = args; return { count: 4 }; } },
  }) };
  const repository = new PrismaCloudyFeedbackRepository(prisma, "a-safe-test-secret-with-at-least-32-bytes", () => now);
  assert.equal(await repository.deleteExpired(), 4);
  assert.equal(transactionLocalSetting, true);
  assert.equal(deleteArgs.where.firstSeenAt.lt.toISOString(), "2026-09-29T12:00:00.000Z");
});

test("Cloudy feedback routes isolate Residents and Superadmins and derive reviewer from session", async () => {
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://unused/unused", FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "cloudy-feedback-route-test-secret-32-bytes" });
  const sessions = new InMemorySessionStore();
  const accounts = new Map<bigint, any>([
    [1n, { accountId: 1n, role: "admin", status: "active", ownerId: 10n, residentId: null, owner: { ownerId: 10n, displayName: "Owner" }, resident: null, email: "owner@example.test", phone: null }],
    [2n, { accountId: 2n, role: "resident", status: "active", ownerId: null, residentId: 20n, owner: null, resident: { residentId: 20n, ownerId: 10n, fullName: "Resident" }, email: "resident@example.test", phone: null }],
    [3n, { accountId: 3n, role: "superadmin", status: "active", ownerId: null, residentId: null, owner: null, resident: null, email: "platform@example.test", phone: null }],
  ]);
  const auth = { config, sessions, repository: { findCandidates: async () => [], findCurrentAccount: async (id: bigint) => accounts.get(id) ?? null } };
  const reviewCalls: any[] = [];
  const repository: CloudyFeedbackRepository = {
    getPreference: async () => ({ enabled: false }), setPreference: async (_id, enabled) => ({ enabled }), capture: async () => false,
    list: async () => ({ rows: [{ feedback_id: "9", sanitized_message: "Câu chưa hiểu" }], total: 1 }),
    detail: async () => null,
    review: async (input) => { reviewCalls.push(input); return { feedback_id: input.feedbackId.toString(), status: input.status ?? "reviewed" }; },
    deleteExpired: async () => 0,
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createCloudyFeedbackRouter(auth, repository));
  app.get("/api/v1/admin-only", authenticateRequest(auth), requireAdmin, (_request, response) => response.sendStatus(204));
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  async function session(accountId: bigint) {
    const token = createOpaqueSessionToken();
    const hash = hashSessionToken(token, config.sessionSecret);
    await sessions.set(createSessionRecord(accountId, hash, config));
    return { Cookie: `gt_session=${token}`, "Content-Type": "application/json" };
  }
  try {
    const ownerHeaders = await session(1n);
    const residentHeaders = await session(2n);
    const superadminHeaders = await session(3n);
    assert.equal((await fetch(`${base}/platform/cloudy/unresolved-feedback`, { headers: residentHeaders })).status, 403);
    assert.equal((await fetch(`${base}/platform/cloudy/unresolved-feedback`, { headers: ownerHeaders })).status, 403);
    assert.equal((await fetch(`${base}/admin-only`, { headers: superadminHeaders })).status, 403);
    assert.equal((await fetch(`${base}/me/assistant/feedback-preference`, { headers: ownerHeaders })).status, 403);
    assert.equal((await fetch(`${base}/me/assistant/feedback-preference`, { headers: residentHeaders })).status, 200);
    const list = await fetch(`${base}/platform/cloudy/unresolved-feedback`, { headers: superadminHeaders });
    assert.equal(list.status, 200);
    assert.equal((await list.json() as any).meta.total_items, 1);
    const review = await fetch(`${base}/platform/cloudy/unresolved-feedback/9`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ expected_updated_at: "2026-10-29T12:00:00.000Z", status: "reviewed" }) });
    assert.equal(review.status, 200);
    assert.equal(reviewCalls[0].reviewerAccountId, 3n);
    assert.equal(reviewCalls[0].feedbackId, 9n);
    const forged = await fetch(`${base}/platform/cloudy/unresolved-feedback/9`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ expected_updated_at: "2026-10-29T12:00:00.000Z", reviewer_account_id: "1", status: "reviewed" }) });
    assert.equal(forged.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Resident Cloudy captures only a server-classified help message", async () => {
  const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://unused/unused", FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "cloudy-feedback-capture-test-secret-32-bytes" });
  const sessions = new InMemorySessionStore();
  const auth = { config, sessions, repository: { findCandidates: async () => [], findCurrentAccount: async () => ({ accountId: 11n, role: "resident", status: "active", ownerId: null, residentId: 21n, owner: null, resident: { residentId: 21n, ownerId: 31n, fullName: "Resident" }, email: null, phone: null }) } };
  const captured: Array<{ accountId: bigint; message: string }> = [];
  const feedback: any = { capture: async (accountId: bigint, message: string) => { captured.push({ accountId, message }); return true; } };
  const meterRepository: any = { assertReady: async () => {} };
  const classifier = async (message: string) => message === "Câu chưa rõ" ? "help" as const : "invoice" as const;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createResidentAssistantRouter(auth, meterRepository, feedback, classifier));
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const token = createOpaqueSessionToken();
  await sessions.set(createSessionRecord(11n, hashSessionToken(token, config.sessionSecret), config));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const headers = { Cookie: `gt_session=${token}`, "Content-Type": "application/json" };
  try {
    const help = await fetch(`${base}/me/assistant/chat`, { method: "POST", headers, body: JSON.stringify({ message: "Câu chưa rõ" }) });
    assert.equal(help.status, 200);
    assert.equal((await help.json() as any).data.feedback_saved, true);
    const understood = await fetch(`${base}/me/assistant/chat`, { method: "POST", headers, body: JSON.stringify({ message: "Câu đã hiểu" }) });
    assert.equal(understood.status, 200);
    assert.equal((await understood.json() as any).data.feedback_saved, undefined);
    assert.deepEqual(captured, [{ accountId: 11n, message: "Câu chưa rõ" }]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
