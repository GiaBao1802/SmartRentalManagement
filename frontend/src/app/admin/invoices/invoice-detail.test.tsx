import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceDetailResponse, InvoiceItem } from "../../../lib/api/invoiceApi";
import { InvoiceBreakdown } from "./[invoiceId]/invoice-breakdown";
import { invoiceMeterUsage, invoiceReadiness, validateInvoiceMeterReadings } from "./[invoiceId]/invoice-detail.logic";

const base: InvoiceDetailResponse = {
  invoice_id: "501", invoice_no: "INV-501", contract_id: "77", property_id: "4", owner_id: "101",
  period_start: "2026-10-15", period_end: "2026-11-14", due_date: "2026-11-19", finalized_at: "2026-11-14T04:00:00.000Z",
  rent_amount: "3500000", electricity_previous_kwh: "100.000", electricity_current_kwh: "150.000", electricity_amount: "125000",
  water_previous_m3: "20.000", water_current_m3: "23.000", water_amount: "45000", service_amount: "350000", total_amount: "4020000",
  status: "unpaid", revision: 1, snapshot_kind: "ITEMIZED", is_overdue: false, amount_provisional: false,
  contract: null, payment_summary: { attempt_count: 0, successful_amount: "0", latest_status: null },
  itemization_available: true, invoice_items: [],
};

const categories = ["RENT", "ELECTRICITY", "WATER", "FIXED_SERVICE", "FLEXIBLE_SERVICE", "PARKING"] as const;
const items: InvoiceItem[] = categories.map((category, index) => ({
  invoice_item_id: String(index + 1), category, item_key: category.toLowerCase(), label: `${category} snapshot`, description: null,
  quantity: category === "ELECTRICITY" ? "50.000" : "1.000", unit: category === "ELECTRICITY" ? "kWh" : "lần",
  unit_price: "2500", amount: category === "ELECTRICITY" ? "125000" : "10",
  ...(category === "ELECTRICITY" ? { electricity_tiers: [
    { tier_no: 1, lower_kwh: "0.000", upper_kwh: "50.000", quantity: "50.000", unit_price: "2500", amount: "125000" },
    { tier_no: 2, lower_kwh: "50.000", upper_kwh: null, quantity: "0.000", unit_price: "3000", amount: "0" },
  ] } : {}),
}));

test("finalized itemized detail renders all server lines and expandable Electricity tier snapshots", () => {
  const html = renderToStaticMarkup(<InvoiceBreakdown invoice={{ ...base, invoice_items: items }} />);
  for (const category of categories) assert.match(html, new RegExp(`${category} snapshot`));
  assert.match(html, /Chi tiết 2 bậc điện/);
  assert.match(html, /50\.000 kWh × 2\.500/);
  assert.match(html, /4\.020\.000 ₫/);
});

test("legacy detail renders aggregate-only state without fabricated item rows", () => {
  const html = renderToStaticMarkup(<InvoiceBreakdown invoice={{ ...base, snapshot_kind: "LEGACY_AGGREGATE", itemization_available: false, invoice_items: [] }} />);
  assert.match(html, /Hóa đơn cũ — chỉ có dữ liệu tổng hợp/);
  assert.match(html, /3\.500\.000 ₫/);
  assert.doesNotMatch(html, /invoice-breakdown-line|Bậc 1|snapshot/);
});

test("draft detail stays without itemized lines", () => {
  const html = renderToStaticMarkup(<InvoiceBreakdown invoice={{ ...base, status: "draft", snapshot_kind: "NOT_FINALIZED", itemization_available: false, invoice_items: [] }} />);
  assert.match(html, /Hóa đơn nháp chưa có breakdown/);
  assert.doesNotMatch(html, /invoice-breakdown-line|Bậc 1/);
});

test("meter UX blocks decreasing, malformed and scientific readings while allowing three decimals", () => {
  assert.match(validateInvoiceMeterReadings("99.999", "23", "100", "20"), /không nhỏ hơn chỉ số đầu kỳ/);
  assert.match(validateInvoiceMeterReadings("1e3", "23", "100", "20"), /tối đa 3 chữ số thập phân/);
  assert.match(validateInvoiceMeterReadings("-1", "23", "100", "20"), /số không âm/);
  assert.equal(validateInvoiceMeterReadings("150.123", "23.001", "100", "20"), "");
  assert.match(validateInvoiceMeterReadings("150", "", "100", "20", true), /Cần nhập đủ/);
});

test("meter usage preview is informational and keeps decimal precision stable", () => {
  assert.equal(invoiceMeterUsage("100.100", "100.300"), 0.2);
  assert.equal(invoiceMeterUsage(null, "100"), null);
  assert.equal(invoiceMeterUsage("100", "99"), null);
  assert.equal(invoiceMeterUsage("100", "1e3"), null);
});

test("draft readiness reports only known contract, rent and meter data and defers price checks to server", () => {
  const items = invoiceReadiness({
    contractNo: "CTR-77", rentAmount: "3500000", electricityPrevious: "100.000", electricityCurrent: "150.000",
    waterPrevious: null, waterCurrent: "23.000",
  });
  assert.deepEqual(items.slice(0, 2).map((item) => item.state), ["known", "known"]);
  assert.equal(items.find((item) => item.label === "Điện cuối kỳ")?.state, "known");
  assert.equal(items.find((item) => item.label === "Nước đầu kỳ")?.state, "attention");
  assert.deepEqual(items.at(-1), { label: "Biểu giá điện/nước, dịch vụ và bãi xe", detail: "Sẽ được hệ thống kiểm tra khi chốt.", state: "server" });
});
