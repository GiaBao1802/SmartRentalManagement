import assert from "node:assert/strict";
import test from "node:test";
import { PrismaOwnerOperationsReportRepository } from "./owner-operations.repository.js";

const now = new Date("2026-10-29T05:00:00.000Z");
const property = {
  propertyId: 51n, name: "Khu Xanh", province: "Đồng Nai", status: "active",
  rooms: [{
    roomId: 91n, roomCode: "A01", status: "available", isActive: true, areaM2: "25.00", defaultRent: 3_000_000n, defaultCapacity: 2,
    contracts: [{ contractId: 10n }],
    roomResidents: [{ residentId: 71n, resident: { residenceRegistrationStatus: "not_completed", residenceStatus: "living", archivedAt: null } }],
    parkingAssignments: [{ vehicle: { vehicleType: "Xe máy" } }, { vehicle: { vehicleType: "Xe đạp" } }],
    complaints: [{ complaintId: 301n, category: "Sửa điện", status: "pending", createdAt: now }],
  }],
};

function makeRepository(overrides: Record<string, any> = {}) {
  const calls: Array<{ model: string; args: any }> = [];
  const prisma: any = {
    property: { findMany: async (args: any) => { calls.push({ model: "property", args }); return overrides.properties ?? [property]; } },
    resident: { findMany: async (args: any) => { calls.push({ model: "resident", args }); return [{ residenceRegistrationStatus: "not_completed" }, { residenceRegistrationStatus: "temporary_resident" }, { residenceRegistrationStatus: "temporary_absence" }]; } },
    contract: { findMany: async (args: any) => { calls.push({ model: "contract", args }); return [{ contractId: 10n }]; } },
    invoice: { findMany: async (args: any) => {
      calls.push({ model: "invoice", args });
      if (args.where.status === "unpaid") return [{ invoiceId: 1n, totalAmount: 4_500_000n, rentAmount: 3_000_000n, dueDate: new Date("2026-10-20T00:00:00.000Z") }];
      if (args.select.rentAmount) return [
        { periodStart: new Date("2026-10-01T00:00:00Z"), rentAmount: 3_000_000n, status: "unpaid" },
        { periodStart: new Date("2026-09-01T00:00:00Z"), rentAmount: 2_800_000n, status: "paid" },
      ];
      return [
        { contractId: 10n, propertyId: 51n, periodStart: new Date("2026-10-01T00:00:00Z"), periodEnd: new Date("2026-10-31T00:00:00Z"), status: "unpaid", electricityPreviousKwh: "100.000", electricityCurrentKwh: "176.250", waterPreviousM3: "10.000", waterCurrentM3: "13.250", contract: { roomId: 91n, room: { roomCode: "A01", property: { name: "Khu Xanh" } } } },
        { contractId: 10n, propertyId: 51n, periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"), status: "paid", electricityPreviousKwh: "50.000", electricityCurrentKwh: "80.000", waterPreviousM3: "5.000", waterCurrentM3: "7.000", contract: { roomId: 91n, room: { roomCode: "A01", property: { name: "Khu Xanh" } } } },
      ];
    } },
    complaint: {
      findMany: async (args: any) => { calls.push({ model: "complaint", args }); return [{ complaintId: 301n, roomId: 91n, propertyId: 51n, category: "Sửa điện", status: "pending", createdAt: now }]; },
      count: async (args: any) => { calls.push({ model: "complaint-count", args }); return 4; },
    },
  };
  return { repository: new PrismaOwnerOperationsReportRepository(prisma), calls };
}

test("Owner report summarizes scoped occupancy, registration, invoices, utilities, vehicles, and requests", async () => {
  const { repository, calls } = makeRepository();
  const result: any = await repository.getOverview(7n, undefined, now);
  assert.equal(result.summary.active_rooms, 1);
  assert.equal(result.summary.occupied_rooms, 1);
  assert.equal(result.summary.available_rooms, 0);
  assert.equal(result.summary.registration_incomplete, 1);
  assert.equal(result.summary.temporary_residents, 1);
  assert.equal(result.summary.temporary_absences, 1);
  assert.equal(result.summary.overdue_invoices, 1);
  assert.equal(result.summary.unpaid_amount, "4500000");
  assert.equal(result.financial.basis, "invoice_period");
  assert.equal(result.financial.current_month, "2026-10");
  assert.equal(result.financial.current_month_rent_billed, "3000000");
  assert.equal(result.financial.current_month_rent_on_paid_invoices, "0");
  assert.equal(result.financial.unpaid_rent_amount, "3000000");
  assert.equal(result.financial.months.find((month: any) => month.month === "2026-09").rent_on_paid_invoices, "2800000");
  assert.equal(result.summary.expiring_contracts_30_days, 1);
  assert.equal(result.rooms[0].latest_invoice.electricity_kwh, 76.25);
  assert.equal(result.rooms[0].latest_invoice.water_m3, 3.25);
  assert.equal(result.rooms[0].active_vehicles, 2);
  assert.equal(result.requests.busiest_rooms[0].count, 1);
  assert.equal(result.highest_electricity_rooms[0].room_code, "A01");
  assert.ok(calls.every(({ args }) => args.where.ownerId === 7n), "every database query must derive Owner scope from the session");
});

test("Owner report filters by requested Property and returns null for a foreign Property", async () => {
  const scoped = makeRepository();
  const result: any = await scoped.repository.getOverview(7n, 51n, now);
  assert.equal(result.scope.property_id, "51");
  assert.ok(scoped.calls.every(({ args }) => args.where.ownerId === 7n));

  const missing = makeRepository({ properties: [] });
  assert.equal(await missing.repository.getOverview(7n, 999n, now), null);
});
