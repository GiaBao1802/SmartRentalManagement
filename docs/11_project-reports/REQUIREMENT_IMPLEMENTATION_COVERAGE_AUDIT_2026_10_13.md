# Góc Trọ — Full Requirement ↔ Implementation Coverage Audit

- **Ngày:** 2026-10-13
- **Loại:** read-only audit
- **Phạm vi:** SmartRentalManagement source và canonical docs / Database kề bên GocTro-SmartBuilding.
- **Baseline:** Database V1.6, PostgreSQL 18.6, 28 public tables, LOCK cho local/development; V1.1–V1.5 là historical.
- **Evidence date:** source inventory inspected 2026-10-13. Runtime/test/validator facts are cited from dated current reports; this pass did not connect to PostgreSQL, start servers, or run tests.
- **Files changed:** this report only. No implementation, database, canonical docs, tests, migration, seed, or runtime data changed.

## Authority and method

Authority order: approved Requirement → API Spec → locked physical database → source/runtime → historical reports. Requirement statements were decomposed into 63 auditable checks with report-local IDs; these IDs do not modify canonical Requirement. Status is exclusive per check:

- IMPLEMENTED: complete application path exists for the behavior.
- PARTIAL: some path exists, but end-to-end Requirement is not closed.
- DATABASE_ONLY: physical structure only.
- BACKEND_ONLY: backend path exists but required UI is absent.
- FRONTEND_LEGACY: UI calls legacy/retired API.
- BLOCKED: implementation depends on unconfigured provider/storage/pricing.
- NOT_STARTED: no implementation found.
- OUT_OF_SCOPE: explicitly outside V1.
- SUPERSEDED: old rule replaced by approved business rule.
- CONFLICT: current schema/source semantics contradict current Requirement if used as current behavior.
- UNVERIFIED: available evidence cannot establish the behavior.

“Implemented” does not mean production deployment. Counts do not measure quality. Test totals are not assigned to a rule unless relevant behavior tests are identified. Rows with no fresh runtime evidence say so.

## Traceability matrix

Req § refers to GocTro-SmartBuilding/docs/01_REQUIREMENTS.md; API § to docs/04_API_SPEC.md; DB to Database V1.6 schema.sql/erd.md and SmartRentalManagement/database/schema.prisma. Source paths are under SmartRentalManagement.

| Req ID | Requirement | API | DB | Backend | Frontend | Test/runtime evidence | Status |
|---|---|---|---|---|---|---|---|
| AUTH-001 | Login/logout, CSRF, secure session (Req §5) | §5.1 | accounts/owners | V1 auth/session | login/auth provider V1 | Auth suite 20/20 and prior local smoke in current-state report | IMPLEMENTED |
| AUTH-002 | Role and Owner scope from authenticated identity (Req §3,5) | auth/scope rules | scoped keys/FKs | V1 middleware/repositories | current V1 pages use session | domain/privacy suites; only selected local smoke | PARTIAL |
| ACCT-001 | Admin manages accounts/status (Req §5) | account surface | accounts | no V1 account-admin route | /admin/accounts calls /api/admin/accounts and /api/tenants | no V1 flow evidence | FRONTEND_LEGACY |
| ACCT-002 | Resident invitation/provisioning (Req §5) | delivery/API gap noted | account_invitations | no V1 invitation routes | no V1 enrollment | none; explicitly deferred | DATABASE_ONLY |
| PROP-001 | Property CRUD/archive and Owner scope (Req §6) | §5.4 | properties | V1 routes/repository | Property page V1 | 44 Property/Room tests reported; core local flow historical | PARTIAL |
| PROP-002 | Search/filter and conflict-safe archive (Req §6) | §5.4 | status/indexes; some rules app-side | V1 list/archive checks | V1 page | browser/search/pagination closure gaps in reports | PARTIAL |
| ROOM-001 | Room CRUD/status/capacity and Property scope (Req §6) | §5.4 | rooms/scoped relations | V1 route/repository | Room page V1 | domain suite and prior core E2E; full DoD partial | PARTIAL |
| ROOM-002 | Room pagination/search (Req §6) | §5.4 | supporting indexes | V1 paginated list | V1 room page | automated evidence, full browser matrix not evidenced | PARTIAL |
| IMG-001 | Room gallery upload/order/cover/delete (Req §6) | Room Images API | room_images and DB guards | V1 routes + local disk adapter | V1 gallery/picker | 21/21 tests reported; native picker/browser closure partial | PARTIAL |
| IMG-002 | Shared image attach and reference-safe deletion (Req §6) | bulk attach API | associations/storage key/triggers | V1 service/routes | bulk create/gallery | runtime report has API/storage checks; host browser partial | PARTIAL |
| PUB-001 | Public room list/detail/filter (Req §4) | §5.3 | public fields/status/images | V1 marketplace | home/list/detail use V1 helper | 7/7 tests and HTTP smoke reported; responsive closure partial | PARTIAL |
| PUB-002 | Contact request without public Owner phone exposure (Req §4) | §5.3 | contact_requests | V1 create + scoped inbox | public form/Admin inbox V1 | HTTP/API smoke reported | PARTIAL |
| RES-001 | Admin resident create/search/detail/scope (Req §7) | §5.5 | residents/Owner scope | V1 resident routes | Admin tenant screens V1 | Resident suite reported; authenticated browser closure partial | PARTIAL |
| RES-002 | Backend derives living/left from active occupancy (Req §7) | §5.5 | status field/check; not full derivation | occupancy transaction recalculates | Admin shows status | domain tests; no final Resident browser E2E | PARTIAL |
| RES-003 | Residence-registration state / CT01 eligibility (Req §7–8) | §5.5/CT01 | registration fields/index | resident data route; no export route | resident view; no verified V1 export | no CT01 runtime | PARTIAL |
| RES-004 | Self profile/phone/avatar (Req §16) | gap documented | V1.6 phone/avatar key | no /me/profile/avatar storage route | portal does not close profile flow | no self-service E2E; deferred | DATABASE_ONLY |
| OCC-001 | Add/end/list occupancy with history (Req §7,9) | §5.5 | room_residents lifecycle | V1 occupancy endpoints | Room panel/detail V1 | domain tests; Resident-auth browser partial | PARTIAL |
| OCC-002 | Atomic transfer, Owner consistency and capacity (Req §7,9) | §5.5 | scoped relations; capacity not fully DB-enforced | transaction validation | resident detail V1 transfer | transfer tests; browser flow not fully verified | PARTIAL |
| PORTAL-001 | Resident reads own rental/occupancy (Req §2,7) | §5.6 | residents/occupancy/contracts | /me/rental | /tenant V1 | API tests; authenticated Resident E2E pending | PARTIAL |
| PORTAL-002 | Resident reads own Contract/docs/history under privacy rules (Req §9) | §5.7 | contracts/history/document metadata | V1 self endpoints | portal Contract screens | privacy/Contract tests; full browser closure partial | PARTIAL |
| PORTAL-003 | Resident invoice visibility (Req §10) | §5.8 | invoices | scoped invoice read endpoint | portal has no Invoice UI | Invoice route tests only | BACKEND_ONLY |
| CON-001 | Create/edit draft Contract (Req §9) | §5.7 | contracts/revision constraints | V1 draft commands | Admin contract UI V1 | validation/repository/route tests; E2E partial | PARTIAL |
| CON-002 | Activation creates official revision/history (Req §9) | §5.7 | history table/guards | V1 atomic activation | Admin detail | Contract suites; selected API E2E | PARTIAL |
| CON-003 | Material update, If-Match and append-only history (Req §9) | §5.7 | revision/history trigger | V1 patch/idempotency | Admin detail V1 | concurrency/history tests; browser closure partial | PARTIAL |
| CON-004 | Renewal successor draft and fresh meter baseline (Req §9) | §5.7 | previous_contract_id/constraints | V1 renewal validation | Admin Contract UI | renewal tests and Admin HTTP evidence | PARTIAL |
| CON-005 | Expiry/termination, effective date, close occupancy/parking (Req §9–10) | §5.7–5.8 | lifecycle/end fields | lifecycle handlers and tests | Admin lifecycle UI | prior billing/Contract test evidence; no fresh runtime | PARTIAL |
| CON-006 | Contract capacity and occupancy/parking limits (Req §9,14) | §5.7/5.11 | capacity/relation data | backend transaction checks | forms expose capacity | Contract/Occupancy tests | PARTIAL |
| CON-007 | Durable Owner/account/operation idempotency (Req §9) | §5.7 | contract_idempotency_requests | create/activate/renew/terminate replay | V1 commands | unit/DB concurrency evidence in reports | PARTIAL |
| CDOC-001 | Versioned metadata and authorized document read (Req §9) | §5.7 | contract_documents + immutable metadata guards | V1 metadata/version/read | Contract UI | service tests | BLOCKED |
| CDOC-002 | Actual binary upload/download and retention (Req §9) | §5.7 | storage metadata only | UnconfiguredObjectStorage | UI action exists | real provider E2E absent; API returns unavailable | BLOCKED |
| BILL-001 | Contract anniversary billing period, clamp/no drift (Req §10) | §5.8 | period_start/end/unique period | V1 period logic | Invoice UI legacy | billing tests; no current V1 UI smoke | PARTIAL |
| BILL-002 | Termination date truncation, no later period, full rent (Req §10) | §5.8 | period/end/termination fields | reconciled logic/tests | Admin Invoice legacy | focused billing tests cited in prior task; no fresh runtime | PARTIAL |
| BILL-003 | Draft generation/reminder scheduler/idempotency (Req §10) | §5.8 | unique invoice period | no scheduler mounted/identified | no V1 screen | no scheduler runtime evidence | NOT_STARTED |
| BILL-004 | Beginning/current electricity and water readings (Req §10) | §5.8 | Invoice start/end columns | draft update/read path | Admin Invoice is legacy | route/validation tests; complete meter UI absent | PARTIAL |
| BILL-005 | Intermediate reads at tariff boundary (Req §10) | V1.7 design pending | no reading event/history entity | absent | absent | no test/runtime | NOT_STARTED |
| BILL-006 | Official Property tariff versions, source/effective date (Req §10) | V1.7 design pending | no utility tariff model | UnconfiguredInvoicePricing | no tariff UI | finalize fails closed; no tariff test | NOT_STARTED |
| BILL-007 | Split utility usage by actual boundary reads, no day allocation (Req §10) | V1.7 design pending | no segments/items | no calculation adapter | no V1 UI | no rule test/runtime | NOT_STARTED |
| BILL-008 | No Contract utility/service override; rent from Contract (Req §10) | §5.8 | rent present; no override columns | rent copied to Invoice | legacy Invoice fields | current model aligns at base level; broader flow partial | PARTIAL |
| BILL-009 | Fixed Service configured at Property and charged per Room (Req §10,13) | V1.7 design pending | no new Fixed model | no V1 service routes | Amenities page legacy | none | NOT_STARTED |
| BILL-010 | Fixed Service applicability by Room where needed (Req §10) | design/open point | no applicability for new concept | absent | absent | none | NOT_STARTED |
| BILL-011 | Fixed price change mid-period (Req §10) | explicitly PRODUCT DECISION REQUIRED | not defined | not applicable yet | not applicable yet | no decision evidence | UNVERIFIED |
| BILL-012 | Flexible service billable events; not POS/default Pool/Gym (Req §10,13) | V1.7 design pending | no generic billable-charge model | no V1 intake | bookings page calls legacy API | no current rule test | NOT_STARTED |
| BILL-013 | Invoice item snapshot with category/label/qty/unit/rate/source/version/period/amount (Req §10) | target V1.7; current DTO aggregate | no invoice_items/equivalent | calculator returns aggregates | Admin legacy; Tenant no Invoice | no snapshot tests | NOT_STARTED |
| BILL-014 | Finalized item/financial snapshot immutable; no current-price rerender (Req §10) | §5.8 lifecycle + V1.7 snapshot design | no immutable item rows/trigger | app rejects generic final mutations; no item snapshot | retired Invoice path still called by FE | lifecycle tests only | PARTIAL |
| BILL-015 | Authoritative server total; complete reads/charges before finalize (Req §10) | §5.8 | amount/state columns only | Unconfigured pricing rejects finalize | no V1 Admin Invoice integration | injected-pricing positive tests; production fails closed | BLOCKED |
| ZALO-001 | Revision-aware invoice send log and Zalo delivery (Req §12) | §5.8 | invoice_zalo_oa_send_logs | service/log; unconfigured provider | no V1 Invoice integration | fake-provider service tests | BLOCKED |
| PAY-001 | MoMo/ZaloPay session/attempt/callback (Req §11) | §5.9 | payment_transactions/session IDs and indexes | no V1 Payment routes/provider | no V1 Payment UI | no V1 flow tests | DATABASE_ONLY |
| PAY-002 | Full amount, per-session retries, idempotent callback (Req §11) | §5.9 | some duplicate/success constraints | no application orchestration | absent | none for V1 Payment | DATABASE_ONLY |
| AMEN-001 | Current Property Facility catalog distinct from paid services (Req §13) | §5.10 design pending | old Amenity check/type restricts old model | no V1 Facility API | legacy Amenities screen | none current | CONFLICT |
| AMEN-002 | Former mandatory Pool/Gym 30-day/720-hour cycle | history only; marked superseded | old subscriptions/cycles retained | no current V1 flow; legacy handlers remain | bookings/amenities call legacy | historical tests only | SUPERSEDED |
| PARK-001 | Areas/slots/vehicles/assignment lifecycle (Req §14) | §5.11 | parking tables/FKs/partial unique indexes | no V1 routes | no V1 parking UI | no V1 suite/runtime | DATABASE_ONLY |
| PARK-002 | Contract resident_capacity limits active parking assignments (Req §14) | §5.11 | relations/indexes, not all cross-table capacity | no assignment transaction | no V1 UI | none | DATABASE_ONLY |
| PARK-003 | Free/paid entitlement and one Property pricing authority (Req §10,14) | design pending | no entitlement/pricing source | absent | absent | none | NOT_STARTED |
| COM-001 | Complaint create/status/priority/history (Req §15) | complaint contract documented | complaints/history tables | no V1 complaint route | /admin/complaints calls /api/maintenance-requests | no V1 Complaint suite/runtime | FRONTEND_LEGACY |
| CT01-001 | Property-wide registration review/export (Req §8) | CT01 contract described | registration state only | no export route | no confirmed V1 export flow | none; official form open | NOT_STARTED |
| NOTIF-001 | Notifications/preferences and delivery (Req §12) | notification surface documented | notifications/preferences | no V1 route/worker | no V1 screen | none V1 | DATABASE_ONLY |
| REPORT-001 | Owner dashboard/report aggregates (Req §2) | report surface described | source data only | no V1 dashboard route | no API-connected V1 dashboard found | none | NOT_STARTED |
| FOX-001 | Foxi natural-language assistant (Req §17) | excluded from V1 | no AI schema | no AI service | demo mascot/chat only | none | OUT_OF_SCOPE |
| OCR-001 | OCR for contract/ID/meter (Req §18) | excluded from V1 | no OCR workflow | no service | no V1 flow | none | OUT_OF_SCOPE |
| SEC-001 | Password hashing and secure session (Req §5,20) | §5.1 | password/session state separation | V1 auth | V1 login | Auth tests and prior local smoke | IMPLEMENTED |
| SEC-002 | Tenant privacy and scoped not-found (Req §3,20) | auth/privacy contract | selected scoped FKs | V1 repositories guard scope | V1 screens use scoped routes; legacy remains | privacy tests; not all runtime scenarios repeated | PARTIAL |
| ACC-001 | Clear invoice categories/amount explanation (Req §10) | aggregate current, item target | only amount buckets | aggregate serializer | legacy Admin, no Resident Invoice | no item display test | PARTIAL |
| ACC-002 | Preserve material lifecycle history in relevant domains (Req §§7–15) | per-domain contracts | selected history tables | varies by mounted V1 domain | varies; legacy screens omit current history | per-domain tests, partial E2E | PARTIAL |

## Coverage counts

The matrix has **63** audit checks; mutually exclusive counts are:

| Status | Count |
|---|---:|
| IMPLEMENTED | 2 |
| PARTIAL | 31 |
| DATABASE_ONLY | 7 |
| BACKEND_ONLY | 1 |
| FRONTEND_LEGACY | 2 |
| BLOCKED | 4 |
| NOT_STARTED | 11 |
| OUT_OF_SCOPE | 2 |
| SUPERSEDED | 1 |
| CONFLICT | 1 |
| UNVERIFIED | 1 |
| **Total** | **63** |

## Module summary

| Module | Requirement coverage / implementation | Main gap |
|---|---|---|
| Auth | Login/session implemented; Owner scope partial | Account administration and Resident provisioning |
| Property / Room | V1 DB/API/UI present; partial closure | full search/pagination/browser acceptance |
| Room Images | V1 DB/API/UI and tests | native picker/browser completeness; production storage |
| Public Marketplace | V1 list/detail/contact across stack | full responsive and browser closure |
| Resident / Occupancy | V1 Admin data and occupancy flows | authenticated Resident browser, profile/avatar/provisioning |
| Resident Portal | V1 rental/Contract reads | Invoice UI, profile, account enrollment |
| Contract | V1 lifecycle/revision/renewal/idempotency/FE | complete browser closure and binary storage |
| Contract Documents | metadata and version API | real binary provider is unconfigured |
| Billing / Invoice | base V1.2 lifecycle exists | tariff/segments/items/snapshot, Admin and Resident V1 UI; finalize blocked |
| Zalo | log/service interface exists | provider/configuration and actual send |
| Payment | DB structures | API, provider, UI and runtime flow absent |
| Services / Facilities | old DB model | new Facility/Fixed/Flexible business flow absent; old model conflicts |
| Parking / Vehicles | DB structures | V1 routes/UI, capacity transaction, entitlement pricing absent |
| Complaints | DB structures and legacy page | V1 API absent; page targets maintenance-request endpoint |
| CT01 | resident registration data | export route/UI and official form |
| Notifications | DB structures | API/worker/UI absent |
| Dashboard / Reports | source data | aggregate API/UI absent |
| Foxi / OCR | explicitly out of V1 | no V1 implementation expected |

## DATABASE CAPABILITY WITHOUT APPLICATION FEATURE

Table presence means only that storage is possible, not that a user can complete a workflow.

| V1.6 capability | Physical capability | Missing application feature |
|---|---|---|
| Payment | payment_transactions, payment_session_id and duplicate/success indexes | no V1 session orchestration, callbacks/provider, UI or application tests |
| Amenity/subscription | amenities, price history, subscriptions, 720-hour cycles/snapshots | no V1 API/service; old semantics superseded |
| Parking/vehicles | areas, slots, vehicles, assignments and partial active uniqueness | no V1 API, capacity transaction, UI or price/entitlement |
| Complaints | complaints and complaint_history | no V1 Complaint route; UI maps to maintenance requests |
| Account invitations | token-hash/status/expiry schema and DB guards | no V1 route, delivery, setup-password or enrollment UI |
| Notifications | notifications/preferences | no delivery worker/API/UI |
| Resident avatar | nullable storage key and uniqueness guard | no upload/storage/read API; audit reports no populated keys |
| Contract documents | versioned metadata and immutability guards | binary provider unconfigured, uploads/downloads blocked |
| Invoice item snapshot | none; no invoice_items/equivalent | cannot store the approved line-level snapshot as first-class data |
| Official utility prices | no Property utility tariff/version/source model | backend has no authoritative rates |

DB does enforce selected checks, uniqueness, partial indexes and triggers. It does not independently enforce every transaction-level rule. Capacity across occupancy/Contract/Parking needs backend coordination. Amenity price history has no V1.6 immutable-history trigger; a row being insertable does not mean it cannot be updated/deleted.

## IMPLEMENTATION WITHOUT CURRENT REQUIREMENT AUTHORITY

| Existing behavior/code | Authority comparison | Classification |
|---|---|---|
| Pool/Gym mandatory subscriptions and 720-hour cycles | current Requirement/API mark old behavior superseded | superseded business logic retained for historical data |
| Generic unversioned invoice CRUD that accepts totals/payment state | violates authoritative finalize and immutable financial boundary; /api/invoices now 410 | retired legacy; current FE still calls it |
| tenant/userAccount/leaseContract/legacy role and enum model | differs from Resident/Account/Contract V1 | legacy code still present/type-invalid in app.ts |
| localStorage/sessionStorage/demo JSON | not the required backend persistence for Next/V1 | legacy demo only |
| viewing request/appointment promise | public contract authorizes persisted contact request, not accepted appointment | legacy/unapproved workflow |
| Foxi demo chat | AI is out of V1 | demo/reference only |

## Requirement approved but not implemented

**P0 — Billing critical path:** authoritative Property tariff history; boundary meter reads and tariff segmentation; Fixed per-Room service; Flexible billable-charge intake; invoice items/snapshot; Admin V1 Invoice UI and Resident invoice read UI; production pricing adapter. Current UnconfiguredInvoicePricing intentionally fails closed.

**P1 — near dependencies/module closure:** Contract binary storage; Account administration and Resident invitation/profile flow (currently intentionally deferred); Zalo provider; Parking/Vehicle workflows after design; V1 Complaint replacing the maintenance page; CT01 review/export after form confirmation.

**P2 — remaining V1 scope:** Notifications delivery/preferences UI; Dashboard/Reports API/UI; new Facility/Fixed/Flexible experiences; full browser/runtime closure for partial modules.

**OUT OF V1:** Foxi AI, OCR, multi-admin/staff, appointment booking promises, partial/refund payment features not approved by Requirement.

These are coverage groupings, not a roadmap change or approval. Resident remains frozen as directed.

## Business rule conflict audit

### Billing

- Property utility tariff versions/source/effective date: absent in Database V1.6; backend pricing adapter is unconfigured. Approved rule is not implemented; finalization fails closed.
- Tariff boundary readings/segments: absent; current V1.2 stores only beginning/current Invoice readings and has no reading-history entity.
- Contract utility/service price override: no such Contract price columns; rent remains Contract-sourced. This boundary is aligned, but does not implement Property tariff math.
- Fixed/Flexible and Facility: DB Amenity type/check restricts old pool/gym subscription or information meanings. If used for current behavior, it conflicts with the newly approved distinction.
- Parking fee: assignment schema exists; entitlement charge type and Property price link do not.
- Append-only price history: Requirement says append-only; V1.6 amenity_price_history has no immutable trigger.
- Invoice snapshot: DB has aggregate amount buckets, no item/rate/unit/source/version snapshot or immutable item guard. API current DTO is aggregate-only; future breakdown is marked V1.7 design pending.
- Finalized immutability: backend blocks generic finalized financial edits; direct SQL is not fully blocked by DB. Retired unversioned Invoice endpoint returns 410, but Admin Invoice page still calls it.

### Resident / Contract / other

- living/left is recalculated by supported occupancy backend transactions; no global DB derivation trigger was found, so direct DB writes can bypass the application invariant.
- V1.6 Resident Owner scope exists and API/domain tests cover scope; current evidence does not establish complete authenticated Resident-browser closure.
- No fake Resident self-service exists; avatar/profile/provisioning are incomplete.
- Contract checks cover capacity, termination, renewal meter baseline, revision and durable idempotency in code/tests. Some cross-table capacity/lifecycle guarantees remain backend transaction rules; full browser closure is partial.
- Contract document metadata works, but binary storage is blocked by UnconfiguredObjectStorage.
- Existing legacy backend encodes old concepts and legacy Prisma fields; routes existing in app.ts are not evidence they compile or work on V1.6.

## API CONTRACT GAP

| API area | Contract vs application | Classification |
|---|---|---|
| Property/Room, Resident/Occupancy | V1 contract and mounted routes/FE; closure evidence partial | implementation with closure gaps |
| Contract §5.7 | documented/locked contract and mounted API/FE; storage/browser gaps remain | partial |
| Contract document binary | API metadata surface exists; object storage unconfigured | blocked |
| Invoice V1.2 | aggregate DTO/lifecycle defined; routes/tests exist; pricing unconfigured and FE legacy | partial/blocked |
| Billing V1.7 | approved rules, exact API/DTO pending | design pending, correctly labeled |
| Payment | contract exists, no V1 router/provider/UI | contract without implementation |
| Facility/Paid Service | old API marked superseded; replacement design pending | design pending; legacy FE callers remain |
| Parking, Complaint, CT01, Notifications, Dashboard | API/business surfaces documented; no matching mounted V1 routes | contract without implementation |
| Account provisioning | schema and business concept, no invitation route or delivery flow | implementation gap; deferred |

Aggregate-only Invoice DTO versus new item-snapshot Requirement is a known future design gap, not evidence of an item implementation. Documented contract endpoints must not be mistaken for mounted runtime routes.

## Legacy drift and current UI

| Screen/source trace | Finding |
|---|---|
| Public home/list/detail/contact — frontend app and lib/api/publicRoomApi.ts | calls V1; responsive/browser closure partial per module reports |
| Admin Property/Room/images — admin/properties and propertyApi/roomApi/roomImageApi | calls V1; browser acceptance partial |
| Admin Residents/Occupancy — admin/tenants, residentApi, occupancyApi | calls V1; resident-auth final E2E/profile remain open |
| Admin/Resident Contract — admin/contracts and tenant portal | calls V1; document binary blocked |
| Admin Invoice — admin/invoices/page.tsx uses DataManagement endpoint /api/invoices | legacy caller; backend explicitly returns 410 |
| Resident Invoice — tenant/tenant-portal.tsx | no Invoice list/detail/payment UI |
| Admin Accounts — admin/accounts/page.tsx calls /api/admin/accounts and /api/tenants | legacy caller; no V1 account-admin API |
| Admin Amenities/Bookings — admin/amenities and admin/bookings | unversioned legacy API; not the current Facility/Flexible behavior |
| Admin Complaints — admin/complaints uses /api/maintenance-requests | not Complaint V1 |
| Admin Viewings — admin/viewings uses /api/viewing-requests | legacy workflow; public current API is a contact request |
| Parking/Vehicles | no V1 connected UI/routes found |
| Foxi | mascot/demo only; no AI route |

Old search families: Pool/Gym, 30-day/720h are retained legacy DB/code but superseded; tenant/userAccount/leaseContract and LANDLORD/old billing/payment enums remain in legacy app.ts/pages; localStorage/sessionStorage/demo-database.json belong to legacy app, not Next V1. Unversioned /api/properties, rooms, contracts and invoices are retired (410); /api/amenities, amenity-bookings, maintenance-requests and viewing-requests remain legacy namespaces called by UI.

Current-state report dated 2026-10-12 records backend project typecheck EXIT 2 with 174 legacy TypeScript diagnostics concentrated in app.ts; backend domain suites 309/309, frontend API tests 26/26, frontend typecheck/build PASS at that snapshot. These totals are not rerun or summed in this audit. Module reports separately cite Property/Room 44/44, Room Images 21/21, Public Marketplace 7/7 and selected local HTTP/E2E evidence. No test was run for this read-only pass.

## Requirement quality and documentation recommendations

- Requirement has no stable per-rule IDs; report IDs are local audit references. Acceptance criteria are high-level and some detailed rules are repeated between module sections and §21.
- Billing rules now distinguish approved behavior from actual open decisions; “if needed” meter metadata and unspecified service applicability must not be invented as schema decisions.
- Keep every old Pool/Gym quotation explicitly marked SUPERSEDED. DB legacy structure must not override canonical business authority.
- The API Spec is ahead of mounted implementation for Payment, Parking, Complaint, CT01, Notifications and Dashboard. Add an implementation-status note/link where readers might mistake endpoint contract for deployed route; do not alter business contract in this audit.
- Existing Billing V1.2 aggregate DTO is explicitly distinguished from the V1.7 target. Keep that distinction prominent.
- No conflicting current utility/parking decision between synced Requirement and API Spec was found. Main divergence is implementation: legacy UI/backend still invokes retired/superseded behavior, while approved V1.7 is not implemented.

## Most important mismatches

1. Invoice finalization lacks Property utility tariff history/source/version and production price calculator.
2. No intermediate meter readings or actual tariff-boundary segment calculation.
3. No invoice item snapshot; amount buckets cannot explain quantity, unit, rate/source/version/period.
4. Admin Invoice still calls retired /api/invoices; Resident has no V1 Invoice UI.
5. V1.6 Amenity checks and legacy handlers encode superseded Pool/Gym subscription semantics.
6. Payment tables/API contract exist but no V1 route/provider/UI/application test path.
7. Parking/Vehicles tables exist but no V1 route/UI/capacity transaction/pricing entitlement.
8. Account invitation schema exists without V1 route, delivery, setup or enrollment UI.
9. Complaints UI maps to maintenance-requests instead of complaint data/API.
10. Contract binary storage remains unconfigured.
11. Backend typecheck is known to fail with 174 legacy diagnostics, so whole-project build health is not established.
12. Notifications and CT01 lack application delivery/export; Dashboard has no V1 aggregate endpoint.
13. Room Images/Marketplace automated coverage exists but host-browser/native-picker and responsive closure are partial.
14. Resident living/left depends on backend write transactions; DB does not derive it for arbitrary direct writes.
15. Current legacy app.ts contains code incompatible with current Prisma V1.6 models; route presence does not establish runnable behavior.

## Roadmap impact

Billing → Payment → Services/Amenities → Parking remains reasonable. Billing is the immediate dependency because final amount and snapshot must be authoritative before Payment consumes finalized invoices. Services should follow the approved Facility/Fixed/Flexible model; Parking follows entitlement/capacity/pricing boundaries. No roadmap change is recommended. Resident remains FROZEN; no unrelated Resident task is justified by this audit.

## Database V1.7 readiness

- **Database V1.7 required: YES.** V1.6 cannot persist Property utility tariff history/source, boundary meter-reading records, generic Fixed/Flexible billable inputs, or first-class immutable invoice item snapshots.
- Likely design gaps: versioned Property prices/tariffs; meter reads at boundaries; durable billable-charge references; invoice-item snapshots and finalized amendment/immutability relationship. No DDL, entity names, or schema design is approved here.
- Not every gap requires a DB change: open formulas/rounding and product decisions, UI entry, API/provider orchestration, scheduler, backend transactions, Zalo provider, and object storage need business/application/configuration work.
- Preserve V1.6 Amenity/subscription/cycle and aggregate Invoice data for historical compatibility pending reviewed mapping. Stop using superseded 30-day behavior as current product logic.
- **Readiness: NOT READY TO IMPLEMENT** until remaining product decisions are closed or expressly bounded; design discovery may proceed without producing final DDL.

## Evidence and limits

Sources read: docs/DOCUMENTATION_RULES.md, DOCUMENT_CATALOG.md; canonical 01_REQUIREMENTS.md, 04_API_SPEC.md, DATABASE_CHANGELOG.md; Database V1.6 README/schema/ERD/seed/validator/migration; Prisma schema; backend app/router/domain/test files; frontend routes/helpers; PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md; BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md; BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md; current module reports for Auth, Property/Room, Room Images, Marketplace, Resident/Occupancy, Contract, Invoice/Zalo and V1.6.

The current-state report records Goctro_test3 V1.6: PostgreSQL 18.6, 28 public tables, validator 97/97 and Prisma validate/generate PASS at report time. This audit did not rerun DB validation or service health. Historical module tests are cited with their scope; positive injected-pricing tests do not establish real tariff/item calculation.

## Exact next task

**GÓC TRỌ — BILLING V1.7 PRODUCT DECISION CLOSURE + API/DATABASE DESIGN PASS**

First resolve only remaining product decisions: electricity tariff model/rounding, water locality/provider, Fixed Service mid-period/applicability, Flexible cancellation/refund, and Parking unit/proration. Then prepare V1.7 API/database design for review. Do not migrate or implement until the design is approved and validated against V1.6.
