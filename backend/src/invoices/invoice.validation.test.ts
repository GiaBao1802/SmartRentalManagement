import test from "node:test";
import assert from "node:assert/strict";
import { validateBillingWorkspaceQuery, validateCreateInvoice, validateDraftPatch, validateIdempotencyKey, validateInvoicePageQuery } from "./invoice.validation.js";

test("manual draft payload requires only documented Contract and period fields", () => {
  const parsed = validateCreateInvoice({ contract_id: "5", period_start: "2026-01-31", period_end: "2026-02-27" });
  assert.equal(parsed.contractId, 5n);
  assert.equal(parsed.periodEnd.toISOString().slice(0, 10), "2026-02-27");
});

test("manual draft rejects authority, lifecycle and client-calculated amount fields", () => {
  for (const body of [
    { contract_id: "5", period_start: "2026-01-31", period_end: "2026-02-27", owner_id: "1" },
    { contract_id: "5", period_start: "2026-01-31", period_end: "2026-02-27", total_amount: "0" },
    { contract_id: "5", period_start: "2026-01-31", period_end: "2026-02-27", status: "paid" },
  ]) assert.throws(() => validateCreateInvoice(body), (error: any) => error.code === "VALIDATION_ERROR");
});

test("draft PATCH accepts current meter readings only", () => {
  assert.deepEqual(validateDraftPatch({ electricity_current_kwh: 125.5, water_current_m3: "17.250" }), { electricityCurrentKwh: "125.5", waterCurrentM3: "17.250" });
  for (const body of [{ total_amount: 100 }, { status: "paid" }, { electricity_amount: "100" }, { owner_id: "1" }]) {
    assert.throws(() => validateDraftPatch(body), (error: any) => error.code === "VALIDATION_ERROR");
  }
});

test("finalize can reuse readings saved on the draft and accepts only meter inputs", () => {
  assert.deepEqual(validateDraftPatch(undefined, false), {});
  assert.throws(() => validateDraftPatch({ total_amount: 0 }, false), (error: any) => error.code === "VALIDATION_ERROR");
});

test("invoice pagination and Resident filters enforce session-derived scope", () => {
  assert.equal(validateInvoicePageQuery({ status: "unpaid", period_start: "2026-01-01" }, "resident").page, 1);
  assert.throws(() => validateInvoicePageQuery({ resident_id: "4" }, "resident"), (error: any) => error.code === "VALIDATION_ERROR");
  assert.equal(validateInvoicePageQuery({ resident_id: "4", room_id: "7" }, "admin").residentId, 4n);
});

test("Billing workspace query validates bounded paging, IDs, server states and date range", () => {
  assert.deepEqual(validateBillingWorkspaceQuery({ page: "2", page_size: "30", property_id: "14", room_id: "21", resident_id: "9", state: "READY_TO_FINALIZE", period_start: "2026-10-15", period_end: "2026-11-14" }), {
    page: 2, pageSize: 30, propertyId: 14n, roomId: 21n, residentId: 9n, state: "READY_TO_FINALIZE", invoiceStatus: undefined,
    periodStart: new Date("2026-10-15T00:00:00.000Z"), periodEnd: new Date("2026-11-14T00:00:00.000Z"),
  });
  assert.throws(() => validateBillingWorkspaceQuery({ page_size: "51" }), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateBillingWorkspaceQuery({ state: "READY_FROM_FRONTEND" }), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateBillingWorkspaceQuery({ property_id: "x" }), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateBillingWorkspaceQuery({ period_start: "2026-12-01", period_end: "2026-11-30" }), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateBillingWorkspaceQuery({ owner_id: "9" }), (error: any) => error.code === "VALIDATION_ERROR");
});

test("idempotency header enforces documented visible ASCII length", () => {
  validateIdempotencyKey("invoice-1");
  assert.throws(() => validateIdempotencyKey(undefined), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateIdempotencyKey("x".repeat(129)), (error: any) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateIdempotencyKey("contains space"), (error: any) => error.code === "VALIDATION_ERROR");
});
