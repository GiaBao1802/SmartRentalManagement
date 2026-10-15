import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceListContent } from "./invoice-list-content";
import type { InvoiceResource } from "../../../lib/api/invoiceApi";

const baseInvoice: InvoiceResource = {
  invoice_id: "501",
  invoice_no: "INV-77-20261015",
  contract_id: "77",
  property_id: "4",
  owner_id: "101",
  period_start: "2026-10-15",
  period_end: "2026-11-14",
  due_date: "2026-11-19",
  finalized_at: null,
  rent_amount: "3500000",
  electricity_previous_kwh: "100.000",
  electricity_current_kwh: null,
  electricity_amount: "0",
  water_previous_m3: "20.000",
  water_current_m3: null,
  water_amount: "0",
  service_amount: "0",
  total_amount: "3500000",
  status: "draft",
  revision: 1,
  snapshot_kind: "NOT_FINALIZED",
  is_overdue: false,
  amount_provisional: true,
  contract: {
    contract_id: "77",
    contract_no: "HD-77",
    room_id: "8",
    property_id: "4",
    room_code: "A01",
    representative_resident_id: "201",
    property: { property_id: "4", name: "Khu A", province: "Đồng Nai", address: "Đồng Nai" },
  },
  payment_summary: { attempt_count: 0, successful_amount: "0", latest_status: null },
};

function render(props: Partial<Parameters<typeof InvoiceListContent>[0]> = {}) {
  return renderToStaticMarkup(<InvoiceListContent rows={[]} meta={null} page={1} loading={false} error="" onRetry={() => undefined} onPage={() => undefined} {...props} />);
}

test("invoice list renders actual API fields and valid lifecycle/overdue states without write actions", () => {
  const rows: InvoiceResource[] = [
    baseInvoice,
    { ...baseInvoice, invoice_id: "502", invoice_no: "INV-502", status: "unpaid", amount_provisional: false, is_overdue: true },
    { ...baseInvoice, invoice_id: "503", invoice_no: "INV-503", status: "paid", amount_provisional: false },
    { ...baseInvoice, invoice_id: "504", invoice_no: "INV-504", snapshot_kind: "LEGACY_AGGREGATE", status: "unpaid", amount_provisional: false },
  ];
  const html = render({ rows, residents: [{ resident_id: "201", full_name: "Nguyễn Thị Ánh" }], meta: { page: 1, page_size: 20, total_items: 4, total_pages: 1 } });
  assert.match(html, /INV-77-20261015/);
  assert.match(html, /Khu A/);
  assert.match(html, /A01/);
  assert.match(html, /Nguyễn Thị Ánh/);
  assert.doesNotMatch(html, /Mã cư dân 201/);
  assert.match(html, /15\/10\/2026 → 14\/11\/2026/);
  assert.match(html, /Đang chuẩn bị/);
  assert.match(html, /Tạm tính · chưa phải số tiền phải trả/);
  assert.match(html, /Chưa thanh toán/);
  assert.match(html, /Quá hạn/);
  assert.match(html, /Đã thanh toán/);
  assert.match(html, /Hóa đơn cũ/);
  assert.match(html, /Xem chi tiết/);
  assert.match(html, /Tòa nhà \/ Khu trọ/);
  assert.match(html, /Người thuê/);
  assert.doesNotMatch(html, /Property ID|Room ID|Resident ID|Cư dân đại diện/);
  assert.match(html, /Trang 1 \/ 1/);
  for (const forbiddenAction of ["Thêm mới", "Sửa", "Xóa", "Ghi nhận đã thu", "VOID"]) assert.doesNotMatch(html, new RegExp(forbiddenAction));
});

test("invoice list renders loading, empty and error states from API state", () => {
  assert.match(render({ loading: true }), /Đang tải danh sách hóa đơn/);
  assert.match(render({ meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } }), /Chưa có hóa đơn phù hợp/);
  const errorHtml = render({ error: "Không tìm thấy dữ liệu trong phạm vi tài khoản của bạn." });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Thử lại/);
  assert.match(errorHtml, /Không tìm thấy dữ liệu trong phạm vi tài khoản của bạn/);
});

test("invoice pagination uses server page metadata and disables out-of-range navigation", () => {
  const middlePage = render({ page: 2, meta: { page: 2, page_size: 20, total_items: 41, total_pages: 3 } });
  assert.match(middlePage, /Hiển thị 21–40 trong 41 hóa đơn/);
  assert.match(middlePage, /Trang 2 \/ 3/);
  const lastPage = render({ page: 3, meta: { page: 3, page_size: 20, total_items: 41, total_pages: 3 } });
  assert.match(lastPage, /disabled=""[^>]*>Sau →/);
});
