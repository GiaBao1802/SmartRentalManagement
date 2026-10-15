import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessCombobox } from "./business-combobox";
import { filterProperties, filterResidents, filtersForInvoiceApi, invoiceResidentLabel, normalizeBusinessSearch, propertyOption, roomOption, statusLabel } from "./invoice-list.logic";
import type { Resident } from "../../../lib/api/residentApi";
import type { Property } from "../../../lib/api/propertyApi";

const residents = [
  { resident_id: "71", full_name: "Nguyễn Thị Ánh", national_id: "079123456789", phone: "0901234567" },
  { resident_id: "72", full_name: "Trần Minh Đức", national_id: "001987654321", phone: "0912345678" },
] as Resident[];

test("Vietnamese and alphabetic resident searches match name, CCCD and phone", () => {
  assert.equal(normalizeBusinessSearch("Đặng Thị Ánh"), "dang thi anh");
  assert.deepEqual(filterResidents(residents, "nguyen thi anh").map((item) => item.resident_id), ["71"]);
  assert.deepEqual(filterResidents(residents, "079123").map((item) => item.resident_id), ["71"]);
  assert.deepEqual(filterResidents(residents, "091234").map((item) => item.resident_id), ["72"]);
});

test("property business search matches Vietnamese names and addresses without diacritics", () => {
  const properties = [
    { property_id: "88", name: "Nhà mẫu Bình An", address: "Địa chỉ kiểm thử 01", province: "TP. Hồ Chí Minh" },
    { property_id: "89", name: "Nhà mẫu Phú Lộc", address: "Địa chỉ kiểm thử 02", province: "Đồng Nai" },
  ] as Property[];
  assert.deepEqual(filterProperties(properties, "binh an").map((item) => item.property_id), ["88"]);
  assert.deepEqual(filterProperties(properties, "ho chi minh").map((item) => item.property_id), ["88"]);
});

test("business choices map only selected internal IDs to server-side invoice filters", () => {
  const filters = filtersForInvoiceApi({
    property: { id: "1001", label: "Khu A" }, room: { id: "1002", label: "A-01" }, resident: { id: "71", label: "Nguyễn Thị Ánh" },
    status: "unpaid", periodStart: "2026-10-15", periodEnd: "2026-11-14",
  });
  assert.deepEqual(filters, { property_id: "1001", room_id: "1002", resident_id: "71", status: "unpaid", period_start: "2026-10-15", period_end: "2026-11-14" });
  const propertyChanged = filtersForInvoiceApi({ property: { id: "2001", label: "Khu B" }, room: null, resident: null, status: "", periodStart: "", periodEnd: "" });
  assert.deepEqual(propertyChanged, { property_id: "2001" });
});

test("lookup options use business labels while retaining opaque IDs internally", () => {
  assert.deepEqual(propertyOption({ property_id: "88", owner_id: "1", property_code: "P-01", name: "Nhà Bình An", province: "Đồng Nai", address: "12 đường Mẫu", manager_name: null, status: "active", created_at: "", updated_at: "" }), { id: "88", label: "Nhà Bình An", description: "12 đường Mẫu · Đồng Nai" });
  assert.deepEqual(roomOption({ room_id: "99", owner_id: "1", property_id: "88", room_code: "A-101", default_rent: "0", area_m2: "0", default_capacity: 1, is_active: true, is_public: false, public_description: null, status: "available", occupancy_count: 0, contract_capacity: null, current_contract: null }), { id: "99", label: "A-101", description: "Phòng" });
});

test("invoice resident labels never expose a raw internal ID", () => {
  assert.equal(invoiceResidentLabel("71", residents), "Nguyễn Thị Ánh");
  assert.equal(invoiceResidentLabel("999", residents), "Cư dân không còn trong danh sách");
  assert.equal(invoiceResidentLabel(null, residents), "Chưa gán cư dân đại diện");
});

test("invoice lifecycle labels use business language", () => {
  assert.equal(statusLabel("draft"), "Đang chuẩn bị");
  assert.equal(statusLabel("unpaid"), "Chưa thanh toán");
  assert.equal(statusLabel("paid"), "Đã thanh toán");
});

test("business lookup renders a labelled keyboard-accessible combobox rather than a numeric ID field", () => {
  const html = renderToStaticMarkup(<BusinessCombobox label="Tòa nhà / Khu trọ" placeholder="Tìm theo tên" selected={null} options={[]} onSearch={() => undefined} onSelect={() => undefined} />);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /Tòa nhà \/ Khu trọ/);
  assert.doesNotMatch(html, /type="number"/);
});
