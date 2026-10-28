import { Prisma, type PrismaClient } from "@prisma/client";
import type { ResidentCreate } from "./resident.validation.js";
import { illustrativeRoomImageKeys } from "../room-images/illustrative-room-image-keys.js";

export type ResidentFilters = { page: number; page_size: number; residenceStatus?: string; registrationStatus?: string; propertyId?: bigint; roomId?: bigint };
const activeOn = (date: Date): Prisma.ContractWhereInput => ({ status: "active", startDate: { lte: date }, endDate: { gte: date } });
function retryable(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"; }
export function resolveOccupancyCapacity(contractCapacity: number | null, roomDefaultCapacity: number): number {
  return contractCapacity ?? roomDefaultCapacity;
}

export class PrismaResidentOccupancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }); }
      catch (error) { if (!retryable(error) || attempt >= 2) throw error; }
    }
  }

  async listResidents(ownerId: bigint, filters: ResidentFilters) {
    const where: Prisma.ResidentWhereInput = {
      ownerId, archivedAt: null,
      ...(filters.residenceStatus ? { residenceStatus: filters.residenceStatus } : {}),
      ...(filters.registrationStatus ? { residenceRegistrationStatus: filters.registrationStatus } : {}),
      ...((filters.propertyId || filters.roomId) ? { roomResidents: { some: { status: "active", ownerId, ...(filters.propertyId ? { propertyId: filters.propertyId } : {}), ...(filters.roomId ? { roomId: filters.roomId } : {}) } } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.resident.findMany({ where, orderBy: [{ fullName: "asc" }, { residentId: "asc" }], skip: (filters.page - 1) * filters.page_size, take: filters.page_size, include: { roomResidents: { where: { status: "active" }, orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }], include: { room: { include: { property: { select: { propertyId: true, name: true } } } }, contract: { select: { contractId: true, contractNo: true, residentCapacity: true, status: true, startDate: true, endDate: true } } } } } }),
      this.prisma.resident.count({ where }),
    ]);
    return { rows, total };
  }

  async createResident(ownerId: bigint, data: ResidentCreate) {
    return this.prisma.resident.create({ data: { ...data, ownerId, residenceStatus: "left" } });
  }

  async searchResident(ownerId: bigint, nationalId: string) {
    return this.prisma.resident.findFirst({ where: { ownerId, nationalId } });
  }

  async findResident(ownerId: bigint, residentId: bigint) {
    return this.prisma.resident.findFirst({ where: { ownerId, residentId }, include: { roomResidents: { orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }], include: { room: { include: { property: { select: { propertyId: true, name: true, province: true, address: true } } } }, contract: { select: { contractId: true, contractNo: true, representativeResidentId: true, startDate: true, endDate: true, status: true, residentCapacity: true } } } } } });
  }

  async updateResident(ownerId: bigint, residentId: bigint, data: Prisma.ResidentUncheckedUpdateInput) {
    return this.serializable(async (tx) => {
      const found = await tx.resident.findFirst({ where: { ownerId, residentId }, select: { residentId: true } });
      if (!found) return null;
      if (data.nationalId !== undefined && data.nationalId !== null) {
        const duplicate = await tx.resident.findFirst({ where: { ownerId, residentId: { not: residentId }, nationalId: data.nationalId as string }, select: { residentId: true } });
        if (duplicate) return "duplicate" as const;
      }
      return tx.resident.update({ where: { residentId_ownerId: { residentId, ownerId } }, data });
    });
  }

  async archiveResident(ownerId: bigint, residentId: bigint) {
    return this.serializable(async (tx) => {
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId }, select: { residentId: true, archivedAt: true, roomResidents: { where: { status: "active" }, select: { occupancyId: true }, take: 1 }, representativeContracts: { where: { status: "active" }, select: { contractId: true }, take: 1 } } });
      if (!resident) return "missing" as const;
      if (resident.archivedAt) return resident;
      if (resident.roomResidents.length || resident.representativeContracts.length) return "conflict" as const;
      return tx.resident.update({ where: { residentId_ownerId: { residentId, ownerId } }, data: { archivedAt: new Date() } });
    });
  }

  async listRoomResidents(ownerId: bigint, roomId: bigint) {
    const room = await this.prisma.room.findFirst({ where: { ownerId, roomId }, select: { roomId: true } });
    if (!room) return null;
    const rows = await this.prisma.roomResident.findMany({ where: { ownerId, roomId }, orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }], include: { resident: true, contract: { select: { contractId: true, contractNo: true, status: true, startDate: true, endDate: true, residentCapacity: true } } } });
    return { rows };
  }

  private async lockRooms(tx: Prisma.TransactionClient, roomIds: bigint[]) {
    for (const roomId of [...new Set(roomIds)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
      await tx.$queryRaw`SELECT room_id FROM rooms WHERE room_id = ${roomId} FOR UPDATE`;
    }
  }

  private async roomAndCapacity(tx: Prisma.TransactionClient, ownerId: bigint, roomId: bigint, date: Date, contractId: bigint | null) {
    const room = await tx.room.findFirst({ where: { ownerId, roomId, property: { status: { not: "archived" } } }, select: { roomId: true, propertyId: true, defaultCapacity: true, isActive: true } });
    if (!room || !room.isActive) return null;
    const contract = contractId ? await tx.contract.findFirst({ where: { ownerId, roomId, contractId, ...activeOn(date) }, select: { contractId: true, propertyId: true, residentCapacity: true } }) : await tx.contract.findFirst({ where: { ownerId, roomId, ...activeOn(date) }, orderBy: [{ startDate: "desc" }, { contractId: "desc" }], select: { contractId: true, propertyId: true, residentCapacity: true } });
    if (contractId && !contract) return { missingContract: true as const };
    return { room, contract, propertyId: room.propertyId, capacity: resolveOccupancyCapacity(contract?.residentCapacity ?? null, room.defaultCapacity) };
  }

  async addOccupancy(ownerId: bigint, roomId: bigint, residentId: bigint, contractId: bigint | null, startedAt: Date) {
    return this.serializable(async (tx) => {
      await this.lockRooms(tx, [roomId]);
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId, archivedAt: null }, select: { residentId: true } });
      if (!resident) return "missing-resident" as const;
      const target = await this.roomAndCapacity(tx, ownerId, roomId, startedAt, contractId);
      if (!target || "missingContract" in target) return target ? "missing-contract" as const : "missing-room" as const;
      const duplicate = await tx.roomResident.findFirst({ where: { ownerId, roomId, residentId, status: "active" }, select: { occupancyId: true } });
      if (duplicate) return "duplicate" as const;
      const count = await tx.roomResident.count({ where: { ownerId, roomId, status: "active", startedAt: { lte: startedAt } } });
      if (count >= target.capacity) return "capacity" as const;
      const result = await tx.roomResident.create({ data: { ownerId, propertyId: target.propertyId, roomId, residentId, contractId: target.contract?.contractId ?? null, startedAt } });
      await tx.resident.update({ where: { residentId_ownerId: { residentId, ownerId } }, data: { residenceStatus: "living" } });
      return result;
    });
  }

  async endOccupancy(ownerId: bigint, occupancyId: bigint, endedAt: Date) {
    return this.serializable(async (tx) => {
      const row = await tx.roomResident.findFirst({ where: { ownerId, occupancyId }, select: { occupancyId: true, residentId: true, roomId: true, startedAt: true, endedAt: true, status: true } });
      if (!row) return "missing" as const;
      if (row.status === "ended") return "ended" as const;
      if (endedAt < row.startedAt) return "date" as const;
      const ended = await tx.roomResident.update({ where: { occupancyId }, data: { endedAt, status: "ended" } });
      const remaining = await tx.roomResident.count({ where: { ownerId, residentId: row.residentId, status: "active" } });
      await tx.resident.update({ where: { residentId_ownerId: { residentId: row.residentId, ownerId } }, data: { residenceStatus: remaining > 0 ? "living" : "left" } });
      return ended;
    });
  }

  async transfer(ownerId: bigint, residentId: bigint, sourceOccupancyId: bigint, roomId: bigint, contractId: bigint | null, startedAt: Date) {
    return this.serializable(async (tx) => {
      const source = await tx.roomResident.findFirst({ where: { occupancyId: sourceOccupancyId, ownerId, residentId, status: "active" }, select: { occupancyId: true, roomId: true, startedAt: true } });
      if (!source) return "missing-source" as const;
      if (startedAt < source.startedAt) return "date" as const;
      if (source.roomId === roomId) return "duplicate" as const;
      await this.lockRooms(tx, [source.roomId, roomId]);
      const resident = await tx.resident.findFirst({ where: { residentId, ownerId, archivedAt: null }, select: { residentId: true } });
      if (!resident) return "missing-resident" as const;
      const target = await this.roomAndCapacity(tx, ownerId, roomId, startedAt, contractId);
      if (!target || "missingContract" in target) return target ? "missing-contract" as const : "missing-room" as const;
      const duplicate = await tx.roomResident.findFirst({ where: { ownerId, roomId, residentId, status: "active" }, select: { occupancyId: true } });
      if (duplicate) return "duplicate" as const;
      const count = await tx.roomResident.count({ where: { ownerId, roomId, status: "active", startedAt: { lte: startedAt } } });
      if (count >= target.capacity) return "capacity" as const;
      await tx.roomResident.update({ where: { occupancyId: sourceOccupancyId }, data: { endedAt: startedAt, status: "ended" } });
      const destination = await tx.roomResident.create({ data: { ownerId, propertyId: target.propertyId, roomId, residentId, contractId: target.contract?.contractId ?? null, startedAt } });
      await tx.resident.update({ where: { residentId_ownerId: { residentId, ownerId } }, data: { residenceStatus: "living" } });
      return { sourceOccupancyId, destination };
    });
  }

  async meRental(ownerId: bigint, residentId: bigint) {
    const resident = await this.prisma.resident.findFirst({
      where: { ownerId, residentId, archivedAt: null },
      include: {
        roomResidents: {
          where: { ownerId }, orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }],
          include: {
            room: { include: { property: { select: { propertyId: true, name: true, province: true, address: true } }, images: { orderBy: [{ sortOrder: "asc" }, { roomImageId: "asc" }], select: { roomImageId: true, storageKey: true, isCover: true, sortOrder: true } } } },
            contract: { select: { contractId: true, contractNo: true, representativeResidentId: true, startDate: true, endDate: true, status: true, residentCapacity: true } },
          },
        },
        representativeContracts: {
          orderBy: [{ startDate: "desc" }, { contractId: "desc" }], take: 20,
          select: { contractId: true, contractNo: true, roomId: true, propertyId: true, startDate: true, endDate: true, status: true, residentCapacity: true, representativeResidentId: true },
        },
      },
    });
    if (!resident) return null;
    const occupancies = resident.roomResidents.map((occupancy) => {
      const { images, ...room } = occupancy.room;
      const toSafeImage = (image: typeof images[number]) => ({
        roomImageId: image.roomImageId,
        isCover: image.isCover,
        sortOrder: image.sortOrder,
        isIllustrative: illustrativeRoomImageKeys.has(image.storageKey),
      });
      const cover = images.find((image) => image.isCover) ?? images[0];
      return { ...occupancy, room: { ...room, images: images.map(toSafeImage), coverImage: cover ? toSafeImage(cover) : null } };
    });
    // The included Resident carries a duplicate occupancy relation. Reuse the sanitized rows there too,
    // otherwise the selected image storageKey fields could escape through resident.roomResidents.
    const safeResident = { ...resident, roomResidents: occupancies };
    return { resident: safeResident, occupancies, representativeContracts: resident.representativeContracts };
  }
}
