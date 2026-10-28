import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { illustrativeRoomImageKeys } from "../src/room-images/illustrative-room-image-keys.js";
import { LocalRoomImageStorage } from "../src/room-images/storage.js";
import { validateImage } from "../src/room-images/validation.js";

dotenv.config({ path: "../.env.neon", override: true });

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Neon connection is not configured.");
const parsedUrl = new URL(url);
if (!parsedUrl.hostname.endsWith(".neon.tech") || process.env.NEON_BRANCH !== "production" || parsedUrl.pathname !== "/neondb") {
  throw new Error("Refusing to write outside the verified shared Neon production neondb.");
}

const roomId = 6;
const expectedKey = "room-images/2026/6ff23546-9613-4d5d-b59e-2a1322b733b3.jpg";
const galleryKeys = [
  expectedKey,
  "room-images/2026/506d2814-5feb-4b89-b18e-7f5435c4c2aa.jpg",
  "room-images/2026/e4076e0f-5f7d-4259-8692-860d9eb196af.jpg",
  "room-images/2026/e186e662-3eb4-45cf-ae93-ffd7e3500b5e.jpg",
  "room-images/2026/55a44383-75c9-4410-9d70-398ff5fb4bc0.jpg",
];
const allowedKeys = illustrativeRoomImageKeys;
if (galleryKeys.some((key) => !allowedKeys.has(key))) throw new Error("Gallery includes an image not approved as illustrative.");

const storage = new LocalRoomImageStorage();
for (const key of galleryKeys) await validateImage(await storage.get(key), "image/jpeg", path.basename(key));

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 12_000 });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await client.query("SELECT pg_advisory_xact_lock(29471029, 6305)");
  const target = await client.query(`
    SELECT current_database() database,current_setting('neon.branch_id',true) branch_id,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') table_count
  `);
  if (target.rows[0]?.database !== "neondb" || target.rows[0]?.branch_id !== "br-spring-frog-a1rqjhvq" || target.rows[0]?.table_count !== 47) {
    throw new Error("Exact V1.16 shared-dev production target verification failed.");
  }

  const room = await client.query(`
    SELECT r.room_id,r.owner_id,r.property_id,r.room_code,p.name property_name
    FROM rooms r JOIN properties p ON p.property_id=r.property_id
    WHERE r.room_id=$1 AND r.room_code='A05' AND p.name='An Bình Biên Hòa'
      AND r.is_public=true AND r.is_active=true AND r.status='available' AND p.status='active'
    FOR UPDATE OF r
  `, [roomId]);
  if (room.rowCount !== 1) throw new Error("The expected public and available A05 Room was not found.");

  const current = await client.query(`SELECT room_image_id,is_cover,sort_order,storage_key FROM room_images WHERE room_id=$1 ORDER BY sort_order,room_image_id`, [roomId]);
  const rows = current.rows;
  const isOriginal = rows.length === 1 && rows[0].is_cover && Number(rows[0].sort_order) === 1 && rows[0].storage_key === expectedKey;
  const alreadyComplete = rows.length === galleryKeys.length && rows.every((row, index) => row.storage_key === galleryKeys[index] && Number(row.sort_order) === index + 1 && row.is_cover === (index === 0));
  if (!isOriginal && !alreadyComplete) throw new Error("Room A05 gallery changed from the known one-cover state; refusing to overwrite it.");

  if (isOriginal) {
    for (const [index, key] of galleryKeys.slice(1).entries()) {
      await client.query(`INSERT INTO room_images(room_id,storage_key,is_cover,sort_order) VALUES($1,$2,false,$3)`, [roomId, key, index + 2]);
    }
  }

  const verified = await client.query(`SELECT room_image_id,is_cover,sort_order,storage_key FROM room_images WHERE room_id=$1 ORDER BY sort_order,room_image_id`, [roomId]);
  if (!alreadyComplete && (verified.rowCount !== galleryKeys.length || verified.rows.some((row, index) => row.storage_key !== galleryKeys[index] || Number(row.sort_order) !== index + 1 || row.is_cover !== (index === 0)))) {
    throw new Error("Room A05 gallery verification failed; rolling back.");
  }
  if (apply) await client.query("COMMIT");
  else await client.query("ROLLBACK");
  console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY_RUN_ROLLED_BACK", target: "Neon shared-dev production / neondb", property: room.rows[0].property_name, room_code: room.rows[0].room_code, images: verified.rowCount, new_images: alreadyComplete ? 0 : 4, all_marked_illustrative: true, storage_keys_exposed: false }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`ROOM_GALLERY_FAILED; transaction rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
