import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaBillingWorkspaceRepository } from "./billing-workspace.repository.js";

test("workspace returns owner-scoped server readiness, recorded reminder and safe business labels without writes", async () => {
  const today = new Date("2026-11-15T00:00:00.000Z");
  const invoice = {
    invoiceId: 8901n, invoiceNo: "INV-88-20261014", contractId: 88n, propertyId: 4n, ownerId: 7n,
    periodStart: new Date("2026-10-14T00:00:00.000Z"), periodEnd: new Date("2026-11-13T00:00:00.000Z"),
    dueDate: null, finalizedAt: null, rentAmount: 3500000n, electricityPreviousKwh: "100.000", electricityCurrentKwh: null,
    waterPreviousM3: "20.000", waterCurrentM3: null, electricityAmount: 0n, waterAmount: 0n, serviceAmount: 0n,
    totalAmount: 3500000n, status: "draft", revision: 1,
  };
  const contract = {
    contractId: 88n, contractNo: "HD-88", ownerId: 7n, propertyId: 4n, roomId: 9n, representativeResidentId: 19n,
    startDate: new Date("2026-10-14T00:00:00.000Z"), endDate: new Date("2027-10-13T00:00:00.000Z"), terminationDate: null,
    status: "active", rentAmount: 3500000n, initialElectricKwh: "100.000", initialWaterM3: "20.000",
    room: { roomCode: "A101", property: { propertyId: 4n, name: "Nhà Bình An", province: "Đồng Nai", address: "Đường Mẫu" } },
    representativeResident: { residentId: 19n, fullName: "Nguyễn Thị Ánh" }, invoices: [],
  };
  const writes: string[] = [];
  const invoiceFindMany = async (args: any) => args.where.status === "draft" ? [invoice] : [];
  const tx = {};
  const prisma: any = {
    $transaction: async (arg: any) => typeof arg === "function" ? arg(tx) : Promise.all(arg),
    contract: {
      findMany: async (args: any) => { assert.equal(args.where.ownerId, 7n); assert.deepEqual(args.orderBy, [{ room: { property: { name: "asc" } } }, { room: { roomCode: "asc" } }, { contractId: "asc" }]); return [contract]; },
      count: async (args: any) => { assert.equal(args.where.ownerId, 7n); return 1; },
    },
    invoice: { findMany: invoiceFindMany, count: async () => 0 },
    notification: { findMany: async (args: any) => {
      assert.equal(args.where.account.ownerId, 7n);
      return [{ body: "Đến cuối kỳ\nMã kỳ: 7:88:2026-10-14:2026-11-13" }];
    } },
  };
  for (const model of ["contract", "invoice", "notification"]) for (const operation of ["create", "createMany", "update", "updateMany", "delete", "deleteMany"]) {
    prisma[model][operation] = async () => { writes.push(`${model}.${operation}`); throw new Error("unexpected write"); };
  }
  const pricing = { inspect: async (_draft: unknown, _contract: unknown, inputTx: unknown) => {
    assert.equal(inputTx, tx);
    return { readyToFinalize: false, missingOrInvalid: [{ code: "ELECTRICITY_ENDING_MISSING", category: "electricity", message: "Chưa nhập chỉ số điện cuối kỳ." }] };
  } };
  const repository = new PrismaBillingWorkspaceRepository(prisma, pricing as any);
  const result = await repository.list(7n, { page: 1, pageSize: 20 }, today);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.property.name, "Nhà Bình An");
  assert.equal(result.data[0]?.room.room_code, "A101");
  assert.equal(result.data[0]?.resident.full_name, "Nguyễn Thị Ánh");
  assert.equal(result.data[0]?.state.code, "MISSING_DATA");
  assert.equal(result.data[0]?.reminder.recorded, true);
  assert.equal(result.data[0]?.missing_or_invalid[0]?.code, "ELECTRICITY_ENDING_MISSING");
  assert.equal(result.summary.missing_data_on_page, 1);
  assert.equal(result.summary.drafts_on_page, 1);
  assert.equal(result.summary.finalized_on_page, 0);
  assert.equal(result.summary.ready_to_finalize_on_page, 0);
  assert.deepEqual(writes, []);
});

test("workspace flags an expected missing draft and does not invent a ready state", async () => {
  const today = new Date("2026-11-15T00:00:00.000Z");
  const contract = {
    contractId: 2n, contractNo: "HD-2", ownerId: 5n, propertyId: 6n, roomId: 7n, representativeResidentId: 8n,
    startDate: new Date("2026-10-14T00:00:00.000Z"), endDate: new Date("2027-10-13T00:00:00.000Z"), terminationDate: null,
    status: "active", rentAmount: 1000n, initialElectricKwh: null, initialWaterM3: null,
    room: { roomCode: "B02", property: { propertyId: 6n, name: "Khu B", province: "Hà Nội", address: "Phố B" } },
    representativeResident: { residentId: 8n, fullName: "Trần An" }, invoices: [],
  };
  const prisma: any = {
    $transaction: async (arg: any) => typeof arg === "function" ? arg({}) : Promise.all(arg),
    contract: { findMany: async () => [contract], count: async () => 1 },
    invoice: { findMany: async () => [], count: async () => 0 }, notification: { findMany: async () => [] },
  };
  const pricing = { inspect: async () => { throw new Error("readiness must not run without a draft"); } };
  const result = await new PrismaBillingWorkspaceRepository(prisma, pricing as any).list(5n, { page: 1, pageSize: 20 }, today);
  assert.equal(result.data[0]?.state.code, "MISSING_DRAFT");
  assert.equal(result.data[0]?.draft_expected, true);
  assert.equal(result.data[0]?.invoice, null);
  assert.equal(result.data[0]?.missing_or_invalid.length, 0);
});

test("workspace retains the latest finalized Invoice and derives overdue using the supplied business clock", async () => {
  const today = new Date("2026-11-15T00:00:00.000Z");
  const invoice = {
    invoiceId: 41n, invoiceNo: "INV-41", contractId: 4n, propertyId: 3n, ownerId: 2n,
    periodStart: new Date("2026-10-14T00:00:00.000Z"), periodEnd: new Date("2026-11-13T00:00:00.000Z"),
    dueDate: new Date("2026-11-14T00:00:00.000Z"), finalizedAt: new Date("2026-11-14T02:00:00.000Z"),
    rentAmount: 500_000n, electricityCurrentKwh: "2", waterCurrentM3: "3", totalAmount: 600_000n, status: "unpaid", revision: 1,
  };
  const contract: any = {
    contractId: 4n, contractNo: "HD-4", ownerId: 2n, propertyId: 3n, roomId: 5n, representativeResidentId: 6n,
    startDate: invoice.periodStart, endDate: new Date("2027-10-13T00:00:00.000Z"), terminationDate: null,
    status: "active", rentAmount: 500_000n, initialElectricKwh: "0", initialWaterM3: "0",
    room: { roomCode: "A04", property: { propertyId: 3n, name: "Nhà Bốn", province: "Đồng Nai", address: "Địa chỉ" } },
    representativeResident: { residentId: 6n, fullName: "Bùi An" }, invoices: [invoice],
  };
  const prisma: any = {
    $transaction: async (arg: any) => typeof arg === "function" ? arg({}) : Promise.all(arg),
    contract: { findMany: async () => [contract], count: async () => 1 },
    invoice: { findMany: async () => [], count: async () => 1 }, notification: { findMany: async () => [] },
  };
  const result = await new PrismaBillingWorkspaceRepository(prisma, { inspect: async () => { throw new Error("not a draft"); } } as any)
    .list(2n, { page: 1, pageSize: 20 }, today);
  assert.equal(result.data[0]?.invoice?.invoice_id, "41");
  assert.equal(result.data[0]?.state.code, "OVERDUE");
  assert.equal(result.data[0]?.invoice?.is_overdue, true);
  assert.equal(result.summary.finalized_on_page, 1);
  assert.equal(result.summary.overdue, 1);
});

test("readiness filtering scans the Owner-scoped candidates before pagination", async () => {
  const today = new Date("2026-11-15T00:00:00.000Z");
  const makeContract = (contractId: bigint, start: string): any => ({
    contractId, contractNo: `HD-${contractId}`, ownerId: 12n, propertyId: 13n, roomId: contractId, representativeResidentId: contractId,
    startDate: new Date(`${start}T00:00:00.000Z`), endDate: new Date("2027-12-31T00:00:00.000Z"), terminationDate: null,
    status: "active", rentAmount: 1000n, initialElectricKwh: null, initialWaterM3: null,
    room: { roomCode: `A${contractId}`, property: { propertyId: 13n, name: "Khu thử", province: "Đồng Nai", address: "Địa chỉ" } },
    representativeResident: { residentId: contractId, fullName: "Người thuê" }, invoices: [],
  });
  const candidates = [makeContract(1n, "2026-10-14"), makeContract(2n, "2026-12-15")];
  const prisma: any = {
    $transaction: async (arg: any) => typeof arg === "function" ? arg({}) : Promise.all(arg),
    contract: {
      findMany: async (args: any) => { assert.equal(args.where.ownerId, 12n); assert.equal("skip" in args, false); assert.equal("take" in args, false); return candidates; },
      count: async () => 2,
    },
    invoice: { findMany: async () => [], count: async () => 0 }, notification: { findMany: async () => [] },
  };
  const result = await new PrismaBillingWorkspaceRepository(prisma, { inspect: async () => { throw new Error("no draft"); } } as any)
    .list(12n, { page: 1, pageSize: 1, state: "UPCOMING" }, today);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.contract_no, "HD-2");
  assert.deepEqual(result.meta, { page: 1, page_size: 1, total_items: 1, total_pages: 1 });
});
