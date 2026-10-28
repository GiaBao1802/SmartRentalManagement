import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaRoomImageRepository } from "../src/room-images/room-image.repository.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.neon") });
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("Missing DATABASE_URL_UNPOOLED in root .env.neon.");
const url = new URL(databaseUrl);
if (url.hostname !== "ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") {
  throw new Error("Refusing to write: target is not the verified Neon shared-dev neondb endpoint.");
}

const OWNER_ID = 6n;
const PROPERTY_ID = 12n;
const EXPECTED_PUBLIC_ROOMS = 85;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const repository = new PrismaRoomImageRepository(prisma);

async function main() {
  const target = await prisma.$queryRaw<Array<{ database: string; branchId: string }>>`SELECT current_database() AS database, current_setting('neon.branch_id', true) AS "branchId"`;
  if (target[0]?.database !== "neondb" || target[0]?.branchId !== "br-spring-frog-a1rqjhvq") throw new Error("Refusing to write: Neon branch/database is not the verified shared-dev target.");

  const privateDemoRooms = await prisma.room.findMany({
    where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, isPublic: false },
    select: { images: { select: { storageKey: true } } },
  });
  const privateKeys = new Set(privateDemoRooms.flatMap((room) => room.images.map((image) => image.storageKey)));
  if (privateDemoRooms.length !== 15) throw new Error(`Expected Owner 6's 15 private demo rooms; found ${privateDemoRooms.length}. No changes made.`);
  if (process.argv.includes("--list-private-image-keys")) {
    const keys = await prisma.roomImage.findMany({
      where: { room: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, isPublic: false } },
      orderBy: [{ roomImageId: "asc" }], distinct: ["storageKey"], select: { storageKey: true }, take: 6,
    });
    console.log(JSON.stringify({ target: "Neon shared-dev production / neondb", illustrativeStorageKeys: keys.map((row) => row.storageKey) }));
    return;
  }

  const rooms = await prisma.room.findMany({
    where: { isPublic: true, isActive: true, status: "available", property: { status: "active" } },
    orderBy: [{ roomId: "asc" }],
    select: { roomId: true, ownerId: true, propertyId: true, roomCode: true, images: { select: { roomImageId: true, storageKey: true, isCover: true } } },
  });
  const sourceKeys = [...new Set(rooms.flatMap((room) => room.images.map((image) => image.storageKey)))];
  if (rooms.length !== EXPECTED_PUBLIC_ROOMS || sourceKeys.length !== 6 || rooms.some((room) => room.images.length !== 1 || !room.images[0]!.isCover || !privateKeys.has(room.images[0]!.storageKey))) {
    throw new Error("Expected exactly one known demo cover on each of the 85 eligible public rooms; no changes made.");
  }

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ result: "dry_run_passed", target: "Neon shared-dev production / neondb", publicRooms: rooms.length, publicDemoCoversToRemove: rooms.length, privateOwner6RoomsPreserved: privateDemoRooms.length, storageObjectsPreserved: sourceKeys.length, illustrativeStorageKeys: sourceKeys }));
    return;
  }

  let removed = 0;
  for (const room of rooms) {
    const image = room.images[0]!;
    const result = await repository.remove(room.ownerId, room.propertyId, room.roomId, image.roomImageId);
    if (result === "missing" || result.cleanupKey !== null) throw new Error(`Stopped after ${removed} removals: unexpected image reference state for Room ${room.roomCode}. Inspect before retrying; image objects are preserved.`);
    removed++;
  }

  const publicCoversRemaining = await prisma.room.count({ where: { isPublic: true, isActive: true, status: "available", property: { status: "active" }, images: { some: { isCover: true } } } });
  const privateImageCount = await prisma.roomImage.count({ where: { room: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, isPublic: false } } });
  if (removed !== EXPECTED_PUBLIC_ROOMS || publicCoversRemaining !== 0 || privateImageCount !== 15) throw new Error(`Post-check mismatch: removed=${removed}, public covers remaining=${publicCoversRemaining}, private images=${privateImageCount}.`);
  console.log(JSON.stringify({ result: "removed_public_demo_associations", target: "Neon shared-dev production / neondb", removed, publicCoversRemaining, privateOwner6ImagesPreserved: privateImageCount, storageObjectsPreserved: sourceKeys.length }));
}

try { await main(); } finally { await prisma.$disconnect(); }
