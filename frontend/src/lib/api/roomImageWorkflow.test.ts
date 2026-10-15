import assert from "node:assert/strict";
import { test } from "node:test";
import { attachImagesToCreatedRooms, createRoomWithImages, createRoomsSequentially, uploadRoomImagesSequentially } from "./roomImageWorkflow";

const file = (name: string) => new File([new Uint8Array([1])], name, { type: "image/jpeg" });

test("single-create workflow creates Room first and supports zero, one or five sequential uploads", async () => {
  const selected = [file("1.jpg"), file("2.jpg"), file("3.jpg"), file("4.jpg"), file("5.jpg")];
  for (const count of [0, 1, 5]) {
    const calls: string[] = [];
    const result = await createRoomWithImages(
      async () => { calls.push("create"); return { room_id: "301" }; },
      (room) => room.room_id,
      selected.slice(0, count),
      async (roomId, image) => { calls.push(`${roomId}:${image.name}`); },
    );
    assert.equal(result.room.room_id, "301");
    assert.equal(result.outcomes.length, count);
    assert.equal(calls[0], "create");
    assert.deepEqual(calls.slice(1), selected.slice(0, count).map((image) => `301:${image.name}`));
  }
});

test("single-create workflow preserves the created Room and reports per-image partial failure", async () => {
  const selected = [file("ok.jpg"), file("bad.jpg"), file("later.jpg")];
  const uploaded: string[] = [];
  const result = await createRoomWithImages(
    async () => ({ room_id: "302" }),
    (room) => room.room_id,
    selected,
    async (roomId, image) => { uploaded.push(`${roomId}:${image.name}`); if (image.name === "bad.jpg") throw new Error("temporary"); },
  );
  assert.equal(result.room.room_id, "302");
  assert.deepEqual(result.outcomes.map(({ name, ok }) => ({ name, ok })), [
    { name: "ok.jpg", ok: true }, { name: "bad.jpg", ok: false }, { name: "later.jpg", ok: true },
  ]);
  assert.equal(uploaded.length, 3, "one failed image does not stop later uploads or roll back the Room");
});

test("bulk create stays sequential and retains only successful Room IDs for shared attachment", async () => {
  const seen: string[] = [];
  const created = await createRoomsSequentially(["A-1", "A-2", "A-3"], async (code) => {
    seen.push(code);
    if (code === "A-2") throw new Error("duplicate");
    return { room_id: code };
  });
  assert.deepEqual(seen, ["A-1", "A-2", "A-3"]);
  assert.deepEqual(created.successes.map(({ room }) => room.room_id), ["A-1", "A-3"]);
  assert.deepEqual(created.failures.map(({ roomCode }) => roomCode), ["A-2"]);

  const images = [file("shared.jpg")];
  let attachedIds: string[] = [];
  await attachImagesToCreatedRooms(created.successes.map(({ room }) => room.room_id), images, async (roomIds) => { attachedIds = roomIds; return "attached"; });
  assert.deepEqual(attachedIds, ["A-1", "A-3"]);
  let called = false;
  const skipped = await attachImagesToCreatedRooms([], images, async () => { called = true; return "unexpected"; });
  assert.equal(skipped, null);
  assert.equal(called, false, "zero successful Rooms skips bulk attach");
});

test("gallery upload workflow continues after an individual failure", async () => {
  const names: string[] = [];
  const outcomes = await uploadRoomImagesSequentially("303", [file("first.jpg"), file("second.jpg")], async (roomId, selected) => {
    assert.equal(roomId, "303"); names.push(selected.name);
    if (selected.name === "first.jpg") throw new Error("unavailable");
  });
  assert.deepEqual(names, ["first.jpg", "second.jpg"]);
  assert.deepEqual(outcomes.map(({ ok }) => ok), [false, true]);
});
