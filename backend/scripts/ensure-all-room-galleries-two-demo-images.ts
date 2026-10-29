import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { illustrativeRoomImageKeys } from "../src/room-images/illustrative-room-image-keys.js";
import { LocalRoomImageStorage } from "../src/room-images/storage.js";
import { validateImage } from "../src/room-images/validation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.neon") });

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("Missing DATABASE_URL_UNPOOLED in root .env.neon.");
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech" || parsed.pathname !== "/neondb" || process.env.NEON_BRANCH !== "production") {
  throw new Error("Refusing to use a database other than the verified Neon shared-dev production neondb.");
}

const EXPECTED_ROOMS = 115;
const EXPECTED_OWNER_IDS = new Set([6, 7, 8, 9, 10]);
const keys = [...illustrativeRoomImageKeys];
if (keys.length !== 6) throw new Error("The approved illustrative asset allowlist changed; review it before proceeding.");
const storage = new LocalRoomImageStorage();
for (const key of keys) await validateImage(await storage.get(key), "image/jpeg", "illustrative-room.jpg");

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
async function run() {
try {
  const target = await prisma.$queryRaw<Array<{ database: string; branchId: string; tableCount: number; walLsn: string }>>`
    SELECT current_database() AS database,
      current_setting('neon.branch_id', true) AS "branchId",
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS "tableCount",
      pg_current_wal_lsn()::text AS "walLsn"
  `;
  if (target[0]?.database !== "neondb" || target[0]?.branchId !== "br-spring-frog-a1rqjhvq" || target[0]?.tableCount !== 47) {
    throw new Error("Exact V1.16 shared-dev production target verification failed.");
  }

  const roomRows = await prisma.$queryRaw<Array<{ roomId: number; ownerId: number; imageCount: number; coverCount: number; distinctKeys: number; maxSortOrder: number | null; minSortOrder: number | null }>>`
    SELECT r.room_id::int AS "roomId", r.owner_id::int AS "ownerId",
      count(ri.room_image_id)::int AS "imageCount",
      count(ri.room_image_id) FILTER (WHERE ri.is_cover)::int AS "coverCount",
      count(DISTINCT ri.storage_key)::int AS "distinctKeys",
      max(ri.sort_order)::int AS "maxSortOrder",min(ri.sort_order)::int AS "minSortOrder"
    FROM rooms r LEFT JOIN room_images ri ON ri.room_id=r.room_id
    GROUP BY r.room_id,r.owner_id ORDER BY r.room_id
  `;
  const ownerIds = new Set(roomRows.map((row) => row.ownerId));
  if (roomRows.length !== EXPECTED_ROOMS || roomRows[0]?.roomId !== 2 || roomRows.at(-1)?.roomId !== 116 ||
      [...ownerIds].some((ownerId) => !EXPECTED_OWNER_IDS.has(ownerId)) || [...EXPECTED_OWNER_IDS].some((ownerId) => !ownerIds.has(ownerId))) {
    throw new Error(`Expected demo inventory mismatch (rooms=${roomRows.length}, ids=${roomRows[0]?.roomId ?? "none"}-${roomRows.at(-1)?.roomId ?? "none"}, owners=${[...ownerIds].join(",")}, missingOwners=${[...EXPECTED_OWNER_IDS].filter((id) => !ownerIds.has(id)).join(",")}, unexpectedOwners=${[...ownerIds].filter((id) => !EXPECTED_OWNER_IDS.has(id)).join(",")}); refusing broad write.`);
  }
  if (roomRows.some((row) => row.imageCount > 5 || row.distinctKeys !== row.imageCount || row.coverCount > 1 ||
      (row.imageCount > 0 && (row.coverCount !== 1 || row.minSortOrder !== 1 || row.maxSortOrder !== row.imageCount)))) {
    throw new Error("A Room has an invalid gallery count, duplicate image, or cover state; refusing to modify galleries.");
  }

  const deficient = roomRows.filter((row) => row.imageCount < 2);
  const additions = deficient.reduce((sum, row) => sum + 2 - row.imageCount, 0);
  if (!apply) {
    console.log(JSON.stringify({ result: "dry_run_passed", target: "Neon shared-dev production / neondb", rooms: roomRows.length,
      roomsAlreadyAtLeastTwo: roomRows.length - deficient.length, roomsNeedingImages: deficient.length,
      illustrativeImagesToAdd: additions, minimumAfterApply: 2, maximumRoomGallery: 5,
      snapshotBranch: "goctro-all-room-galleries-backup-20261029", snapshotId: "br-bitter-pond-a1ku9kc0",
      snapshotParentLsn: "0/2403BB0", productionLsn: target[0].walLsn, labelRequired: "Ảnh minh họa", storageKeysExposed: false }));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DO $$ BEGIN PERFORM pg_advisory_xact_lock(29471029, 6315); END $$`;
    await tx.$queryRaw`SELECT room_id FROM rooms ORDER BY room_id FOR UPDATE`;
    const locked = await tx.$queryRaw<Array<{ roomId: number; ownerId: number; imageCount: number; maxSortOrder: number | null; minSortOrder: number | null }>>`
      SELECT r.room_id::int AS "roomId",r.owner_id::int AS "ownerId",count(ri.room_image_id)::int AS "imageCount",
        max(ri.sort_order)::int AS "maxSortOrder",min(ri.sort_order)::int AS "minSortOrder"
      FROM rooms r LEFT JOIN room_images ri ON ri.room_id=r.room_id
      GROUP BY r.room_id,r.owner_id ORDER BY r.room_id
    `;
    if (locked.length !== roomRows.length || locked.some((row, index) => row.roomId !== roomRows[index]?.roomId || row.ownerId !== roomRows[index]?.ownerId ||
        row.imageCount !== roomRows[index]?.imageCount || row.maxSortOrder !== roomRows[index]?.maxSortOrder || row.minSortOrder !== roomRows[index]?.minSortOrder)) {
      throw new Error("Room inventory/gallery changed after dry-run; no writes committed.");
    }

    for (const room of roomRows) {
      let imageCount = room.imageCount;
      let probe = 0;
      while (imageCount < 2) {
        const key = keys[(room.roomId + probe) % keys.length]!;
        const existing = await tx.roomImage.findFirst({ where: { roomId: room.roomId, storageKey: key }, select: { roomImageId: true } });
        probe++;
        if (existing) continue;
        await tx.roomImage.create({ data: { roomId: room.roomId, storageKey: key, isCover: imageCount === 0, sortOrder: imageCount + 1 } });
        imageCount++;
      }
    }

    const after = await tx.$queryRaw<Array<{ rooms: number; minImages: number; maxImages: number; invalidCovers: number; totalImages: number }>>`
      SELECT count(*)::int AS rooms,min(image_count)::int AS "minImages",max(image_count)::int AS "maxImages",
        count(*) FILTER (WHERE cover_count<>1)::int AS "invalidCovers",sum(image_count)::int AS "totalImages"
      FROM (SELECT r.room_id,count(ri.room_image_id)::int AS image_count,count(ri.room_image_id) FILTER (WHERE ri.is_cover)::int AS cover_count
        FROM rooms r LEFT JOIN room_images ri ON ri.room_id=r.room_id GROUP BY r.room_id) galleries
    `;
    if (after[0]?.rooms !== EXPECTED_ROOMS || (after[0]?.minImages ?? 0) < 2 || after[0]?.maxImages! > 5 || after[0]?.invalidCovers !== 0) {
      throw new Error("Post-write gallery validation failed; transaction will roll back.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });

  const verify = await prisma.$queryRaw<Array<{ rooms: number; minImages: number; maxImages: number; invalidCovers: number; totalImages: number; illustrativeImages: number }>>`
    SELECT count(*)::int AS rooms,min(image_count)::int AS "minImages",max(image_count)::int AS "maxImages",
      count(*) FILTER (WHERE cover_count<>1)::int AS "invalidCovers",sum(image_count)::int AS "totalImages",
      (SELECT count(*)::int FROM room_images WHERE storage_key=ANY(${keys}::text[])) AS "illustrativeImages"
    FROM (SELECT r.room_id,count(ri.room_image_id)::int AS image_count,count(ri.room_image_id) FILTER (WHERE ri.is_cover)::int AS cover_count
      FROM rooms r LEFT JOIN room_images ri ON ri.room_id=r.room_id GROUP BY r.room_id) galleries
  `;
  if (verify[0]?.rooms !== EXPECTED_ROOMS || (verify[0]?.minImages ?? 0) < 2 || verify[0]?.maxImages! > 5 || verify[0]?.invalidCovers !== 0) {
    throw new Error("Committed gallery verification failed.");
  }
  console.log(JSON.stringify({ result: "all_room_galleries_verified", target: "Neon shared-dev production / neondb", ...verify[0],
    illustrativeImagesWereAdded: additions, labelRequired: "Ảnh minh họa", storageKeysExposed: false }));
} finally {
  await prisma.$disconnect();
}
}

await run();
