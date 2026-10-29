import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { PrismaPublicMarketplaceRepository } from "./public-marketplace.repository.js";

test("public room query requires every selected active shared facility on the same Property", async () => {
  let roomQuery: any;
  const prisma = {
    room: {
      findMany: async (args: any) => { roomQuery = args; return []; },
      count: async () => 0,
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient;
  const repository = new PrismaPublicMarketplaceRepository(prisma);
  await repository.listPublicRooms({
    page: 1, page_size: 12, sort: "newest", property_facilities: ["Hồ bơi", "Sân bóng đá"],
  });

  assert.deepEqual(roomQuery.where.property.AND, [
    { propertyFacilities: { some: { active: true, name: { equals: "Hồ bơi", mode: "insensitive" } } } },
    { propertyFacilities: { some: { active: true, name: { equals: "Sân bóng đá", mode: "insensitive" } } } },
  ]);
});

test("public facility option query excludes inactive facilities and Properties without public rooms", async () => {
  let facilityQuery: any;
  const prisma = {
    propertyFacility: { findMany: async (args: any) => { facilityQuery = args; return [{ name: "Hồ bơi" }, { name: "Hồ bơi" }, { name: "Sân bóng đá" }]; } },
  } as unknown as PrismaClient;
  const repository = new PrismaPublicMarketplaceRepository(prisma);

  assert.deepEqual(await repository.listPublicPropertyFacilities(), ["Hồ bơi", "Sân bóng đá"]);
  assert.deepEqual(facilityQuery.where, {
    active: true,
    property: { status: "active", rooms: { some: (await import("../properties/room-status.js")).publicAvailableRoomWhere() } },
  });
});
