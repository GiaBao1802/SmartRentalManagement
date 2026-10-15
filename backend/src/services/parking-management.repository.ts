import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";

const issue = (status: number, message: string) => new ApiError(status, status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "VALIDATION_ERROR", message);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const businessToday = () => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T00:00:00.000Z");
const active = { status: "active" };
const assignmentInclude: Prisma.ParkingSlotAssignmentInclude = { parkingSlot: { include: { parkingArea: { select: { name: true } } } }, room: { select: { roomCode: true } }, contract: { select: { contractNo: true } }, resident: { select: { fullName: true } }, vehicle: { select: { vehicleType: true, plateNumber: true } }, entitlement: { include: { pricingItem: { include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } } } } };

export type ParkingAssignmentInput = { parkingSlotId: bigint; roomId: bigint; contractId: bigint; residentId: bigint; vehicleId: bigint; startedAt: Date; entitlementType: string; billability: "PAID" | "FREE" | "UNCLASSIFIED"; pricingItemId: bigint | null };

export class PrismaParkingManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, name: true } });
    if (!property) return null;
    const [areas, vehicles, assignments, entitlements, parkingItems] = await this.prisma.$transaction([
      this.prisma.parkingArea.findMany({ where: { ownerId, propertyId }, include: { slots: { include: { assignments: { where: active, select: { assignmentId: true } } } }, _count: { select: { slots: true } } }, orderBy: { name: "asc" } }),
      this.prisma.vehicle.count({ where: { ownerId, resident: { roomResidents: { some: { ownerId, propertyId, status: "active" } } } } }),
      this.prisma.parkingSlotAssignment.findMany({ where: { ownerId, propertyId }, include: this.assignmentInclude(), orderBy: [{ status: "asc" }, { startedAt: "desc" }] }),
      this.prisma.parkingEntitlement.findMany({ where: { ownerId, propertyId, active: true }, select: { billability: true } }),
      this.prisma.propertyPricingItem.findMany({ where: { ownerId, propertyId, kind: "PARKING" }, include: { priceVersions: { where: { effectiveFrom: { lte: businessToday() } }, orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }], take: 1 } }, orderBy: { name: "asc" } }),
    ]);
    const slots = areas.flatMap((area) => area.slots);
    return { property, areas, slots, vehicles, assignments, entitlements, parkingItems };
  }

  async listAreas(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } }); if (!property) return null;
    return this.prisma.parkingArea.findMany({ where: { ownerId, propertyId }, include: { slots: { include: { assignments: { where: active, select: { assignmentId: true } } } } }, orderBy: { name: "asc" } });
  }
  async createArea(ownerId: bigint, propertyId: bigint, input: { name: string; location: string | null }) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    return this.unique(() => this.prisma.parkingArea.create({ data: { ownerId, propertyId, ...input } }), "Tên khu vực bãi xe đã tồn tại trong khu trọ.");
  }
  async updateArea(ownerId: bigint, areaId: bigint, input: { name?: string; location?: string | null; active?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT parking_area_id FROM parking_areas WHERE parking_area_id=${areaId} AND owner_id=${ownerId} FOR UPDATE`;
      const current = await tx.parkingArea.findFirst({ where: { ownerId, parkingAreaId: areaId }, include: { slots: { where: { status: "active" }, include: { assignments: { where: active, select: { assignmentId: true } } } } } }); if (!current) return null;
      if (input.active === false && current.slots.some((slot) => slot.assignments.length)) throw issue(409, "Không thể ngưng khu vực khi còn đăng ký gửi xe đang hoạt động.");
      return tx.parkingArea.update({ where: { parkingAreaId: areaId }, data: input });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw issue(409, "Tên khu vực bãi xe đã tồn tại trong khu trọ."); this.mapConflict(error); throw error; });
  }

  async listSlots(ownerId: bigint, areaId: bigint) {
    const area = await this.prisma.parkingArea.findFirst({ where: { ownerId, parkingAreaId: areaId }, select: { parkingAreaId: true } }); if (!area) return null;
    return this.prisma.parkingSlot.findMany({ where: { ownerId, parkingAreaId: areaId }, include: { assignments: { where: active, select: { assignmentId: true } } }, orderBy: { slotCode: "asc" } });
  }
  async createSlot(ownerId: bigint, areaId: bigint, slotCode: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT parking_area_id FROM parking_areas WHERE parking_area_id=${areaId} AND owner_id=${ownerId} FOR UPDATE`;
      const area = await tx.parkingArea.findFirst({ where: { ownerId, parkingAreaId: areaId, active: true }, select: { propertyId: true } }); if (!area) return null;
      return tx.parkingSlot.create({ data: { ownerId, propertyId: area.propertyId, parkingAreaId: areaId, slotCode } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw issue(409, "Mã slot đã tồn tại trong khu vực."); this.mapConflict(error); throw error; });
  }
  async updateSlot(ownerId: bigint, slotId: bigint, status: "active" | "inactive") {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT parking_slot_id FROM parking_slots WHERE parking_slot_id=${slotId} AND owner_id=${ownerId} FOR UPDATE`;
      const slot = await tx.parkingSlot.findFirst({ where: { ownerId, parkingSlotId: slotId }, include: { assignments: { where: active, select: { assignmentId: true } } } }); if (!slot) return null;
      if (status === "inactive" && slot.assignments.length) throw issue(409, "Slot này đang được sử dụng.");
      return tx.parkingSlot.update({ where: { parkingSlotId: slotId }, data: { status } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { this.mapConflict(error); throw error; });
  }

  async listResidents(ownerId: bigint, propertyId: bigint) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    const today = businessToday();
    return this.prisma.roomResident.findMany({ where: { ownerId, propertyId, status: "active", startedAt: { lte: today }, OR: [{ endedAt: null }, { endedAt: { gte: today } }], contract: { is: { status: "active" } } }, select: { resident: { select: { residentId: true, fullName: true, phone: true } }, room: { select: { roomId: true, roomCode: true } }, contract: { select: { contractId: true, contractNo: true, status: true, startDate: true, endDate: true, terminationDate: true, residentCapacity: true, representativeResidentId: true } } }, orderBy: [{ room: { roomCode: "asc" } }, { resident: { fullName: "asc" } }] });
  }
  async listVehicles(ownerId: bigint, propertyId: bigint) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    const today = businessToday();
    return this.prisma.vehicle.findMany({ where: { ownerId, resident: { roomResidents: { some: { ownerId, propertyId, status: "active", startedAt: { lte: today }, OR: [{ endedAt: null }, { endedAt: { gte: today } }] } } } }, include: { resident: { select: { residentId: true, fullName: true } }, assignments: { where: { ownerId, propertyId, status: "active" }, select: { assignmentId: true } } }, orderBy: [{ vehicleType: "asc" }, { plateNumber: "asc" }] });
  }
  async createVehicle(ownerId: bigint, propertyId: bigint, residentId: bigint, input: { vehicleType: string; plateNumber: string | null }) {
    if (!await this.prisma.roomResident.findFirst({ where: { ownerId, propertyId, residentId, status: "active" }, select: { occupancyId: true } })) return null;
    return this.prisma.vehicle.create({ data: { ownerId, residentId, ...input } });
  }

  async listAssignments(ownerId: bigint, propertyId: bigint) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    return this.prisma.parkingSlotAssignment.findMany({ where: { ownerId, propertyId }, include: this.assignmentInclude(), orderBy: [{ status: "asc" }, { startedAt: "desc" }] });
  }

  async createAssignment(ownerId: bigint, propertyId: bigint, input: ParkingAssignmentInput) {
    try { return await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } }); if (!property) return null;
      await tx.$queryRaw`SELECT contract_id FROM contracts WHERE contract_id = ${input.contractId} AND owner_id = ${ownerId} AND property_id = ${propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT parking_area_id FROM parking_areas WHERE parking_area_id = (SELECT parking_area_id FROM parking_slots WHERE parking_slot_id=${input.parkingSlotId} AND owner_id=${ownerId} AND property_id=${propertyId}) FOR UPDATE`;
      await tx.$queryRaw`SELECT parking_slot_id FROM parking_slots WHERE parking_slot_id = ${input.parkingSlotId} AND owner_id = ${ownerId} AND property_id = ${propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${input.vehicleId} AND owner_id = ${ownerId} AND resident_id = ${input.residentId} FOR UPDATE`;
      const [slot, contract, vehicle] = await Promise.all([
        tx.parkingSlot.findFirst({ where: { ownerId, propertyId, parkingSlotId: input.parkingSlotId, status: "active", parkingArea: { active: true } }, select: { parkingSlotId: true, parkingAreaId: true } }),
        tx.contract.findFirst({ where: { ownerId, propertyId, contractId: input.contractId, roomId: input.roomId }, select: { contractId: true, status: true, startDate: true, endDate: true, terminationDate: true, residentCapacity: true, representativeResidentId: true } }),
        tx.vehicle.findFirst({ where: { ownerId, vehicleId: input.vehicleId, residentId: input.residentId }, select: { vehicleId: true } }),
      ]);
      if (!slot) throw issue(404, "Không tìm thấy slot đang hoạt động trong khu trọ này.");
      if (!contract || !vehicle) throw issue(404, "Không tìm thấy hợp đồng hoặc phương tiện trong phạm vi khu trọ.");
      const occupancy = await tx.roomResident.findFirst({ where: { ownerId, propertyId, roomId: input.roomId, contractId: input.contractId, residentId: input.residentId, status: "active", startedAt: { lte: input.startedAt }, OR: [{ endedAt: null }, { endedAt: { gte: input.startedAt } }] }, select: { occupancyId: true } });
      if (!occupancy) throw issue(409, "Cư dân không thuộc hợp đồng đã chọn.");
      const effectiveEnd = contract.status === "terminated" && contract.terminationDate ? contract.terminationDate : contract.endDate;
      if (contract.status !== "active" || input.startedAt < contract.startDate || input.startedAt > effectiveEnd) throw issue(409, "Ngày bắt đầu phải nằm trong thời hạn hợp đồng đang hiệu lực.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, parkingSlotId: input.parkingSlotId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Slot này đang được sử dụng.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, vehicleId: input.vehicleId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Phương tiện này đã có đăng ký gửi xe đang hoạt động.");
      const activeCount = await tx.parkingSlotAssignment.count({ where: { ownerId, contractId: input.contractId, status: "active" } });
      if (activeCount >= contract.residentCapacity) throw issue(409, "Số đăng ký gửi xe đã đạt sức chứa hợp đồng.");
      const entitlement = await this.resolveEntitlement(tx, ownerId, propertyId, { ...input, effectiveDate: input.startedAt });
      try {
        return await tx.parkingSlotAssignment.create({ data: { ownerId, propertyId, parkingSlotId: input.parkingSlotId, vehicleId: input.vehicleId, residentId: input.residentId, roomId: input.roomId, contractId: input.contractId, startedAt: input.startedAt, entitlementId: entitlement?.parkingEntitlementId ?? null }, include: this.assignmentInclude() });
      } catch (error) { this.mapConflict(error); throw error; }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { this.mapConflict(error); throw error; }
  }

  async classify(ownerId: bigint, propertyId: bigint, assignmentId: bigint, input: Omit<ParkingAssignmentInput, "parkingSlotId" | "roomId" | "contractId" | "residentId" | "vehicleId" | "startedAt">) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.parkingSlotAssignment.findFirst({ where: { ownerId, propertyId, assignmentId }, include: { invoiceItems: { select: { invoiceItemId: true } } } }); if (!assignment) return null;
      if (assignment.invoiceItems.length) throw issue(409, "Đăng ký đã có hóa đơn. Không thể đổi phân loại để giữ nguyên lịch sử đã chốt.");
      const entitlement = await this.resolveEntitlement(tx, ownerId, propertyId, { ...input, effectiveDate: assignment.startedAt });
      return tx.parkingSlotAssignment.update({ where: { assignmentId }, data: { entitlementId: entitlement?.parkingEntitlementId ?? null }, include: this.assignmentInclude() });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async endAssignment(ownerId: bigint, assignmentId: bigint, endedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT assignment_id FROM parking_slot_assignments WHERE assignment_id=${assignmentId} AND owner_id=${ownerId} FOR UPDATE`;
      const row = await tx.parkingSlotAssignment.findFirst({ where: { ownerId, assignmentId } }); if (!row) return null;
      if (row.status !== "active") throw issue(409, "Đăng ký gửi xe đã kết thúc.");
      if (endedAt < row.startedAt) throw issue(400, "Ngày kết thúc không được trước ngày bắt đầu.");
      return tx.parkingSlotAssignment.update({ where: { assignmentId }, data: { status: "ended", endedAt }, include: this.assignmentInclude() });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { this.mapConflict(error); throw error; });
  }

  async listParkingPricing(ownerId: bigint, propertyId: bigint) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    return this.prisma.propertyPricingItem.findMany({ where: { ownerId, propertyId, kind: "PARKING" }, include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  }

  private async resolveEntitlement(tx: Prisma.TransactionClient, ownerId: bigint, propertyId: bigint, input: Pick<ParkingAssignmentInput, "entitlementType" | "billability" | "pricingItemId"> & { effectiveDate: Date }) {
    if (input.billability === "UNCLASSIFIED") return null;
    if (!(["PAID_SLOT", "FREE_SLOT", "MOTORCYCLE_VEHICLE_CARD", "APARTMENT_VEHICLE_CARD"] as string[]).includes(input.entitlementType)) throw issue(400, "Loại quyền gửi xe không hợp lệ.");
    if ((input.entitlementType === "PAID_SLOT" && input.billability !== "PAID") || (input.entitlementType === "FREE_SLOT" && input.billability !== "FREE")) throw issue(400, "Loại quyền gửi xe không khớp trạng thái tính phí.");
    let item: { propertyPricingItemId: bigint; name: string } | null = null;
    if (input.billability === "PAID") {
      if (!input.pricingItemId) throw issue(409, "Parking trả phí chưa có cấu hình giá hợp lệ.");
      item = await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: input.pricingItemId, kind: "PARKING", status: "active", priceVersions: { some: {} } }, select: { propertyPricingItemId: true, name: true } });
      if (!item) throw issue(409, "Parking trả phí chưa có cấu hình giá hợp lệ.");
    } else if (input.pricingItemId !== null) throw issue(400, "Quyền miễn phí không được gắn nguồn giá.");
    const code = `${input.entitlementType}_${input.billability}${item ? `_${item.propertyPricingItemId}` : ""}`;
    const existing = await tx.parkingEntitlement.findFirst({ where: { ownerId, propertyId, code } });
    if (existing) { if (!existing.active) throw issue(409, "Quyền gửi xe đã ngưng hoạt động."); return existing; }
    try { return await tx.parkingEntitlement.create({ data: { ownerId, propertyId, entitlementType: input.entitlementType, billability: input.billability, propertyPricingItemId: item?.propertyPricingItemId ?? null, pricingKind: item ? "PARKING" : null, code, name: item?.name ?? (input.billability === "FREE" ? "Gửi xe miễn phí" : "Chưa phân loại") } }); }
    catch (error) { this.mapConflict(error); throw error; }
  }

  private assignmentInclude() { return assignmentInclude; }
  private async unique<T>(operation: () => Promise<T>, message: string): Promise<T> { try { return await operation(); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw issue(409, message); throw error; } }
  private mapConflict(error: unknown) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw issue(409, "Slot này hoặc phương tiện này đang có đăng ký gửi xe hoạt động."); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw issue(409, "Thông tin gửi xe không còn hợp lệ. Tải lại rồi thử lại."); }
}
