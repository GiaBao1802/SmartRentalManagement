import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaRoomImageRepository } from "./room-image.repository.js";

function baseFixture() {
  const calls: Array<{ method: string; args?: any }> = [];
  let count = 0; let images: Array<{ roomImageId: bigint; roomId: bigint; isCover: boolean; sortOrder: number; storageKey?: string; createdAt: Date }> = [];
  const row = (input: any) => ({ roomImageId: input.roomImageId ?? BigInt(images.length + 1), roomId: input.roomId, isCover: input.isCover, sortOrder: input.sortOrder, storageKey: input.storageKey, createdAt: new Date() });
  const tx: any = {
    $queryRaw: async (...args: any[]) => { calls.push({ method: "queryRaw", args }); return [{ room_id: 201n }, { room_id: 202n }]; },
    $executeRaw: async (...args: any[]) => { calls.push({ method: "executeRaw", args }); return 1; },
    roomImage: {
      count: async () => count,
      create: async ({ data, select }: any) => { calls.push({ method: "create", args: { data, select } }); count++; const created = row(data); images.push(created); return created; },
      findMany: async ({ where, orderBy, select }: any) => { calls.push({ method: "findMany", args: { where, orderBy, select } }); return images.sort((a,b) => a.sortOrder-b.sortOrder || Number(a.roomImageId-b.roomImageId)); },
      findFirst: async ({ where, orderBy, select }: any) => { calls.push({ method: "findFirst", args: { where, orderBy, select } }); return images.find((image) => image.roomImageId === where.roomImageId) ?? images[0] ?? null; },
      findUniqueOrThrow: async ({ where }: any) => images.find((image) => image.roomImageId === where.roomImageId),
      update: async ({ where, data }: any) => { const image = images.find((candidate) => candidate.roomImageId === where.roomImageId)!; Object.assign(image, data); calls.push({ method: "update", args: { where, data } }); return image; },
      updateMany: async ({ where, data }: any) => { for (const image of images) if (image.roomId === where.roomId && image.isCover) Object.assign(image,data); calls.push({ method: "updateMany", args: { where, data } }); return { count: 1 }; },
      delete: async ({ where }: any) => { images = images.filter((image) => image.roomImageId !== where.roomImageId); count--; calls.push({ method: "delete", args: where }); },
      createMany: async ({ data }: any) => { calls.push({ method: "createMany", args: data }); images.push(...data.map(row)); count += data.length; return { count: data.length }; },
      groupBy: async () => [],
    },
  };
  const prisma: any = { room: { findFirst: async () => ({ roomId: 201n }), findMany: async () => [] }, roomImage: tx.roomImage, $transaction: async (callback: any) => callback(tx) };
  return { repository: new PrismaRoomImageRepository(prisma), calls, setCount: (n: number) => { count=n; }, images };
}

test("single attachment assigns first cover and the next dense position; max-five is enforced", async () => {
  const f = baseFixture();
  const first = await f.repository.add(101n, 12n, 201n, "room-images/2026/key.jpg");
  assert.equal(first !== "missing" && first !== "limit" && first.isCover, true);
  assert.equal(f.calls.find((call) => call.method === "create")?.args.data.sortOrder, 1);
  f.setCount(5);
  assert.equal(await f.repository.add(101n, 12n, 201n, "another/key.jpg"), "limit");
});

test("reorder requires exact permutation and writes a dense order in one transaction", async () => {
  const f = baseFixture(); f.images.push({ roomImageId: 1n, roomId: 201n, isCover: true, sortOrder: 1, createdAt: new Date() }, { roomImageId: 2n, roomId: 201n, isCover: false, sortOrder: 2, createdAt: new Date() });
  assert.equal(await f.repository.reorder(101n, 12n, 201n, [1n, 1n]), "invalid");
  const result = await f.repository.reorder(101n, 12n, 201n, [2n, 1n]);
  assert.ok(Array.isArray(result));
  assert.deepEqual(f.calls.filter((call) => call.method === "update").slice(-2).map((call) => call.args.data.sortOrder), [1,2]);
});

test("cover selection is idempotent and delete promotes deterministic next image", async () => {
  const f = baseFixture(); f.images.push({ roomImageId: 5n, roomId: 201n, isCover: true, sortOrder: 1, storageKey: "shared/key.jpg", createdAt: new Date() }, { roomImageId: 6n, roomId: 201n, isCover: false, sortOrder: 2, storageKey: "other/key.jpg", createdAt: new Date() }); f.setCount(1);
  await f.repository.setCover(101n, 12n, 201n, 5n);
  assert.equal(f.calls.some((call) => call.method === "updateMany"), false);
  const result = await f.repository.remove(101n, 12n, 201n, 5n);
  assert.deepEqual(result, { deletedId: 5n, promotedId: 6n, cleanupKey: "shared/key.jpg" });
  assert.equal(f.images[0]?.isCover, true); assert.equal(f.images[0]?.sortOrder, 1);
});

test("deleting one shared association retains the physical object while another reference remains", async () => {
  const f = baseFixture(); f.images.push({ roomImageId: 5n, roomId: 201n, isCover: false, sortOrder: 1, storageKey: "room-images/2026/shared.jpg", createdAt: new Date() }); f.setCount(2);
  const result = await f.repository.remove(101n, 12n, 201n, 5n);
  assert.equal(result !== "missing" && result.cleanupKey, null);
});

test("bulk association transaction uses one shared key and initializes independent gallery order", async () => {
  const f = baseFixture();
  const result = await f.repository.attachShared(101n, 12n, [201n, 202n], "room-images/2026/shared.jpg", 0);
  assert.equal(result, 2);
  const data = f.calls.find((call) => call.method === "createMany")?.args;
  assert.deepEqual(data.map((item: any) => item.storageKey), ["room-images/2026/shared.jpg", "room-images/2026/shared.jpg"]);
  assert.equal(data.every((item: any) => item.isCover && item.sortOrder === 1), true);
});

test("SQLSTATE 40001 is mapped to a safe retryable conflict", async () => {
  const f = baseFixture();
  const client: any = { room: {}, roomImage: {}, $transaction: async () => { const error: any = new Error("raw db error"); error.code = "40001"; throw error; } };
  const repository = new PrismaRoomImageRepository(client);
  await assert.rejects(repository.add(101n,12n,201n,"room-images/2026/key.jpg"), (error: any) => error.status === 409 && error.code === "ROOM_IMAGE_RETRY_REQUIRED" && JSON.stringify(error).includes("raw db error") === false);
  void f;
});
