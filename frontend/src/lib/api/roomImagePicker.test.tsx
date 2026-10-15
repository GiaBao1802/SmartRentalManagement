import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRoomImageFiles } from "../../app/admin/properties/[propertyId]/rooms/room-image-picker";

const image = (name: string, type = "image/jpeg", size = 10) => new File([new Uint8Array(size)], name, { type });

test("single Room image picker accepts zero, one and five supported files", () => {
  assert.equal(validateRoomImageFiles([], 5), "");
  assert.equal(validateRoomImageFiles([image("one.jpg")], 5), "");
  assert.equal(validateRoomImageFiles(Array.from({ length: 5 }, (_, index) => image(`${index}.jpg`)), 5), "");
});

test("Room image picker rejects over-limit, unsupported and oversized selections", () => {
  assert.match(validateRoomImageFiles(Array.from({ length: 6 }, (_, index) => image(`${index}.jpg`)), 5), /tối đa 5 ảnh/);
  assert.match(validateRoomImageFiles([image("wrong.gif", "image/gif")], 5), /JPEG, PNG hoặc WebP/);
  assert.match(validateRoomImageFiles([image("large.png", "image/png", 5 * 1024 * 1024 + 1)], 5), /tối đa là 5 MB/);
});
