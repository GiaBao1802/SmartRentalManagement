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
  const encoded = encodeURIComponent("location=Biên Hòa&price_max=3999999&page=1&page_size=12&sort=price_asc&amenities=air_conditioning");
  assert.deepEqual(parseCloudyRoomLinks(`[[results:${encoded}]]`, true), [
    { text: "Xem toàn bộ kết quả phòng", href: "/tim-phong?location=Bi%C3%AAn+H%C3%B2a&price_max=3999999&page=1&page_size=12&sort=price_asc&amenities=air_conditioning" },
  ]);
  const invalidAmenity = encodeURIComponent("page=1&page_size=12&sort=price_asc&amenities=unknown");
  const invalidSegments = parseCloudyRoomLinks(`Kết quả. [[results:${invalidAmenity}]]`, true);
  assert.equal(invalidSegments.map(segment => segment.text).join(""), "Kết quả. ");
  assert.equal(invalidSegments.map(segment => segment.text).join("").includes("[[results:"), false);
  const externalLike = encodeURIComponent("https://evil.example/");
  const externalSegments = parseCloudyRoomLinks(`[[results:${externalLike}]]`, true);
  assert.equal(externalSegments[0]?.href, undefined);
  assert.equal(externalSegments.map(segment => segment.text).join(""), "");
});
