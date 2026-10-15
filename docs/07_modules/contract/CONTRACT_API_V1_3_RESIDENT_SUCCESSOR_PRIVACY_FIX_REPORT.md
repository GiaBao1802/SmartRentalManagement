# Contract API V1.3 Resident Successor Privacy Fix

## Result

Fixed the Resident successor disclosure at the repository query boundary. Resident-owned Contract detail and `/me/contracts` now load a successor summary only when that successor independently matches the authenticated Owner and Resident access rule. Admin Owner-scoped successor summaries are unchanged.

The API hardening task remains **NOT LOCKED** until §5.7 is rerun as requested.

## Root cause and affected endpoints

`contractSummary` originally included the direct successor summary without a Resident filter. `contractDto()` serialized that nested summary for both roles. A Resident authorized for the predecessor could therefore receive a successor's `contract_id`, `contract_no`, `status`, and `revision` even if the successor had been reassigned to another representative.

Affected endpoints:

- `GET /contracts/{contract_id}` when called by a Resident.
- `GET /me/contracts` for every returned Contract row.

## New authorization rule

The repository uses a Resident-specific Contract include for both Resident endpoints. The nested successor query independently requires:

- `owner_id` from the authenticated session; and
- either `representative_resident_id` equal to the authenticated Resident, or a RoomResident relation for that same Resident and Owner.

The Resident ID is supplied only by authenticated request context. If no independently authorized successor matches, Prisma returns an empty nested relation and the existing DTO convention omits `successor`. The predecessor remains a normal successful response; it is not changed to 404. A successor linked by `previous_contract_id` alone is insufficient for Resident visibility.

Admin lookups still use the existing unfiltered `contractSummary` after an Owner-scoped Contract query, so Admin behavior is preserved.

## Changes and tests

- Added `residentContractSummary(ownerId, residentId)` and applied it to `findForResident()` and `listMine()`.
- Added repository tests asserting independent Owner + Resident filtering for detail and `/me/contracts` queries.
- Added route tests for Admin visibility, independently authorized Resident visibility, reassigned successor hiding (including no successor ID/number/status/revision in response), `/me/contracts` hiding, and foreign-Owner 404 behavior.

## Validation results

| Check | Result |
|---|---:|
| Contract suite | **112/112 PASS** |
| Auth regression | **20/20 PASS** |
| Property/Room regression | **33/33 PASS** |
| Resident/Occupancy regression | **37/37 PASS** |
| Backend typecheck before fix (known baseline) | **173 errors**, all in `backend/src/app.ts` |
| Backend typecheck after fix | **173 errors**, all in `backend/src/app.ts`; **0 non-`app.ts` errors** |

Tests use fake repository/storage fixtures and local HTTP test servers. No database command was run.

## Files changed for this fix

- `backend/src/contracts/contract.repository.ts`
- `backend/src/contracts/contract.repository.test.ts`
- `backend/src/contracts/contract.routes.test.ts`
- `docs/07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md`

No backend route file or `auth/v1.router.ts` change was needed. `docs/04_API_SPEC.md`, Requirements, Database V1.3, Prisma, and frontend were not modified.

## Next step

Rerun **Contract API V1.3 Contract Hardening**. Do not start Invoice migration until that review has completed and the Contract section is locked.
