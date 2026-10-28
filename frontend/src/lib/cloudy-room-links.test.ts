import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCloudyRoomLinks } from "./cloudy-room-links";

test("turns only generated room markers in Cloudy replies into same-site detail links", () => {
  assert.deepEqual(parseCloudyRoomLinks("Phòng A\n[[room:202]]", true), [
    { text: "Phòng A\n" },
    { text: "Xem chi tiết phòng", roomId: "202" },
  ]);
});

test("does not linkify user text or nonnumeric route markers", () => {
  assert.deepEqual(parseCloudyRoomLinks("[[room:202]] [[room:../../admin]]", false), [
    { text: "[[room:202]] [[room:../../admin]]" },
  ]);
  assert.deepEqual(parseCloudyRoomLinks("[[room:../../admin]]", true), [
    { text: "[[room:../../admin]]" },
  ]);
});
