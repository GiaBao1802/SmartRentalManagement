import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";

const issue = (status: number, message: string) => new ApiError(status, status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "VALIDATION_ERROR", message);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const businessToday = () => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T00:00:00.000Z");
const active = { status: "active" };
const assignmentInclude: Prisma.ParkingSlotAssignmentInclude = { parkingSlot: { include: { parkingArea: { select: { name: true } } } }, room: { select: { roomCode: true } }, contract: { select: { contractNo: true } }, resident: { select: { fullName: true } }, vehicle: { select: { vehicleType: true, plateNumber: true } }, entitlement: { include: { pricingItem: { include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } } } } };

export type ParkingAssignmentInput = { parkingSlotId: bigint; roomId: bigint; contractId: bigint; residentId: bigint; vehicleId: bigint; startedAt: Date; entitlementType: string; billability: "PAID" | "FREE" | "UNCLASSIFIED"; pricingItemId: bigint | null };
export type ParkingRequestInput = { parkingSlotId: bigint; vehicleId: bigint; contractId: bigint; startedAt: Date };
export type ParkingSlotConfiguration = { acceptedVehicleType: string | null; billability: "PAID" | "FREE"; pricingItemId: bigint | null };

const vehicleCategory = (value: string) => {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/motor|scooter|bike|xe may|xe ga|xe so/.test(normalized)) return "MOTORCYCLE";
  if (/car|oto|o to|xe hoi|xe bon cho/.test(normalized)) return "CAR";
  if (/bicycle|xe dap|xedap/.test(normalized)) return "BICYCLE";
  return "OTHER";
};
const slotView = { assignments: { where: active, select: { assignmentId: true } }, defaultEntitlement: { include: { pricingItem: { include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } } } } } satisfies Prisma.ParkingSlotInclude;

export class PrismaParkingManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, name: true } });
    if (!property) return null;
    const [areas, vehicles, assignments, entitlements, parkingItems] = await this.prisma.$transaction([
      this.prisma.parkingArea.findMany({ where: { ownerId, propertyId }, include: { slots: { include: slotView }, _count: { select: { slots: true } } }, orderBy: { name: "asc" } }),
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
    return this.prisma.parkingArea.findMany({ where: { ownerId, propertyId }, include: { slots: { include: slotView } }, orderBy: { name: "asc" } });
  }
  async createArea(ownerId: bigint, propertyId: bigint, input: { name: string; location: string | null }) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    return this.unique(() => this.prisma.parkingArea.create({ data: { ownerId, propertyId, ...input } }), "Tên khu vực bãi xe đã tồn tại trong khu trọ.");
  }
  async updateArea(ownerId: bigint, areaId: bigint, input: { name?: string; location?: string | null; active?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT parking_area_id FROM parking_areas WHERE parking_area_id=${areaId} AND owner_id=${ownerId} FOR UPDATE`;
      const current = await tx.parkingArea.findFirst({ where: { ownerId, parkingAreaId: areaId }, include: { slots: { include: { assignments: { where: active, select: { assignmentId: true } } } } } }); if (!current) return null;
      if (input.active === false && current.slots.some((slot) => slot.assignments.length)) throw issue(409, "Không thể ngưng khu vực khi còn đăng ký gửi xe đang hoạt động.");
      if (input.active === false) {
        await this.expireRequests(tx, { ownerId, propertyId: current.propertyId, parkingSlotId: { in: current.slots.map((slot) => slot.parkingSlotId) } });
        if (await tx.parkingSlotRequest.findFirst({ where: { ownerId, propertyId: current.propertyId, parkingSlotId: { in: current.slots.map((slot) => slot.parkingSlotId) }, status: "pending" }, select: { requestId: true } })) throw issue(409, "Không thể ngưng khu vực khi có yêu cầu gửi xe đang chờ duyệt.");
      }
      return tx.parkingArea.update({ where: { parkingAreaId: areaId }, data: input });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw issue(409, "Tên khu vực bãi xe đã tồn tại trong khu trọ."); this.mapConflict(error); throw error; });
  }

  async listSlots(ownerId: bigint, areaId: bigint) {
    const area = await this.prisma.parkingArea.findFirst({ where: { ownerId, parkingAreaId: areaId }, select: { parkingAreaId: true } }); if (!area) return null;
    return this.prisma.parkingSlot.findMany({ where: { ownerId, parkingAreaId: areaId }, include: slotView, orderBy: { slotCode: "asc" } });
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
      if (status === "inactive") {
        await this.expireRequests(tx, { ownerId, parkingSlotId: slotId });
        if (await tx.parkingSlotRequest.findFirst({ where: { ownerId, parkingSlotId: slotId, status: "pending" }, select: { requestId: true } })) throw issue(409, "Slot này có yêu cầu gửi xe đang chờ duyệt.");
      }
      return tx.parkingSlot.update({ where: { parkingSlotId: slotId }, data: { status } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { this.mapConflict(error); throw error; });
  }

  async configureSlot(ownerId: bigint, slotId: bigint, input: ParkingSlotConfiguration) {
    try { return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT parking_slot_id FROM parking_slots WHERE parking_slot_id=${slotId} AND owner_id=${ownerId} FOR UPDATE`;
      const slot = await tx.parkingSlot.findFirst({ where: { ownerId, parkingSlotId: slotId }, include: { assignments: { where: active, select: { assignmentId: true } } } });
      if (!slot) return null;
      await this.expireRequests(tx, { ownerId, parkingSlotId: slotId });
      if (slot.assignments.length || await tx.parkingSlotRequest.findFirst({ where: { ownerId, parkingSlotId: slotId, status: "pending" }, select: { requestId: true } })) throw issue(409, "Không thể đổi cấu hình khi slot đang được dùng hoặc có yêu cầu chờ duyệt.");
      const entitlement = await this.resolveEntitlement(tx, ownerId, slot.propertyId, { entitlementType: input.billability === "PAID" ? "PAID_SLOT" : "FREE_SLOT", billability: input.billability, pricingItemId: input.pricingItemId, effectiveDate: businessToday() });
      if (!entitlement) throw issue(409, "Chưa thể cấu hình quyền gửi xe cho slot này.");
      await tx.parkingSlot.update({ where: { parkingSlotId: slotId }, data: { acceptedVehicleType: input.acceptedVehicleType, defaultEntitlementId: entitlement.parkingEntitlementId } });
      return tx.parkingSlot.findUnique({ where: { parkingSlotId: slotId }, include: slotView });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { this.mapConflict(error); throw error; }
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
        tx.parkingSlot.findFirst({ where: { ownerId, propertyId, parkingSlotId: input.parkingSlotId, status: "active", parkingArea: { active: true } }, select: { parkingSlotId: true, parkingAreaId: true, acceptedVehicleType: true, defaultEntitlementId: true } }),
        tx.contract.findFirst({ where: { ownerId, propertyId, contractId: input.contractId, roomId: input.roomId }, select: { contractId: true, status: true, startDate: true, endDate: true, terminationDate: true, residentCapacity: true, representativeResidentId: true } }),
        tx.vehicle.findFirst({ where: { ownerId, vehicleId: input.vehicleId, residentId: input.residentId }, select: { vehicleId: true, vehicleType: true } }),
      ]);
      if (!slot) throw issue(404, "Không tìm thấy slot đang hoạt động trong khu trọ này.");
      if (!contract || !vehicle) throw issue(404, "Không tìm thấy hợp đồng hoặc phương tiện trong phạm vi khu trọ.");
      if (slot.acceptedVehicleType && vehicleCategory(vehicle.vehicleType) !== slot.acceptedVehicleType) throw issue(409, "Loại phương tiện không phù hợp với slot đã chọn.");
      const occupancy = await tx.roomResident.findFirst({ where: { ownerId, propertyId, roomId: input.roomId, contractId: input.contractId, residentId: input.residentId, status: "active", startedAt: { lte: input.startedAt }, OR: [{ endedAt: null }, { endedAt: { gte: input.startedAt } }] }, select: { occupancyId: true } });
      if (!occupancy) throw issue(409, "Cư dân không thuộc hợp đồng đã chọn.");
      const effectiveEnd = contract.status === "terminated" && contract.terminationDate ? contract.terminationDate : contract.endDate;
      if (contract.status !== "active" || input.startedAt < contract.startDate || input.startedAt > effectiveEnd) throw issue(409, "Ngày bắt đầu phải nằm trong thời hạn hợp đồng đang hiệu lực.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, parkingSlotId: input.parkingSlotId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Slot này đang được sử dụng.");
      await this.expireRequests(tx, { ownerId, parkingSlotId: input.parkingSlotId });
      if (await tx.parkingSlotRequest.findFirst({ where: { ownerId, parkingSlotId: input.parkingSlotId, status: "pending" }, select: { requestId: true } })) throw issue(409, "Slot này đang được giữ cho một yêu cầu chờ duyệt.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, vehicleId: input.vehicleId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Phương tiện này đã có đăng ký gửi xe đang hoạt động.");
      await this.expireRequests(tx, { ownerId, contractId: input.contractId });
      if (await tx.parkingSlotRequest.findFirst({ where: { ownerId, vehicleId: input.vehicleId, status: "pending" }, select: { requestId: true } })) throw issue(409, "Phương tiện này đang nằm trong một yêu cầu chờ duyệt.");
      const [activeCount, pendingCount] = await Promise.all([
        tx.parkingSlotAssignment.count({ where: { ownerId, contractId: input.contractId, status: "active" } }),
        tx.parkingSlotRequest.count({ where: { ownerId, contractId: input.contractId, status: "pending" } }),
      ]);
      if (activeCount + pendingCount >= contract.residentCapacity) throw issue(409, "Số đăng ký và yêu cầu gửi xe đã đạt sức chứa hợp đồng.");
      const entitlement = slot.defaultEntitlementId
        ? await tx.parkingEntitlement.findFirst({ where: { ownerId, propertyId, parkingEntitlementId: slot.defaultEntitlementId, active: true } })
        : await this.resolveEntitlement(tx, ownerId, propertyId, { ...input, effectiveDate: input.startedAt });
      if (slot.defaultEntitlementId && !entitlement) throw issue(409, "Cấu hình quyền gửi xe của slot đã bị ngưng.");
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

  async myParking(ownerId: bigint, residentId: bigint) {
    const today = businessToday(); const now = new Date();
    await this.expireRequests(this.prisma, { ownerId, residentId });
    const memberships = await this.prisma.roomResident.findMany({
      where: { ownerId, residentId, status: "active", startedAt: { lte: today }, OR: [{ endedAt: null }, { endedAt: { gte: today } }], contract: { is: { status: "active", startDate: { lte: today }, endDate: { gte: today } } } },
      include: { room: { select: { roomId: true, roomCode: true, propertyId: true, property: { select: { propertyId: true, name: true, province: true, address: true } } } }, contract: { select: { contractId: true, contractNo: true, roomId: true, propertyId: true, startDate: true, endDate: true, status: true, residentCapacity: true } } },
      orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }],
    });
    const contracts = memberships.filter((row) => row.contract).map((row) => ({ room: row.room, contract: row.contract }));
    const propertyIds = [...new Set(contracts.map((row) => row.contract!.propertyId))];
    const [vehicles, assignments, pendingRequests, areas, occupiedSlots, heldSlots] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { ownerId, residentId }, orderBy: [{ vehicleType: "asc" }, { plateNumber: "asc" }] }),
      this.prisma.parkingSlotAssignment.findMany({ where: { ownerId, residentId }, include: this.assignmentInclude(), orderBy: [{ status: "asc" }, { startedAt: "desc" }] }),
      this.prisma.parkingSlotRequest.findMany({ where: { ownerId, residentId, status: "pending", expiresAt: { gt: now } }, select: { requestId: true, parkingSlotId: true, vehicleId: true, contractId: true, expiresAt: true } }),
      this.prisma.parkingArea.findMany({ where: { ownerId, propertyId: { in: propertyIds }, active: true }, include: { slots: { where: { status: "active" }, include: { ...slotView, parkingArea: { select: { name: true, location: true } } } } }, orderBy: { name: "asc" } }),
      this.prisma.parkingSlotAssignment.findMany({ where: { ownerId, propertyId: { in: propertyIds }, status: "active" }, select: { parkingSlotId: true } }),
      this.prisma.parkingSlotRequest.findMany({ where: { ownerId, propertyId: { in: propertyIds }, status: "pending", expiresAt: { gt: now } }, select: { parkingSlotId: true } }),
    ]);
    const heldSlotIds = new Set(heldSlots.map((row) => row.parkingSlotId.toString()));
    const activeAssignmentSlotIds = new Set(occupiedSlots.map((row) => row.parkingSlotId.toString()));
    const usedVehicleIds = new Set([...assignments.filter((row) => row.status === "active").map((row) => row.vehicleId.toString()), ...pendingRequests.map((row) => row.vehicleId.toString())]);
    const availableAreas = areas.flatMap((area) => {
      const context = contracts.find((candidate) => candidate.contract!.propertyId === area.propertyId);
      if (!context) return [];
      return [{ parkingArea: { parkingAreaId: area.parkingAreaId, name: area.name, location: area.location }, property: context.room.property }];
    });
    const availableSlots: Array<Record<string, unknown>> = [];
    for (const context of contracts) {
      for (const area of areas.filter((candidate) => candidate.propertyId === context.contract!.propertyId)) {
        for (const slot of area.slots) {
          if (!slot.defaultEntitlement?.active || heldSlotIds.has(slot.parkingSlotId.toString()) || activeAssignmentSlotIds.has(slot.parkingSlotId.toString())) continue;
          const entitlement = slot.defaultEntitlement;
          if (entitlement.billability !== "PAID" && entitlement.billability !== "FREE") continue;
          if (entitlement.billability === "PAID" && (entitlement.pricingItem?.status !== "active" || !entitlement.pricingItem.priceVersions.some((version) => version.effectiveFrom <= today))) continue;
          availableSlots.push({
            parkingSlotId: slot.parkingSlotId, slotCode: slot.slotCode, acceptedVehicleType: slot.acceptedVehicleType,
            parkingArea: { parkingAreaId: area.parkingAreaId, name: area.name, location: area.location },
            property: context.room.property, contract: context.contract, entitlement,
          });
        }
      }
    }
    const requests = await this.listRequestViews({ ownerId, residentId });
    const vehicleHistoryIds = new Set([...assignments.map((row) => row.vehicleId.toString()), ...requests.map((row) => row.vehicleId.toString())]);
    return { contracts, vehicles: vehicles.map((vehicle) => ({ ...vehicle, inUse: usedVehicleIds.has(vehicle.vehicleId.toString()), hasHistory: vehicleHistoryIds.has(vehicle.vehicleId.toString()) })), availableAreas, availableSlots, requests, assignments };
  }

  async createResidentVehicle(ownerId: bigint, residentId: bigint, input: { vehicleType: string; plateNumber: string | null }) {
    const today = businessToday();
    const occupancy = await this.prisma.roomResident.findFirst({ where: { ownerId, residentId, status: "active", startedAt: { lte: today }, OR: [{ endedAt: null }, { endedAt: { gte: today } }], contract: { is: { status: "active", startDate: { lte: today }, endDate: { gte: today } } } }, select: { occupancyId: true } });
    if (!occupancy) return null;
    return this.prisma.vehicle.create({ data: { ownerId, residentId, ...input } });
  }

  async deleteResidentVehicle(ownerId: bigint, residentId: bigint, vehicleId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ vehicle_id: bigint }>>`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${vehicleId} AND owner_id = ${ownerId} AND resident_id = ${residentId} FOR UPDATE`;
      if (!locked.length) return null;
      const [request, assignment] = await Promise.all([
        tx.parkingSlotRequest.findFirst({ where: { ownerId, residentId, vehicleId }, select: { requestId: true } }),
        tx.parkingSlotAssignment.findFirst({ where: { ownerId, residentId, vehicleId }, select: { assignmentId: true } }),
      ]);
      if (request || assignment) throw issue(409, "Không thể xóa phương tiện vì đã có yêu cầu hoặc lịch sử gửi xe. Hãy giữ lại phương tiện để bảo toàn lịch sử.");
      await tx.vehicle.delete({ where: { vehicleId } });
      return { vehicleId, deleted: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createResidentRequest(ownerId: bigint, residentId: bigint, input: ParkingRequestInput) {
    const now = new Date(); const today = businessToday();
    try { return await this.prisma.$transaction(async (tx) => {
      await this.expireRequests(tx, { ownerId, residentId });
      await tx.$queryRaw`SELECT contract_id FROM contracts WHERE contract_id=${input.contractId} AND owner_id=${ownerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT parking_slot_id FROM parking_slots WHERE parking_slot_id=${input.parkingSlotId} AND owner_id=${ownerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT vehicle_id FROM vehicles WHERE vehicle_id=${input.vehicleId} AND owner_id=${ownerId} AND resident_id=${residentId} FOR UPDATE`;
      await this.expireRequests(tx, { ownerId, parkingSlotId: input.parkingSlotId });
      await this.expireRequests(tx, { ownerId, contractId: input.contractId });
      const [contract, slot, vehicle] = await Promise.all([
        tx.contract.findFirst({ where: { ownerId, contractId: input.contractId, status: "active" }, select: { contractId: true, propertyId: true, roomId: true, status: true, startDate: true, endDate: true, terminationDate: true, residentCapacity: true } }),
        tx.parkingSlot.findFirst({ where: { ownerId, parkingSlotId: input.parkingSlotId, status: "active", parkingArea: { active: true } }, select: { parkingSlotId: true, propertyId: true, acceptedVehicleType: true, defaultEntitlementId: true, slotCode: true, parkingArea: { select: { name: true } } } }),
        tx.vehicle.findFirst({ where: { ownerId, residentId, vehicleId: input.vehicleId }, select: { vehicleId: true, vehicleType: true, plateNumber: true } }),
      ]);
      if (!contract || !slot || !vehicle || contract.propertyId !== slot.propertyId) return null;
      if (input.startedAt < today || input.startedAt < contract.startDate || input.startedAt > (contract.terminationDate ?? contract.endDate)) throw issue(400, "Ngày bắt đầu phải nằm trong thời hạn hợp đồng từ hôm nay trở đi.");
      const occupancy = await tx.roomResident.findFirst({ where: { ownerId, propertyId: contract.propertyId, roomId: contract.roomId, contractId: input.contractId, residentId, status: "active", startedAt: { lte: today }, OR: [{ endedAt: null }, { endedAt: { gte: input.startedAt } }] }, select: { occupancyId: true } });
      if (!occupancy) throw issue(409, "Chỉ cư dân đang thuộc hợp đồng đã chọn mới gửi được yêu cầu.");
      if (!slot.defaultEntitlementId) throw issue(409, "Slot này chưa được chủ trọ cấu hình giá hoặc loại miễn phí.");
      const entitlement = await tx.parkingEntitlement.findFirst({ where: { ownerId, propertyId: slot.propertyId, parkingEntitlementId: slot.defaultEntitlementId, active: true } });
      if (!entitlement || !["PAID", "FREE"].includes(entitlement.billability)) throw issue(409, "Cấu hình giá của slot chưa sẵn sàng.");
      if (entitlement.billability === "PAID") {
        const validPrice = entitlement.propertyPricingItemId && await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId: slot.propertyId, propertyPricingItemId: entitlement.propertyPricingItemId, kind: "PARKING", status: "active", priceVersions: { some: { effectiveFrom: { lte: input.startedAt } } } }, select: { propertyPricingItemId: true } });
        if (!validPrice) throw issue(409, "Giá Parking của slot chưa có phiên bản hiệu lực tại ngày bắt đầu.");
      }
      if (slot.acceptedVehicleType && vehicleCategory(vehicle.vehicleType) !== slot.acceptedVehicleType) throw issue(409, "Loại phương tiện không phù hợp với slot đã chọn.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, parkingSlotId: slot.parkingSlotId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Slot này vừa được cư dân khác đăng ký.");
      if (await tx.parkingSlotAssignment.findFirst({ where: { ownerId, vehicleId: vehicle.vehicleId, status: "active" }, select: { assignmentId: true } })) throw issue(409, "Phương tiện này đã có chỗ gửi xe đang hoạt động.");
      if (await tx.parkingSlotRequest.findFirst({ where: { ownerId, residentId, status: "pending" }, select: { requestId: true } })) throw issue(409, "Bạn đang có một yêu cầu gửi xe chờ chủ trọ duyệt.");
      const [slotHeld, vehicleHeld, activeCount, pendingCount] = await Promise.all([
        tx.parkingSlotRequest.findFirst({ where: { ownerId, parkingSlotId: slot.parkingSlotId, status: "pending", expiresAt: { gt: now } }, select: { requestId: true } }),
        tx.parkingSlotRequest.findFirst({ where: { ownerId, vehicleId: vehicle.vehicleId, status: "pending", expiresAt: { gt: now } }, select: { requestId: true } }),
        tx.parkingSlotAssignment.count({ where: { ownerId, contractId: contract.contractId, status: "active" } }),
        tx.parkingSlotRequest.count({ where: { ownerId, contractId: contract.contractId, status: "pending", expiresAt: { gt: now } } }),
      ]);
      if (slotHeld || vehicleHeld) throw issue(409, "Slot hoặc phương tiện vừa được giữ cho yêu cầu khác.");
      if (activeCount + pendingCount >= contract.residentCapacity) throw issue(409, `Hợp đồng đã đạt giới hạn ${activeCount + pendingCount}/${contract.residentCapacity} chỗ gửi xe. Hãy liên hệ chủ trọ để kiểm tra đăng ký hiện tại hoặc điều chỉnh sức chứa hợp đồng.`);
      const [resident, admins] = await Promise.all([
        tx.resident.findFirst({ where: { ownerId, residentId }, select: { fullName: true } }),
        tx.account.findMany({ where: { ownerId, role: "admin", status: "active" }, select: { accountId: true } }),
      ]);
      const request = await tx.parkingSlotRequest.create({ data: { ownerId, propertyId: slot.propertyId, parkingSlotId: slot.parkingSlotId, vehicleId: vehicle.vehicleId, residentId, roomId: contract.roomId, contractId: contract.contractId, entitlementId: entitlement.parkingEntitlementId, startedAt: input.startedAt, requestedAt: now, expiresAt: new Date(now.valueOf() + 24 * 60 * 60 * 1000) } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(({ accountId }) => ({
        accountId,
        notificationType: "parking_request",
        title: "Cư dân gửi yêu cầu chỗ đỗ xe",
        body: `${resident?.fullName ?? "Cư dân"} yêu cầu ${slot.parkingArea.name} · ${slot.slotCode} cho ${vehicle.plateNumber || vehicle.vehicleType}. Vui lòng xem mục Yêu cầu duyệt trong Parking.`,
        createdAt: now,
      })) });
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { this.mapConflict(error); throw error; }
  }

  async cancelResidentRequest(ownerId: bigint, residentId: bigint, requestId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT request_id FROM parking_slot_requests WHERE request_id=${requestId} AND owner_id=${ownerId} AND resident_id=${residentId} FOR UPDATE`;
      const request = await tx.parkingSlotRequest.findFirst({ where: { ownerId, residentId, requestId } });
      if (!request) return null;
      if (request.status !== "pending") throw issue(409, "Chỉ có thể hủy yêu cầu đang chờ duyệt.");
      return tx.parkingSlotRequest.update({ where: { requestId }, data: { status: "cancelled", reviewedAt: new Date(), reviewNote: "Cư dân đã hủy yêu cầu." } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => { this.mapConflict(error); throw error; });
  }

  async listParkingRequests(ownerId: bigint, propertyId: bigint) {
    if (!await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } })) return null;
    await this.expireRequests(this.prisma, { ownerId, propertyId });
    return this.listRequestViews({ ownerId, propertyId });
  }

  async reviewParkingRequest(ownerId: bigint, propertyId: bigint, requestId: bigint, accountId: bigint, decision: "approve" | "reject", note: string | null) {
    try { return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT request_id FROM parking_slot_requests WHERE request_id=${requestId} AND owner_id=${ownerId} AND property_id=${propertyId} FOR UPDATE`;
      const request = await tx.parkingSlotRequest.findFirst({ where: { ownerId, propertyId, requestId } });
      if (!request) return null;
      if (request.status !== "pending") throw issue(409, "Yêu cầu này không còn ở trạng thái chờ duyệt.");
      if (request.expiresAt <= new Date()) {
        return tx.parkingSlotRequest.update({ where: { requestId }, data: { status: "expired", reviewedAt: new Date(), reviewNote: "Hết hạn giữ slot sau 24 giờ." } });
      }
      if (decision === "reject") {
        return tx.parkingSlotRequest.update({ where: { requestId }, data: { status: "rejected", reviewedAt: new Date(), reviewedByAccountId: accountId, reviewNote: note } });
      }
      const [slot, contract, vehicle] = await Promise.all([
        tx.parkingSlot.findFirst({ where: { ownerId, propertyId, parkingSlotId: request.parkingSlotId, status: "active", parkingArea: { active: true } }, select: { parkingSlotId: true, acceptedVehicleType: true } }),
        tx.contract.findFirst({ where: { ownerId, propertyId, contractId: request.contractId, roomId: request.roomId, status: "active" }, select: { contractId: true, startDate: true, endDate: true, terminationDate: true, residentCapacity: true } }),
        tx.vehicle.findFirst({ where: { ownerId, residentId: request.residentId, vehicleId: request.vehicleId }, select: { vehicleId: true, vehicleType: true } }),
      ]);
      if (!slot || !contract || !vehicle) throw issue(409, "Slot, hợp đồng hoặc phương tiện đã thay đổi; hãy tải lại yêu cầu.");
      if (slot.acceptedVehicleType && vehicleCategory(vehicle.vehicleType) !== slot.acceptedVehicleType) throw issue(409, "Loại phương tiện không còn phù hợp với slot.");
      const occupancy = await tx.roomResident.findFirst({ where: { ownerId, propertyId, roomId: request.roomId, contractId: request.contractId, residentId: request.residentId, status: "active", startedAt: { lte: request.startedAt }, OR: [{ endedAt: null }, { endedAt: { gte: request.startedAt } }] }, select: { occupancyId: true } });
      if (!occupancy || request.startedAt < contract.startDate || request.startedAt > (contract.terminationDate ?? contract.endDate)) throw issue(409, "Cư dân không còn đủ điều kiện theo hợp đồng ở ngày bắt đầu đã chọn.");
      const [slotUsed, vehicleUsed, activeCount, pendingCount] = await Promise.all([
        tx.parkingSlotAssignment.findFirst({ where: { ownerId, parkingSlotId: request.parkingSlotId, status: "active" }, select: { assignmentId: true } }),
        tx.parkingSlotAssignment.findFirst({ where: { ownerId, vehicleId: request.vehicleId, status: "active" }, select: { assignmentId: true } }),
        tx.parkingSlotAssignment.count({ where: { ownerId, contractId: request.contractId, status: "active" } }),
        tx.parkingSlotRequest.count({ where: { ownerId, contractId: request.contractId, status: "pending", requestId: { not: requestId }, expiresAt: { gt: new Date() } } }),
      ]);
      if (slotUsed || vehicleUsed) throw issue(409, "Slot hoặc phương tiện đã được sử dụng; yêu cầu chưa được duyệt.");
      if (activeCount + pendingCount >= contract.residentCapacity) throw issue(409, "Hợp đồng đã đạt sức chứa gửi xe.");
      const entitlement = await tx.parkingEntitlement.findFirst({ where: { ownerId, propertyId, parkingEntitlementId: request.entitlementId, active: true } });
      if (!entitlement) throw issue(409, "Quyền gửi xe đã bị ngưng; yêu cầu chưa được duyệt.");
      if (entitlement.billability === "PAID") {
        const validPrice = entitlement.propertyPricingItemId && await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: entitlement.propertyPricingItemId, kind: "PARKING", status: "active", priceVersions: { some: { effectiveFrom: { lte: request.startedAt } } } }, select: { propertyPricingItemId: true } });
        if (!validPrice) throw issue(409, "Giá Parking không còn hiệu lực tại ngày bắt đầu; chưa thể duyệt yêu cầu.");
      }
      const assignment = await tx.parkingSlotAssignment.create({ data: { ownerId, propertyId, parkingSlotId: request.parkingSlotId, vehicleId: request.vehicleId, residentId: request.residentId, roomId: request.roomId, contractId: request.contractId, startedAt: request.startedAt, entitlementId: request.entitlementId }, include: this.assignmentInclude() });
      const updatedRequest = await tx.parkingSlotRequest.update({ where: { requestId }, data: { status: "approved", reviewedAt: new Date(), reviewedByAccountId: accountId, reviewNote: note, assignmentId: assignment.assignmentId } });
      return { ...updatedRequest, assignment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { this.mapConflict(error); throw error; }
  }

  private async listRequestViews(where: Prisma.ParkingSlotRequestWhereInput) {
    const requests = await this.prisma.parkingSlotRequest.findMany({ where, orderBy: [{ requestedAt: "desc" }, { requestId: "desc" }] });
    return Promise.all(requests.map(async (request) => {
      const [parkingSlot, vehicle, resident, room, contract, entitlement] = await Promise.all([
        this.prisma.parkingSlot.findFirst({ where: { ownerId: request.ownerId, propertyId: request.propertyId, parkingSlotId: request.parkingSlotId }, include: { parkingArea: { select: { name: true, location: true } } } }),
        this.prisma.vehicle.findFirst({ where: { ownerId: request.ownerId, residentId: request.residentId, vehicleId: request.vehicleId } }),
        this.prisma.resident.findFirst({ where: { ownerId: request.ownerId, residentId: request.residentId }, select: { fullName: true } }),
        this.prisma.room.findFirst({ where: { ownerId: request.ownerId, propertyId: request.propertyId, roomId: request.roomId }, select: { roomCode: true } }),
        this.prisma.contract.findFirst({ where: { ownerId: request.ownerId, propertyId: request.propertyId, roomId: request.roomId, contractId: request.contractId }, select: { contractNo: true } }),
        this.prisma.parkingEntitlement.findFirst({ where: { ownerId: request.ownerId, propertyId: request.propertyId, parkingEntitlementId: request.entitlementId }, include: { pricingItem: { include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } } } }),
      ]);
      return { ...request, parkingSlot, vehicle, resident, room, contract, entitlement };
    }));
  }

  private async expireRequests(tx: Prisma.TransactionClient | PrismaClient, where: Prisma.ParkingSlotRequestWhereInput) {
    return tx.parkingSlotRequest.updateMany({ where: { ...where, status: "pending", expiresAt: { lte: new Date() } }, data: { status: "expired", reviewedAt: new Date(), reviewNote: "Hết hạn giữ slot sau 24 giờ." } });
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
      item = await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: input.pricingItemId, kind: "PARKING", status: "active", priceVersions: { some: { effectiveFrom: { lte: input.effectiveDate } } } }, select: { propertyPricingItemId: true, name: true } });
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
