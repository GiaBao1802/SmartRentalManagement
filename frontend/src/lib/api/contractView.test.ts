import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "./errors";
import { changedContractFields, contractErrorMessage, contractHistoryChangeLabel, contractHistoryChangeRows, contractStatusLabel, effectiveContractEnd, formatContractMoney } from "./contractView";

test("Contract UI maps only V1 statuses and preserves bigint VND formatting", () => {
  assert.deepEqual([contractStatusLabel("draft"), contractStatusLabel("active"), contractStatusLabel("expired"), contractStatusLabel("terminated")], ["Nháp", "Đang hiệu lực", "Hết hạn", "Đã chấm dứt"]);
  assert.equal(formatContractMoney("4500000000000000"), "4.500.000.000.000.000 ₫");
  assert.equal(formatContractMoney(null), "—");
});

test("terminated effective end uses termination date while normal expiry uses contractual end date", () => {
  assert.equal(effectiveContractEnd({ status: "terminated", end_date: "2027-10-14", termination_date: "2027-01-01" }), "2027-01-01");
  assert.equal(effectiveContractEnd({ status: "expired", end_date: "2027-10-14", termination_date: null }), "2027-10-14");
  assert.equal(effectiveContractEnd({ status: "terminated", end_date: "2027-10-14", termination_date: null }), "2027-10-14");
});

test("history field summary comes from API before/after snapshots and conflicts remain explicit", () => {
  assert.deepEqual(changedContractFields({ revision: 2, change_type: "material_update", change_reason: "Thỏa thuận", before_data: { rent_amount: "4", end_date: "2027-01-01" }, after_data: { rent_amount: "5", end_date: "2027-01-01" }, changed_by_account_id: "7", created_at: "2026-10-12T00:00:00Z" }), ["rent_amount"]);
  assert.equal(contractErrorMessage(new ApiError("xung đột", 409, "CONTRACT_REVISION_CONFLICT"), "fallback"), "Hợp đồng đã được thay đổi ở nơi khác. Vui lòng tải lại dữ liệu mới nhất.");
  assert.equal(contractErrorMessage(new ApiError("server detail", 409, "IDEMPOTENCY_KEY_REUSED"), "fallback"), "Yêu cầu này đã được sử dụng với dữ liệu khác. Vui lòng tải lại và thử lại.");
  assert.equal(contractErrorMessage(new ApiError("hóa đơn chưa thanh toán", 409, "CONTRACT_HAS_UNPAID_INVOICES"), "fallback"), "Hợp đồng còn hóa đơn chưa thanh toán nên chưa thể chấm dứt.");
  assert.equal(contractErrorMessage(new ApiError("meter baseline", 409, "CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED"), "fallback"), "Chưa xác định được chỉ số đầu kỳ của hợp đồng mới. Vui lòng bổ sung chỉ số trước khi kích hoạt.");
  assert.equal(contractErrorMessage(new ApiError("503", 503, "STORAGE_UNAVAILABLE"), "fallback"), "Dịch vụ lưu trữ tệp chưa được cấu hình. Metadata hiện có vẫn được giữ nguyên.");
});

test("contract history maps business labels and hides identifiers and unknown technical fields", () => {
  const context = {
    contract: {
      contract_id: "91", contract_no: "GT-0091", room_id: "12", property_id: "3", owner_id: "1",
      representative_resident_id: "7", previous_contract_id: "88", start_date: "2026-11-12", end_date: "2027-11-11",
      status: "active" as const, revision: 2, rent_amount: "2200000", deposit_amount: "1000000", resident_capacity: 3,
      initial_electric_kwh: "111", initial_water_m3: "56", termination_date: null, termination_reason: null,
      final_electric_kwh: null, final_water_m3: null, deposit_deduction: null, deposit_settlement_amount: null,
      created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z",
      room: { room_id: "12", room_code: "P.12", property: { property_id: "3", name: "Khu A", province: "Đồng Nai", address: "Đồng Nai" } },
      representative_resident: { resident_id: "7", full_name: "Nguyễn An" },
    },
    residents: [{ resident_id: "7", full_name: "Nguyễn An" }],
  };
  const rows = contractHistoryChangeRows({
    revision: 2, change_type: "activation", change_reason: null, changed_by_account_id: "99", created_at: "2026-11-12T00:00:00Z",
    before_data: { status: "draft", room_id: "11", representative_resident_id: "6", previous_contract_id: null, internal_token: "secret" },
    after_data: { status: "active", room_id: "12", representative_resident_id: "7", previous_contract_id: "88", internal_token: "changed" },
  }, context);
  assert.deepEqual(rows.map(({ label, before, after }) => ({ label, before, after })), [
    { label: "Trạng thái hợp đồng", before: "Nháp", after: "Đang hiệu lực" },
    { label: "Phòng", before: "Thông tin phòng chưa có trong hồ sơ", after: "Phòng P.12" },
    { label: "Người đứng tên hợp đồng", before: "Thông tin người đứng tên chưa có trong hồ sơ", after: "Nguyễn An" },
    { label: "Hợp đồng trước", before: "Không có", after: "Có hợp đồng trước" },
  ]);
  assert.equal(contractHistoryChangeLabel("activation", "active"), "Kích hoạt hợp đồng");
  assert.equal(JSON.stringify(rows).includes("internal_token"), false);
  assert.equal(JSON.stringify(rows).includes("88"), false);
});
