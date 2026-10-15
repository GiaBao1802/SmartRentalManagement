# Billing Demo Invoice Missing Pricing Diagnosis

**Date:** 2026-10-14  
**Status:** Read-only diagnosis complete; no code or database changes.

## Invoice tested

Used the named demo draft found in the current `Goctro_test3` database, without substituting another fixture:

- Invoice ID: `5004`
- Invoice no.: `DEMO-INV-DRAFT-001`
- Contract: `DEMO-HD-004` (ID `4002`, status `expired`)
- Property: `Nhà mẫu An Cư` (ID `21`, Owner ID `2`)
- Room: `C102`
- Period: `2025-10-15` through `2025-11-04`
- Invoice status: `draft`; snapshot kind: `NOT_FINALIZED`

The period matches the original Contract start-date anchor and lies within the Contract's effective end date (`2025-11-04`). The expired status itself is not a finalize blocker in the inspected implementation for this in-period draft.

## Read-only method and API limitation

Verified the connection identity as `Goctro_test3`, PostgreSQL port `5432`. `GET /api/v1/billing/workspace?invoice_status=draft&property_id=21` returned `401 UNAUTHENTICATED`, and no authenticated Admin billing page was open to supply a session. To avoid manufacturing credentials or switching fixtures, invoked the production `PrismaItemizedInvoicePricing.inspect()` and its meter, utility, Fixed Service, Flexible Service, and Parking resolvers directly against this exact Invoice. These are the same read-only readiness resolvers used by the workspace/finalization path. No data was changed.

## Meter completeness

Invoice stored readings:

| Utility | Opening | Ending | Result |
|---|---:|---:|---|
| Electricity | Missing | Missing | No prior finalized Invoice and no Contract initial reading |
| Water | Missing | Missing | No prior finalized Invoice and no Contract initial reading |

The resolver reported no same-Contract prior finalized reading and no usable Contract initial reading for either utility. Both current/end readings on Invoice 5004 are also NULL. **Meter data is incomplete and is a blocker.**

## Pricing and other charge sources

### Electricity

- Active Property tariff: **none** for Property 21 / Owner 2.
- Published version effective on the Invoice `period_start`: **none**.
- Tier configuration: none to validate because there is no tariff.
- Resolver: `TARIFF_MISSING`.

### Water

- Active Property tariff: **none** for Property 21 / Owner 2.
- Published version effective on the Invoice `period_start`: **none**.
- Flat rate: none to validate because there is no tariff.
- Resolver: `TARIFF_MISSING`.

### Fixed Service

- Property Fixed Service pricing items: **none** (no active or inactive item rows for this Property).
- Resolver: `RESOLVED`, empty service list. Therefore there is no applicable Fixed Service whose price is missing; this is **not** the blocker.

### Flexible Service

- No charge rows were eligible or excluded for Contract 4002 in this Invoice period.
- Resolver: `RESOLVED`, empty charges. No Flexible Service price/amount mismatch is present.

### Parking

- No Parking assignment exists for Contract 4002; no Property Parking pricing item exists for Property 21.
- Resolver: `RESOLVED`, empty entitlement list. Parking does not apply and is **not** a blocker.

## Exact readiness blockers

`readyToFinalize = false`. The production readiness inspector returned:

| Code | Message |
|---|---|
| `ELECTRICITY_OPENING_MISSING` | Chưa xác định được chỉ số điện đầu kỳ hợp lệ. |
| `WATER_OPENING_MISSING` | Chưa xác định được chỉ số nước đầu kỳ hợp lệ. |
| `ELECTRICITY_ENDING_MISSING` | Chưa nhập chỉ số điện cuối kỳ. |
| `WATER_ENDING_MISSING` | Chưa nhập chỉ số nước cuối kỳ. |
| `ELECTRICITY_TARIFF_MISSING` | Thiếu hoặc chưa hợp lệ cấu hình giá điện áp dụng cho kỳ này. |
| `WATER_TARIFF_MISSING` | Thiếu hoặc chưa hợp lệ cấu hình giá nước áp dụng cho kỳ này. |

No `FIXED_SERVICE_*`, `FLEXIBLE_SERVICE_*`, `PARKING_*`, or Contract/period blocker was returned.

## Root cause and next data needed

- **Is a Fixed Service price the reason? NO.** This Property has no Fixed Service catalog items to price.
- **Are utility prices missing? YES.** Both Electricity and Water have no active tariff for the Property.
- **Are meters complete? NO.** Both opening and ending readings are unresolved/missing.
- **Does Parking apply? NO.** There is no assignment/entitlement for this Contract.
- **Code bug found? NO.** The exact resolvers returned concrete, data-backed blockers, and the Contract period matches its anchor.
- **Classification:** `B` missing Water tariff, `A` missing Electricity tariff, `F` missing meter data, `H` incomplete demo fixture.

For this draft to become ready, the authoritative Property utility tariff configuration needs active, published versions effective for `2025-10-15` (Electricity with valid progressive tiers; Water with a valid flat rate), and the Contract/Invoice needs valid source opening readings plus the two ending readings. This report does not create or edit any of them. Since this is a historical 2025 period on an expired Contract, confirm this exact demo draft is intended for finalization before a separate data-provisioning task.

## Files and changes

- Created this diagnosis report.
- Updated `docs/DOCUMENT_CATALOG.md` to index it.
- No source code, schema, Prisma, seed, Requirement, API Spec, or database row was modified.
