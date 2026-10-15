import test from "node:test";
import assert from "node:assert/strict";
import { provinceCode, provinces } from "./explorer-provinces.js";

test("34 stable codes, explicit old-name mappings and no guessed fallback", () => {
  assert.equal(provinces.length, 34);
  assert.equal(new Set(provinces.map(p => p[0])).size, 34);
  for (const [code, name] of provinces) assert.equal(provinceCode(name), code);
  assert.equal(provinceCode("Tỉnh Bình Dương"), "79");
  assert.equal(provinceCode("Thành phố Hồ Chí Minh"), "79");
  assert.equal(provinceCode("TP. HCM"), "79");
  assert.equal(provinceCode("Khánh Hòa"), "56");
  assert.equal(provinceCode("Thừa Thiên Huế"), "46");
  assert.equal(provinceCode("Tỉnh không biết"), null);
});

test("read-only live PostgreSQL explorer: province totals, filters, pagination and public DTO", { skip: process.env.EXPLORER_LIVE_TEST !== "1" }, async () => {
  const base = "http://localhost:4000/api/v1/public/explorer";
  const response = await fetch(base); assert.equal(response.status, 200);
  const summary = (await response.json()).data;
  assert.equal(summary.mode, "live"); assert.equal(summary.provinces.length, 34);
  for (const p of summary.provinces) {
    const r = await fetch(`${base}/rooms?province_code=${p.code}&page_size=1`);
    assert.equal(r.status, 200); const body = await r.json();
    assert.equal(body.meta.total_items, p.public_rooms);
    assert.equal(body.meta.total_pages, p.public_rooms);
    assert.equal(p.system_properties, null);
    for (const room of body.data) {
      assert.deepEqual(Object.keys(room).sort(), ["room_id","room_code","property","default_rent","area_m2","default_capacity","status","public_description","cover_image"].sort());
      assert.deepEqual(Object.keys(room.property).sort(), ["name","province","address"].sort());
      const filtered = await fetch(`${base}/rooms?province_code=${p.code}&price_min=${BigInt(room.default_rent)+1n}&price_max=${BigInt(room.default_rent)+1n}&page_size=1`);
      assert.equal(filtered.status,200);
      for (const item of (await filtered.json()).data) assert.equal(item.default_rent,(BigInt(room.default_rent)+1n).toString());
    }
  }
  for (const query of ["province_code=99", "province_code=79&price_min=10&price_max=1", "province_code=79&page=0", "province_code=79&page_size=101", "province_code=79&owner_id=1", "province_code=79&province=x"]) {
    assert.equal((await fetch(`${base}/rooms?${query}`)).status,400,query);
  }
});
