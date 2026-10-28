import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import type { ContractInput, ContractListQuery, ContractPatch, ContractRenewalInput } from "./contract.validation.js";
import { contractBusinessDate, dateAtBusinessMidnight, sqlDate } from "./contract.date.js";

const contractSummary = {
  room: { select: { roomId: true, roomCode: true, propertyId: true, property: { select: { propertyId: true, name: true, province: true, address: true } } } },
  representativeResident: { select: { residentId: true, fullName: true } },
  successorContracts: { select: { contractId: true, contractNo: true, status: true, revision: true }, take: 1 },
} satisfies Prisma.ContractInclude;
function residentContractSummary(ownerId: bigint, residentId: bigint): Prisma.ContractInclude {
  return {
    ...contractSummary,
    successorContracts: {
      where: {
        ownerId,
        OR: [
          { representativeResidentId: residentId },
          { roomResidents: { some: { residentId, ownerId } } },
        ],
      },
      select: { contractId: true, contractNo: true, status: true, revision: true },
      take: 1,
    },
  };
}
type Tx = Prisma.TransactionClient;

export class PrismaContractRepository {
  constructor(private readonly prisma: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async list(ownerId: bigint, query: ContractListQuery, actorId?: bigint) {
    if (actorId !== undefined) await this.syncExpired(ownerId, actorId);
    const where: Prisma.ContractWhereInput = {
      ownerId,
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.representativeResidentId ? { representativeResidentId: query.representativeResidentId } : {}),
      ...(query.contractNo ? { contractNo: { contains: query.contractNo, mode: "insensitive" } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expiringBefore ? { endDate: { lte: query.expiringBefore, gte: dateAtBusinessMidnight(contractBusinessDate(this.clock())) }, status: "active" } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({ where, include: contractSummary, orderBy: [{ startDate: "desc" }, { contractId: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.contract.count({ where }),
    ]);
    return { rows, total };
  }

  async syncExpired(ownerId: bigint, actorId: bigint, now = this.clock()) {
    const today = contractBusinessDate(now);
    const candidates = await this.prisma.contract.findMany({
      where: { ownerId, status: "active", endDate: { lt: dateAtBusinessMidnight(today) } },
      select: { contractId: true },
    });
    let transitioned = 0;
    for (const candidate of candidates) {
      const didTransition = await this.prisma.$transaction(async (tx) => {
        await this.lockContract(tx, ownerId, candidate.contractId);
        const current = await tx.contract.findFirst({ where: { ownerId, contractId: candidate.contractId }, select: { status: true, revision: true, endDate: true } });
        if (!current || current.status !== "active" || sqlDate(current.endDate) >= today) return false;
        const revision = current.revision + 1;
        await tx.contract.update({ where: { contractId_ownerId: { contractId: candidate.contractId, ownerId } }, data: { status: "expired", revision } });
        await tx.contractChangeHistory.create({ data: {
          contractId: candidate.contractId, ownerId, changedByAccountId: actorId, revision,
          changeType: "status_transition", changeReason: null,
          beforeData: { status: "active" }, afterData: { status: "expired", end_date: sqlDate(current.endDate) },
        } });
        await tx.parkingSlotAssignment.updateMany({ where: { ownerId, contractId: candidate.contractId, status: "active", startedAt: { lte: current.endDate } }, data: { status: "ended", endedAt: current.endDate } });
        await tx.parkingSlotRequest.updateMany({ where: { ownerId, contractId: candidate.contractId, status: "pending" }, data: { status: "cancelled", reviewedAt: new Date(), reviewNote: "Hợp đồng đã hết hiệu lực." } });
        await tx.amenitySubscription.updateMany({ where: { ownerId, contractId: candidate.contractId, status: { in: ["active", "cancellation_requested"] } }, data: { status: "contract_ended", effectiveEndAt: current.endDate } });
        await tx.amenitySubscriptionCycle.updateMany({ where: { ownerId, contractId: candidate.contractId, status: "planned", cycleStart: { gte: current.endDate } }, data: { status: "cancelled" } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (didTransition) transitioned += 1;
    }
    return transitioned;
  }

  async create(ownerId: bigint, input: ContractInput, transaction?: Tx) {
    return this.inTransaction(transaction, async (tx) => {
      const room = await tx.room.findFirst({ where: { ownerId, roomId: input.roomId }, select: { roomId: true, propertyId: true, isActive: true, status: true } });
      if (!room || !room.isActive || room.status === "inactive") return null;
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId: input.representativeResidentId, archivedAt: null }, select: { residentId: true } });
      if (!resident) return null;
      await this.assertCapacity(tx, ownerId, room.roomId, input.residentCapacity);
      return tx.contract.create({ data: {
        contractNo: input.contractNo, roomId: room.roomId, propertyId: room.propertyId, ownerId,
        representativeResidentId: resident.residentId, startDate: input.startDate, endDate: input.endDate,
        rentAmount: input.rentAmount, depositAmount: input.depositAmount, residentCapacity: input.residentCapacity,
        initialElectricKwh: input.initialElectricKwh, initialWaterM3: input.initialWaterM3, status: "draft", revision: 0,
      }, include: contractSummary });
    });
  }

  async canCreateForOwner(ownerId: bigint, input: ContractInput): Promise<boolean> {
    const [room, resident] = await Promise.all([
      // This is an authorization-only preflight before idempotency lookup. Mutable
      // business eligibility is checked again inside create(); putting it here
      // would make a committed request unreplayable after later deactivation/archive.
      this.prisma.room.findFirst({ where: { ownerId, roomId: input.roomId }, select: { roomId: true } }),
      this.prisma.resident.findFirst({ where: { ownerId, residentId: input.representativeResidentId }, select: { residentId: true } }),
    ]);
    return Boolean(room && resident);
  }

  async findForOwner(ownerId: bigint, contractId: bigint, actorId?: bigint) {
    if (actorId !== undefined) await this.syncExpired(ownerId, actorId);
    return this.prisma.contract.findFirst({ where: { ownerId, contractId }, include: contractSummary });
  }

  async findForResident(ownerId: bigint, residentId: bigint, contractId: bigint, actorId?: bigint) {
    if (actorId !== undefined) await this.syncExpired(ownerId, actorId);
    return this.prisma.contract.findFirst({ where: {
      ownerId, contractId,
      OR: [{ representativeResidentId: residentId }, { roomResidents: { some: { residentId, ownerId, contractId } } }],
    }, include: residentContractSummary(ownerId, residentId) });
  }

  async patch(ownerId: bigint, contractId: bigint, patch: ContractPatch, expectedRevision?: number, actorId?: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const scoped = await tx.contract.findFirst({ where: { ownerId, contractId }, select: { roomId: true } });
      if (!scoped) return null;
      await this.lockRoom(tx, ownerId, scoped.roomId);
      await this.lockContract(tx, ownerId, contractId);
      const current = await tx.contract.findFirst({ where: { ownerId, contractId }, include: contractSummary });
      if (!current) return null;
      if (current.status !== "draft" && current.status !== "active") throw this.stateConflict("Chỉ hợp đồng draft hoặc active mới được cập nhật.");
      if (current.status === "active") this.assertRevision(current.revision, expectedRevision);
      if (current.status === "active" && "contractNo" in patch) throw new ApiError(400, "VALIDATION_ERROR", "contract_no không thể thay đổi sau khi kích hoạt.");
      if (current.status === "active" && (!patch.changeReason || !patch.changeReason.trim())) throw new ApiError(400, "VALIDATION_ERROR", "change_reason là bắt buộc cho thay đổi hợp đồng active.");
      if (current.status === "draft" && patch.changeReason !== undefined) throw new ApiError(400, "VALIDATION_ERROR", "Draft không nhận change_reason.");
      const { changeReason, ...data } = patch;
      const merged = { ...current, ...data };
      this.assertDates(merged.startDate, merged.endDate);
      if (data.representativeResidentId !== undefined && !(await tx.resident.findFirst({ where: { ownerId, residentId: data.representativeResidentId, archivedAt: null }, select: { residentId: true } }))) return null;
      if (data.residentCapacity !== undefined) await this.assertCapacity(tx, ownerId, current.roomId, data.residentCapacity);
      await this.assertNoOverlap(tx, ownerId, current.roomId, merged.startDate, merged.endDate, current.contractId);
      const before = current;
      const changed = Object.fromEntries(Object.entries(data).filter(([key, value]) => !sameValue((current as unknown as Record<string, unknown>)[key], value)));
      if (Object.keys(changed).length === 0) return { contract: current, changed: false };
      const updateData = changed as Prisma.ContractUpdateInput;
      if (current.status === "draft") {
        const contract = await tx.contract.update({ where: { contractId_ownerId: { contractId, ownerId } }, data: updateData, include: contractSummary });
        return { contract, changed: true };
      }
      if (actorId === undefined) throw new Error("Authenticated actor is required for official Contract changes.");
      const revision = current.revision + 1;
      const contract = await tx.contract.update({ where: { contractId_ownerId: { contractId, ownerId } }, data: { ...updateData, revision }, include: contractSummary });
      await tx.contractChangeHistory.create({ data: {
        contractId, ownerId, changedByAccountId: actorId, revision, changeType: "material_update", changeReason,
        beforeData: snapshot(changed, before), afterData: snapshot(changed, contract),
      } });
      return { contract, changed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async activate(ownerId: bigint, actorId: bigint, contractId: bigint, transaction?: Tx) {
    return this.inTransaction(transaction, async (tx) => {
      const scoped = await tx.contract.findFirst({ where: { ownerId, contractId }, select: { roomId: true } });
      if (!scoped) return null;
      await this.lockRoom(tx, ownerId, scoped.roomId);
      await this.lockContract(tx, ownerId, contractId);
      const current = await tx.contract.findFirst({ where: { ownerId, contractId }, include: contractSummary });
      if (!current) return null;
      if (current.status !== "draft" || current.revision !== 0) throw this.stateConflict("Chỉ hợp đồng draft chưa kích hoạt mới được kích hoạt.");
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId: current.representativeResidentId, archivedAt: null }, select: { residentId: true } });
      if (!resident) return null;
      const room = await tx.room.findFirst({ where: { ownerId, roomId: current.roomId }, select: { isActive: true, status: true, property: { select: { status: true } } } });
      if (!room) return null;
      if (!room.isActive || room.status === "inactive" || room.property.status === "archived") throw this.stateConflict("Không thể kích hoạt hợp đồng cho phòng hoặc khu vực không hoạt động.");
      this.assertDates(current.startDate, current.endDate);
      if (current.previousContractId !== null && (current.initialElectricKwh === null || current.initialWaterM3 === null)) {
        throw new ApiError(409, "CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED", "Hợp đồng mới cần có chỉ số điện và nước ban đầu riêng trước khi kích hoạt.");
      }
      await this.assertNoOverlap(tx, ownerId, current.roomId, current.startDate, current.endDate, current.contractId);
      await this.assertCapacity(tx, ownerId, current.roomId, current.residentCapacity);
      const contract = await tx.contract.update({ where: { contractId_ownerId: { contractId, ownerId } }, data: { status: "active", revision: 1 }, include: contractSummary });
      await tx.contractChangeHistory.create({ data: {
        contractId, ownerId, changedByAccountId: actorId, revision: 1, changeType: "activation",
        beforeData: { status: "draft" }, afterData: activationSnapshot(contract),
      } });
      return contract;
    });
  }

  async renew(ownerId: bigint, contractId: bigint, expectedRevision: number, input: ContractRenewalInput, transaction?: Tx) {
    return this.inTransaction(transaction, async (tx) => {
      const scoped = await tx.contract.findFirst({ where: { ownerId, contractId }, select: { roomId: true } });
      if (!scoped) return null;
      await this.lockRoom(tx, ownerId, scoped.roomId);
      await this.lockContract(tx, ownerId, contractId);
      const predecessor = await tx.contract.findFirst({ where: { ownerId, contractId }, include: contractSummary });
      if (!predecessor) return null;
      this.assertRevision(predecessor.revision, expectedRevision);
      if (!["active", "expired"].includes(predecessor.status)) throw this.stateConflict("Chỉ hợp đồng official phù hợp mới được gia hạn.");
      if (await tx.contract.findFirst({ where: { ownerId, previousContractId: contractId }, select: { contractId: true } })) throw this.stateConflict("Hợp đồng đã có successor trực tiếp.");
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId: predecessor.representativeResidentId, archivedAt: null }, select: { residentId: true } });
      if (!resident) return null;
      this.assertDates(input.startDate, input.endDate);
      await this.assertNoOverlap(tx, ownerId, predecessor.roomId, input.startDate, input.endDate);
      await this.assertCapacity(tx, ownerId, predecessor.roomId, predecessor.residentCapacity);
      return tx.contract.create({ data: {
        contractNo: input.contractNo, roomId: predecessor.roomId, propertyId: predecessor.propertyId, ownerId,
        representativeResidentId: resident.residentId, previousContractId: predecessor.contractId,
        startDate: input.startDate, endDate: input.endDate, rentAmount: predecessor.rentAmount,
        depositAmount: predecessor.depositAmount, residentCapacity: predecessor.residentCapacity,
        initialElectricKwh: null, initialWaterM3: null,
        status: "draft", revision: 0,
      }, include: contractSummary });
    });
  }

  async terminate(ownerId: bigint, actorId: bigint, contractId: bigint, expectedRevision: number, input: {
    terminationDate: Date; terminationReason: string; finalElectricKwh: string; finalWaterM3: string; depositDeduction: bigint; depositSettlementAmount: bigint;
  }, transaction?: Tx) {
    return this.inTransaction(transaction, async (tx) => {
      const scoped = await tx.contract.findFirst({ where: { ownerId, contractId }, select: { roomId: true } });
      if (!scoped) return null;
      await this.lockRoom(tx, ownerId, scoped.roomId);
      await this.lockContract(tx, ownerId, contractId);
      const current = await tx.contract.findFirst({ where: { ownerId, contractId }, include: contractSummary });
      if (!current) return null;
      this.assertRevision(current.revision, expectedRevision);
      if (current.status !== "active") throw this.stateConflict("Chỉ hợp đồng active mới được thanh lý.");
      if (input.terminationDate < current.startDate || input.terminationDate > current.endDate) throw new ApiError(400, "VALIDATION_ERROR", "termination_date phải nằm trong thời hạn hợp đồng.");
      if (sqlDate(input.terminationDate) > contractBusinessDate(this.clock())) throw new ApiError(400, "VALIDATION_ERROR", "Ngày chấm dứt không được lớn hơn ngày hiện tại.");
      if (current.initialElectricKwh !== null && new Prisma.Decimal(input.finalElectricKwh).lessThan(current.initialElectricKwh)) throw new ApiError(400, "VALIDATION_ERROR", "Chỉ số điện cuối kỳ không được thấp hơn chỉ số ban đầu.");
      if (current.initialWaterM3 !== null && new Prisma.Decimal(input.finalWaterM3).lessThan(current.initialWaterM3)) throw new ApiError(400, "VALIDATION_ERROR", "Chỉ số nước cuối kỳ không được thấp hơn chỉ số ban đầu.");
      if (input.depositDeduction > current.depositAmount || input.depositSettlementAmount !== current.depositAmount - input.depositDeduction) throw new ApiError(400, "VALIDATION_ERROR", "Tiền quyết toán phải bằng tiền cọc trừ khoản khấu trừ hợp lệ.");
      const unpaid = await tx.invoice.findFirst({ where: { ownerId, contractId, status: "unpaid" }, select: { invoiceId: true } });
      if (unpaid) throw new ApiError(409, "CONTRACT_HAS_UNPAID_INVOICES", "Hợp đồng còn hóa đơn chưa thanh toán.");
      const futureOccupancy = await tx.roomResident.findFirst({ where: { ownerId, contractId, status: "active", startedAt: { gt: input.terminationDate } }, select: { occupancyId: true } });
      if (futureOccupancy) throw this.stateConflict("Cần xử lý cư trú bắt đầu sau ngày thanh lý trước khi kết thúc hợp đồng.");
      const affected = await tx.roomResident.findMany({ where: { ownerId, contractId, status: "active", startedAt: { lte: input.terminationDate } }, select: { residentId: true } });
      const revision = current.revision + 1;
      const dateTime = input.terminationDate;
      const contract = await tx.contract.update({ where: { contractId_ownerId: { contractId, ownerId } }, data: {
        status: "terminated", revision, terminationDate: input.terminationDate, terminationReason: input.terminationReason,
        finalElectricKwh: input.finalElectricKwh, finalWaterM3: input.finalWaterM3,
        depositDeduction: input.depositDeduction, depositSettlementAmount: input.depositSettlementAmount,
      }, include: contractSummary });
      await tx.roomResident.updateMany({ where: { ownerId, contractId, status: "active", startedAt: { lte: input.terminationDate } }, data: { status: "ended", endedAt: input.terminationDate } });
      for (const residentId of new Set(affected.map((row) => row.residentId))) {
        const remaining = await tx.roomResident.findFirst({ where: { ownerId, residentId, status: "active" }, select: { occupancyId: true } });
        await tx.resident.updateMany({ where: { ownerId, residentId }, data: { residenceStatus: remaining ? "living" : "left" } });
      }
      await tx.parkingSlotAssignment.updateMany({ where: { ownerId, contractId, status: "active", startedAt: { lte: input.terminationDate } }, data: { status: "ended", endedAt: input.terminationDate } });
      await tx.parkingSlotRequest.updateMany({ where: { ownerId, contractId, status: "pending" }, data: { status: "cancelled", reviewedAt: new Date(), reviewNote: "Hợp đồng đã kết thúc." } });
      await tx.amenitySubscription.updateMany({ where: { ownerId, contractId, status: { in: ["active", "cancellation_requested"] } }, data: { status: "contract_ended", effectiveEndAt: dateTime } });
      await tx.amenitySubscriptionCycle.updateMany({ where: { ownerId, contractId, status: "planned", cycleStart: { gte: dateTime } }, data: { status: "cancelled" } });
      await tx.contractChangeHistory.create({ data: {
        contractId, ownerId, changedByAccountId: actorId, revision, changeType: "status_transition",
        beforeData: { status: current.status, termination_date: null, termination_reason: null, final_electric_kwh: null, final_water_m3: null, deposit_deduction: null, deposit_settlement_amount: null },
        afterData: { status: "terminated", termination_date: input.terminationDate.toISOString().slice(0, 10), termination_reason: input.terminationReason, final_electric_kwh: input.finalElectricKwh, final_water_m3: input.finalWaterM3, deposit_deduction: input.depositDeduction.toString(), deposit_settlement_amount: input.depositSettlementAmount.toString() },
      } });
      return contract;
    });
  }

  async history(ownerId: bigint, contractId: bigint, page: number, pageSize: number) {
    if (!(await this.prisma.contract.findFirst({ where: { ownerId, contractId }, select: { contractId: true } }))) return null;
    const where = { ownerId, contractId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contractChangeHistory.findMany({ where, orderBy: [{ revision: "asc" }, { changeId: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { revision: true, changeType: true, changeReason: true, beforeData: true, afterData: true, changedByAccountId: true, createdAt: true } }),
      this.prisma.contractChangeHistory.count({ where }),
    ]);
    return { rows, total };
  }

  async listDocuments(ownerId: bigint, contractId: bigint, residentId?: bigint) {
    const whereContract: Prisma.ContractWhereInput = { ownerId, contractId, ...(residentId === undefined ? {} : { OR: [{ representativeResidentId: residentId }, { roomResidents: { some: { ownerId, residentId, contractId } } }] }) };
    const contract = await this.prisma.contract.findFirst({ where: whereContract, select: { contractId: true } });
    if (!contract) return null;
    return this.prisma.contractDocument.findMany({ where: { ownerId, contractId }, orderBy: [{ documentType: "asc" }, { version: "desc" }], select: documentPublicSelect });
  }

  async findDocument(ownerId: bigint, documentId: bigint, residentId?: bigint) {
    const row = await this.prisma.contractDocument.findFirst({ where: { ownerId, documentId }, select: { ...documentPublicSelect, contract: { select: { representativeResidentId: true, roomResidents: { where: { residentId, ownerId }, select: { occupancyId: true }, take: 1 } } } } });
    if (!row || (residentId !== undefined && row.contract.representativeResidentId !== residentId && !row.contract.roomResidents.length)) return null;
    const { contract: _contract, ...safe } = row;
    return safe;
  }

  async listMine(ownerId: bigint, residentId: bigint, page: number, pageSize: number, actorId?: bigint) {
    if (actorId !== undefined) await this.syncExpired(ownerId, actorId);
    const where: Prisma.ContractWhereInput = { ownerId, OR: [{ representativeResidentId: residentId }, { roomResidents: { some: { residentId, ownerId } } }] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({ where, include: residentContractSummary(ownerId, residentId), orderBy: [{ startDate: "desc" }, { contractId: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.contract.count({ where }),
    ]);
    return { rows, total };
  }

  private async lockRoom(tx: Tx, ownerId: bigint, roomId: bigint) {
    await tx.$queryRaw`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND room_id = ${roomId} FOR UPDATE`;
  }
  private async lockContract(tx: Tx, ownerId: bigint, contractId: bigint) {
    await tx.$queryRaw`SELECT contract_id FROM contracts WHERE owner_id = ${ownerId} AND contract_id = ${contractId} FOR UPDATE`;
  }
  private async assertNoOverlap(tx: Tx, ownerId: bigint, roomId: bigint, startDate: Date, endDate: Date, exceptId?: bigint) {
    const overlap = await tx.contract.findFirst({ where: { ownerId, roomId, status: "active", ...(exceptId ? { contractId: { not: exceptId } } : {}), startDate: { lte: endDate }, endDate: { gte: startDate } }, select: { contractId: true } });
    if (overlap) throw new ApiError(409, "CONTRACT_DATE_OVERLAP", "Thời hạn hợp đồng bị trùng với hợp đồng đang hiệu lực.");
  }
  private async assertCapacity(tx: Tx, ownerId: bigint, roomId: bigint, capacity: number) {
    const [room, pendingParkingRequests] = await Promise.all([
      tx.room.findFirst({ where: { ownerId, roomId }, select: { _count: { select: { roomResidents: { where: { status: "active" } }, parkingAssignments: { where: { status: "active" } } } } } }),
      tx.parkingSlotRequest.count({ where: { ownerId, roomId, status: "pending", expiresAt: { gt: new Date() } } }),
    ]);
    if (!room) return;
    if (room._count.roomResidents > capacity) throw new ApiError(409, "ROOM_CAPACITY_EXCEEDED", "Sức chứa hợp đồng thấp hơn số cư dân đang ở.");
    if (room._count.parkingAssignments + pendingParkingRequests > capacity) throw new ApiError(409, "PARKING_CAPACITY_EXCEEDED", "Sức chứa hợp đồng thấp hơn số đăng ký và yêu cầu gửi xe đang hoạt động.");
  }
  private assertDates(start: Date, end: Date) { if (end <= start) throw new ApiError(400, "VALIDATION_ERROR", "end_date phải sau start_date."); }
  private assertRevision(actual: number, expected: number | undefined) { if (expected === undefined || actual !== expected) throw new ApiError(409, "CONTRACT_REVISION_CONFLICT", "Hợp đồng đã được cập nhật; hãy tải lại trước khi tiếp tục."); }
  private stateConflict(message: string) { return new ApiError(409, "CONFLICT", message); }

  private inTransaction<T>(transaction: Tx | undefined, work: (tx: Tx) => Promise<T>): Promise<T> {
    if (transaction) return work(transaction);
    return this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

const documentPublicSelect = { documentId: true, contractId: true, propertyId: true, ownerId: true, fileName: true, mimeType: true, fileSize: true, documentType: true, version: true, checksumSha256: true, status: true, uploadedByAccountId: true, signedAt: true, signatureProvider: true, signatureReference: true, createdAt: true, updatedAt: true } satisfies Prisma.ContractDocumentSelect;

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Prisma.Decimal) { try { return new Prisma.Decimal(b as string | number).equals(a); } catch { return false; } }
  if (typeof a === "bigint" && typeof b === "bigint") return a === b;
  return a === b;
}
function snapshot(keys: Record<string, unknown>, contract: Record<string, any>): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const key of Object.keys(keys)) {
    const value = contract[key];
    const safe = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "bigint" ? value.toString() : value instanceof Prisma.Decimal ? value.toString() : value;
    out[snake(key)] = safe as Prisma.InputJsonValue;
  }
  return out as Prisma.InputJsonObject;
}
function activationSnapshot(contract: Record<string, any>) {
  return {
    contract_no: contract.contractNo, room_id: contract.roomId.toString(), representative_resident_id: contract.representativeResidentId.toString(),
    ...(contract.previousContractId === null ? {} : { previous_contract_id: contract.previousContractId.toString() }),
    start_date: contract.startDate.toISOString().slice(0, 10), end_date: contract.endDate.toISOString().slice(0, 10),
    rent_amount: contract.rentAmount.toString(), deposit_amount: contract.depositAmount.toString(), resident_capacity: contract.residentCapacity,
    initial_electric_kwh: contract.initialElectricKwh?.toString() ?? null, initial_water_m3: contract.initialWaterM3?.toString() ?? null, status: "active",
  };
}
function snake(value: string) { return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
