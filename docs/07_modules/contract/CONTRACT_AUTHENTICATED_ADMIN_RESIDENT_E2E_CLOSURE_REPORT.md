# Contract Authenticated Admin + Resident E2E Closure Report

**Run date:** 2026-10-12  
**Scope:** Local/dev authenticated Contract API E2E. No application code or database structure was changed in this pass.

## 1. Executive summary

Admin Contract lifecycle was exercised through the running V1 HTTP API, including create, draft edit, activation, active amendment, renewal, termination, idempotent replay, expiry, and related Room/Occupancy/Resident state. The resident-meter unresolved and explicit-resolution paths also passed through a second renewal fixture.

The closure gates are **PARTIAL**. A valid V1 Resident credential/session was not available, and browser control could not reliably identify the current host browser URL. Admin and Resident browser, responsive, and accessibility gates therefore remain unverified. No results below claim browser completion.

## 2. Environment and preconditions

| Check | Result |
|---|---|
| PostgreSQL | 18.6, `localhost:5432` |
| Database | `Goctro_test3` |
| Public tables | 28 |
| `GET /api/health` | 200 |
| `GET /api/health/db` | 200 |
| `GET /api/v1/auth/csrf` | 200 |
| Frontend `http://localhost:3000` | 200 |
| Existing V1.5 / P1-6 evidence | Present and read before execution |

Existing local dev servers were reused. No additional instance was started.

## 3–4. Authenticated Admin session

Using the real CSRF → login flow, Admin login returned 200 and issued the `gt_session` cookie. `/api/v1/auth/me` returned 200 with role `admin`, active status, account `1`, and Owner `1` derived by the server. Subsequent authenticated detail/list requests succeeded. No session, password, or hash values are recorded here.

Session re-fetch `/auth/me` returned 200. Logout returned 200 and the same session returned 401 from `/auth/me` afterward.

## 5–7. Admin create and negative validation

Created draft Contract **4004** in Owner 1, Room 224, using same-Owner Resident 1001. It persisted as `draft`, revision 0 and was re-fetched through the API. Exact create replay returned HTTP 201 with the same Contract ID and response; changed semantic payload with the same key returned 409 `IDEMPOTENCY_KEY_REUSED`.

Foreign Owner Room and Resident, invalid date range, zero capacity, unsupported field, missing required field, and malformed idempotency key were rejected. Contract count remained unchanged after the rejected create cases; no partial Contract was left behind.

The pass also created support Resident **2012** through the Admin API. It has no account and was used only for Contract-linked occupancy/state verification.

## 8. Draft update and revision semantics

Draft rent update returned 200 and persisted on re-fetch. The draft remained revision 0 with no history row. This follows the current canonical V1 Requirement/API behavior: a draft PATCH is not an official revision. The task text’s request for draft `If-Match`/revision/history conflicts with that canonical contract, so official revision evidence was verified on activation and active amendment instead.

## 9–10. Activation and idempotent replay

Contract 4004 activation returned 200, status `active`, revision 1, and exactly one activation history record. Replaying the same HTTP request/key returned the same Contract and did not add another transition.

## 11. Active capacity amendment

Two active occupancy rows were added through the Admin API for Residents 2006 and 2012. Missing `change_reason` returned 400; stale `If-Match: "0"` returned 409 `CONTRACT_REVISION_CONFLICT`; reducing capacity below the two current occupants returned 409 `ROOM_CAPACITY_EXCEEDED` without a partial change. A valid formal amendment from capacity 3 to 4 returned 200 at revision 2, recorded the reason, and left Room 224 `default_capacity` at 4 (the existing Room value).

Room list showed Room 224 as `occupied` while those occupancy rows were active.

## 12–13. Renewal and successor utility baseline

Renewal of Contract 4004 returned successor draft **4005**, revision 0, linked by `previous_contract_id`. Exact HTTP replay returned the same successor; changed dates with the same key returned 409 `IDEMPOTENCY_KEY_REUSED`. Exactly one successor exists.

An early activation attempt while the predecessor was still active returned HTTP 409 `CONFLICT`. The DB V1.5 partial unique index `one_active_contract_per_room` permits only one active Contract per Room; after Contract 4004 was terminated, Contract 4005 activated successfully. The generic 409 message was “Hợp đồng hoặc phiên bản tài liệu đã tồn tại.” No schema or business rule was changed.

After predecessor termination, Contract 4005 resolved its initial electricity/water values to the predecessor’s final readings `111` / `56`, not its original initial values `100` / `50`. To separately exercise the mandatory unresolved path, expired E2E Contract 4006 was renewed into successor **4008**:

- New successor initially had both readings `null`.
- Activation returned 409 `CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED`.
- Draft PATCH with explicit readings `1.5` / `2.25` returned 200.
- Activation then returned 200 with those exact readings.
- Contract 4008 was terminated through its API lifecycle at revision 2.

This verified the unresolved rejection, explicit fallback, successful activation, and never-fallback-to-original-initial behavior.

## 14–15. Termination and idempotent replay

Future termination date was rejected with 400. Contract 4004 termination on Vietnam business date returned 200 at revision 3. Exact same-key replay returned 200 with the same response; changed termination payload with the same key returned 409 `IDEMPOTENCY_KEY_REUSED`.

The two linked Occupancy rows ended on `2026-10-12`; Residents 2006 and 2012 were recomputed to `left`. Contract 4004 remained `terminated` after later reads.

## 16. Expiry behavior

Past-end fixture Contract **4006** (Room 225) activated, then list/detail reads synchronized it to `expired`, revision 2. Its history count remained exactly 2 after repeated list reads, so expiry was applied once.

Boundary fixture Contract **4007** (Room 226) with `end_date = 2026-10-12` remained `active`, revision 1 on that date. This confirms expiry occurs only after the Vietnam business date passes `end_date`.

## 17–21. Resident session, list/detail, privacy, successor visibility

**BLOCKED / NOT RUN.** No known V1 Resident plaintext credential was available. The configured tenant password belongs to the legacy demo account model and did not authenticate the V1 Resident account. A fallback credential probe was rejected by automatic review, so no further guessing or bypass was attempted. The Resident Contract list/detail, cross-Resident and cross-Owner privacy, successor visibility, and Resident browser gates are unverified.

## 22–24. Persisted cross-domain state and history

Re-fetches confirmed:

- Contract 4004: `terminated`, revision 3; history revisions `[1, 2, 3]` for activation, material update, and status transition.
- Contract 4005: active successor, revision 1, readings `111` / `56`.
- Room 224: was `occupied` with active occupancy and became `available` after both rows ended.
- Occupancies 8/9: `ended`, effective date `2026-10-12`.
- Residents 2006/2012: `left` after no active occupancy remained.
- Contract 4006: `expired`, with one expiry transition/history event.
- Contract 4007: active through its `end_date`.
- Contract 4008: explicit meter readings persisted through activation and termination.

These are direct API/DB re-fetches, not client-only state.

## 25. API version and frontend mapping

The Contract frontend helper calls Contract resources through the shared V1 API client; requests resolve under `/api/v1`. The helper and response/error/concurrency mapping are covered by frontend API tests. No legacy `/api/contracts` call was found in the current Admin Contract UI/helper paths. Browser network inspection was not available.

## 26–29. Browser UI, responsive, accessibility

**BLOCKED / NOT VERIFIED.** The host browser automation could not determine the current browser URL with sufficient confidence and instructed the operator to stop UI automation. No Admin or Resident screens, refresh persistence, pending/duplicate-click states, 1440/768/360px layouts, keyboard/focus behavior, or modal focus behavior are reported as PASS.

Manual host checklist before locking:

1. In Chrome at 1440px, verify Admin list/create/detail/edit/activate/renew/terminate/history, validation and confirmation states; refresh after lifecycle actions.
2. Repeat at 768px and 360px; check page-level overflow, contained table scrolling, form readability, action access, and modal fit.
3. Sign in with a valid V1 Resident account; verify own list/detail, refresh, safe fields, no Admin controls, and generic privacy-safe 404s for foreign Contracts.
4. Repeat Resident screens at 1440/768/360px and keyboard through forms/actions; confirm visible focus and usable dialogs.

## 30–31. Real HTTP idempotency and error evidence

| Operation | Initial | Exact replay | Same-key changed payload | Side-effect evidence |
|---|---:|---:|---:|---|
| Create 4004 | 201 | 201, same body/ID | 409 `IDEMPOTENCY_KEY_REUSED` | One Contract; no draft history |
| Activate 4004 | 200 | 200, same body/ID | Not applicable to empty activation body | One activation history row |
| Renew 4004 → 4005 | 201 | 201, same successor ID | 409 `IDEMPOTENCY_KEY_REUSED` | One successor |
| Terminate 4004 | 200 | 200, same body | 409 `IDEMPOTENCY_KEY_REUSED` | One revision-3 transition; occupancy closed once |
| Activate 4005 after predecessor ended | 200 | 200, same body/ID | Not applicable to empty activation body | One successor activation |

Other observed errors: stale revision 409; future termination 400; unresolved meter baseline 409; foreign create resources 404; malformed inputs 400. Resident-safe error behavior remains unverified without a Resident session.

## 32–33. Frontend validation and backend regressions

- Frontend typecheck: **PASS**.
- Frontend API tests: **26/26 PASS**.
- Frontend production build: **PASS** (Next.js optimized build and route generation).
- Backend Contract: **132/132 PASS**.
- Backend Auth: **20/20 PASS**.
- Backend Property/Room: **44/44 PASS**.
- Backend Resident/Occupancy: **49/49 PASS**.
- Backend Invoice/Zalo: **36/36 PASS**.
- Backend Room Images: **21/21 PASS**.
- Backend regression total: **302/302 PASS**.

The first sandbox invocation could not bind test servers to temporary loopback ports (`EACCES`). The same suites were rerun on the Windows host and all passed.

## 34. Backend typecheck/build

Both backend typecheck and build exit nonzero with **174 existing diagnostics**: 173 in legacy `backend/src/app.ts` and 1 in `backend/src/residents/resident.test.ts`. There are **0 diagnostics** in Contract or Contract Document source/test files. No unrelated legacy diagnostics were changed in this pass.

## 35. Database safety

No Database V1.5 SQL, Prisma, seed, migration, or validator file was changed; no migration, seed, reset, or schema command was run. Only clearly tagged local E2E Contract/Resident/Occupancy rows were created or transitioned through supported APIs. Existing workspace modifications outside this pass were preserved.

## 36–37. Lock decision and limitations

**CONTRACT MODULE: PARTIAL — NOT LOCKED.** Admin authenticated HTTP lifecycle, HTTP replay, business state, frontend checks, and backend regressions passed. Locking is blocked by missing authenticated Resident HTTP/privacy/browser evidence and unavailable host-browser automation. The unresolved baseline case has now been verified over HTTP; no Contract business rule or schema gap remains from that path.

## 38–41. Exact next task

**Resume Contract Authenticated Admin + Resident E2E Closure:** use the host browser to complete the Admin and Resident UI, refresh, responsive, and accessibility checklist above, and authenticate a valid V1 Resident account to run `/api/v1/me/contracts`, own detail, and foreign-resource privacy checks. Then update this report and the document catalog with observed evidence. Do not begin the separate Resident/Occupancy closure, Invoice frontend, or Payment work in this pass.

## 42. Files changed

- `docs/07_modules/contract/CONTRACT_AUTHENTICATED_ADMIN_RESIDENT_E2E_CLOSURE_REPORT.md` (this report)
- `docs/DOCUMENT_CATALOG.md` (catalog entry)

No application, Database V1.5, or Prisma source was changed by this pass.
