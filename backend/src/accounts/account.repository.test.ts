import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { PrismaAccountManagementRepository } from "./account.repository.js";

test("Prisma list uses tenant AND filters and explicit safe projections", async () => {
  const calls: unknown[] = [];
  const client = {
    account: { findMany: (query: unknown) => { calls.push(query); return Promise.resolve([]); }, count: (query: unknown) => { calls.push(query); return Promise.resolve(0); } },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PrismaClient;
  await new PrismaAccountManagementRepository(client).list(11n, { page: 2, page_size: 10, role: "resident", residentId: 22n });
  const data = calls[0] as { where: { AND: unknown[] }; select: Record<string, unknown>; skip: number; take: number };
  assert.deepEqual(data.where.AND[0], { OR: [{ role: "admin", ownerId: 11n }, { role: "resident", resident: { ownerId: 11n } }] });
  assert.deepEqual(data.where.AND[1], { role: "resident", residentId: 22n, status: undefined });
  assert.equal(data.skip, 10); assert.equal(data.take, 10); assert.equal("passwordHash" in data.select, false);
  assert.deepEqual(data.select.resident, { select: { residentId: true, fullName: true } });
});
test("status transaction locks Account/Resident scope and waits for session revocation", async () => {
  const steps: string[] = [];
  const tx = { $queryRaw: async () => { steps.push("lock"); return [{ account_id: 2n }]; }, account: { update: async () => { steps.push("update"); return null; } } };
  const client = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => { const result = await run(tx); steps.push("commit"); return result; } } as unknown as PrismaClient;
  await new PrismaAccountManagementRepository(client).setResidentStatus(11n, 2n, "locked", async () => { steps.push("revoke"); });
  assert.deepEqual(steps, ["lock", "update", "revoke", "commit"]);
});
test("missing scoped Account never updates or revokes", async () => {
  let revoked = false;
  const tx = { $queryRaw: async () => [] };
  const client = { $transaction: (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  assert.equal(await new PrismaAccountManagementRepository(client).setResidentStatus(11n, 4n, "locked", async () => { revoked = true; }), null); assert.equal(revoked, false);
});
test("invitation revocation locks row, preserves terminal history and never selects token hash", async () => {
  const tx = { $queryRaw: async () => [{ invitation_id: 1n }], accountInvitation: { findFirst: async (args: { select: Record<string, unknown> }) => { assert.equal("tokenHash" in args.select, false); return { status: "accepted", expiresAt: new Date(Date.now() + 60_000) }; }, update: async () => { throw Error("terminal history must not change"); } } };
  const client = { $transaction: (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  assert.equal(await new PrismaAccountManagementRepository(client).revokeInvitation(11n, 1n, new Date()), "terminal");
});
