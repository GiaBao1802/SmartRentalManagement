import assert from "node:assert/strict";
import { test } from "node:test";
import { ContractDocumentService } from "./contract-document.service.js";
import { FakeObjectStorage, UnconfiguredObjectStorage, type ObjectStorage } from "./object-storage.js";

async function* bytes(content: string) { yield new TextEncoder().encode(content); }
function fixture(options: { contract?: unknown; failCreate?: boolean } = {}) {
  const created: any[] = []; let latest: { version: number } | null = null;
  const prisma: any = {
    contract: { findFirst: async () => options.contract === undefined ? { contractId: 31n, propertyId: 21n } : options.contract },
    $transaction: async (callback: (tx: any) => unknown) => callback({
      $queryRaw: async () => [],
      contractDocument: {
        findFirst: async () => latest,
        create: async ({ data }: any) => {
          if (options.failCreate) throw new Error("insert failed");
          created.push(data); latest = { version: data.version };
          const { storageKey: _key, ...safe } = data;
          return { documentId: BigInt(60 + created.length), ...safe, createdAt: new Date(), updatedAt: new Date(), signedAt: null, signatureProvider: null, signatureReference: null };
        },
      },
    }),
    contractDocument: { findFirst: async () => ({ documentId: 61n, contractId: 31n, ownerId: 101n, propertyId: 21n, storageKey: "private/key", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 3n, documentType: "contract", version: 1, checksumSha256: "a".repeat(64), status: "draft", uploadedByAccountId: 11n, signedAt: null, signatureProvider: null, signatureReference: null, createdAt: new Date(), updatedAt: new Date() }) },
  };
  return { prisma, created };
}

test("document upload allocates immutable increasing versions and hides object key", async () => {
  const { prisma, created } = fixture(); const service = new ContractDocumentService(prisma, new FakeObjectStorage());
  const input = { ownerId: 101n, accountId: 11n, contractId: 31n, documentType: "contract", fileName: "a.pdf", mimeType: "application/pdf", bytes: bytes("pdf") };
  const first = await service.upload(input); const second = await service.upload(input);
  assert.equal(created[0].version, 1); assert.equal(created[1].version, 2);
  assert.equal(created[0].uploadedByAccountId, 11n); assert.equal(created[0].ownerId, 101n); assert.equal(created[0].propertyId, 21n);
  assert.equal(typeof created[0].storageKey, "string"); assert.equal((first as any)?.storageKey, undefined); assert.equal((second as any)?.storageKey, undefined);
  assert.equal(first?.checksumSha256?.length, 64); assert.equal(first?.fileSize, 3n);
});

test("document upload authorizes Contract before staging object", async () => {
  const { prisma, created } = fixture({ contract: null }); const storage = new FakeObjectStorage(); let stageCalled = false;
  const adapter: ObjectStorage = { ...storage, available: true, stage: async (input) => { stageCalled = true; return storage.stage(input); }, createReadUrl: (key) => storage.createReadUrl(key) };
  const result = await new ContractDocumentService(prisma, adapter).upload({ ownerId: 999n, accountId: 11n, contractId: 31n, documentType: "contract", fileName: "x", mimeType: "application/pdf", bytes: bytes("x") });
  assert.equal(result, null); assert.equal(stageCalled, false); assert.equal(created.length, 0);
});

test("database insert failure cleans staged object", async () => {
  const { prisma } = fixture({ failCreate: true }); const fake = new FakeObjectStorage(); let cleaned = false;
  const adapter: ObjectStorage = {
    available: true,
    stage: async (input) => { const staged = await fake.stage(input); return { ...staged, cleanup: async () => { cleaned = true; await staged.cleanup(); } }; },
    createReadUrl: (key) => fake.createReadUrl(key),
  };
  await assert.rejects(new ContractDocumentService(prisma, adapter).upload({ ownerId: 101n, accountId: 11n, contractId: 31n, documentType: "contract", fileName: "x", mimeType: "application/pdf", bytes: bytes("x") }));
  assert.equal(cleaned, true);
});

test("document type is allowlisted", async () => {
  const { prisma } = fixture(); const service = new ContractDocumentService(prisma, new FakeObjectStorage());
  await assert.rejects(service.upload({ ownerId: 101n, accountId: 11n, contractId: 31n, documentType: "unknown", fileName: "x", mimeType: "application/pdf", bytes: bytes("x") }));
});

test("unconfigured object storage blocks binary upload", async () => {
  const { prisma } = fixture(); const service = new ContractDocumentService(prisma, new UnconfiguredObjectStorage());
  await assert.rejects(service.upload({ ownerId: 101n, accountId: 11n, contractId: 31n, documentType: "contract", fileName: "x", mimeType: "application/pdf", bytes: bytes("x") }), (error: any) => error.status === 503 && error.code === "STORAGE_UNAVAILABLE");
});

test("document read returns safe metadata and optional short-lived URL only", async () => {
  const { prisma } = fixture(); const service = new ContractDocumentService(prisma, new UnconfiguredObjectStorage());
  const result = await service.read(101n, 61n);
  assert.equal((result?.metadata as any).storageKey, undefined); assert.equal(result?.downloadUrl, null);
});
