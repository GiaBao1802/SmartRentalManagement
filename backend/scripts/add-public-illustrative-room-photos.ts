import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaRoomImageRepository } from "../src/room-images/room-image.repository.js";
import { illustrativeRoomImageKeys } from "../src/room-images/illustrative-room-image-keys.js";
import { LocalRoomImageStorage } from "../src/room-images/storage.js";
import { validateImage } from "../src/room-images/validation.js";

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
const storage = new LocalRoomImageStorage();
const repository = new PrismaRoomImageRepository(prisma);

async function main() {
  const target = await prisma.$queryRaw<Array<{ database: string; branchId: string }>>`SELECT current_database() AS database, current_setting('neon.branch_id', true) AS "branchId"`;
  if (target[0]?.database !== "neondb" || target[0]?.branchId !== "br-spring-frog-a1rqjhvq") throw new Error("Refusing to write: Neon branch/database is not the verified shared-dev target.");

  const keys = [...illustrativeRoomImageKeys];
  const privateRows = await prisma.roomImage.findMany({ where: { room: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, isPublic: false } }, select: { storageKey: true } });
  const availablePrivateKeys = new Set(privateRows.map((row) => row.storageKey));
  if (privateRows.length !== 15 || keys.length !== 6 || keys.some((key) => !availablePrivateKeys.has(key))) throw new Error("The expected 15 private Owner 6 fixture associations and six allowlisted illustrative files must exist.");
  for (const key of keys) await validateImage(await storage.get(key), "image/jpeg", "photo.jpg");

  const rooms = await prisma.room.findMany({
    where: { isPublic: true, isActive: true, status: "available", property: { status: "active" } },
    orderBy: [{ roomId: "asc" }],
    select: { roomId: true, ownerId: true, propertyId: true, roomCode: true, images: { select: { roomImageId: true, storageKey: true, isCover: true } } },
  });
  if (rooms.length !== EXPECTED_PUBLIC_ROOMS || rooms.some((room) => room.images.length !== 0)) throw new Error("Expected exactly 85 eligible public rooms with no image associations. No writes made.");
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ result: "dry_run_passed", target: "Neon shared-dev production / neondb", publicRooms: rooms.length, coversToAttach: rooms.length, distinctIllustrativeImages: keys.length, labelRequired: "Ảnh minh họa" }));
    return;
  }

  let attached = 0;
  for (const [index, room] of rooms.entries()) {
    const result = await repository.add(room.ownerId, room.propertyId, room.roomId, keys[index % keys.length]!);
    if (result === "missing" || result === "limit") throw new Error(`Stopped after ${attached} attachments: Room ${room.roomCode} returned ${result}. Rerun only after inspecting the partial result.`);
    attached++;
  }
  const check = await prisma.room.count({ where: { isPublic: true, isActive: true, status: "available", property: { status: "active" }, images: { some: { isCover: true } } } });
  const demoCount = await prisma.roomImage.count({ where: { storageKey: { in: keys }, isCover: true, room: { isPublic: true, isActive: true, status: "available", property: { status: "active" } } } });
  if (check !== EXPECTED_PUBLIC_ROOMS || demoCount !== EXPECTED_PUBLIC_ROOMS) throw new Error(`Post-check mismatch: publicCovers=${check}, illustrativeCovers=${demoCount}.`);
  console.log(JSON.stringify({ result: "attached_illustrative_public_covers", target: "Neon shared-dev production / neondb", attached, publicCoversVerified: check, illustrativeCoversVerified: demoCount, badgeRequired: "Ảnh minh họa" }));
}

try { await main(); } finally { await prisma.$disconnect(); }
