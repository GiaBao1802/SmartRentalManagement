import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { ApiError } from "../middleware/api-error.js";
import { RoomImageService } from "./room-image.service.js";
import { assertStorageKey, LocalRoomImageStorage, type RoomImageStorage } from "./storage.js";
import { MAX_IMAGE_BYTES, readMultipart, validateImage } from "./validation.js";

const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
const webp = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).webp().toBuffer();
const file = (bytes: Buffer, contentType: string, filename = "room.jpg", fieldName = "file") => ({ bytes, contentType, filename, fieldName });

test("validates JPEG, PNG and WebP from signatures and successful full decode", async () => {
  assert.equal((await validateImage(jpeg, "image/jpeg", "room.jpg")).contentType, "image/jpeg");
  assert.equal((await validateImage(png, "image/png", "room.png")).contentType, "image/png");
  assert.equal((await validateImage(webp, "image/webp", "room.webp")).contentType, "image/webp");
});

test("rejects SVG, GIF, HEIC, malformed signatures, MIME mismatch and fake extension", async () => {
  for (const bytes of [Buffer.from("<svg></svg>"), Buffer.from("GIF89a"), Buffer.from("ftypheic")]) {
    await assert.rejects(validateImage(bytes, "image/jpeg", "room.jpg"), ApiError);
  }
  await assert.rejects(validateImage(Buffer.from([0xff,0xd8,0xff]), "image/jpeg", "room.jpg"), ApiError);
  await assert.rejects(validateImage(jpeg, "image/png", "room.jpg"), ApiError);
  await assert.rejects(validateImage(jpeg, "image/jpeg", "room.png"), ApiError);
  await assert.rejects(validateImage(jpeg, "image/jpeg", "..\\room.jpg"), ApiError);
  await assert.rejects(validateImage(Buffer.from([0xff,0xd8,0xff,0x00,0xff,0xd9]), "image/jpeg", "room.jpg"), ApiError);
});

test("rejects empty and over-5-MiB images", async () => {
  await assert.rejects(validateImage(Buffer.alloc(0), "image/jpeg"), (error: any) => error.status === 422);
  await assert.rejects(validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/jpeg"), (error: any) => error.status === 413);
});

test("bounded multipart parser preserves file bytes and rejects malformed or unexpected fields at service boundary", async () => {
  const boundary = "unit-boundary";
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="room.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
  const end = Buffer.from(`\r\n--${boundary}--\r\n`);
  const raw = Buffer.concat([body, jpeg, end]);
  const parsed = await readMultipart(Object.assign((async function*(){ yield raw; })(), { headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(raw.length) } }), 1024);
  assert.equal(parsed.files.length, 1); assert.deepEqual(parsed.files[0]?.bytes, jpeg); assert.equal(parsed.files[0]?.fieldName, "file");
  await assert.rejects(readMultipart(Object.assign((async function*(){ yield raw; })(), { headers: { "content-type": `multipart/form-data; boundary=${boundary}` } }), 4), (error: any) => error.status === 413);
});

test("local storage creates opaque keys, shares a single object, hides paths and safely rejects traversal", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goctro-room-image-"));
  try {
    const storage = new LocalRoomImageStorage(directory);
    const key = await storage.put(jpeg, "image/jpeg");
    assert.match(key, /^room-images\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(JSON.stringify({ key }).includes(directory), false);
    assert.deepEqual(await storage.get(key), jpeg); // multiple Room associations resolve the same private object
    assert.deepEqual(await storage.get(key), jpeg);
    await assert.rejects(storage.get("../../secret"), (error: any) => error.status === 404);
    assert.throws(() => assertStorageKey("/absolute/path.jpg"), ApiError);
    await storage.delete(key);
    await assert.rejects(storage.get(key), (error: any) => error.code === "STORAGE_OBJECT_UNAVAILABLE");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("single upload makes first image cover, keeps storage key private and cleans failed DB writes", async () => {
  const keys: string[] = []; const deleted: string[] = []; let count = 0;
  const storage: RoomImageStorage = { put: async () => { const key = `room-images/2026/${crypto.randomUUID()}.jpg`; keys.push(key); return key; }, get: async () => jpeg, delete: async (key) => { deleted.push(key); } };
  const repository: any = {
    roomExists: async () => true,
    add: async (_owner: bigint, _property: bigint, _room: bigint, key: string) => {
      if (count === 5) return "limit";
      const row = { roomImageId: BigInt(++count), isCover: count === 1, sortOrder: count, createdAt: new Date() };
      assert.equal(keys.includes(key), true); return row;
    },
    validateBulkRooms: async () => null,
    attachShared: async () => 1,
  };
  const service = new RoomImageService(repository, storage);
  const first = await service.upload(11n, 101n, 201n, file(jpeg, "image/jpeg"));
  const second = await service.upload(11n, 101n, 201n, file(jpeg, "image/jpeg"));
  assert.equal(first?.isCover, true); assert.equal(second?.isCover, false);
  count = 5;
  await assert.rejects(service.upload(11n, 101n, 201n, file(jpeg, "image/jpeg")), (error: any) => error.code === "ROOM_IMAGE_LIMIT_REACHED");
  assert.equal(deleted.length, 1); assert.equal(first && "storageKey" in first, false);
});

test("bulk attach stores each successful file once and keeps per-file outcomes independent", async () => {
  const stored: string[] = []; const cleaned: string[] = []; const groups: Array<{ key: string; count: number }> = [];
  const storage: RoomImageStorage = { put: async () => { const key = `room-images/2026/${crypto.randomUUID()}.jpg`; stored.push(key); return key; }, get: async () => jpeg, delete: async (key) => { cleaned.push(key); } };
  const repository: any = {
    roomExists: async () => true,
    validateBulkRooms: async (_owner: bigint, _property: bigint, ids: bigint[]) => ids.length === 2 ? null : "missing",
    attachShared: async (_owner: bigint, _property: bigint, ids: bigint[], key: string) => { groups.push({ key, count: ids.length }); return ids.length; },
  };
  const service = new RoomImageService(repository, storage);
  const result = await service.bulk(11n, 101n, [{ name: "room_ids", value: '["201","202"]' }], [file(jpeg,"image/jpeg","a.jpg","files"), file(Buffer.from("bad"),"image/jpeg","b.jpg","files"), file(jpeg,"image/jpeg","c.jpg","files")]);
  assert.deepEqual(result?.room_ids, ["201", "202"]);
  assert.deepEqual(result?.image_results.map((r) => r.status), ["attached", "failed", "attached"]);
  assert.equal(result?.image_results[1]?.code, "INVALID_IMAGE");
  assert.equal(stored.length, 2); assert.equal(groups.length, 2); assert.equal(groups.every((g) => g.count === 2), true); assert.equal(cleaned.length, 0);
  const five = await service.bulk(11n, 101n, [{ name: "room_ids", value: '["201","202"]' }], Array.from({ length: 5 }, (_, index) => file(jpeg,"image/jpeg",`room-${index}.jpg`,"files")));
  assert.equal(five?.image_results.filter((r) => r.status === "attached").length, 5);
});

test("physical delete failure keeps metadata deletion and reports cleanup pending without logging key", async () => {
  const repository: any = { remove: async () => ({ deletedId: 801n, promotedId: null, cleanupKey: "room-images/2026/private-key.jpg" }) };
  const storage: RoomImageStorage = { put: async () => "", get: async () => jpeg, delete: async () => { throw new Error("disk unavailable"); } };
  const previous = console.error; let log = ""; console.error = (message?: unknown) => { log += String(message); };
  try {
    const result = await new RoomImageService(repository, storage).remove(101n, 12n, 201n, 801n);
    assert.equal(result?.physical_cleanup_pending, true);
    assert.equal(log.includes("private-key"), false);
    assert.equal(log.includes("/room-images/"), false);
  } finally { console.error = previous; }
});

test("successful final-reference delete removes the physical object", async () => {
  const deleted: string[] = [];
  const repository: any = { remove: async () => ({ deletedId: 801n, promotedId: null, cleanupKey: "room-images/2026/final.jpg" }) };
  const storage: RoomImageStorage = { put: async () => "", get: async () => jpeg, delete: async (key) => { deleted.push(key); } };
  const result = await new RoomImageService(repository, storage).remove(101n,12n,201n,801n);
  assert.equal(result?.physical_cleanup_pending, false); assert.deepEqual(deleted, ["room-images/2026/final.jpg"]);
});
