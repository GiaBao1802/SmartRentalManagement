import assert from "node:assert/strict";
import test from "node:test";
import { PrismaMeterContinuityRepository } from "./meter-continuity.repository.js";

test("repository scopes Contract by Owner and Contract IDs", async () => {
  let args: any;
  const repo = new PrismaMeterContinuityRepository({
    contract: { findFirst: async (input: any) => { args = input; return null; } },
    invoice: { findFirst: async () => null },
  } as any);
  await repo.findContract(11n, 22n);
  assert.deepEqual(args.where, { ownerId: 11n, contractId: 22n });
  assert.deepEqual(args.select, { contractId: true, ownerId: true, propertyId: true, initialElectricKwh: true, initialWaterM3: true });
});

test("repository selects only the nearest earlier finalized Invoice of the same Owner/Property/Contract", async () => {
  let args: any;
  const repo = new PrismaMeterContinuityRepository({
    contract: { findFirst: async () => null },
    invoice: { findFirst: async (input: any) => { args = input; return null; } },
  } as any);
  const invoicePeriodStart = new Date("2026-02-01T00:00:00.000Z");
  await repo.findPreviousFinalizedInvoice({ ownerId: 11n, contractId: 22n, utilityType: "ELECTRICITY", invoicePeriodStart }, 33n);
  assert.deepEqual(args.where, {
    ownerId: 11n,
    propertyId: 33n,
    contractId: 22n,
    status: { in: ["unpaid", "paid"] },
    finalizedAt: { not: null },
    periodEnd: { lt: invoicePeriodStart },
  });
  assert.deepEqual(args.orderBy, [{ periodEnd: "desc" }, { periodStart: "desc" }, { invoiceId: "desc" }]);
  assert.equal(args.select.electricityCurrentKwh, true);
  assert.equal(args.select.waterCurrentM3, true);
});
