import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceDisplayStatus, invoiceDueStateLabel, invoiceLifecycleLabel } from "./invoice-status";

test("invoice lifecycle status remains separate from payment due state", () => {
  assert.equal(invoiceLifecycleLabel("unpaid"), "Chưa thanh toán");
  assert.equal(invoiceDisplayStatus("unpaid", true, "2026-10-27", "2026-10-28"), "Chưa thanh toán · Quá hạn");
  assert.equal(invoiceDisplayStatus("unpaid", false, "2026-10-28", "2026-10-28"), "Chưa thanh toán · Đến hạn hôm nay");
  assert.equal(invoiceDisplayStatus("unpaid", false, "2026-10-30", "2026-10-28"), "Chưa thanh toán · Còn hạn");
  assert.equal(invoiceDisplayStatus("draft", false, null, "2026-10-28"), "Đang chuẩn bị");
  assert.equal(invoiceDisplayStatus("paid", false, "2026-10-27", "2026-10-28"), "Đã thanh toán");
});

test("inconsistent unpaid due-date facts are surfaced for review instead of guessed", () => {
  assert.equal(invoiceDueStateLabel("unpaid", false, "2026-10-27", "2026-10-28"), "Cần kiểm tra hạn");
  assert.equal(invoiceDueStateLabel("unpaid", false, null, "2026-10-28"), "Thiếu hạn thanh toán");
});
