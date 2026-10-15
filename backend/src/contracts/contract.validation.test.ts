import assert from "node:assert/strict";
import { test } from "node:test";
import { parseContractPageQuery } from "./contract.routes.js";
import { parseContractId, parseRevisionMatch, validateContractCreate, validateContractListQuery, validateContractPatch, validateEmptyObject, validateIdempotencyKey, validateRenewal, validateTermination } from "./contract.validation.js";
import { contractBusinessDate } from "./contract.date.js";

const valid = {
  contract_no: "HD-100", room_id: "10", representative_resident_id: "20", start_date: "2026-10-15", end_date: "2027-10-14",
  rent_amount: "3500000", deposit_amount: 3500000, resident_capacity: 3, initial_electric_kwh: "100.125", initial_water_m3: null,
};
function rejects(action: () => unknown) { assert.throws(action); }

test("create draft input parses BigInt, exact SQL date and decimal readings", () => {
  const value = validateContractCreate(valid);
  assert.equal(value.roomId, 10n); assert.equal(value.representativeResidentId, 20n);
  assert.equal(value.startDate.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(value.rentAmount, 3500000n); assert.equal(value.initialElectricKwh, "100.125"); assert.equal(value.initialWaterM3, null);
});
test("create rejects non-object body", () => rejects(() => validateContractCreate([])));
test("create rejects owner authority field", () => rejects(() => validateContractCreate({ ...valid, owner_id: "99" })));
test("create rejects property authority field", () => rejects(() => validateContractCreate({ ...valid, property_id: "30" })));
test("create rejects status override", () => rejects(() => validateContractCreate({ ...valid, status: "active" })));
test("create rejects revision override", () => rejects(() => validateContractCreate({ ...valid, revision: 1 })));
test("create rejects renewal lineage override", () => rejects(() => validateContractCreate({ ...valid, previous_contract_id: "9" })));
test("create rejects termination field override", () => rejects(() => validateContractCreate({ ...valid, termination_date: "2027-01-01" })));
test("create requires contract number", () => { const { contract_no: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("create requires room ID", () => { const { room_id: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("create requires representative Resident ID", () => { const { representative_resident_id: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("create requires dates", () => { const { start_date: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("create requires initial electric reading key", () => { const { initial_electric_kwh: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("create requires initial water reading key", () => { const { initial_water_m3: _x, ...body } = valid; rejects(() => validateContractCreate(body)); });
test("invalid calendar date is rejected", () => rejects(() => validateContractCreate({ ...valid, start_date: "2026-02-29" })));
test("start date with timestamp is rejected", () => rejects(() => validateContractCreate({ ...valid, start_date: "2026-10-15T00:00:00Z" })));
test("equal start and end date is rejected", () => rejects(() => validateContractCreate({ ...valid, end_date: valid.start_date })));
test("date range with end before start is rejected", () => rejects(() => validateContractCreate({ ...valid, start_date: "2027-01-01", end_date: "2026-12-31" })));
test("zero resident capacity is rejected", () => rejects(() => validateContractCreate({ ...valid, resident_capacity: 0 })));
test("fractional resident capacity is rejected", () => rejects(() => validateContractCreate({ ...valid, resident_capacity: 1.5 })));
test("numeric string resident capacity is rejected", () => rejects(() => validateContractCreate({ ...valid, resident_capacity: "3" })));
test("unsafe JS money number is rejected", () => rejects(() => validateContractCreate({ ...valid, rent_amount: Number.MAX_SAFE_INTEGER + 1 })));
test("negative money is rejected", () => rejects(() => validateContractCreate({ ...valid, rent_amount: -1 })));
test("fractional money is rejected", () => rejects(() => validateContractCreate({ ...valid, rent_amount: 1.5 })));
test("BigInt overflow money is rejected", () => rejects(() => validateContractCreate({ ...valid, rent_amount: "9223372036854775808" })));
test("12,3 meter precision is accepted", () => assert.equal(validateContractCreate({ ...valid, initial_electric_kwh: "999999999.999" }).initialElectricKwh, "999999999.999"));
test("negative meter reading is rejected", () => rejects(() => validateContractCreate({ ...valid, initial_electric_kwh: "-1" })));
test("meter reading with four decimals is rejected", () => rejects(() => validateContractCreate({ ...valid, initial_water_m3: "1.0001" })));
test("meter reading exponent notation is rejected", () => rejects(() => validateContractCreate({ ...valid, initial_water_m3: "1e3" })));
test("draft patch allows contract number and sparse terms", () => {
  const value = validateContractPatch({ contract_no: "HD-101", rent_amount: "3700000" }, "draft");
  assert.equal(value.contractNo, "HD-101"); assert.equal(value.rentAmount, 3700000n);
});
test("draft patch does not require change reason", () => assert.deepEqual(validateContractPatch({ start_date: "2026-10-16" }, "draft"), { startDate: new Date("2026-10-16T00:00:00.000Z") }));
test("draft patch rejects change reason", () => rejects(() => validateContractPatch({ start_date: "2026-10-16", change_reason: "x" }, "draft")));
test("draft patch rejects owner override", () => rejects(() => validateContractPatch({ owner_id: "99" }, "draft")));
test("draft patch rejects status override", () => rejects(() => validateContractPatch({ status: "active" }, "draft")));
test("draft patch rejects revision override", () => rejects(() => validateContractPatch({ revision: 1 }, "draft")));
test("draft patch rejects room change", () => rejects(() => validateContractPatch({ room_id: "11" }, "draft")));
test("draft patch rejects termination fields", () => rejects(() => validateContractPatch({ termination_date: "2027-01-01" }, "draft")));
test("active patch accepts valid audit reason", () => assert.equal(validateContractPatch({ rent_amount: "3600000", change_reason: "Điều chỉnh theo thỏa thuận" }, "active").changeReason, "Điều chỉnh theo thỏa thuận"));
test("active patch requires change reason", () => rejects(() => validateContractPatch({ rent_amount: "3600000" }, "active")));
test("active patch rejects blank change reason", () => rejects(() => validateContractPatch({ rent_amount: "3600000", change_reason: "  " }, "active")));
test("active patch rejects contract number mutation", () => rejects(() => validateContractPatch({ contract_no: "HD-2", change_reason: "reason" }, "active")));
test("active patch rejects server revision field", () => rejects(() => validateContractPatch({ revision: 5, change_reason: "reason" }, "active")));
test("active patch rejects inverted date range", () => rejects(() => validateContractPatch({ start_date: "2026-10-15", end_date: "2026-10-14", change_reason: "reason" }, "active")));
test("termination parses required settlement values safely", () => {
  const value = validateTermination({ termination_date: "2027-01-01", termination_reason: "Mutual agreement", final_electric_kwh: "101.000", final_water_m3: "74", deposit_deduction: "500000", deposit_settlement_amount: "3000000" });
  assert.equal(value.depositDeduction, 500000n); assert.equal(value.depositSettlementAmount, 3000000n);
});
test("termination rejects missing reason", () => rejects(() => validateTermination({ termination_date: "2027-01-01", final_electric_kwh: "1", final_water_m3: "1", deposit_deduction: 0, deposit_settlement_amount: 1 })));
test("termination rejects negative final reading", () => rejects(() => validateTermination({ termination_date: "2027-01-01", termination_reason: "x", final_electric_kwh: "-1", final_water_m3: "1", deposit_deduction: 0, deposit_settlement_amount: 1 })));
test("termination rejects unsupported caller audit fields", () => rejects(() => validateTermination({ termination_date: "2027-01-01", termination_reason: "x", final_electric_kwh: "1", final_water_m3: "1", deposit_deduction: 0, deposit_settlement_amount: 1, changed_by_account_id: "2" })));
test("renewal requires a new contract number and successor term dates", () => {
  const value = validateRenewal({ contract_no: "HD-NEW", start_date: "2027-10-15", end_date: "2028-10-14" });
  assert.equal(value.contractNo, "HD-NEW"); assert.equal(value.startDate.toISOString().slice(0, 10), "2027-10-15");
});
test("renewal does not accept client-selected room", () => rejects(() => validateRenewal({ contract_no: "HD", start_date: "2027-01-01", end_date: "2028-01-01", room_id: "10" })));
test("renewal rejects client-selected property", () => rejects(() => validateRenewal({ contract_no: "HD", start_date: "2027-01-01", end_date: "2028-01-01", property_id: "8" })));
test("empty activation object is accepted", () => assert.deepEqual(validateEmptyObject({}), {}));
test("activation rejects client status", () => rejects(() => validateEmptyObject({ status: "active" })));
test("list query parses supported filters and pagination", () => {
  const value = validateContractListQuery({ page: "2", page_size: "25", room_id: "10", status: "active", expiring_before: "2027-01-01" });
  assert.equal(value.page, 2); assert.equal(value.pageSize, 25); assert.equal(value.roomId, 10n); assert.equal(value.status, "active");
});
test("list query trims and preserves Contract number partial-search input", () => {
  assert.equal(validateContractListQuery({ contract_no: "  hd-01  " }).contractNo, "hd-01");
});
test("list query rejects blank Contract number search", () => rejects(() => validateContractListQuery({ contract_no: "   " })));
test("Contract business date follows Asia/Ho_Chi_Minh across UTC midnight boundary", () => {
  assert.equal(contractBusinessDate(new Date("2026-10-11T17:05:00.000Z")), "2026-10-12");
});
test("list query rejects unsupported filter", () => rejects(() => validateContractListQuery({ owner_id: "10" })));
test("list query rejects invalid status", () => rejects(() => validateContractListQuery({ status: "deleted" })));
test("list query rejects overlarge page size", () => rejects(() => validateContractListQuery({ page_size: "101" })));
test("list query rejects invalid date filter", () => rejects(() => validateContractListQuery({ expiring_before: "2026-02-30" })));
test("history pagination rejects sort override", () => rejects(() => parseContractPageQuery({ page: "1", sort: "asc" })));
test("contract IDs only accept positive decimal strings", () => assert.equal(parseContractId("123"), 123n));
test("contract IDs reject zero", () => rejects(() => parseContractId("0")));
test("contract IDs reject unsafe numbers", () => rejects(() => parseContractId(123)));
test("If-Match parses quoted revision", () => assert.equal(parseRevisionMatch('"3"'), 3));
test("If-Match rejects missing quotes", () => rejects(() => parseRevisionMatch("3")));
test("If-Match rejects weak etag", () => rejects(() => parseRevisionMatch('W/"3"')));
test("If-Match rejects negative revision", () => rejects(() => parseRevisionMatch('"-1"')));
test("If-Match rejects unsafe revision", () => rejects(() => parseRevisionMatch('"9007199254740992"')));
test("Idempotency-Key accepts visible ASCII", () => assert.equal(validateIdempotencyKey("contract-create-2026-001"), "contract-create-2026-001"));
test("Idempotency-Key rejects missing value", () => rejects(() => validateIdempotencyKey(undefined)));
test("Idempotency-Key rejects whitespace", () => rejects(() => validateIdempotencyKey("contains space")));
test("Idempotency-Key rejects control characters", () => rejects(() => validateIdempotencyKey("invalid\nkey")));
test("Idempotency-Key enforces length limit", () => rejects(() => validateIdempotencyKey("x".repeat(129))));
