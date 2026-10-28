import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaContractRepository } from "./contract.repository.js";

function current(overrides: Record<string, any> = {}) {
  return {
    contractId: 31n, contractNo: "HD-31", roomId: 41n, propertyId: 21n, ownerId: 101n, representativeResidentId: 201n, previousContractId: null,
    startDate: new Date("2026-10-15T00:00:00Z"), endDate: new Date("2027-10-14T00:00:00Z"), status: "active", revision: 3,
    rentAmount: 3500000n, depositAmount: 3500000n, residentCapacity: 3, initialElectricKwh: null, initialWaterM3: null,
    terminationDate: null, terminationReason: null, finalElectricKwh: null, finalWaterM3: null, depositDeduction: null, depositSettlementAmount: null,
    room: { roomId: 41n, roomCode: "A-1", propertyId: 21n, property: { propertyId: 21n, name: "Property", province: "HCMC", address: "Address" } },
    representativeResident: { residentId: 201n, fullName: "Resident" }, successorContracts: [], ...overrides,
  };
}
function client(tx: any) {
  return { $transaction: async (callback: (value: any) => unknown) => callback(tx) } as any;
}
function txWithBase(base = current()) {
  const histories: any[] = []; const updates: any[] = []; let contractReads = 0;
  const tx: any = {
    $queryRaw: async () => [],
    contract: {
      findFirst: async () => { contractReads += 1; if (contractReads === 1) return { roomId: 41n }; if (contractReads === 2) return base; return null; },
      update: async ({ data }: any) => { updates.push(data); return { ...base, ...data }; },
    },
    resident: { findFirst: async () => ({ residentId: 201n }), updateMany: async () => ({ count: 1 }) },
    room: { findFirst: async () => ({ isActive: true, status: "available", property: { status: "active" }, _count: { roomResidents: 1, parkingAssignments: 0 } }) },
    contractChangeHistory: { create: async ({ data }: any) => { histories.push(data); return data; } },
    invoice: { findFirst: async () => null },
    roomResident: { findFirst: async () => null, findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    parkingSlotAssignment: { updateMany: async () => ({ count: 0 }) },
    parkingSlotRequest: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    amenitySubscription: { updateMany: async () => ({ count: 0 }) },
    amenitySubscriptionCycle: { updateMany: async () => ({ count: 0 }) },
  };
  return { tx, histories, updates };
}

test("active material PATCH increments exactly once and appends changed-only audit in same transaction", async () => {
  const base = current(); const { tx, histories, updates } = txWithBase(base);
  const repo = new PrismaContractRepository(client(tx));
  const result = await repo.patch(101n, 31n, { rentAmount: 4000000n, changeReason: "Agreed" }, 3, 11n);
  assert.equal((result as any).contract.revision, 4); assert.equal(updates.length, 1); assert.equal(updates[0].revision, 4);
  assert.equal(histories.length, 1); assert.equal(histories[0].revision, 4); assert.equal(histories[0].changeType, "material_update");
  assert.deepEqual(histories[0].beforeData, { rent_amount: "3500000" }); assert.deepEqual(histories[0].afterData, { rent_amount: "4000000" });
  assert.equal(histories[0].changedByAccountId, 11n); assert.equal(histories[0].ownerId, 101n);
});

test("active material PATCH no-op keeps revision and creates no audit", async () => {
  const { tx, histories, updates } = txWithBase(current()); const repo = new PrismaContractRepository(client(tx));
  const result = await repo.patch(101n, 31n, { rentAmount: 3500000n, changeReason: "No field change" }, 3, 11n);
  assert.equal((result as any).changed, false); assert.equal(updates.length, 0); assert.equal(histories.length, 0);
});

test("stale If-Match fails before any Contract update or history insert", async () => {
  const { tx, histories, updates } = txWithBase(current()); const repo = new PrismaContractRepository(client(tx));
  await assert.rejects(repo.patch(101n, 31n, { rentAmount: 4000000n, changeReason: "Agreed" }, 2, 11n), (error: any) => error.status === 409 && error.code === "CONTRACT_REVISION_CONFLICT");
  assert.equal(updates.length, 0); assert.equal(histories.length, 0);
});

test("active capacity decrease below current occupants is rejected", async () => {
  const { tx, histories, updates } = txWithBase(current()); tx.room.findFirst = async () => ({ _count: { roomResidents: 2, parkingAssignments: 0 } }); const repo = new PrismaContractRepository(client(tx));
  await assert.rejects(repo.patch(101n, 31n, { residentCapacity: 1, changeReason: "Capacity change" }, 3, 11n), (error: any) => error.status === 409 && error.code === "ROOM_CAPACITY_EXCEEDED");
  assert.equal(updates.length, 0); assert.equal(histories.length, 0);
});

test("active capacity amendment requires current revision and reason and records one history revision", async () => {
  const { tx, histories, updates } = txWithBase(current());
  const repo = new PrismaContractRepository(client(tx));
  const result = await repo.patch(101n, 31n, { residentCapacity: 4, changeReason: "Approved occupancy change" }, 3, 11n);
  assert.equal((result as any).contract.revision, 4);
  assert.equal(updates[0]!.residentCapacity, 4);
  assert.equal(histories.length, 1); assert.equal(histories[0]!.revision, 4); assert.equal(histories[0]!.changeType, "material_update");
  assert.equal(histories[0]!.changeReason, "Approved occupancy change");
});

test("Contract list scopes a trimmed case-insensitive partial number filter and composes other filters", async () => {
  let where: any; let paging: any;
  const prisma: any = { contract: {
    findMany: async (args: any) => { where = args.where; paging = args; return []; },
    count: async ({ where: countWhere }: any) => { assert.deepEqual(countWhere, where); return 0; },
  }, $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations) };
  const repo = new PrismaContractRepository(prisma);
  await repo.list(101n, { page: 2, pageSize: 10, contractNo: "hd-01", status: "active", roomId: 41n });
  assert.deepEqual(where, { ownerId: 101n, roomId: 41n, status: "active", contractNo: { contains: "hd-01", mode: "insensitive" } });
  assert.equal(paging.skip, 10); assert.equal(paging.take, 10);
});

test("expiry synchronization is idempotent, timezone-aware and appends one official history event", async () => {
  const expired = current({ endDate: new Date("2026-10-11T00:00:00Z"), status: "active", revision: 4 });
  const histories: any[] = []; const updates: any[] = []; const closures: string[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    contract: {
      findFirst: async () => expired,
      update: async ({ data }: any) => { updates.push(data); Object.assign(expired, data); return expired; },
    },
    contractChangeHistory: { create: async ({ data }: any) => { histories.push(data); return data; } },
    parkingSlotAssignment: { updateMany: async () => { closures.push("parking"); return { count: 1 }; } },
    parkingSlotRequest: { updateMany: async () => ({ count: 0 }) },
    amenitySubscription: { updateMany: async () => { closures.push("amenity"); return { count: 1 }; } },
    amenitySubscriptionCycle: { updateMany: async () => { closures.push("cycles"); return { count: 1 }; } },
  };
  const prisma: any = { contract: { findMany: async () => [{ contractId: 31n }] }, $transaction: async (callback: any) => callback(tx) };
  const repo = new PrismaContractRepository(prisma, () => new Date("2026-10-11T17:05:00.000Z"));
  assert.equal(await repo.syncExpired(101n, 11n), 1);
  assert.equal(await repo.syncExpired(101n, 11n), 0);
  assert.equal(expired.status, "expired"); assert.equal(expired.revision, 5);
  assert.equal(updates.length, 1); assert.equal(histories.length, 1);
  assert.deepEqual(closures, ["parking", "amenity", "cycles"]);
  assert.equal(histories[0]!.changeType, "status_transition"); assert.deepEqual(histories[0]!.afterData, { status: "expired", end_date: "2026-10-11" });
});

test("expiry synchronization leaves an active Contract through its end date", async () => {
  let queried: any;
  const prisma: any = {
    contract: { findMany: async (args: any) => { queried = args.where; return []; } },
    $transaction: async (callback: any) => callback({}),
  };
  const repo = new PrismaContractRepository(prisma, () => new Date("2026-10-12T06:00:00.000Z"));
  assert.equal(await repo.syncExpired(101n, 11n), 0);
  assert.deepEqual(queried, { ownerId: 101n, status: "active", endDate: { lt: new Date("2026-10-12T00:00:00.000Z") } });
});

test("activation creates revision one and a complete official baseline", async () => {
  const base = current({ status: "draft", revision: 0 }); const { tx, histories, updates } = txWithBase(base); const repo = new PrismaContractRepository(client(tx));
  const result = await repo.activate(101n, 11n, 31n);
  assert.equal((result as any).revision, 1); assert.equal((result as any).status, "active");
  assert.equal(updates[0].revision, 1); assert.equal(histories.length, 1); assert.equal(histories[0].changeType, "activation");
  assert.deepEqual(histories[0].beforeData, { status: "draft" });
  assert.deepEqual(histories[0].afterData, { contract_no: "HD-31", room_id: "41", representative_resident_id: "201", start_date: "2026-10-15", end_date: "2027-10-14", rent_amount: "3500000", deposit_amount: "3500000", resident_capacity: 3, initial_electric_kwh: null, initial_water_m3: null, status: "active" });
});

test("successor activation requires its own initial readings and never reads predecessor meter history", async () => {
  const base = current({ status: "draft", revision: 0, previousContractId: 30n, initialElectricKwh: null, initialWaterM3: "88" });
  const { tx, histories, updates } = txWithBase(base);
  let contractReads = 0;
  let invoiceReads = 0;
  tx.contract.findFirst = async () => { contractReads += 1; return contractReads === 1 ? { roomId: 41n } : base; };
  tx.invoice.findFirst = async () => { invoiceReads += 1; return null; };
  const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
  await assert.rejects(repo.activate(101n, 11n, 31n), (error: any) => error.status === 409 && error.code === "CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED");
  assert.equal(contractReads, 2);
  assert.equal(invoiceReads, 0);
  assert.equal(updates.length, 0);
  assert.equal(histories.length, 0);
});

test("successor activates using only the two readings already entered on its own draft", async () => {
  const base = current({ status: "draft", revision: 0, previousContractId: 30n, initialElectricKwh: "1360.000", initialWaterM3: "47.250" });
  const { tx, histories, updates } = txWithBase(base);
  const repo = new PrismaContractRepository(client(tx));
  const result = await repo.activate(101n, 11n, 31n);
  assert.equal((result as any).status, "active");
  assert.equal(updates[0]!.initialElectricKwh, undefined);
  assert.equal(updates[0]!.initialWaterM3, undefined);
  assert.equal(histories[0]!.afterData.initial_electric_kwh, "1360.000");
  assert.equal(histories[0]!.afterData.initial_water_m3, "47.250");
});

test("renewal starts a new meter continuity with empty initial readings", async () => {
  const predecessor = current({ status: "expired", revision: 4, initialElectricKwh: "12.000", initialWaterM3: "8.000", finalElectricKwh: "1000.000", finalWaterM3: "300.000" });
  const created: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    contract: {
      findFirst: async (args: any) => {
        if (args.select?.roomId) return { roomId: 41n };
        if (args.where?.previousContractId) return null;
        if (args.where?.startDate) return null;
        return predecessor;
      },
      create: async ({ data }: any) => { created.push(data); return { ...predecessor, ...data, contractId: 32n }; },
    },
    resident: { findFirst: async () => ({ residentId: 201n }) },
    room: { findFirst: async () => ({ _count: { roomResidents: 1, parkingAssignments: 0 } }) },
    parkingSlotRequest: { count: async () => 0 },
    invoice: { findFirst: async () => { throw new Error("Renewal must not inspect predecessor invoices"); } },
  };
  const repo = new PrismaContractRepository(client(tx));
  await repo.renew(101n, 31n, 4, { contractNo: "HD-32", startDate: new Date("2027-10-15T00:00:00Z"), endDate: new Date("2028-10-14T00:00:00Z") } as any);
  assert.equal(created.length, 1);
  assert.equal(created[0].previousContractId, 31n);
  assert.equal(created[0].initialElectricKwh, null);
  assert.equal(created[0].initialWaterM3, null);
});

test("termination debt blocks before Contract or dependent lifecycle writes", async () => {
  const { tx, histories, updates } = txWithBase(current()); tx.invoice.findFirst = async () => ({ invoiceId: 90n });
  const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
  await assert.rejects(repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date("2027-01-01T00:00:00Z"), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 0n, depositSettlementAmount: 3500000n }), (error: any) => error.status === 409 && error.code === "CONTRACT_HAS_UNPAID_INVOICES");
  assert.equal(updates.length, 0); assert.equal(histories.length, 0);
});

test("future Contract termination is rejected using the Vietnam business date", async () => {
  const { tx, updates, histories } = txWithBase(current());
  const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
  await assert.rejects(repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date("2027-01-02T00:00:00Z"), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 0n, depositSettlementAmount: 3500000n }), (error: any) => error.status === 400 && error.code === "VALIDATION_ERROR" && error.message.includes("không được lớn hơn"));
  assert.equal(updates.length, 0); assert.equal(histories.length, 0);
});

test("termination date must be inside the original Contract interval", async () => {
  for (const date of ["2026-10-14", "2027-10-15"]) {
    const { tx, updates } = txWithBase(current());
    const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
    await assert.rejects(repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date(`${date}T00:00:00Z`), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 0n, depositSettlementAmount: 3500000n }), (error: any) => error.status === 400 && error.code === "VALIDATION_ERROR");
    assert.equal(updates.length, 0);
  }
});

test("termination increments revision and atomically records audit plus dependent closures", async () => {
  const { tx, histories, updates } = txWithBase(current()); const closed: string[] = [];
  tx.roomResident.updateMany = async () => { closed.push("occupancy"); return { count: 1 }; };
  tx.parkingSlotAssignment.updateMany = async () => { closed.push("parking"); return { count: 1 }; };
  tx.amenitySubscription.updateMany = async () => { closed.push("subscription"); return { count: 1 }; };
  tx.amenitySubscriptionCycle.updateMany = async () => { closed.push("planned-cycles"); return { count: 1 }; };
  const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
  const result = await repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date("2026-12-31T00:00:00Z"), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 500000n, depositSettlementAmount: 3000000n });
  assert.equal((result as any).revision, 4); assert.equal((result as any).status, "terminated"); assert.deepEqual(closed, ["occupancy", "parking", "subscription", "planned-cycles"]);
  assert.equal(updates[0].revision, 4); assert.equal(histories[0].changeType, "status_transition"); assert.equal(histories[0].changeReason, undefined);
  assert.equal(histories[0].changedByAccountId, 11n); assert.equal(histories[0].afterData.termination_reason, "Agreement");
});

test("termination recomputes each affected Resident from all remaining active Occupancies", async () => {
  const { tx } = txWithBase(current());
  const statusWrites: any[] = [];
  tx.roomResident.findMany = async () => [{ residentId: 201n }, { residentId: 202n }];
  tx.roomResident.findFirst = async ({ where }: any) => where.contractId ? null : (where.residentId === 201n ? { occupancyId: 800n } : null);
  tx.roomResident.updateMany = async () => ({ count: 2 });
  tx.resident.updateMany = async ({ where, data }: any) => { statusWrites.push({ where, data }); return { count: 1 }; };
  const repo = new PrismaContractRepository(client(tx), () => new Date("2027-01-01T12:00:00+07:00"));
  await repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date("2027-01-01T00:00:00Z"), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 0n, depositSettlementAmount: 3500000n });
  assert.deepEqual(statusWrites, [
    { where: { ownerId: 101n, residentId: 201n }, data: { residenceStatus: "living" } },
    { where: { ownerId: 101n, residentId: 202n }, data: { residenceStatus: "left" } },
  ]);
});

test("termination failure after Resident recomputation rolls back Contract, occupancy and Resident status changes", async () => {
  const durable: any = {
    contract: current(), occupancies: [{ residentId: 201n, status: "active", contractId: 31n, startedAt: new Date("2026-10-15T00:00:00Z") }],
    residents: [{ residentId: 201n, residenceStatus: "living" }], histories: [],
  };
  const prisma: any = { $transaction: async (callback: any) => {
    const staged = structuredClone(durable);
    const tx: any = {
      $queryRaw: async () => [],
      contract: {
        findFirst: async (args: any) => args.select?.roomId ? { roomId: 41n } : staged.contract,
        update: async ({ data }: any) => { Object.assign(staged.contract, data); return staged.contract; },
      },
      invoice: { findFirst: async () => null },
      roomResident: {
        findFirst: async ({ where }: any) => where.contractId ? null : staged.occupancies.find((row: any) => row.residentId === where.residentId && row.status === "active") ?? null,
        findMany: async () => staged.occupancies.filter((row: any) => row.contractId === 31n && row.status === "active"),
        updateMany: async () => { for (const row of staged.occupancies) if (row.contractId === 31n && row.status === "active") row.status = "ended"; return { count: 1 }; },
      },
      resident: { updateMany: async ({ where, data }: any) => { const row = staged.residents.find((item: any) => item.residentId === where.residentId); if (row) row.residenceStatus = data.residenceStatus; return { count: 1 }; } },
      parkingSlotAssignment: { updateMany: async () => ({ count: 0 }) },
      parkingSlotRequest: { updateMany: async () => ({ count: 0 }) },
      amenitySubscription: { updateMany: async () => { throw new Error("simulated later side-effect failure"); } },
      amenitySubscriptionCycle: { updateMany: async () => ({ count: 0 }) },
      contractChangeHistory: { create: async ({ data }: any) => { staged.histories.push(data); return data; } },
    };
    const result = await callback(tx);
    Object.assign(durable, staged);
    return result;
  } };
  const repo = new PrismaContractRepository(prisma, () => new Date("2027-01-01T12:00:00+07:00"));
  await assert.rejects(repo.terminate(101n, 11n, 31n, 3, { terminationDate: new Date("2026-12-31T00:00:00Z"), terminationReason: "Agreement", finalElectricKwh: "120", finalWaterM3: "80", depositDeduction: 0n, depositSettlementAmount: 3500000n }), /simulated later side-effect failure/);
  assert.equal(durable.contract.status, "active");
  assert.equal(durable.occupancies[0].status, "active");
  assert.equal(durable.residents[0].residenceStatus, "living");
  assert.equal(durable.histories.length, 0);
});

test("Resident Contract detail independently scopes nested successor to session Owner and Resident", async () => {
  let args: any;
  const prisma: any = { contract: { findFirst: async (input: any) => { args = input; return null; } } };
  const repo = new PrismaContractRepository(prisma);
  await repo.findForResident(101n, 201n, 31n);
  assert.deepEqual(args.where, {
    ownerId: 101n, contractId: 31n,
    OR: [{ representativeResidentId: 201n }, { roomResidents: { some: { residentId: 201n, ownerId: 101n, contractId: 31n } } }],
  });
  assert.deepEqual(args.include.successorContracts.where, {
    ownerId: 101n,
    OR: [{ representativeResidentId: 201n }, { roomResidents: { some: { residentId: 201n, ownerId: 101n } } }],
  });
  assert.deepEqual(args.include.successorContracts.select, { contractId: true, contractNo: true, status: true, revision: true });
});

test("Resident /me Contract list independently scopes each nested successor to session Owner and Resident", async () => {
  let args: any;
  const prisma: any = {
    contract: {
      findMany: async (input: any) => { args = input; return []; },
      count: async () => 0,
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const repo = new PrismaContractRepository(prisma);
  await repo.listMine(101n, 201n, 1, 20);
  assert.deepEqual(args.where, { ownerId: 101n, OR: [{ representativeResidentId: 201n }, { roomResidents: { some: { residentId: 201n, ownerId: 101n } } }] });
  assert.deepEqual(args.include.successorContracts.where, {
    ownerId: 101n,
    OR: [{ representativeResidentId: 201n }, { roomResidents: { some: { residentId: 201n, ownerId: 101n } } }],
  });
});
