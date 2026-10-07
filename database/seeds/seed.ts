import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const dayOffset = (days: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
};

const properties = [
  { code: "KV01", name: "Tòa A", province: "TP. Hồ Chí Minh", prefix: "A", address: "12 Nguyễn Văn Linh, Q.7", count: 20, rent: 3_500_000, area: 25, manager: "Nguyễn Văn An", status: "ACTIVE" as const },
  { code: "KV02", name: "Tòa B", province: "Hà Nội", prefix: "B", address: "88 Cầu Giấy, P. Dịch Vọng", count: 16, rent: 4_200_000, area: 30, manager: "Lê Thị Hoa", status: "ACTIVE" as const },
  { code: "KV03", name: "Tòa C", province: "Đà Nẵng", prefix: "C", address: "45 Nguyễn Văn Thoại, Sơn Trà", count: 30, rent: 3_200_000, area: 28, manager: "Phạm Quốc Bảo", status: "ACTIVE" as const },
  { code: "KV04", name: "Khu D", province: "TP. Hồ Chí Minh", prefix: "D", address: "25 Phan Văn Trị, Gò Vấp", count: 30, rent: 4_500_000, area: 30, manager: null, status: "UNDER_CONSTRUCTION" as const },
  { code: "KV05", name: "Khu E", province: "Hà Nội", prefix: "E", address: "10 Trần Duy Hưng", count: 10, rent: 3_000_000, area: 22, manager: "Lê Thị Hoa", status: "PAUSED" as const },
];

const tenants = [
  { nationalId: "079012345678", fullName: "Nguyễn Văn A", phone: "0912 345 678", email: "vana@gmail.com", status: "RESIDENT" as const, registrationStatus: "REGISTERED" as const, propertyCode: "KV01", roomNumber: "A101" },
  { nationalId: "079112233445", fullName: "Trần Văn B", phone: "0945 678 901", email: "tranvanb@gmail.com", status: "RESIDENT" as const, registrationStatus: "UNREGISTERED" as const, propertyCode: "KV01", roomNumber: "A205" },
  { nationalId: "001098765432", fullName: "Trần Thị B", phone: "0923 456 789", email: "mai.tran@gmail.com", status: "RESIDENT" as const, registrationStatus: "UNREGISTERED" as const, propertyCode: "KV02", roomNumber: "B205" },
  { nationalId: "048055512345", fullName: "Lê Văn C", phone: "0934 567 890", email: "cuongle@gmail.com", status: "FORMER" as const, registrationStatus: "UNREGISTERED" as const, propertyCode: "KV03", roomNumber: "C310" },
  { nationalId: "048077788899", fullName: "Phạm Thị D", phone: "0956 789 012", email: "dpham@gmail.com", status: "RESIDENT" as const, registrationStatus: "REGISTERED" as const, propertyCode: "KV03", roomNumber: "C102" },
];

const contractSamples = [
  { number: "HD001", nationalId: "079012345678", propertyCode: "KV01", roomNumber: "A101", startOffset: -270, endOffset: 95, deposit: 3_500_000, rent: 3_500_000, occupants: 2, startE: 1_250, startW: 60, latestE: 1_330, latestW: 74, status: "ACTIVE" as const },
  { number: "HD002", nationalId: "079112233445", propertyCode: "KV01", roomNumber: "A205", startOffset: -215, endOffset: 25, deposit: 3_500_000, rent: 3_500_000, occupants: 1, startE: 900, startW: 40, latestE: 980, latestW: 52, status: "ACTIVE" as const },
  { number: "HD003", nationalId: "001098765432", propertyCode: "KV02", roomNumber: "B205", startOffset: -200, endOffset: 10, deposit: 4_200_000, rent: 4_200_000, occupants: 2, startE: 500, startW: 30, latestE: 610, latestW: 41, status: "ACTIVE" as const },
  { number: "HD004", nationalId: "048055512345", propertyCode: "KV03", roomNumber: "C310", startOffset: -480, endOffset: -120, deposit: 3_200_000, rent: 3_200_000, occupants: 1, startE: 100, startW: 10, latestE: 420, latestW: 35, status: "TERMINATED" as const },
];

const amenitySamples = [
  { code: "LAUNDRY", name: "Máy giặt", location: "Tầng 1", price: 0, unit: "lượt", opens: "06:00", closes: "22:00", active: true, capacity: 5, instructions: "Lấy đồ đúng giờ và vệ sinh máy sau khi dùng." },
  { code: "SHARED_KITCHEN", name: "Bếp chung", location: "Tầng 2", price: 0, unit: "lượt", opens: "06:00", closes: "22:00", active: true, capacity: null, instructions: "Giữ vệ sinh bếp, tắt gas và điện sau khi dùng." },
  { code: "PARKING", name: "Slot đỗ xe", location: "Hầm B1", price: 0, unit: "tháng", opens: null, closes: null, active: true, capacity: 8, instructions: "Đỗ đúng slot đã đăng ký và khóa cổ xe." },
  { code: "POOL", name: "Hồ bơi", location: "Tầng thượng", price: 50_000, unit: "lượt", opens: "06:00", closes: "21:00", active: true, capacity: null, instructions: "Tắm tráng trước khi xuống hồ." },
  { code: "GYM", name: "Gym", location: "Tầng 3", price: 30_000, unit: "lượt", opens: "05:00", closes: "22:00", active: true, capacity: null, instructions: "Lau dụng cụ sau khi dùng." },
  { code: "PARCEL_LOCKER", name: "Tủ đồ gửi hàng", location: "Sảnh", price: 0, unit: "lượt", opens: null, closes: null, active: true, capacity: null, instructions: "Nhận hàng theo thông báo." },
  { code: "TENNIS", name: "Sân tennis", location: "Khu B", price: 120_000, unit: "giờ", opens: "06:00", closes: "20:00", active: false, capacity: null, instructions: null },
  { code: "BBQ", name: "Phòng BBQ", location: "Khu B", price: 200_000, unit: "giờ", opens: "10:00", closes: "22:00", active: true, capacity: null, instructions: null },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    const roomByKey = new Map<string, { id: string }>();
    for (const sample of properties) {
      const property = await tx.property.upsert({
        where: { code: sample.code },
        create: {
          code: sample.code,
          name: sample.name,
          province: sample.province,
          roomPrefix: sample.prefix,
          address: sample.address,
          managerName: sample.manager,
          defaultRentVnd: sample.rent,
          defaultAreaM2: sample.area,
          status: sample.status,
        },
        update: {
          name: sample.name,
          province: sample.province,
          roomPrefix: sample.prefix,
          address: sample.address,
          managerName: sample.manager,
          defaultRentVnd: sample.rent,
          defaultAreaM2: sample.area,
          status: sample.status,
        },
      });
      for (let index = 0; index < sample.count; index += 1) {
        const floor = Math.floor(index / 10) + 1;
        const roomNumber = `${sample.prefix}${floor}${String((index % 10) + 1).padStart(2, "0")}`;
        const room = await tx.room.upsert({
          where: { propertyId_roomNumber: { propertyId: property.id, roomNumber } },
          create: {
            propertyId: property.id,
            roomNumber,
            floor,
            areaM2: sample.area,
            condition: sample.status === "ACTIVE" ? "READY" : "UNAVAILABLE",
          },
          update: {
            floor,
            areaM2: sample.area,
            condition: sample.status === "ACTIVE" ? "READY" : "UNAVAILABLE",
          },
        });
        roomByKey.set(`${sample.code}:${roomNumber}`, room);
      }
    }

    const tenantByNationalId = new Map<string, { id: string }>();
    for (const sample of tenants) {
      const tenant = await tx.tenant.upsert({
        where: { nationalId: sample.nationalId },
        create: {
          nationalId: sample.nationalId,
          fullName: sample.fullName,
          phone: sample.phone,
          email: sample.email,
          status: sample.status,
          registrationStatus: sample.registrationStatus,
        },
        update: {
          fullName: sample.fullName,
          phone: sample.phone,
          email: sample.email,
          status: sample.status,
          registrationStatus: sample.registrationStatus,
        },
      });
      tenantByNationalId.set(sample.nationalId, tenant);
    }

    const contractByNumber = new Map<string, { id: string; monthlyRentVnd: number }>();
    for (const sample of contractSamples) {
      const tenant = tenantByNationalId.get(sample.nationalId);
      const room = roomByKey.get(`${sample.propertyCode}:${sample.roomNumber}`);
      if (!tenant || !room) throw new Error(`Missing tenant or room for ${sample.number}`);
      const startDate = dayOffset(sample.startOffset);
      const endDate = dayOffset(sample.endOffset);
      const contract = await tx.leaseContract.upsert({
        where: { contractNumber: sample.number },
        create: {
          contractNumber: sample.number,
          tenantId: tenant.id,
          roomId: room.id,
          startDate,
          endDate,
          monthlyRentVnd: sample.rent,
          depositVnd: sample.deposit,
          occupantCount: sample.occupants,
          startElectricMeter: sample.startE,
          startWaterMeter: sample.startW,
          latestElectricMeter: sample.latestE,
          latestWaterMeter: sample.latestW,
          status: sample.status,
          signedAt: startDate,
        },
        update: {
          tenantId: tenant.id,
          roomId: room.id,
          startDate,
          endDate,
          monthlyRentVnd: sample.rent,
          depositVnd: sample.deposit,
          occupantCount: sample.occupants,
          startElectricMeter: sample.startE,
          startWaterMeter: sample.startW,
          latestElectricMeter: sample.latestE,
          latestWaterMeter: sample.latestW,
          status: sample.status,
          signedAt: startDate,
        },
      });
      contractByNumber.set(sample.number, contract);

      if (sample.status === "TERMINATED") {
        const terminatedOn = dayOffset(-115);
        await tx.contractTermination.upsert({
          where: { contractId: contract.id },
          create: {
            contractId: contract.id,
            terminatedOn,
            reason: "Hết hạn",
            finalElectricMeter: sample.latestE,
            finalWaterMeter: sample.latestW,
            depositDeductionVnd: 0,
            depositRefundVnd: sample.deposit,
          },
          update: {
            terminatedOn,
            reason: "Hết hạn",
            finalElectricMeter: sample.latestE,
            finalWaterMeter: sample.latestW,
            depositDeductionVnd: 0,
            depositRefundVnd: sample.deposit,
          },
        });
      }
    }

    const current = monthStart(0);
    const previous = monthStart(-1);
    const invoiceSamples = [
      { number: "HD-101", contract: "HD001", period: current, total: 4_220_000, electric: 280_000, water: 210_000, previousE: 1_250, currentE: 1_330, previousW: 60, currentW: 74, other: 230_000, dueOffset: 20, paid: false },
      { number: "HD-102", contract: "HD003", period: current, total: 4_770_000, electric: 385_000, water: 165_000, previousE: 500, currentE: 610, previousW: 30, currentW: 41, other: 20_000, dueOffset: 20, paid: true },
      { number: "HD-203", contract: "HD002", period: previous, total: 4_090_000, electric: 280_000, water: 180_000, previousE: 900, currentE: 980, previousW: 40, currentW: 52, other: 130_000, dueOffset: -3, paid: false },
    ];

    for (const sample of invoiceSamples) {
      const contract = contractByNumber.get(sample.contract);
      if (!contract) throw new Error(`Missing contract ${sample.contract}`);
      const invoice = await tx.invoice.upsert({
        where: {
          contractId_billingYear_billingMonth: {
            contractId: contract.id,
            billingYear: sample.period.getUTCFullYear(),
            billingMonth: sample.period.getUTCMonth() + 1,
          },
        },
        create: {
          invoiceNumber: sample.number,
          contractId: contract.id,
          billingYear: sample.period.getUTCFullYear(),
          billingMonth: sample.period.getUTCMonth() + 1,
          dueDate: dayOffset(sample.dueOffset),
          totalVnd: sample.total,
          status: sample.paid ? "PAID" : "UNPAID",
          paidAt: sample.paid ? dayOffset(-1) : null,
        },
        update: {
          invoiceNumber: sample.number,
          dueDate: dayOffset(sample.dueOffset),
          totalVnd: sample.total,
          status: sample.paid ? "PAID" : "UNPAID",
          paidAt: sample.paid ? dayOffset(-1) : null,
        },
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      const lineSamples = [
        { type: "RENT" as const, description: "Tiền thuê phòng", quantity: 1, unit: "tháng", unitPriceVnd: sample.total - sample.electric - sample.water - sample.other, amountVnd: sample.total - sample.electric - sample.water - sample.other },
        { type: "ELECTRICITY" as const, description: "Tiền điện", quantity: sample.currentE - sample.previousE, unit: "kWh", unitPriceVnd: 3_500, amountVnd: sample.electric },
        { type: "WATER" as const, description: "Tiền nước", quantity: sample.currentW - sample.previousW, unit: "m³", unitPriceVnd: 15_000, amountVnd: sample.water },
        { type: "OTHER" as const, description: "Dịch vụ và phí khác (demo)", quantity: 1, unit: "kỳ", unitPriceVnd: sample.other, amountVnd: sample.other },
      ];
      await tx.invoiceLine.createMany({
        data: lineSamples.map((line) => ({ invoiceId: invoice.id, ...line })),
      });

      await tx.meterReading.upsert({
        where: { invoiceId_type: { invoiceId: invoice.id, type: "ELECTRICITY" } },
        create: { invoiceId: invoice.id, type: "ELECTRICITY", previousValue: sample.previousE, currentValue: sample.currentE, unitPriceVnd: 3_500, amountVnd: sample.electric },
        update: { previousValue: sample.previousE, currentValue: sample.currentE, unitPriceVnd: 3_500, amountVnd: sample.electric },
      });
      await tx.meterReading.upsert({
        where: { invoiceId_type: { invoiceId: invoice.id, type: "WATER" } },
        create: { invoiceId: invoice.id, type: "WATER", previousValue: sample.previousW, currentValue: sample.currentW, unitPriceVnd: 15_000, amountVnd: sample.water },
        update: { previousValue: sample.previousW, currentValue: sample.currentW, unitPriceVnd: 15_000, amountVnd: sample.water },
      });

      if (sample.paid) {
        await tx.payment.upsert({
          where: { id: `seed-payment-${sample.number}` },
          create: { id: `seed-payment-${sample.number}`, invoiceId: invoice.id, amountVnd: sample.total, method: "BANK_TRANSFER", reference: "DEMO-SEED" },
          update: { invoiceId: invoice.id, amountVnd: sample.total, method: "BANK_TRANSFER", reference: "DEMO-SEED" },
        });
      }
    }

    const amenityByCode = new Map<string, { id: string }>();
    for (const sample of amenitySamples) {
      const amenity = await tx.amenity.upsert({
        where: { code: sample.code },
        create: {
          code: sample.code,
          name: sample.name,
          location: sample.location,
          priceVnd: sample.price,
          priceUnit: sample.unit,
          opensAt: sample.opens,
          closesAt: sample.closes,
          isActive: sample.active,
          capacity: sample.capacity,
          instructions: sample.instructions,
        },
        update: {
          name: sample.name,
          location: sample.location,
          priceVnd: sample.price,
          priceUnit: sample.unit,
          opensAt: sample.opens,
          closesAt: sample.closes,
          isActive: sample.active,
          capacity: sample.capacity,
          instructions: sample.instructions,
        },
      });
      amenityByCode.set(sample.code, amenity);
    }

    const bookingSamples = [
      { id: "seed-booking-approved", code: "LAUNDRY", nationalId: tenants[0].nationalId, propertyCode: "KV01", roomNumber: "A101", useOffset: -2, time: "09:00–10:00", status: "APPROVED" as const, note: "Đặt máy giặt demo" },
      { id: "seed-booking-pending", code: "GYM", nationalId: tenants[1].nationalId, propertyCode: "KV01", roomNumber: "A205", useOffset: 2, time: "18:00–19:00", status: "PENDING" as const, note: "Đăng ký tiện ích demo" },
      { id: "seed-booking-used", code: "POOL", nationalId: tenants[0].nationalId, propertyCode: "KV01", roomNumber: "A101", useOffset: -8, time: "17:00–18:00", status: "USED" as const, note: null },
    ];
    for (const sample of bookingSamples) {
      const amenity = amenityByCode.get(sample.code);
      const tenant = tenantByNationalId.get(sample.nationalId);
      const room = roomByKey.get(`${sample.propertyCode}:${sample.roomNumber}`);
      if (!amenity || !tenant || !room) throw new Error(`Missing relation for ${sample.id}`);
      await tx.amenityBooking.upsert({
        where: { id: sample.id },
        create: {
          id: sample.id,
          amenityId: amenity.id,
          tenantId: tenant.id,
          roomId: room.id,
          useDate: dayOffset(sample.useOffset),
          timeSlot: sample.time,
          status: sample.status,
          note: sample.note,
        },
        update: {
          amenityId: amenity.id,
          tenantId: tenant.id,
          roomId: room.id,
          useDate: dayOffset(sample.useOffset),
          timeSlot: sample.time,
          status: sample.status,
          note: sample.note,
        },
      });
    }

    const maintenanceSamples = [
      { id: "seed-request-1", tenantIndex: 0, propertyCode: "KV01", roomNumber: "A101", category: "Hóa đơn", content: "Đề nghị kiểm tra lại tiền điện của kỳ này.", priority: "MEDIUM" as const },
      { id: "seed-request-2", tenantIndex: 1, propertyCode: "KV01", roomNumber: "A205", category: "Thiết bị", content: "Máy nước nóng trong phòng không hoạt động.", priority: "HIGH" as const },
      { id: "seed-request-3", tenantIndex: 2, propertyCode: "KV02", roomNumber: "B205", category: "Dịch vụ", content: "Đề nghị kiểm tra vệ sinh hành lang tầng 2.", priority: "MEDIUM" as const },
      { id: "seed-request-4", tenantIndex: 4, propertyCode: "KV03", roomNumber: "C102", category: "Cơ sở vật chất", content: "Cửa sổ phòng bị hở khi mưa lớn.", priority: "HIGH" as const },
      { id: "seed-request-5", tenantIndex: 3, propertyCode: "KV03", roomNumber: "C310", category: "Khác", content: "Cần đối chiếu khoản khấu trừ tiền cọc khi thanh lý.", priority: "MEDIUM" as const },
    ];
    for (const [index, sample] of maintenanceSamples.entries()) {
      const tenant = tenantByNationalId.get(tenants[sample.tenantIndex].nationalId);
      const room = roomByKey.get(`${sample.propertyCode}:${sample.roomNumber}`);
      if (!tenant || !room) throw new Error(`Missing relation for ${sample.id}`);
      await tx.maintenanceRequest.upsert({
        where: { id: sample.id },
        create: {
          id: sample.id,
          tenantId: tenant.id,
          roomId: room.id,
          source: "TENANT_PORTAL",
          category: sample.category,
          content: sample.content,
          priority: sample.priority,
          status: "PENDING",
          createdAt: dayOffset(-index),
        },
        update: {
          tenantId: tenant.id,
          roomId: room.id,
          category: sample.category,
          content: sample.content,
          priority: sample.priority,
          status: "PENDING",
        },
      });
    }

    for (const sample of [
      { nationalId: tenants[0].nationalId, type: "Xe máy", plate: "59A1-123.45", slot: "S-12" },
      { nationalId: tenants[0].nationalId, type: "Xe đạp điện", plate: null, slot: null },
      { nationalId: tenants[2].nationalId, type: "Xe máy", plate: "29B1-678.90", slot: "S-05" },
    ]) {
      const tenant = tenantByNationalId.get(sample.nationalId);
      if (!tenant) throw new Error(`Missing tenant ${sample.nationalId}`);
      const id = `seed-vehicle-${sample.nationalId}-${sample.type.replaceAll(" ", "-")}`;
      await tx.vehicle.upsert({
        where: { id },
        create: { id, tenantId: tenant.id, vehicleType: sample.type, plateNumber: sample.plate, parkingSlot: sample.slot },
        update: { tenantId: tenant.id, vehicleType: sample.type, plateNumber: sample.plate, parkingSlot: sample.slot },
      });
    }

    // Room viewing requests and login accounts are intentionally left empty:
    // the current HTML demo has no initial viewing requests and uses unsafe sample passwords.
  }, { maxWait: 10_000, timeout: 120_000 });

  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "123456";
  const adminSalt = randomBytes(16).toString("hex");
  const adminHash = scryptSync(adminPassword, adminSalt, 64).toString("hex");
  await prisma.userAccount.upsert({
    where: { username: "admin" },
    update: { passwordHash: `scrypt$${adminSalt}$${adminHash}`, role: "ADMIN", isActive: true, displayName: "Nguyễn Văn An" },
    create: { username: "admin", passwordHash: `scrypt$${adminSalt}$${adminHash}`, role: "ADMIN", isActive: true, displayName: "Nguyễn Văn An", email: "admin@goctro.local" },
  });

  console.log("Development sample data seeded. Admin login: admin / configured DEV_ADMIN_PASSWORD (default: 123456)");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
