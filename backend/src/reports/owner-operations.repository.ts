import type { PrismaClient } from "@prisma/client";
import { businessDate } from "../invoices/invoice.billing.js";

export interface OwnerOperationsReportRepository {
  getOverview(ownerId: bigint, propertyId?: bigint, now?: Date): Promise<Record<string, unknown> | null>;
}

const ACTIVE_COMPLAINT_STATUSES = ["pending", "in_progress"];
const CLOSED_COMPLAINT_STATUSES = ["resolved", "rejected"];

function decimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values: Array<bigint | number | null | undefined>): string {
  return values.reduce<bigint>((total, value) => total + BigInt(value ?? 0), 0n).toString();
}

export class PrismaOwnerOperationsReportRepository implements OwnerOperationsReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview(ownerId: bigint, propertyId?: bigint, now = new Date()) {
    const today = businessDate(now);
    const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const financialStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
    const currentMonthKey = currentMonth.toISOString().slice(0, 7);
    const propertyWhere = { ownerId, ...(propertyId === undefined ? {} : { propertyId }) };
    const [properties, residents, expiringContracts, unpaidInvoices, recentInvoices, financialInvoices, openComplaints, closedComplaints] = await Promise.all([
      this.prisma.property.findMany({
        where: propertyWhere,
        orderBy: [{ name: "asc" }, { propertyId: "asc" }],
        select: {
          propertyId: true, name: true, province: true, status: true,
          rooms: {
            orderBy: [{ roomCode: "asc" }, { roomId: "asc" }],
            select: {
              roomId: true, roomCode: true, status: true, isActive: true, areaM2: true, defaultRent: true, defaultCapacity: true,
              contracts: { where: { ownerId, status: "active", startDate: { lte: today }, endDate: { gte: today } }, select: { contractId: true } },
              roomResidents: { where: { ownerId, status: "active" }, select: { residentId: true, resident: { select: { residenceRegistrationStatus: true, residenceStatus: true, archivedAt: true } } } },
              parkingAssignments: { where: { ownerId, status: "active", endedAt: null }, select: { vehicle: { select: { vehicleType: true } } } },
              complaints: { where: { ownerId, status: { in: ACTIVE_COMPLAINT_STATUSES } }, select: { complaintId: true, category: true, status: true, createdAt: true } },
            },
          },
        },
      }),
      this.prisma.resident.findMany({ where: { ownerId, archivedAt: null, residenceStatus: "living", ...(propertyId === undefined ? {} : { roomResidents: { some: { ownerId, propertyId, status: "active" } } }) }, select: { residenceRegistrationStatus: true } }),
      this.prisma.contract.findMany({
        where: { ownerId, ...(propertyId === undefined ? {} : { propertyId }), status: "active", endDate: { gte: today, lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) } },
        select: { contractId: true },
      }),
      this.prisma.invoice.findMany({
        where: { ownerId, ...(propertyId === undefined ? {} : { propertyId }), status: "unpaid", finalizedAt: { not: null } },
        select: { invoiceId: true, totalAmount: true, rentAmount: true, dueDate: true },
      }),
      this.prisma.invoice.findMany({
        where: { ownerId, ...(propertyId === undefined ? {} : { propertyId }), finalizedAt: { not: null }, periodStart: { gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } },
        orderBy: [{ periodStart: "desc" }, { invoiceId: "desc" }],
        select: {
          contractId: true, propertyId: true, periodStart: true, periodEnd: true, status: true,
          electricityPreviousKwh: true, electricityCurrentKwh: true, waterPreviousM3: true, waterCurrentM3: true,
          contract: { select: { roomId: true, room: { select: { roomCode: true, property: { select: { name: true } } } } } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { ownerId, ...(propertyId === undefined ? {} : { propertyId }), finalizedAt: { not: null }, periodStart: { gte: financialStart, lt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)) } },
        orderBy: [{ periodStart: "asc" }, { invoiceId: "asc" }],
        select: { periodStart: true, rentAmount: true, status: true },
      }),
      this.prisma.complaint.findMany({ where: { ownerId, status: { in: ACTIVE_COMPLAINT_STATUSES } }, select: { complaintId: true, roomId: true, propertyId: true, category: true, status: true, createdAt: true } }),
      this.prisma.complaint.count({ where: { ownerId, ...(propertyId === undefined ? {} : { propertyId }), status: { in: CLOSED_COMPLAINT_STATUSES } } }),
    ]);

    if (propertyId !== undefined && properties.length === 0) return null;
    const propertyIds = new Set(properties.map((property) => property.propertyId.toString()));
    const rooms = properties.flatMap((property) => property.rooms.map((room) => ({ property, room })));
    const roomById = new Map(rooms.map(({ property, room }) => [room.roomId.toString(), { property, room }]));
    const latestByContract = new Map<string, (typeof recentInvoices)[number]>();
    for (const invoice of recentInvoices) {
      if (!propertyIds.has(invoice.propertyId.toString()) || latestByContract.has(invoice.contractId.toString())) continue;
      latestByContract.set(invoice.contractId.toString(), invoice);
    }
    const latestByRoom = new Map<string, (typeof recentInvoices)[number]>();
    for (const invoice of latestByContract.values()) latestByRoom.set(invoice.contract.roomId.toString(), invoice);

    const roomRows = rooms.filter(({ property }) => property.status === "active").map(({ property, room }) => {
      const occupants = room.roomResidents.filter((occupancy) => !occupancy.resident.archivedAt && occupancy.resident.residenceStatus === "living");
      const unresolved = room.complaints;
      const invoice = latestByRoom.get(room.roomId.toString());
      const electricityKwh = invoice?.electricityPreviousKwh !== null && invoice?.electricityPreviousKwh !== undefined && invoice.electricityCurrentKwh !== null
        ? Math.max(0, decimal(invoice.electricityCurrentKwh) - decimal(invoice.electricityPreviousKwh)) : null;
      const waterM3 = invoice?.waterPreviousM3 !== null && invoice?.waterPreviousM3 !== undefined && invoice.waterCurrentM3 !== null
        ? Math.max(0, decimal(invoice.waterCurrentM3) - decimal(invoice.waterPreviousM3)) : null;
      return {
        property_id: property.propertyId.toString(), property_name: property.name, province: property.province,
        room_id: room.roomId.toString(), room_code: room.roomCode, room_status: room.status, is_active: room.isActive,
        area_m2: String(room.areaM2), rent_amount: room.defaultRent.toString(), capacity: room.defaultCapacity,
        occupants: occupants.length, active_contracts: room.contracts.length,
        registration_incomplete: occupants.filter((occupancy) => occupancy.resident.residenceRegistrationStatus === "not_completed").length,
        active_vehicles: room.parkingAssignments.length,
        vehicle_types: [...new Set(room.parkingAssignments.map((assignment) => assignment.vehicle.vehicleType))],
        open_requests: unresolved.length,
        latest_invoice: invoice ? {
          period_start: invoice.periodStart.toISOString().slice(0, 10), period_end: invoice.periodEnd.toISOString().slice(0, 10), status: invoice.status,
          electricity_kwh: electricityKwh === null ? null : Number(electricityKwh.toFixed(3)),
          water_m3: waterM3 === null ? null : Number(waterM3.toFixed(3)),
        } : null,
      };
    });
    const allRooms = roomRows.filter((room) => room.is_active);
    const occupiedRooms = allRooms.filter((room) => room.occupants > 0 || room.active_contracts > 0);
    const incomplete = residents.filter((resident) => resident.residenceRegistrationStatus === "not_completed").length;
    const temporarilyAbsent = residents.filter((resident) => resident.residenceRegistrationStatus === "temporary_absence").length;
    const temporaryResident = residents.filter((resident) => resident.residenceRegistrationStatus === "temporary_resident").length;
    const scopedOpenComplaints = openComplaints.filter((complaint) => propertyIds.has(complaint.propertyId.toString()));
    const byRoom = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const complaint of scopedOpenComplaints) {
      if (complaint.roomId !== null) byRoom.set(complaint.roomId.toString(), (byRoom.get(complaint.roomId.toString()) ?? 0) + 1);
      const category = complaint.category.trim() || "Chưa phân loại";
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }
    const requestsByRoom = [...byRoom.entries()].map(([id, count]) => ({ room: roomById.get(id), count })).filter((entry) => entry.room).sort((a, b) => b.count - a.count).slice(0, 5).map(({ room, count }) => ({ property_name: room!.property.name, room_code: room!.room.roomCode, count }));
    const highestElectricity = allRooms.filter((room) => room.latest_invoice?.electricity_kwh !== null && room.latest_invoice?.electricity_kwh !== undefined).sort((a, b) => (b.latest_invoice?.electricity_kwh ?? 0) - (a.latest_invoice?.electricity_kwh ?? 0)).slice(0, 5);
    const highestWater = allRooms.filter((room) => room.latest_invoice?.water_m3 !== null && room.latest_invoice?.water_m3 !== undefined).sort((a, b) => (b.latest_invoice?.water_m3 ?? 0) - (a.latest_invoice?.water_m3 ?? 0)).slice(0, 5);
    const highestVehicles = allRooms.filter((room) => room.active_vehicles > 0).sort((a, b) => b.active_vehicles - a.active_vehicles).slice(0, 5);
    const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < today);
    const financialByMonth = new Map<string, { rent_billed: bigint; rent_on_paid_invoices: bigint }>();
    for (let offset = 0; offset < 12; offset += 1) {
      const month = new Date(Date.UTC(financialStart.getUTCFullYear(), financialStart.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
      financialByMonth.set(month, { rent_billed: 0n, rent_on_paid_invoices: 0n });
    }
    for (const invoice of financialInvoices) {
      const month = invoice.periodStart.toISOString().slice(0, 7);
      const values = financialByMonth.get(month);
      if (!values) continue;
      values.rent_billed += invoice.rentAmount;
      if (invoice.status === "paid") values.rent_on_paid_invoices += invoice.rentAmount;
    }
    const financialMonths = [...financialByMonth.entries()].map(([month, values]) => ({ month, rent_billed: values.rent_billed.toString(), rent_on_paid_invoices: values.rent_on_paid_invoices.toString() }));
    const currentFinancial = financialByMonth.get(currentMonthKey) ?? { rent_billed: 0n, rent_on_paid_invoices: 0n };
    return {
      generated_at: now.toISOString(),
      scope: { property_id: propertyId?.toString() ?? null, property_count: properties.length },
      properties: properties.map((property) => ({ property_id: property.propertyId.toString(), name: property.name, province: property.province, status: property.status })),
      summary: {
        active_properties: properties.filter((property) => property.status === "active").length,
        active_rooms: allRooms.length, occupied_rooms: occupiedRooms.length, available_rooms: allRooms.length - occupiedRooms.length,
        occupancy_percent: allRooms.length ? Math.round(occupiedRooms.length * 1000 / allRooms.length) / 10 : 0,
        current_residents: residents.length, registration_incomplete: incomplete, temporary_residents: temporaryResident, temporary_absences: temporarilyAbsent,
        expiring_contracts_30_days: expiringContracts.length,
        unpaid_invoices: unpaidInvoices.length, overdue_invoices: overdueInvoices.length, unpaid_amount: sum(unpaidInvoices.map((invoice) => invoice.totalAmount)),
        open_requests: scopedOpenComplaints.length, resolved_requests: closedComplaints,
        active_vehicles: allRooms.reduce((total, room) => total + room.active_vehicles, 0),
      },
      financial: {
        basis: "invoice_period",
        current_month: currentMonthKey,
        current_month_rent_billed: currentFinancial.rent_billed.toString(),
        current_month_rent_on_paid_invoices: currentFinancial.rent_on_paid_invoices.toString(),
        unpaid_rent_amount: sum(unpaidInvoices.map((invoice) => invoice.rentAmount)),
        months: financialMonths,
      },
      requests: {
        by_category: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
        busiest_rooms: requestsByRoom,
      },
      highest_electricity_rooms: highestElectricity,
      highest_water_rooms: highestWater,
      most_vehicles_rooms: highestVehicles,
      rooms: allRooms,
    };
  }
}
