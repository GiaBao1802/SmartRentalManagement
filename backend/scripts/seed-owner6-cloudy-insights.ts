import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaContractRepository } from "../src/contracts/contract.repository.js";
import { validateContractCreate } from "../src/contracts/contract.validation.js";
import { PrismaResidentOccupancyRepository } from "../src/residents/resident.repository.js";
import { PrismaInvoiceRepository } from "../src/invoices/invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "../src/invoices/invoice-itemized.pricing.js";
import { DemoPaymentRepository } from "../src/payments/demo-payment.repository.js";
import { PrismaParkingManagementRepository } from "../src/services/parking-management.repository.js";
import { billingPeriod } from "../src/invoices/invoice.billing.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.neon") });

const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("Missing DATABASE_URL_UNPOOLED in root .env.neon.");
const url = new URL(databaseUrl);
if (url.hostname !== "ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") {
  throw new Error("Refusing to write: target is not the verified Neon shared-dev neondb endpoint.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const OWNER_ID = 6n;
const ADMIN_ID = 6n;
const PROPERTY_ID = 12n;
const PROPERTY_CODE = "DEMO-OWNER6-202610";
const TAG = "DEMO-CLOUDY-INSIGHTS-20261029";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const newTenants = [
  { room: "T04", name: "Người thuê thử nghiệm T04", initialElectric: "313.500", currentElectric: "341.500", initialWater: "32.400", currentWater: "35.800", capacity: 1, rent: 4_200_000 },
  { room: "T05", name: "Người thuê thử nghiệm T05", initialElectric: "504.200", currentElectric: "580.200", initialWater: "51.600", currentWater: "58.400", capacity: 1, rent: 4_800_000 },
  { room: "T06", name: "Người thuê thử nghiệm T06", initialElectric: "872.000", currentElectric: "1004.000", initialWater: "79.000", currentWater: "90.200", capacity: 1, rent: 2_600_000 },
];

const requests = [
  { room: "T01", day: "2026-09-04", category: "Sửa chữa điện", content: "[DỮ LIỆU MÔ PHỎNG] Công tắc đèn khu bếp đôi lúc tiếp xúc kém, nhờ kiểm tra giúp." },
  { room: "T01", day: "2026-09-10", category: "Nước sinh hoạt", content: "[DỮ LIỆU MÔ PHỎNG] Vòi sen chảy yếu vào buổi tối, xin kiểm tra áp lực nước." },
  { room: "T01", day: "2026-10-02", category: "Thiết bị phòng", content: "[DỮ LIỆU MÔ PHỎNG] Quạt hút nhà vệ sinh phát tiếng ồn sau khi bật khoảng vài phút." },
  { room: "T01", day: "2026-10-18", category: "Khu vực chung", content: "[DỮ LIỆU MÔ PHỎNG] Đèn hành lang tầng trệt không sáng, đề nghị thay bóng." },
  { room: "T02", day: "2026-09-08", category: "Internet", content: "[DỮ LIỆU MÔ PHỎNG] Wi-Fi buổi tối thường chập chờn, nhờ kiểm tra bộ phát." },
  { room: "T02", day: "2026-09-21", category: "Nước sinh hoạt", content: "[DỮ LIỆU MÔ PHỎNG] Có dấu hiệu rò nhẹ dưới bồn rửa, xin kiểm tra đường ống." },
  { room: "T02", day: "2026-10-12", category: "Đăng ký lưu trú", content: "[DỮ LIỆU MÔ PHỎNG] Xin hướng dẫn cập nhật thông tin lưu trú khi đổi căn cước." },
  { room: "T03", day: "2026-09-15", category: "Thiết bị phòng", content: "[DỮ LIỆU MÔ PHỎNG] Máy nước nóng mất nhiều thời gian làm nóng, nhờ kiểm tra." },
  { room: "T03", day: "2026-10-06", category: "Khu vực chung", content: "[DỮ LIỆU MÔ PHỎNG] Cửa cổng khép chưa kín, đề nghị chỉnh bản lề." },
  { room: "T04", day: "2026-09-19", category: "Sửa chữa điện", content: "[DỮ LIỆU MÔ PHỎNG] Ổ cắm cạnh bàn làm việc hơi lỏng, xin kiểm tra an toàn." },
  { room: "T05", day: "2026-10-09", category: "Vệ sinh", content: "[DỮ LIỆU MÔ PHỎNG] Xin bổ sung lịch vệ sinh khu giặt sấy chung." },
  { room: "T06", day: "2026-10-22", category: "Báo cáo nhà trọ", content: "[DỮ LIỆU MÔ PHỎNG] Xin xác nhận giờ yên tĩnh và cách báo sự cố ngoài giờ." },
];

async function main() {
  const owner = await prisma.owner.findUnique({ where: { ownerId: OWNER_ID }, select: { ownerId: true } });
  const admin = await prisma.account.findFirst({ where: { accountId: ADMIN_ID, ownerId: OWNER_ID, role: "admin", status: "active" }, select: { accountId: true } });
  const property = await prisma.property.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, propertyCode: PROPERTY_CODE }, select: { propertyId: true } });
  if (!owner || !admin || !property) throw new Error("Owner, active Admin, or exact private demo property no longer matches the verified target.");

  const fixtureContracts = await prisma.contract.count({ where: { ownerId: OWNER_ID, contractNo: { startsWith: `${TAG}-` } } });
  if (fixtureContracts > newTenants.length) throw new Error("More fixture contracts than expected; no changes made.");

  const rooms = await prisma.room.findMany({
    where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomCode: { in: ["T01", "T02", "T03", "T04", "T05", "T06"] } },
    select: { roomId: true, roomCode: true, defaultRent: true, defaultCapacity: true, isActive: true },
  });
  if (rooms.length !== 6 || rooms.some((room) => !room.isActive)) throw new Error("Expected active demo Rooms T01–T06; no writes made.");
  const byCode = new Map(rooms.map((room) => [room.roomCode, room]));
  const alreadyOccupied = await prisma.roomResident.findMany({
    where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: { in: newTenants.map((tenant) => byCode.get(tenant.room)!.roomId) }, status: "active", contract: { contractNo: { not: { startsWith: `${TAG}-` } } } },
    select: { roomId: true },
  });
  if (alreadyOccupied.length) throw new Error("T04–T06 contain a non-fixture active resident; no changes made.");

  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "dry-run", target: "verified Neon shared-dev / neondb / production", property: PROPERTY_CODE, new_residents_and_september_invoices: newTenants.length, vehicle_assignments: 5, room_requests: requests.length, note: "No database changes. Run with --apply after reviewing." }, null, 2));
    return;
  }

  const contractsRepo = new PrismaContractRepository(prisma);
  const occupanciesRepo = new PrismaResidentOccupancyRepository(prisma);
  const invoicesRepo = new PrismaInvoiceRepository(prisma);
  const parkingRepo = new PrismaParkingManagementRepository(prisma);
  const pricing = new PrismaItemizedInvoicePricing();
  const payments = new DemoPaymentRepository(prisma);
  const occupants = new Map<string, { residentId: bigint; contractId: bigint; roomId: bigint; occupancyId: bigint; vehicleCount: number }>();
  const start = date("2026-09-01");
  const end = date("2027-08-31");

  for (const tenant of newTenants) {
    const room = byCode.get(tenant.room)!;
    const email = `demo-cloudy-${tenant.room.toLowerCase()}@example.test`;
    const resident = await prisma.resident.findFirst({ where: { ownerId: OWNER_ID, email } }) ?? await prisma.resident.create({ data: {
      ownerId: OWNER_ID, fullName: tenant.name, email,
      residenceStatus: "left", residenceRegistrationStatus: tenant.room === "T05" ? "temporary_resident" : "not_completed",
    } });
    let contract = await prisma.contract.findFirst({ where: { ownerId: OWNER_ID, contractNo: `${TAG}-${tenant.room}` } });
    if (!contract) {
      const contractInput = validateContractCreate({
        contract_no: `${TAG}-${tenant.room}`, room_id: room.roomId.toString(), representative_resident_id: resident.residentId.toString(),
        start_date: "2026-09-01", end_date: "2027-08-31", rent_amount: String(tenant.rent), deposit_amount: String(tenant.rent),
        resident_capacity: Math.min(room.defaultCapacity, tenant.capacity), initial_electric_kwh: tenant.initialElectric, initial_water_m3: tenant.initialWater,
      });
      const draft = await contractsRepo.create(OWNER_ID, contractInput);
      if (!draft) throw new Error(`Could not create ${tenant.room} demo contract.`);
      contract = await contractsRepo.activate(OWNER_ID, ADMIN_ID, draft.contractId);
      if (!contract) throw new Error(`Could not activate ${tenant.room} demo contract.`);
    }
    let occupancy = await prisma.roomResident.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: room.roomId, contractId: contract.contractId, residentId: resident.residentId, status: "active" } });
    if (!occupancy) {
      const linked = await occupanciesRepo.addOccupancy(OWNER_ID, room.roomId, resident.residentId, contract.contractId, start);
      if (!linked || typeof linked === "string") throw new Error(`Could not link ${tenant.room} demo resident: ${String(linked)}.`);
      occupancy = linked;
    }
    occupants.set(tenant.room, { residentId: resident.residentId, contractId: contract.contractId, roomId: room.roomId, occupancyId: occupancy.occupancyId, vehicleCount: 0 });
  }

  const period = billingPeriod(start, end, 0);
  if (!period || period.periodStart.valueOf() !== start.valueOf() || period.periodEnd.valueOf() !== date("2026-09-30").valueOf()) throw new Error("Unexpected September billing period.");
  const invoiceResults: Array<{ room: string; invoiceId: string; status: string; electricKwh: string; waterM3: string }> = [];
  for (const tenant of newTenants) {
    const occupant = occupants.get(tenant.room)!;
    let invoice = await prisma.invoice.findUnique({ where: { contractId_periodStart_periodEnd: { contractId: occupant.contractId, periodStart: period.periodStart, periodEnd: period.periodEnd } } });
    if (!invoice) {
      const draft = await invoicesRepo.createDraft(OWNER_ID, { contractId: occupant.contractId, periodStart: period.periodStart, periodEnd: period.periodEnd });
      const patched = await invoicesRepo.patchDraft(OWNER_ID, draft.invoiceId, { electricityCurrentKwh: tenant.currentElectric, waterCurrentM3: tenant.currentWater });
      if (!patched) throw new Error(`Could not save September readings for ${tenant.room}.`);
      invoice = await invoicesRepo.finalize(OWNER_ID, draft.invoiceId, {}, pricing, ADMIN_ID, new Date("2026-10-02T05:00:00.000Z"));
      if (!invoice) throw new Error(`Could not finalize the synthetic September invoice for ${tenant.room}.`);
    } else if (invoice.electricityCurrentKwh?.toString() !== Number(tenant.currentElectric).toString() || invoice.waterCurrentM3?.toString() !== Number(tenant.currentWater).toString()) {
      throw new Error(`Existing September invoice for ${tenant.room} differs from expected fixture values; it was not changed.`);
    }
    let status = invoice.status;
    if (tenant.room === "T05" && invoice.status !== "paid") {
      const payment = await payments.simulate(OWNER_ID, occupant.residentId, invoice.invoiceId, "success");
      if (!payment || "notPayable" in payment && payment.notPayable) throw new Error("Could not record the development-only simulated paid invoice.");
      status = "paid (demo simulation)";
    }
    invoiceResults.push({ room: tenant.room, invoiceId: invoice.invoiceId.toString(), status, electricKwh: `${(Number(tenant.currentElectric) - Number(tenant.initialElectric)).toFixed(3)}`, waterM3: `${(Number(tenant.currentWater) - Number(tenant.initialWater)).toFixed(3)}` });
  }

  const areaName = `${TAG} · Nhà xe mô phỏng`;
  const area = await prisma.parkingArea.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, name: areaName } }) ?? await parkingRepo.createArea(OWNER_ID, PROPERTY_ID, { name: areaName, location: "Khu để xe trong nhà (dữ liệu giả lập)" });
  if (!area) throw new Error("Could not create the synthetic parking area.");
  const previousResident = await prisma.resident.findFirst({ where: { ownerId: OWNER_ID, fullName: "Cư dân thử nghiệm T02", email: "demo-owner6-t02@example.test" }, select: { residentId: true } });
  const staleVehicle = previousResident ? await prisma.vehicle.findFirst({ where: { ownerId: OWNER_ID, residentId: previousResident.residentId, vehicleType: "Xe tay ga", plateNumber: "60-C1-526.83" } }) : null;
  if (staleVehicle) {
    const [assignment, request] = await Promise.all([
      prisma.parkingSlotAssignment.findFirst({ where: { ownerId: OWNER_ID, vehicleId: staleVehicle.vehicleId }, select: { assignmentId: true } }),
      prisma.parkingSlotRequest.findFirst({ where: { ownerId: OWNER_ID, vehicleId: staleVehicle.vehicleId }, select: { requestId: true } }),
    ]);
    if (assignment || request) throw new Error("Unexpected linked vehicle with the temporary demo plate; refusing to delete it.");
    await prisma.vehicle.delete({ where: { vehicleId: staleVehicle.vehicleId } });
  }
  const vehiclePlan = [
    { room: "T01", type: "Xe máy", plate: "60-B2-731.42", slot: "M01", kind: "MOTORCYCLE" },
    { room: "T01", type: "Xe máy điện", plate: "60-MD-184.27", slot: "M02", kind: "MOTORCYCLE" },
    { room: "T02", type: "Xe máy", plate: "60-C1-526.83", slot: "M03", kind: "MOTORCYCLE" },
    { room: "T03", type: "Bicycle (xe đạp)", plate: null, slot: "D01" },
    { room: "T04", type: "Ô tô 4 chỗ", plate: "60A-731.24", slot: "O01", kind: "CAR" },
  ];
  for (const vehicle of vehiclePlan) {
    const vehicleKind = vehicle.slot.startsWith("M") ? "MOTORCYCLE" : vehicle.slot.startsWith("D") ? "BICYCLE" : "CAR";
    let slot = await prisma.parkingSlot.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, parkingAreaId: area.parkingAreaId, slotCode: vehicle.slot } });
    if (!slot) slot = await parkingRepo.createSlot(OWNER_ID, area.parkingAreaId, vehicle.slot);
    if (!slot) throw new Error(`Could not create demo slot ${vehicle.slot}.`);
    if (!slot.acceptedVehicleType) slot = await prisma.parkingSlot.update({ where: { parkingSlotId: slot.parkingSlotId }, data: { acceptedVehicleType: vehicleKind } });
    if (slot.acceptedVehicleType !== vehicleKind) throw new Error(`Demo slot ${vehicle.slot} has an unexpected vehicle type.`);
  }
  for (const vehiclePlanItem of vehiclePlan) {
    const occupant = occupants.get(vehiclePlanItem.room) ?? await (async () => {
      const room = byCode.get(vehiclePlanItem.room)!;
      const membership = await prisma.roomResident.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: room.roomId, status: "active", contract: { status: "active" } }, orderBy: { startedAt: "desc" }, select: { residentId: true, roomId: true, contractId: true, occupancyId: true } });
      if (!membership) throw new Error(`No active demo occupant for ${vehiclePlanItem.room}.`);
      return { ...membership, vehicleCount: 0 };
    })();
    const vehicle = await prisma.vehicle.findFirst({ where: { ownerId: OWNER_ID, residentId: occupant.residentId, vehicleType: vehiclePlanItem.type, plateNumber: vehiclePlanItem.plate } }) ?? await parkingRepo.createVehicle(OWNER_ID, PROPERTY_ID, occupant.residentId, { vehicleType: vehiclePlanItem.type, plateNumber: vehiclePlanItem.plate });
    if (!vehicle) throw new Error(`Could not create demo vehicle ${vehiclePlanItem.plate}.`);
    const slot = await prisma.parkingSlot.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, parkingAreaId: area.parkingAreaId, slotCode: vehiclePlanItem.slot }, select: { parkingSlotId: true } });
    if (!slot) throw new Error(`Missing demo slot ${vehiclePlanItem.slot}.`);
    const assigned = await prisma.parkingSlotAssignment.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, vehicleId: vehicle.vehicleId, status: "active" } }) ?? await parkingRepo.createAssignment(OWNER_ID, PROPERTY_ID, {
      parkingSlotId: slot.parkingSlotId, roomId: occupant.roomId, contractId: occupant.contractId, residentId: occupant.residentId,
      vehicleId: vehicle.vehicleId, startedAt: date("2026-09-01"), entitlementType: "FREE_SLOT", billability: "FREE", pricingItemId: null,
    });
    if (!assigned) throw new Error(`Could not assign demo vehicle ${vehiclePlanItem.plate}.`);
    if (occupants.has(vehiclePlanItem.room)) occupants.get(vehiclePlanItem.room)!.vehicleCount += 1;
  }

  for (const [index, request] of requests.entries()) {
    const occupant = occupants.get(request.room) ?? await (async () => {
      const room = byCode.get(request.room)!;
      const membership = await prisma.roomResident.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: room.roomId, status: "active", contract: { status: "active" } }, orderBy: { startedAt: "desc" }, select: { residentId: true, roomId: true, contractId: true, occupancyId: true } });
      if (!membership) throw new Error(`No active demo occupant for ${request.room}.`);
      return { ...membership, vehicleCount: 0 };
    })();
    const createdAt = new Date(`${request.day}T12:00:00.000Z`);
    const content = request.content;
    const complaint = await prisma.complaint.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: occupant.roomId, content } }) ?? await prisma.complaint.create({ data: {
      ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomId: occupant.roomId, residentId: occupant.residentId,
      category: request.category, content, priority: index === 1 ? "high" : "normal",
      status: ["pending", "in_progress", "resolved", "rejected"][index % 4]!,
      createdAt, updatedAt: index % 4 === 0 ? createdAt : new Date(createdAt.valueOf() + 3_600_000), resolvedAt: index % 4 === 2 ? new Date(createdAt.valueOf() + 3_600_000) : null,
    } });
    const isPending = complaint.status === "pending";
    const linked = await prisma.$queryRaw<Array<{ complaint_id: bigint }>>`SELECT complaint_id FROM complaint_room_requests WHERE complaint_id=${complaint.complaintId}`;
    if (!linked.length) await prisma.$executeRaw`INSERT INTO complaint_room_requests(complaint_id,occupancy_id,request_key,equipment_code,created_at) VALUES(${complaint.complaintId},${occupant.occupancyId},${randomUUID()}::uuid,NULL,${createdAt})`;
    const historyCount = await prisma.complaintHistory.count({ where: { complaintId: complaint.complaintId } });
    if (historyCount === 0) await prisma.complaintHistory.create({ data: { complaintId: complaint.complaintId, actorAccountId: null, action: "created", toStatus: "pending", note: "Dữ liệu mô phỏng để kiểm thử thống kê; không phải yêu cầu thật.", createdAt } });
    if (!isPending && historyCount < 2) {
      await prisma.complaintHistory.create({ data: {
        complaintId: complaint.complaintId, actorAccountId: ADMIN_ID, action: "status_changed", fromStatus: "pending", toStatus: complaint.status,
        note: complaint.status === "resolved" ? "Đã xử lý trong kịch bản mô phỏng." : complaint.status === "rejected" ? "Từ chối trong kịch bản mô phỏng." : "Đang kiểm tra trong kịch bản mô phỏng.",
        createdAt: new Date(createdAt.valueOf() + 3_600_000),
      } });
    }
  }

  const stats = {
    addedResidents: newTenants.length,
    addedSeptemberInvoices: invoiceResults,
    addedVehicleAssignments: vehiclePlan.length,
    addedRequests: requests.length,
  };
  console.log(JSON.stringify({ result: "created", target: "verified Neon shared-dev / neondb / production", property: PROPERTY_CODE, stats }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Cloudy demo seed failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
