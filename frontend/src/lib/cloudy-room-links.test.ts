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

test("creates a same-site all-results link with only bounded public search filters", () => {
  const encoded = encodeURIComponent("location=Biên Hòa&price_max=3999999&page=1&page_size=12&sort=price_asc");
  assert.deepEqual(parseCloudyRoomLinks(`[[results:${encoded}]]`, true), [
    { text: "Xem toàn bộ kết quả phòng", href: "/rooms?location=Bi%C3%AAn+H%C3%B2a&price_max=3999999&page=1&page_size=12&sort=price_asc" },
  ]);
  const externalLike = encodeURIComponent("https://evil.example/");
  assert.equal(parseCloudyRoomLinks(`[[results:${externalLike}]]`, true)[0]?.href, undefined);
});
