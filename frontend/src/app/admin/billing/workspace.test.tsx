import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingSummary, WorkspaceRow } from "./workspace";
import type { BillingWorkspaceResponse, BillingWorkspaceRow } from "../../../lib/api/invoiceApi";

const base: BillingWorkspaceRow = {
  contract_no: "HD-88",
  contract_id: "88",
  property: { property_id: "4", name: "Nhà Bình An", province: "Đồng Nai", address: "Đường Mẫu" },
  room: { room_code: "A101" }, resident: { resident_id: "19", full_name: "Nguyễn Thị Ánh" },
  period: { period_start: "2026-10-14", period_end: "2026-11-13" },
  state: { code: "MISSING_DATA", label: "Thiếu dữ liệu" },
  reminder: { due: true, recorded: true }, draft_expected: true,
  invoice: { invoice_id: "8901", invoice_no: "INV-88-20261014", status: "draft", due_date: null, is_overdue: false, total_amount: "3500000", amount_provisional: true },
  missing_or_invalid: [{ code: "ELECTRICITY_ENDING_MISSING", category: "electricity", message: "Chưa nhập chỉ số điện cuối kỳ." }],
};

test("workspace row shows per-contract period, resident, server reason and mapped draft action without exposing raw IDs", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={base} />);
  assert.match(html, /A101/);
  assert.match(html, /Nhà Bình An/);
  assert.match(html, /Nguyễn Thị Ánh/);
  assert.match(html, /14\/10\/2026 – 13\/11\/2026/);
  assert.match(html, /Chưa nhập chỉ số điện cuối kỳ/);
  assert.match(html, /Đã ghi nhận nhắc cuối kỳ/);
  assert.match(html, /Nhập chỉ số cuối kỳ/);
  assert.match(html, /href="\/admin\/invoices\/8901"/);
  const visibleText = html.replace(/<[^>]*>/g, " ");
  assert.doesNotMatch(visibleText, /8901|resident_id|property_id|contractId/i);
  assert.doesNotMatch(html, /Sẵn sàng chốt/);
});

test("ready action opens the existing Invoice detail/finalize workflow", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, state: { code: "READY_TO_FINALIZE", label: "Sẵn sàng chốt" }, missing_or_invalid: [] }} />);
  assert.match(html, /Kiểm tra và chốt hóa đơn/);
  assert.match(html, /href="\/admin\/invoices\/8901"/);
});

test("missing tariff links to the Property utility configuration screen", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "ELECTRICITY_TARIFF_MISSING", category: "electricity", message: "Thiếu biểu giá điện." }] }} />);
  assert.match(html, /Cấu hình biểu giá điện \/ nước/);
  assert.match(html, /href="\/admin\/services\/utilities\?property_id=4"/);
});

test("missing opening reading maps to the existing Contract detail route", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "ELECTRICITY_OPENING_MISSING", category: "electricity", message: "Chưa xác định chỉ số điện đầu kỳ." }] }} />);
  assert.match(html, /Cập nhật chỉ số đầu kỳ/);
  assert.match(html, /href="\/admin\/contracts\/88#meter-source"/);
});

test("water version blocker links to Property utility configuration", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "WATER_VERSION_MISSING", category: "water", message: "Thiếu giá nước." }] }} />);
  assert.match(html, /href="\/admin\/services\/utilities\?property_id=4"/);
});

test("Fixed and Flexible blockers link to the matching Property service workspace", () => {
  const fixed = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "FIXED_SERVICE_PRICE_VERSION_MISSING", category: "service", message: "Thiếu phiên bản giá cố định." }] }} />);
  assert.match(fixed, /Quản lý dịch vụ cố định/);
  assert.match(fixed, /href="\/admin\/services\/fixed\?property_id=4"/);
  const flexible = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "FLEXIBLE_SERVICE_PRICE_VERSION_MISSING", category: "service", message: "Thiếu giá phát sinh." }] }} />);
  assert.match(flexible, /Quản lý tiện ích phát sinh/);
  assert.match(flexible, /href="\/admin\/services\/flexible\?property_id=4"/);
});

test("Parking blockers link to Parking operations with the affected Property", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, missing_or_invalid: [{ code: "PARKING_PRICE_VERSION_MISSING", category: "parking", message: "Thiếu giá Parking." }] }} />);
  assert.match(html, /Kiểm tra đăng ký và mức phí gửi xe/);
  assert.match(html, /href="\/admin\/services\/parking\?property_id=4"/);
});

test("workspace summary renders server counters and empty pending values without fabricated readiness", () => {
  const response: BillingWorkspaceResponse["summary"] = {
    contracts_on_page: 4, needs_attention_on_page: 2, drafts_on_page: 2, finalized_on_page: 1, missing_data_on_page: 1, ready_to_finalize_on_page: 1,
    finalized_unpaid: 7, paid: 3, overdue: 2, unpaid_preview: [],
  };
  const html = renderToStaticMarkup(<BillingSummary summary={response} />);
  assert.match(html, /Cần xử lý trong trang/);
  assert.match(html, /Thiếu dữ liệu trong trang/);
  assert.match(html, /Sẵn sàng chốt trong trang/);
  assert.match(html, /Bản nháp đang chuẩn bị trong trang/);
  assert.match(html, /<strong>1<\/strong>/);
  assert.match(html, /<strong>7<\/strong>/);
  const pending = renderToStaticMarkup(<BillingSummary summary={null} />);
  assert.equal((pending.match(/<strong>—<\/strong>/g) ?? []).length, 7);
});

test("missing draft has no frontend recovery/write action", () => {
  const html = renderToStaticMarkup(<WorkspaceRow row={{ ...base, state: { code: "MISSING_DRAFT", label: "Thiếu bản nháp dự kiến" }, invoice: null, missing_or_invalid: [] }} />);
  assert.match(html, /Chờ scheduler tạo bản nháp/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /href=/);
});
