import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPropertyRoomRepository } from "../src/properties/property-room.repository.js";
import { validateRoomCreate } from "../src/properties/property-room.validation.js";
import { PrismaContractRepository } from "../src/contracts/contract.repository.js";
import { validateContractCreate } from "../src/contracts/contract.validation.js";
import { PrismaResidentOccupancyRepository } from "../src/residents/resident.repository.js";
import { PrismaPropertyServiceRepository } from "../src/services/property-service.repository.js";
import { PrismaUtilityTariffManagementRepository } from "../src/services/utility-tariff-management.repository.js";
import { PrismaInvoiceRepository } from "../src/invoices/invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "../src/invoices/invoice-itemized.pricing.js";
import { DemoPaymentRepository } from "../src/payments/demo-payment.repository.js";
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
const PROPERTY_CODE = "DEMO-OWNER6-202610";
const FIXTURE_TAG = "DEMO-OWNER6-202610";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  const owner = await prisma.owner.findUnique({ where: { ownerId: OWNER_ID }, select: { ownerId: true } });
  const admin = await prisma.account.findFirst({ where: { accountId: ADMIN_ID, ownerId: OWNER_ID, role: "admin", status: "active" }, select: { accountId: true } });
  if (!owner || !admin) throw new Error("Owner 6 or its active Admin account no longer matches the verified demo account.");
  if (await prisma.property.findFirst({ where: { ownerId: OWNER_ID, propertyCode: PROPERTY_CODE } })) {
    throw new Error(`${PROPERTY_CODE} already exists. No changes made; inspect the existing fixture before rerunning.`);
  }

  const roomsRepository = new PrismaPropertyRoomRepository(prisma);
  const contractsRepository = new PrismaContractRepository(prisma);
  const occupancyRepository = new PrismaResidentOccupancyRepository(prisma);
  const servicesRepository = new PrismaPropertyServiceRepository(prisma);
  const tariffsRepository = new PrismaUtilityTariffManagementRepository(prisma);
  const invoicesRepository = new PrismaInvoiceRepository(prisma);
  const pricing = new PrismaItemizedInvoicePricing();
  const paymentsRepository = new DemoPaymentRepository(prisma);

  const property = await roomsRepository.createProperty(OWNER_ID, {
    propertyCode: PROPERTY_CODE,
    name: "Khu thử nghiệm đa dạng phòng",
    province: "TP. Hồ Chí Minh",
    address: "Dữ liệu mô phỏng nội bộ · không phải địa chỉ thật",
    managerName: "Chủ trọ mẫu 1",
    status: "active",
  });

  const amenitySets = [
    ["air_conditioning", "wifi", "private_bathroom", "water_heater"],
    ["parking", "washing_machine", "refrigerator", "balcony"],
    ["air_conditioning", "elevator", "private_kitchen", "cats_allowed"],
    ["wifi", "private_bathroom", "dogs_allowed"],
    ["refrigerator", "water_heater", "private_kitchen"],
    ["air_conditioning", "parking", "wifi", "balcony"],
    ["washing_machine", "private_bathroom", "water_heater"],
    ["elevator", "refrigerator", "cats_allowed", "dogs_allowed"],
    ["wifi", "private_kitchen", "balcony"],
    ["air_conditioning", "parking", "private_bathroom", "water_heater"],
  ];
  const rooms = [];
  for (let index = 0; index < 10; index += 1) {
    const isInactive = index >= 8;
    const input = validateRoomCreate({
      room_code: `T${String(index + 1).padStart(2, "0")}`,
      default_rent: String([2_600_000, 3_100_000, 3_600_000, 4_200_000, 4_800_000][index % 5]),
      area_m2: ["16.50", "20.00", "24.50", "28.00", "32.00"][index % 5],
      default_capacity: index % 3 === 0 ? 2 : 1,
      is_active: !isInactive,
      is_public: false,
      status: isInactive ? "inactive" : "available",
      public_description: `[DỮ LIỆU MÔ PHỎNG] Phòng ${index + 1} dùng để kiểm thử danh sách quản lý.`,
      marketplace_amenities: amenitySets[index],
    });
    const room = await roomsRepository.createRoom(OWNER_ID, property.propertyId, input);
    if (!room) throw new Error(`Could not create demo Room T${String(index + 1).padStart(2, "0")}.`);
    rooms.push(room);
  }

  const facilities = [
    { name: "Bãi xe có mái che", description: "Dữ liệu tiện ích mô phỏng.", location: "Tầng trệt" },
    { name: "Khu giặt sấy chung", description: "Dữ liệu tiện ích mô phỏng.", location: "Nhà phụ" },
    { name: "Sân phơi", description: "Dữ liệu tiện ích mô phỏng.", location: "Tầng thượng" },
    { name: "Camera khu vực chung", description: "Dữ liệu tiện ích mô phỏng.", location: "Cổng và hành lang" },
  ];
  for (const facility of facilities) await servicesRepository.createFacility(OWNER_ID, property.propertyId, facility);

  const fixedItems = [
    { code: "DEMO_WIFI", name: "Wi-Fi chung (mô phỏng)", unit: "phòng/tháng", price: 120_000n },
    { code: "DEMO_CLEANING", name: "Vệ sinh khu chung (mô phỏng)", unit: "phòng/tháng", price: 35_000n },
    { code: "DEMO_TRASH", name: "Thu gom rác (mô phỏng)", unit: "phòng/tháng", price: 25_000n },
  ];
  for (const item of fixedItems) {
    const created = await servicesRepository.createItem(OWNER_ID, property.propertyId, {
      kind: "FIXED_SERVICE", code: item.code, name: item.name,
      description: "Giá kiểm thử; không áp dụng thu tiền thật.", unit: item.unit,
    });
    if (!created) throw new Error(`Could not create service ${item.code}.`);
    await servicesRepository.publishPrice(OWNER_ID, property.propertyId, created.propertyPricingItemId, ADMIN_ID, "FIXED_SERVICE", {
      effectiveFrom: date("2026-09-01"), unitPrice: item.price,
      sourceName: "Bảng giá mô phỏng", sourceReference: FIXTURE_TAG, reason: "Dữ liệu kiểm thử hóa đơn, không phải giá thu thật.",
    });
  }
  const laundry = await servicesRepository.createItem(OWNER_ID, property.propertyId, {
    kind: "FLEXIBLE_SERVICE", code: "DEMO_LAUNDRY", name: "Giặt sấy theo lượt (mô phỏng)",
    description: "Lịch và giá kiểm thử; không phát sinh giao dịch thật.", unit: "lượt",
    serviceConfiguration: {
      serviceMode: "BOOKING", availableWeekdays: [1, 2, 3, 4, 5, 6, 7],
      opensAt: "08:00", closesAt: "20:00", slotDurationMinutes: 60,
      capacityPerSlot: 2, packageDurationCount: null, packageDurationUnit: null,
    },
  });
  if (!laundry) throw new Error("Could not create the flexible laundry service.");
  await servicesRepository.publishPrice(OWNER_ID, property.propertyId, laundry.propertyPricingItemId, ADMIN_ID, "FLEXIBLE_SERVICE", {
    effectiveFrom: date("2026-09-01"), unitPrice: 30_000n,
    sourceName: "Bảng giá mô phỏng", sourceReference: FIXTURE_TAG, reason: "Giá kiểm thử, không phải giá thu thật.",
  });

  await tariffsRepository.publishVersion(OWNER_ID, property.propertyId, ADMIN_ID, {
    utilityType: "ELECTRICITY", effectiveFrom: date("2026-09-01"),
    sourceName: "Biểu giá mô phỏng", sourceReference: FIXTURE_TAG,
    tiers: [
      { tierNo: 1, lowerKwh: "0", upperKwh: "50", unitPrice: 2_000n },
      { tierNo: 2, lowerKwh: "50", upperKwh: "100", unitPrice: 2_500n },
      { tierNo: 3, lowerKwh: "100", upperKwh: null, unitPrice: 3_000n },
    ],
  });
  await tariffsRepository.publishVersion(OWNER_ID, property.propertyId, ADMIN_ID, {
    utilityType: "WATER", effectiveFrom: date("2026-09-01"), flatUnitPrice: 15_000n,
    sourceName: "Giá nước mô phỏng", sourceReference: FIXTURE_TAG,
  });

  const residents = [];
  const contracts = [];
  const contractStart = date("2026-09-01");
  const contractEnd = date("2027-08-31");
  for (let index = 0; index < 3; index += 1) {
    const resident = await prisma.resident.create({ data: {
      ownerId: OWNER_ID,
      fullName: `Cư dân thử nghiệm T${String(index + 1).padStart(2, "0")}`,
      email: `demo-owner6-t${String(index + 1).padStart(2, "0")}@example.test`,
      residenceStatus: "left",
      residenceRegistrationStatus: index === 0 ? "temporary_resident" : "not_completed",
    } });
    residents.push(resident);
    const input = validateContractCreate({
      contract_no: `${FIXTURE_TAG}-T${String(index + 1).padStart(2, "0")}`,
      room_id: rooms[index]!.roomId.toString(), representative_resident_id: resident.residentId.toString(),
      start_date: "2026-09-01", end_date: "2027-08-31",
      rent_amount: rooms[index]!.defaultRent.toString(), deposit_amount: rooms[index]!.defaultRent.toString(),
      resident_capacity: rooms[index]!.defaultCapacity,
      initial_electric_kwh: `${120 + index * 50}.000`, initial_water_m3: `${14 + index * 5}.000`,
    });
    const draft = await contractsRepository.create(OWNER_ID, input);
    if (!draft) throw new Error(`Could not create demo contract T${index + 1}.`);
    const active = await contractsRepository.activate(OWNER_ID, ADMIN_ID, draft.contractId);
    if (!active) throw new Error(`Could not activate demo contract T${index + 1}.`);
    const occupancy = await occupancyRepository.addOccupancy(OWNER_ID, rooms[index]!.roomId, resident.residentId, active.contractId, contractStart);
    if (!occupancy || typeof occupancy === "string") throw new Error(`Could not create demo occupancy T${index + 1}: ${String(occupancy)}.`);
    contracts.push(active);
  }

  const period = billingPeriod(contractStart, contractEnd, 0);
  if (!period) throw new Error("Could not resolve the first fixture billing period.");
  const invoices = [];
  for (let index = 0; index < 3; index += 1) {
    const created = await invoicesRepository.createDraft(OWNER_ID, {
      contractId: contracts[index]!.contractId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
    const electricityEnd = `${155 + index * 50}.000`;
    const waterEnd = `${17 + index * 5}.000`;
    const patched = await invoicesRepository.patchDraft(OWNER_ID, created.invoiceId, {
      electricityCurrentKwh: electricityEnd,
      waterCurrentM3: waterEnd,
    });
    if (!patched) throw new Error(`Could not save fixture readings for invoice T${index + 1}.`);
    invoices.push(created);
  }

  const overdue = await invoicesRepository.finalize(OWNER_ID, invoices[0]!.invoiceId, {}, pricing, ADMIN_ID, new Date("2026-10-02T05:00:00.000Z"));
  // finalize() evaluates overdue at its supplied historical finalization time;
  // the live read below verifies that the same unpaid invoice is now overdue.
  if (!overdue || overdue.status !== "unpaid" || overdue.dueDate === null || overdue.dueDate.valueOf() >= date("2026-10-28").valueOf()) {
    throw new Error("Expected the first synthetic invoice to have a historical due date and unpaid status.");
  }
  const paid = await invoicesRepository.finalize(OWNER_ID, invoices[1]!.invoiceId, {}, pricing, ADMIN_ID, new Date("2026-10-20T05:00:00.000Z"));
  if (!paid || paid.status !== "unpaid") throw new Error("Expected the second synthetic invoice to finalize as unpaid before demo payment.");
  const payment = await paymentsRepository.simulate(OWNER_ID, residents[1]!.residentId, invoices[1]!.invoiceId, "success");
  if (!payment || "notPayable" in payment && payment.notPayable) throw new Error("Could not record the simulated successful payment.");
  const unpaid = await invoicesRepository.finalize(OWNER_ID, invoices[2]!.invoiceId, {}, pricing, ADMIN_ID, new Date("2026-10-25T05:00:00.000Z"));
  if (!unpaid || unpaid.status !== "unpaid" || unpaid.isOverdue) throw new Error("Expected the third synthetic invoice to remain not-yet-due unpaid.");

  console.log(JSON.stringify({
    result: "created",
    owner_id: OWNER_ID.toString(),
    property: { property_id: property.propertyId.toString(), property_code: PROPERTY_CODE, room_count: rooms.length },
    rooms: { occupied: 3, available: 5, inactive: 2 },
    residents: residents.length,
    facilities: facilities.length,
    services: { fixed: fixedItems.length, flexible: 1 },
    utility_tariffs: 2,
    invoices: [
      { invoice_id: overdue.invoiceId.toString(), status: overdue.status, overdue: overdue.isOverdue },
      { invoice_id: invoices[1]!.invoiceId.toString(), status: "paid", overdue: false, payment: payment.transaction?.outcome },
      { invoice_id: unpaid.invoiceId.toString(), status: unpaid.status, overdue: unpaid.isOverdue },
    ],
  }));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
