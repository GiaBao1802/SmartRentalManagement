import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatAdminDate,
  formatAdminMoney,
  formatAdminStatus,
  formatAdminTimestamp,
  formatOptionalText,
  residenceStatusLabel,
} from "./admin-presentation";

test("admin presentation formats VND and empty or invalid amounts safely", () => {
  assert.equal(formatAdminMoney("2200000"), "2.200.000 ₫");
  assert.equal(formatAdminMoney(0), "0 ₫");
  assert.equal(formatAdminMoney(null), "—");
  assert.equal(formatAdminMoney("not-money"), "—");
});

test("admin presentation formats business dates and timestamps in Vietnamese", () => {
  assert.equal(formatAdminDate("2026-11-12"), "12/11/2026");
  assert.equal(formatAdminDate("invalid"), "—");
  assert.equal(formatAdminTimestamp("2026-10-12T06:26:01.000Z"), "13:26 12/10/2026");
  assert.equal(formatAdminTimestamp(undefined), "—");
});

test("admin presentation maps statuses without exposing unknown enum strings", () => {
  assert.equal(formatAdminStatus("ARCHIVED"), "Ngưng hoạt động");
  assert.equal(formatAdminStatus("unpaid"), "Chưa thanh toán");
  assert.equal(formatAdminStatus("waiting_for_x"), "Chưa xác định");
  assert.equal(formatAdminStatus(null), "Chưa xác định");
});

test("optional text and resident state avoid nulls and infer past residence only from history", () => {
  assert.equal(formatOptionalText(null), "—");
  assert.equal(formatOptionalText("  ", "Chưa cập nhật"), "Chưa cập nhật");
  assert.equal(residenceStatusLabel("left"), "Không có lượt ở hiện tại");
  assert.equal(residenceStatusLabel("left", 0), "Chưa từng lưu trú");
  assert.equal(residenceStatusLabel("left", 1), "Đã rời đi");
  assert.equal(residenceStatusLabel("living"), "Đang ở");
});
