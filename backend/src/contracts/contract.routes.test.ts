import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { RuntimeConfig } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "../auth/auth.types.js";
import { createSessionRecord, type AuthDependencies } from "../middleware/auth.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createV1Router } from "../auth/v1.router.js";
import { UnconfiguredObjectStorage } from "../contract-documents/object-storage.js";
import { parseContractPageQuery } from "./contract.routes.js";
import { stringifyBigInts } from "../utils/ids.js";

const origin = "http://localhost:3000";
const config: RuntimeConfig = loadEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test", FRONTEND_ORIGIN: origin, SESSION_SECRET: "contract-test-session-secret-with-32-bytes" });
const adminAccount: LoginAccountRecord = { accountId: 11n, ownerId: 101n, residentId: null, role: "admin", email: "admin@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: { ownerId: 101n, displayName: "Owner" }, resident: null };
const residentAccount: LoginAccountRecord = { accountId: 12n, ownerId: null, residentId: 201n, role: "resident", email: "resident@test.invalid", phone: null, passwordHash: "unused", status: "active", owner: null, resident: { residentId: 201n, ownerId: 101n, fullName: "Resident" } };
class TestAuthRepository implements AuthRepository {
  async findCandidates() { return []; }
  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> {
    const record = [adminAccount, residentAccount].find((item) => item.accountId === accountId);
    if (!record) return null;
    const { passwordHash: _passwordHash, ...current } = record;
    return current;
  }
}
const sessions = new InMemorySessionStore();
const auth: AuthDependencies = { config, repository: new TestAuthRepository(), sessions };
const observed: Array<{ method: string; args: unknown[] }> = [];
const doc = { documentId: 61n, contractId: 31n, ownerId: 101n, propertyId: 21n, fileName: "contract.pdf", storageKey: "secret/path", mimeType: "application/pdf", fileSize: 12n, documentType: "contract", version: 1, checksumSha256: "a".repeat(64), status: "draft", uploadedByAccountId: 11n, signedAt: null, signatureProvider: null, signatureReference: null, createdAt: new Date("2026-10-01T10:00:00Z"), updatedAt: new Date("2026-10-01T10:00:00Z") };
const successorSummary = { contractId: 32n, contractNo: "HD-32-PRIVATE", status: "draft", revision: 0 };
function contract(overrides: Record<string, unknown> = {}) {
  return {
    contractId: 31n, contractNo: "HD-31", roomId: 41n, propertyId: 21n, ownerId: 101n, representativeResidentId: 201n, previousContractId: null,
    startDate: new Date("2026-10-15T00:00:00Z"), endDate: new Date("2027-10-14T00:00:00Z"), status: "draft", revision: 0,
    rentAmount: 3500000n, depositAmount: 3500000n, residentCapacity: 3, initialElectricKwh: null, initialWaterM3: null,
    terminationDate: null, terminationReason: null, finalElectricKwh: null, finalWaterM3: null, depositDeduction: null, depositSettlementAmount: null,
    createdAt: new Date("2026-10-01T10:00:00Z"), updatedAt: new Date("2026-10-01T10:00:00Z"),
    room: { roomId: 41n, roomCode: "A-1", propertyId: 21n, property: { propertyId: 21n, name: "Property", province: "HCMC", address: "Address" } },
    representativeResident: { residentId: 201n, fullName: "Resident" }, successorContracts: [], ...overrides,
  };
}
const repository = {
  async list(...args: unknown[]) { observed.push({ method: "list", args }); return { rows: [contract()], total: 1 }; },
  async canCreateForOwner(...args: unknown[]) { observed.push({ method: "canCreateForOwner", args }); return true; },
  async create(...args: unknown[]) { observed.push({ method: "create", args }); return contract({ status: "draft", revision: 0 }); },
  async findForOwner(...args: unknown[]) { observed.push({ method: "findForOwner", args }); return contract(); },
  async findForResident(...args: unknown[]) { observed.push({ method: "findForResident", args }); return contract(); },
  async patch(...args: unknown[]) { observed.push({ method: "patch", args }); return { contract: contract({ status: "active", revision: 4 }), changed: true }; },
  async activate(...args: unknown[]) { observed.push({ method: "activate", args }); return contract({ status: "active", revision: 1 }); },
  async renew(...args: unknown[]) { observed.push({ method: "renew", args }); return contract({ contractId: 32n, contractNo: "HD-NEW", previousContractId: 31n, status: "draft", revision: 0 }); },
  async terminate(...args: unknown[]) { observed.push({ method: "terminate", args }); return contract({ status: "terminated", revision: 2 }); },
  async history(...args: unknown[]) { observed.push({ method: "history", args }); return { rows: [{ revision: 1, changeType: "activation", changeReason: null, beforeData: { status: "draft" }, afterData: { status: "active" }, changedByAccountId: 11n, createdAt: new Date("2026-10-01T10:00:00Z") }], total: 1 }; },
  async listDocuments(...args: unknown[]) { observed.push({ method: "listDocuments", args }); return [doc]; },
  async findDocument(...args: unknown[]) { observed.push({ method: "findDocument", args }); return doc; },
  async listMine(...args: unknown[]) { observed.push({ method: "listMine", args }); return { rows: [contract()], total: 1 }; },
} as any;
const contractIdempotency = {
  async execute(command: any) {
    observed.push({ method: "idempotency", args: [command.ownerId, command.accountId, command.operationScope, command.semanticInput] });
    const result = await command.executeMutation({} as any);
    return { status: result.status, body: stringifyBigInts(result.body), replayed: false };
  },
} as any;
const documentService = {
  async read(...args: unknown[]) { observed.push({ method: "readDocument", args }); const { storageKey: _storageKey, ...metadata } = doc; return { metadata, downloadUrl: null }; },
  async upload() { throw new Error("upload must remain blocked in these tests"); },
} as any;
let server: Server;
let baseUrl = "";
const tokens = new Map<string, string>();
async function installSession(account: LoginAccountRecord) {
  const token = createOpaqueSessionToken();
  const csrf = makeCsrfToken(config.sessionSecret);
  await sessions.set(createSessionRecord(account.accountId, hashSessionToken(token, config.sessionSecret), config));
  tokens.set(account.role, `${token}|${csrf}`);
}
function headers(role: "admin" | "resident", unsafe = false, extra: Record<string, string> = {}) {
  const [token, csrf] = tokens.get(role)!.split("|");
  return { Cookie: `gt_session=${token}; gt_csrf=${csrf}`, ...(unsafe ? { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" } : {}), ...extra };
}
async function call(path: string, role: "admin" | "resident", options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: options.method ?? "GET", headers: headers(role, options.method !== undefined && options.method !== "GET", options.headers), ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  return { response, body: await response.json() };
}
before(async () => {
  await installSession(adminAccount); await installSession(residentAccount);
  const app = express(); app.use(requestIdMiddleware); app.use(express.json());
  app.use("/api/v1", createV1Router({ ...auth, contractRepository: repository, contractIdempotency, objectStorage: new UnconfiguredObjectStorage(), contractDocumentService: documentService })); app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("GET contracts scopes list query to authenticated Owner and paginates", async () => {
  observed.length = 0; const result = await call("/api/v1/contracts?status=active&page=2&page_size=25", "admin");
  assert.equal(result.response.status, 200); assert.equal(result.body.meta.page, 2); assert.equal(result.body.meta.page_size, 25);
  assert.equal((observed[0]!.args[0] as bigint), 101n); assert.equal((observed[0]!.args[1] as any).status, "active");
});
test("GET contracts accepts trimmed Contract number filter alongside current filters", async () => {
  observed.length = 0;
  const result = await call("/api/v1/contracts?contract_no=%20hd-01%20&status=active&room_id=41&page=2", "admin");
  assert.equal(result.response.status, 200);
  const query = observed.find((item) => item.method === "list")!.args[1] as any;
  assert.equal(query.contractNo, "hd-01"); assert.equal(query.status, "active"); assert.equal(query.roomId, 41n); assert.equal(query.page, 2);
});
test("GET contracts rejects Resident role", async () => { const result = await call("/api/v1/contracts", "resident"); assert.equal(result.response.status, 403); });
test("POST contract requires Idempotency-Key before persistence", async () => {
  observed.length = 0; const result = await call("/api/v1/contracts", "admin", { method: "POST", body: {} });
  assert.equal(result.response.status, 400); assert.equal(observed.length, 0);
});
test("POST contract uses authenticated Owner and creates draft revision zero", async () => {
  observed.length = 0; const result = await call("/api/v1/contracts", "admin", { method: "POST", headers: { "Idempotency-Key": "contract-create-001" }, body: { contract_no: "HD-1", room_id: "41", representative_resident_id: "201", start_date: "2026-10-15", end_date: "2027-10-14", rent_amount: "3500000", deposit_amount: "3500000", resident_capacity: 3, initial_electric_kwh: null, initial_water_m3: null } });
  assert.equal(result.response.status, 201); assert.equal(result.body.data.revision, 0); assert.equal(result.body.data.status, "draft");
  assert.equal((observed[0]!.args[0] as bigint), 101n); assert.equal((observed[0]!.args[1] as any).roomId, 41n);
});
test("POST contract rejects client Owner field", async () => {
  const result = await call("/api/v1/contracts", "admin", { method: "POST", headers: { "Idempotency-Key": "contract-create-002" }, body: { owner_id: "202" } });
  assert.equal(result.response.status, 400);
});
test("foreign detail returns indistinguishable 404", async () => {
  const prior = repository.findForOwner; repository.findForOwner = async () => null;
  try { const result = await call("/api/v1/contracts/999", "admin"); assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND"); }
  finally { repository.findForOwner = prior; }
});
test("Resident detail resolves identity from session context", async () => {
  observed.length = 0; const result = await call("/api/v1/contracts/31", "resident");
  assert.equal(result.response.status, 200); assert.deepEqual(observed[0]!.args, [101n, 201n, 31n, 12n]);
  assert.equal(result.body.data.representative_resident, undefined);
});
test("Admin predecessor response continues to include Owner-scoped successor summary", async () => {
  const prior = repository.findForOwner; repository.findForOwner = async () => contract({ successorContracts: [successorSummary] });
  try {
    const result = await call("/api/v1/contracts/31", "admin");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.successor, { contract_id: "32", contract_no: "HD-32-PRIVATE", status: "draft", revision: 0 });
  } finally { repository.findForOwner = prior; }
});
test("Resident may see successor summary when repository independently authorizes that successor", async () => {
  const prior = repository.findForResident; repository.findForResident = async (...args: unknown[]) => { observed.push({ method: "findForResident", args }); return contract({ successorContracts: [successorSummary] }); };
  try {
    const result = await call("/api/v1/contracts/31", "resident");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.successor, { contract_id: "32", contract_no: "HD-32-PRIVATE", status: "draft", revision: 0 });
    assert.deepEqual(observed.find((item) => item.method === "findForResident")!.args, [101n, 201n, 31n, 12n]);
  } finally { repository.findForResident = prior; }
});
test("Resident predecessor response hides successor reassigned to another Resident without disclosing any successor field", async () => {
  const prior = repository.findForResident; repository.findForResident = async () => contract({ status: "active", successorContracts: [] });
  try {
    const result = await call("/api/v1/contracts/31", "resident");
    assert.equal(result.response.status, 200); assert.equal(result.body.data.contract_id, "31");
    assert.equal(Object.hasOwn(result.body.data, "successor"), false);
    const serialized = JSON.stringify(result.body);
    for (const secret of ["32", "HD-32-PRIVATE", '"successor"']) assert.equal(serialized.includes(secret), false);
  } finally { repository.findForResident = prior; }
});
test("foreign Owner Contract remains indistinguishable 404 for Resident", async () => {
  const prior = repository.findForResident; repository.findForResident = async () => null;
  try {
    const result = await call("/api/v1/contracts/999", "resident");
    assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "NOT_FOUND");
  } finally { repository.findForResident = prior; }
});
test("draft PATCH needs no If-Match and forwards sparse fields", async () => {
  observed.length = 0; const result = await call("/api/v1/contracts/31", "admin", { method: "PATCH", body: { contract_no: "HD-31-A" } });
  assert.equal(result.response.status, 200); const callArgs = observed.find((item) => item.method === "patch")!.args;
  assert.equal(callArgs[3], undefined); assert.equal((callArgs[2] as any).contractNo, "HD-31-A");
});
test("active PATCH validates reason and requires If-Match", async () => {
  observed.length = 0;
  const prior = repository.findForOwner; repository.findForOwner = async () => contract({ status: "active", revision: 3 });
  try {
    const missing = await call("/api/v1/contracts/31", "admin", { method: "PATCH", body: { rent_amount: "4000000", change_reason: "Agreed" } });
    assert.equal(missing.response.status, 400);
    const valid = await call("/api/v1/contracts/31", "admin", { method: "PATCH", headers: { "If-Match": '"3"' }, body: { rent_amount: "4000000", change_reason: "Agreed" } });
    assert.equal(valid.response.status, 200); const args = observed.find((item) => item.method === "patch")!.args;
    assert.equal(args[3], 3); assert.equal(args[4], 11n);
  } finally { repository.findForOwner = prior; }
});
test("active PATCH rejects contract_no", async () => {
  const prior = repository.findForOwner; repository.findForOwner = async () => contract({ status: "active", revision: 3 });
  try { const result = await call("/api/v1/contracts/31", "admin", { method: "PATCH", headers: { "If-Match": '"3"' }, body: { contract_no: "HD-X", change_reason: "reason" } }); assert.equal(result.response.status, 400); }
  finally { repository.findForOwner = prior; }
});
test("activation requires idempotency but no draft revision precondition", async () => {
  const result = await call("/api/v1/contracts/31/activate", "admin", { method: "POST", headers: { "Idempotency-Key": "activate-31" }, body: {} });
  assert.equal(result.response.status, 200); assert.equal(result.body.data.revision, 1); assert.equal(result.body.data.status, "active");
});
test("activation rejects caller-supplied status", async () => {
  const result = await call("/api/v1/contracts/31/activate", "admin", { method: "POST", headers: { "Idempotency-Key": "activate-31x" }, body: { status: "active" } }); assert.equal(result.response.status, 400);
});
test("renew requires If-Match and creates revision-zero successor", async () => {
  const body = { contract_no: "HD-NEW", start_date: "2027-10-15", end_date: "2028-10-14" };
  const missing = await call("/api/v1/contracts/31/renew", "admin", { method: "POST", headers: { "Idempotency-Key": "renew-31-a" }, body }); assert.equal(missing.response.status, 400);
  const good = await call("/api/v1/contracts/31/renew", "admin", { method: "POST", headers: { "Idempotency-Key": "renew-31-b", "If-Match": '"1"' }, body });
  assert.equal(good.response.status, 201); assert.equal(good.body.data.revision, 0); assert.equal(good.body.data.previous_contract_id, "31");
});
test("Resident cannot read audit history", async () => { const result = await call("/api/v1/contracts/31/history", "resident"); assert.equal(result.response.status, 403); });
test("history returns only documented audit fields and pagination", async () => {
  const result = await call("/api/v1/contracts/31/history?page=1&page_size=10", "admin");
  assert.equal(result.response.status, 200); assert.equal(result.body.data[0].changed_by_account_id, "11"); assert.equal(result.body.meta.total_items, 1);
  assert.deepEqual(Object.keys(result.body.data[0]).sort(), ["after_data", "before_data", "change_reason", "change_type", "changed_by_account_id", "created_at", "revision"].sort());
});
test("document listing never serializes storage_key", async () => {
  const result = await call("/api/v1/contracts/31/documents", "admin");
  assert.equal(result.response.status, 200); assert.equal(result.body.data[0].storage_key, undefined); assert.equal(result.body.data[0].file_name, "contract.pdf");
});
test("document read never serializes durable storage key", async () => {
  const result = await call("/api/v1/contract-documents/61", "admin");
  assert.equal(result.response.status, 200); assert.equal(result.body.data.storage_key, undefined);
});
test("document upload reports missing production storage without persisting fake bytes", async () => {
  const result = await call("/api/v1/contracts/31/documents", "admin", { method: "POST", headers: { "Idempotency-Key": "document-31-1" }, body: { document_type: "contract" } });
  assert.equal(result.response.status, 503); assert.equal(result.body.error.code, "STORAGE_UNAVAILABLE");
});
test("GET me contracts is resident-only and session-scoped", async () => {
  observed.length = 0; const result = await call("/api/v1/me/contracts?page=2", "resident");
  assert.equal(result.response.status, 200); assert.deepEqual(observed[0]!.args, [101n, 201n, 2, 20, 12n]);
  assert.equal(result.body.data[0].revision, 0); assert.equal(result.body.data[0].change_history, undefined);
});
test("GET me contracts hides successor unless that successor is independently Resident-scoped", async () => {
  const prior = repository.listMine; repository.listMine = async (...args: unknown[]) => {
    observed.push({ method: "listMine", args });
    return { rows: [contract({ successorContracts: [] })], total: 1 };
  };
  try {
    const result = await call("/api/v1/me/contracts", "resident");
    assert.equal(result.response.status, 200); assert.equal(result.body.data[0].contract_id, "31");
    assert.equal(Object.hasOwn(result.body.data[0], "successor"), false);
    assert.equal(JSON.stringify(result.body).includes("HD-32-PRIVATE"), false);
  } finally { repository.listMine = prior; }
});
test("Admin cannot read Resident self-contract endpoint", async () => { const result = await call("/api/v1/me/contracts", "admin"); assert.equal(result.response.status, 403); });
test("page query applies defaults", () => assert.deepEqual(parseContractPageQuery({}), { page: 1, pageSize: 20 }));
