import type { Prisma } from "@prisma/client";

export function utcStartOfToday(now = new Date()): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function currentContractWhere(today = utcStartOfToday()): Prisma.ContractWhereInput {
  return { status: "active", startDate: { lte: today }, endDate: { gte: today } };
}

export function activeOccupancyWhere(): Prisma.RoomResidentWhereInput {
  return { status: "active" };
}

/** Shared effective-availability predicate for discovery, contact and public image delivery. */
export function publicAvailableRoomWhere(today = utcStartOfToday()): Prisma.RoomWhereInput {
  return {
    isActive: true,
    isPublic: true,
    status: { not: "inactive" },
    property: { status: "active" },
    NOT: {
      OR: [
        { contracts: { some: currentContractWhere(today) } },
        { roomResidents: { some: activeOccupancyWhere() } },
      ],
    },
  };
}
