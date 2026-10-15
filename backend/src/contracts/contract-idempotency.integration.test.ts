import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import { PrismaContractRepository } from "./contract.repository.js";
import { ContractIdempotencyService, hashIdempotencyKey, type ContractResponseKeyProvider } from "./contract-idempotency.js";
import type { ContractInput, ContractRenewalInput } from "./contract.validation.js";

const url = process.env.CONTRACT_IDEMPOTENCY_TEST_DATABASE_URL;
test("PostgreSQL V1.5 Contract idempotency lifecycle, isolation, concurrency and restart", { skip: !url }, async () => {
  assert.ok(url, "runtime runner must supply a disposable PostgreSQL database");
  assert.match(new URL(url).pathname, /idempotency/i, "refusing to write outside a disposable idempotency database");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const keyBytes = Buffer.alloc(32, 0x5a);
  const keys: ContractResponseKeyProvider = { active: () => ({ version: "runtime-test-key-v1", key: keyBytes }), byVersion: (version) => version === "runtime-test-key-v1" ? keyBytes : undefined };
  const repo = new PrismaContractRepository(prisma);
  const service = new ContractIdempotencyService(prisma, keys);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000);
  const unique = () => randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
  const makeInput = (roomId: bigint, residentId: bigint, no: string, start: Date, end: Date): ContractInput => ({
    contractNo: `IDEM-${no}`, roomId, representativeResidentId: residentId, startDate: start, endDate: end,
    rentAmount: 3_500_000n, depositAmount: 3_500_000n, residentCapacity: 2,
    initialElectricKwh: "10", initialWaterM3: "5",
  });
  const createCommand = (ownerId: bigint, accountId: bigint, input: ContractInput, key: string, suffix = "") => ({
    ownerId, accountId, method: "POST" as const, operationScope: "contracts.create", idempotencyKey: key,
    semanticInput: input,
    executeMutation: async (tx: Prisma.TransactionClient) => {
      const row = await repo.create(ownerId, input, tx);
      if (!row) throw new Error("fixture Room/Resident unavailable");
      return { status: 201, body: { data: { contract_id: row.contractId, contract_no: row.contractNo, status: row.status }, suffix } };
    },
  });
  const idFrom = (body: string) => BigInt((JSON.parse(body) as { data: { contract_id: string } }).data.contract_id);
  const countContract = (contractId: bigint) => prisma.contract.count({ where: { contractId } });
  const countHistory = (contractId: bigint) => prisma.contractChangeHistory.count({ where: { contractId } });

  try {
    await prisma.$queryRaw`SELECT 1`;
    const details = await prisma.$queryRaw<Array<{ db: string; port: number; version: string }>>`SELECT current_database() AS db, inet_server_port() AS port, current_setting('server_version') AS version`;
    assert.match(details[0]!.version, /^18\./);
    assert.match(details[0]!.db, /idempotency/i);

    // Same key/payload during a real database race: one draft and one durable row.
    const createKey = `create-${randomUUID()}`;
    const createInput = makeInput(111n, 1003n, unique(), day(2), day(367));
    const createArgs = createCommand(1n, 1n, createInput, createKey);
    const [createdA, createdB] = await Promise.all([service.execute(createArgs), service.execute(createArgs)]);
    const createdId = idFrom(createdA.body);
    assert.equal(createdB.status, 201);
    assert.equal(idFrom(createdB.body), createdId);
    assert.equal(await countContract(createdId), 1);
    const createdRequest = await prisma.contractIdempotencyRequest.findUniqueOrThrow({ where: { ownerId_accountId_operationScope_idempotencyKeyHash: { ownerId: 1n, accountId: 1n, operationScope: "contracts.create", idempotencyKeyHash: hashIdempotencyKey(createKey) } } });
    assert.equal(createdRequest.state, "completed");
    assert.equal(createdRequest.requestFingerprint.length, 32);
    assert.equal(Buffer.from(createdRequest.idempotencyKeyHash).toString("hex"), hashIdempotencyKey(createKey).toString("hex"));
    assert.equal(Buffer.from(createdRequest.idempotencyKeyHash).includes(Buffer.from(createKey)), false);
    assert.equal(Buffer.from(createdRequest.responseCiphertext!).includes(Buffer.from(createInput.contractNo)), false);

    // Re-instantiated service reads the encrypted database result; response-send loss is safe.
    const restarted = new ContractIdempotencyService(prisma, keys);
    const replayAfterRestart = await restarted.execute(createArgs);
    assert.equal(replayAfterRestart.replayed, true);
    assert.equal(replayAfterRestart.body, createdA.body);
    assert.equal(await countContract(createdId), 1);

    const changedPayload = { ...createArgs, semanticInput: { ...createInput, rentAmount: createInput.rentAmount + 1n } };
    await assert.rejects(() => service.execute(changedPayload), (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await countContract(createdId), 1);

    // Owner isolation: same raw key and scope is an independent namespace.
    const ownerIsolatedInput = makeInput(212n, 2003n, unique(), day(2), day(367));
    const ownerIsolated = await service.execute(createCommand(2n, 4n, ownerIsolatedInput, createKey));
    assert.notEqual(idFrom(ownerIsolated.body), createdId);

    // Database V1.5 permits only one Admin account per Owner (accounts.owner_id UNIQUE).
    // Confirm this schema limit explicitly; the runtime namespace still includes account_id.
    await assert.rejects(() => prisma.account.create({ data: { ownerId: 1n, role: "admin", email: `idem-${unique().toLowerCase()}@example.test`, passwordHash: "runtime-only-unusable", status: "active" } }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002"));

    // Failed mutation and missing active encryption key both roll the reservation back.
    const failedKey = `rollback-${randomUUID()}`;
    const failedInput = makeInput(111n, 1003n, unique(), day(4), day(369));
    const failedArgs = createCommand(1n, 1n, failedInput, failedKey);
    await assert.rejects(() => service.execute({ ...failedArgs, executeMutation: async (tx) => { await repo.create(1n, failedInput, tx); throw new Error("injected rollback"); } }), /injected rollback/);
    assert.equal(await prisma.contract.count({ where: { contractNo: failedInput.contractNo } }), 0);
    assert.equal(await prisma.contractIdempotencyRequest.count({ where: { ownerId: 1n, accountId: 1n, operationScope: "contracts.create", idempotencyKeyHash: hashIdempotencyKey(failedKey) } }), 0);
    const noKeyProvider: ContractResponseKeyProvider = { active: () => { throw new ApiError(503, "IDEMPOTENCY_REPLAY_UNAVAILABLE", "Unavailable"); }, byVersion: () => undefined };
    const encryptionFailureKey = `encrypt-fail-${randomUUID()}`;
    const encryptionFailureInput = makeInput(111n, 1003n, unique(), day(5), day(370));
    const encryptionFailureArgs = createCommand(1n, 1n, encryptionFailureInput, encryptionFailureKey);
    await assert.rejects(() => new ContractIdempotencyService(prisma, noKeyProvider).execute(encryptionFailureArgs), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.equal(await prisma.contract.count({ where: { contractNo: encryptionFailureInput.contractNo } }), 0);
    assert.equal(await prisma.contractIdempotencyRequest.count({ where: { ownerId: 1n, accountId: 1n, operationScope: "contracts.create", idempotencyKeyHash: hashIdempotencyKey(encryptionFailureKey) } }), 0);

    // Activate duplicate: exactly one state transition and one official history event.
    const activationKey = `activate-${randomUUID()}`;
    const activateArgs = { ownerId: 1n, accountId: 1n, method: "POST" as const, operationScope: `contracts.activate:${createdId}`, idempotencyKey: activationKey, semanticInput: {}, executeMutation: async (tx: Parameters<typeof repo.activate>[3]) => {
      const row = await repo.activate(1n, 1n, createdId, tx); if (!row) throw new Error("contract missing");
      return { status: 200, body: { data: { contract_id: row.contractId, status: row.status, revision: row.revision } } };
    } };
    const activated = await Promise.all([service.execute(activateArgs), service.execute(activateArgs)]);
    assert.equal(JSON.parse(activated[0]!.body).data.revision, 1);
    assert.equal(activated[1]!.body, activated[0]!.body);
    assert.equal(await countHistory(createdId), 1);

    // Create and activate a separate predecessor, then race the same renewal request.
    const renewBaseInput = makeInput(211n, 2003n, unique(), day(-10), day(20));
    const renewBaseResult = await service.execute(createCommand(2n, 4n, renewBaseInput, `renew-base-${randomUUID()}`));
    const predecessorId = idFrom(renewBaseResult.body);
    await repo.activate(2n, 4n, predecessorId);
    const renewal: ContractRenewalInput = { contractNo: `IDEM-${unique()}`, startDate: day(21), endDate: day(386) };
    const renewKey = `renew-${randomUUID()}`;
    const renewArgs = { ownerId: 2n, accountId: 4n, method: "POST" as const, operationScope: `contracts.renew:${predecessorId}`, idempotencyKey: renewKey, semanticInput: { body: renewal, if_match_revision: 1 }, executeMutation: async (tx: Parameters<typeof repo.renew>[4]) => {
      const row = await repo.renew(2n, predecessorId, 1, renewal, tx); if (!row) throw new Error("predecessor missing");
      return { status: 201, body: { data: { contract_id: row.contractId, previous_contract_id: row.previousContractId, status: row.status } } };
    } };
    const renewals = await Promise.all([service.execute(renewArgs), service.execute(renewArgs)]);
    const successorId = idFrom(renewals[0]!.body);
    assert.equal(idFrom(renewals[1]!.body), successorId);
    assert.equal((await prisma.contract.findMany({ where: { ownerId: 2n, previousContractId: predecessorId } })).length, 1);
    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { contractId: predecessorId } })).revision, 1);
    await assert.rejects(() => service.execute({ ...renewArgs, semanticInput: { body: { ...renewal, endDate: day(400) }, if_match_revision: 1 } }), (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "IDEMPOTENCY_KEY_REUSED");
    assert.equal((await prisma.contract.findMany({ where: { ownerId: 2n, previousContractId: predecessorId } })).length, 1);

    // Termination duplicate: one revision/history/termination effect, Resident state remains derived.
    const termBaseInput = makeInput(212n, 2003n, unique(), day(-10), day(100));
    const termBaseResult = await service.execute(createCommand(2n, 4n, termBaseInput, `term-base-${randomUUID()}`));
    const terminateId = idFrom(termBaseResult.body);
    await repo.activate(2n, 4n, terminateId);
    await prisma.roomResident.create({ data: { roomId: 212n, propertyId: 22n, ownerId: 2n, residentId: 2003n, contractId: terminateId, startedAt: day(-10), status: "active" } });
    const termination = { terminationDate: today, terminationReason: "Runtime idempotency fixture", finalElectricKwh: "10", finalWaterM3: "5", depositDeduction: 0n, depositSettlementAmount: 3_500_000n };
    const terminateKey = `terminate-${randomUUID()}`;
    const terminateArgs = { ownerId: 2n, accountId: 4n, method: "POST" as const, operationScope: `contracts.terminate:${terminateId}`, idempotencyKey: terminateKey, semanticInput: { body: termination, if_match_revision: 1 }, executeMutation: async (tx: Parameters<typeof repo.terminate>[5]) => {
      const row = await repo.terminate(2n, 4n, terminateId, 1, termination, tx); if (!row) throw new Error("contract missing");
      return { status: 200, body: { data: { contract_id: row.contractId, status: row.status, revision: row.revision } } };
    } };
    const terminations = await Promise.all([service.execute(terminateArgs), service.execute(terminateArgs)]);
    assert.equal(terminations[1]!.body, terminations[0]!.body);
    assert.equal(JSON.parse(terminations[0]!.body).data.revision, 2);
    assert.equal(await countHistory(terminateId), 2);
    assert.equal(await prisma.roomResident.count({ where: { ownerId: 2n, contractId: terminateId, status: "ended", endedAt: today } }), 1);
    await assert.rejects(() => service.execute({ ...terminateArgs, semanticInput: { body: { ...termination, terminationReason: "changed" }, if_match_revision: 1 } }), (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await countHistory(terminateId), 2);
    assert.equal((await prisma.resident.findFirstOrThrow({ where: { ownerId: 2n, residentId: 2003n } })).residenceStatus, "left");

    // Key rotation: replay needs the historical key version, not a usable active key.
    const rotatedKeyProvider: ContractResponseKeyProvider = { active: () => { throw new Error("new writes temporarily unavailable"); }, byVersion: (version) => version === "runtime-test-key-v1" ? keyBytes : undefined };
    const replayDuringRotation = await new ContractIdempotencyService(prisma, rotatedKeyProvider).execute(createArgs);
    assert.equal(replayDuringRotation.replayed, true);
    assert.equal(replayDuringRotation.body, createdA.body);

    // Losing an old encryption key is fail-closed and never reruns the mutation.
    const noHistoricalKey: ContractResponseKeyProvider = { active: () => ({ version: "new", key: Buffer.alloc(32, 0x33) }), byVersion: () => undefined };
    await assert.rejects(() => new ContractIdempotencyService(prisma, noHistoricalKey).execute(createArgs), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === "IDEMPOTENCY_REPLAY_UNAVAILABLE");
    assert.equal(await countContract(createdId), 1);
  } finally {
    await prisma.$disconnect();
  }
});
