# Contract Business Requirement Audit

**Audit date:** 2026-10-12  
**Scope:** Product Requirement vs locked Contract API/backend vs current Admin and Resident frontend. Read-only audit; no code, database, Prisma, API Spec, or Requirement files changed.  
**Conclusion:** Partial alignment. Four business/data gaps and one known API reliability gap should be resolved before claiming full Contract E2E closure.

## 1. Executive summary

The core lifecycle is substantially aligned: one representative Resident, draft revision 0, activation at revision 1, controlled active edits, durable Admin history, successor renewal, early termination fields, Owner/Resident scoping, and safe document metadata are represented in API/backend and frontend. The frontend follows V1 routes, sends concurrency/idempotency headers, does not derive successor access, and preserves the original contractual end date.

The audit found six P1 findings: the required Contract-number lookup is absent end-to-end; no current code path transitions an ended Contract to `expired`; a future termination date is accepted while dependent records end immediately; Contract termination leaves affected Resident `residence_status` stale; renewal copies old meter baselines into a new invoice anchor; and durable idempotency replay remains unimplemented. Six P2 findings concern capacity semantics, deposit deductions, occupancy handoff guidance, Resident list context, archived-Property draft selection, and inclusive expiring-date wording.

**Counts:** P0 = 0, P1 = 6, P2 = 6, P3 = 0.

## 2. Sources and authority

Read and compared:

- Canonical product source: `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, especially §§7, 9, 10, 21, and Contract acceptance criteria.
- Canonical API source: `../GocTro-SmartBuilding/docs/04_API_SPEC.md`, especially §§2, 4, 5.4–5.8, 6–8, 13–14.
- `docs/DOCUMENTATION_RULES.md` and `docs/DOCUMENT_CATALOG.md`.
- `docs/07_modules/contract/CONTRACT_API_V1_3_MIGRATION_REPORT.md` and `CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md`.
- Latest `../GocTro-SmartBuilding/docs/API_SPEC_CONTRACT_V1_3_CONTRACT_HARDENING_REPORT.md` and `API_SPEC_RESIDENT_OCCUPANCY_CONTRACT_HARDENING_REPORT.md`.
- `docs/07_modules/contract/CONTRACT_FRONTEND_MIGRATION_E2E_REPORT.md`.
- `database/schema.prisma`; current Contract repository, validation, routes and tests; Property/Room status/repository; Resident/Occupancy repository; Invoice billing/repository; current Admin Contract and Resident frontend/API helpers.

Authority order used: canonical Requirement for product intent; canonical API Spec for approved request/response and implementation details; current backend for actual behavior; current frontend for user-visible workflow. Migration and audit reports are evidence, not alternate business authority. Legacy/demo behavior was excluded.

The Requirement file header still describes Database V1.3 as its current baseline, while the API Spec and supplied project context identify V1.4 as current physical baseline. This is a stale version note, not a Contract business rule; it was not changed in this audit.

## 3. Contract lifecycle model

Actual statuses are exactly `draft`, `active`, `expired`, and `terminated`. A new Contract is `draft/revision=0`; draft edits are not official history. Activation is `draft → active/revision=1` and records the official baseline. Material active PATCH increments one revision and writes one audit event when a real field changes. Renewal creates a separate `draft/revision=0` successor and leaves its predecessor unchanged. Termination accepts only `active`, changes to `terminated`, increments revision, and appends a lifecycle history event. No reactivation or generic PATCH is allowed for `expired` or `terminated`.

Backend renewal accepts `active` or `expired` predecessors; frontend offers renewal in those same statuses, only when there is no direct successor. Frontend activates only drafts, edits drafts/active records, terminates active records, and exposes no action for terminated records. Vietnamese labels match actual enum values.

**Gap:** repository/source search found no Contract expiry worker, scheduler, route, or mutation assigning `expired`. Date-based Room availability independently checks `start_date <= today <= end_date`, but this does not change the persisted Contract status. An `active` row can therefore remain labelled active after `end_date` and still expose active-only UI actions.

## 4. Requirement matrix

| Requirement | Business rule | Backend status | Frontend status | Gap / severity / recommended action |
|---|---|---|---|---|
| Contract lookup by Room, representative, code, status | Requirement §9 lists all four lookup dimensions. | List supports Property, Room, representative, status, expiry date; no `contract_no` filter. | Same supported filters; no code input. | **P1:** add approved code lookup to API/backend/UI or explicitly amend Requirement before full closure. |
| Exactly one representative; other occupants managed separately | One representative per Contract; other Residents use Room occupancy. | Contract has one representative ID; RoomResident is separate. | Admin chooses one representative. Resident UI also renders its own occupancies separately. | Aligned. No automatic co-signers or extra Contract residents are invented. |
| Create draft with required Contract fields | Code, Room, representative, dates, rent, deposit, signed capacity, initial readings. | Exact create allowlist; meter keys required but nullable; Owner/Property/status/revision server-derived. | Form collects required fields; initial readings are optional and sent as `null`. | Aligned with API's required-nullable reading keys; Requirement does not specify whether readings must contain values. Clarify only if product requires non-null readings. |
| Draft validation and overlap | Draft validation applies; only conflicting active periods are forbidden under the approved overlap rule. | Validates Owner, active Room, Resident, date ordering and capacity; overlap is checked at draft PATCH/activation/renew, not initial create. | Basic client validation; displays backend errors. | No direct conflict: Requirement prohibits overlapping active Contracts. Drafts may coexist pending activation. |
| Room/Property eligibility | Same Owner; inactive Room cannot become active Contract; archived Property cannot activate. | Create verifies active Room but does not reject archived Property; activation rejects inactive Room and archived Property. | Property selector loads all Properties; Room selector filters active Rooms but does not exclude archived-Property Rooms. | **P2:** UI/backend allow a draft that cannot activate. Clarify whether archived Property drafts are useful; otherwise filter/guard before creation. |
| Resident eligibility | One representative; occupancy is a separate relationship. | Requires a non-archived Resident in the authenticated Owner; does not require pre-existing occupancy. | Selects a same-Owner Resident; does not create occupancy. | Aligned with absence of a pre-occupancy requirement. UI should guide Admin to the separate occupancy step after activation (P2). |
| Contract capacity vs Room default | Contract capacity is a snapshot and later Room-default edits do not change it. | Create/activate/renew/active PATCH compare active occupancy and parking counts to proposed Contract capacity; backend blocks decreases below current use. | Create/edit forms let Admin enter/change capacity; active form has no explanation of occupancy/parking consequences. | **P2 ambiguity:** API permits active capacity change while Requirement calls it signed snapshot. Confirm whether negotiated post-signing capacity changes are intended; make impact clear. |
| Dates / effective end | Normal end uses `end_date`; terminated Contract uses earlier `termination_date`; keep history. | SQL date validation and Invoice helper use effective end; room availability is date-based. | Admin/Resident detail distinguishes original end and termination/effective end; no date timezone text. | Mostly aligned. Future termination and expiry-state gaps are separate P1s below. |
| Activation | Draft only, complete data, active Room/Property, no date overlap, capacity safe. | Locks/reloads records; validates all above; activation history is atomic. | Confirmation and pending/error state; status refreshed. | Aligned in code. It does not auto-create occupancy, consistent with separate occupancy model, but follow-up is not guided (P2). |
| Occupancy status consistency on termination | `residence_status` must equal whether any active Occupancy remains, updated atomically with Occupancy. | Contract termination bulk-ends linked `room_residents` but does not recompute affected `residents.residence_status`. Resident end-occupancy route does recompute it. | Resident portal reads the stored Resident status, so it may still show “Đang ở” after the final linked occupancy was ended by Contract termination. | **P1:** recompute each affected Resident from all remaining active occupancy rows in the termination transaction; add regression test. |
| Active edit and concurrency | Active material edits require reason, current revision, history; contract code immutable. | Exact allowlist; `If-Match`; stale 409; no-op no revision; material change increments once. | Reason is required in active form; helper sends quoted revision and conflict reloads latest state. | Aligned. Capacity edit remains a business ambiguity above. |
| History | Admin of same Owner only; Residents never see history/internal `change_reason`/actor. | Owner-scoped, paginated, allowlisted; stable revision ascending; Resident denied. | Admin displays actual entries; Resident Contract UI has no history. | Aligned; current history order follows canonical API (ascending). |
| Renewal | Successor is a new draft; predecessor remains historical and unchanged. | Requires predecessor `If-Match` and idempotency key; clones Room/Property/representative/rent/deposit/capacity/readings; backend sets lineage. | New number and dates only; wording states terms are cloned and new draft is created. | Core lifecycle aligned. Cloned initial readings create a cross-domain billing risk (P1 below). |
| Termination / settlement | Active-only; check debt; retain record; use reason/final readings and settle deposit. | Any `unpaid` invoice blocks; validates dates/readings and `settlement = deposit - deduction`; transaction ends linked occupancy/parking/subscriptions/cycles. | Required fields, formula note, blocked invoice message, history retained. | Core aligned; future date behavior and meaning/evidence for a “valid” deduction need clarification (P1/P2). |
| Resident privacy / successor | Resident sees only own linked Contracts and authorized successor; no other Resident PII/internal history. | Session-scoped detail/list; successor independently reauthorized; history Admin-only. | Renders only API-returned successor; no history; no other Resident summary. | Automated backend privacy regression and frontend helper mapping pass. Browser E2E remains unverified. |
| Documents | Permitted file/metadata viewing; immutable versions; no storage key exposure. | Safe metadata/read DTO; type allowlist and immutable version service; upload returns 503 without adapter. | Admin/Resident metadata/read UX; storage-unavailable state; Admin upload offered with explicit limitation text. | Metadata behavior aligned. Binary storage is known infrastructure debt, not a false-success bug. |

## 5. Creation audit

Requirement fields are represented. `contract_no` is required at create and editable only while draft. Rent/deposit are integer VND and nonnegative; capacity is a positive integer. Start/end are SQL dates, end must be strictly after start. The UI checks date order, money integer syntax, and capacity; backend validates all authoritative values.

Initial meter keys are required by API shape but can be `null`; the UI correctly submits explicit nulls for blank inputs. Requirement says the Contract stores initial readings but does not state that a numeric reading must exist at draft or activation. API also permits activation with null initial readings. Invoices fail closed later when required initial/final utility data is unavailable. This is a documented nullable design, but Product should confirm whether “required” means a required key or an actual reading before signing.

The API allows a draft under an archived Property if its Room remains active, while activation rejects the archived Property. Since Admin options include all Properties, this can create a draft that cannot progress. It is not a database integrity issue; it is an eligibility/UX inconsistency.

## 6. Eligibility audit

- **Room concurrency:** backend checks inclusive date overlap against other `active` Contracts during draft PATCH, activation, and renewal. Initial draft creation can coexist with another Contract because it is not yet active. Overlap is application logic, not a DB exclusion constraint.
- **Room state:** create and activation require an active Room. Activation additionally rejects archived Property. The UI filters inactive Rooms from draft choices, but currently does not filter archived Properties.
- **Owner scope:** backend derives Owner from session and uses Owner-scoped relation checks. Prisma composite relations support Room/Property/Owner and representative/Owner consistency.
- **Resident before occupancy:** backend only requires a non-archived same-Owner Resident; no previous occupancy is required. This is consistent with managing occupancy separately.
- **Multiple Contracts/occupancies:** there is one representative per Contract and separately linked RoomResident history. No rule in the reviewed Requirement establishes a global one-Contract/one-occupancy person invariant; do not invent one.

## 7. Capacity audit

`Room.default_capacity` is the fallback/default for occupancy when no applicable Contract capacity exists. When a Contract applies, `Contract.resident_capacity` is the controlling signed snapshot. Later Room default changes do not rewrite the Contract. Contract create, activation, renewal and supplied active-capacity updates are checked against active occupancy and active parking assignment counts. A decrease below either count is rejected; registrations are not silently removed. This matches the protected capacity behavior.

Open point: the Requirement calls capacity a snapshot “at signing,” while §5.7 permits active PATCH to change `resident_capacity`. Those statements can coexist if an active amendment is an intentional new signed value, but the Requirement does not say that. The Admin editor currently allows it without explaining that it can affect current parking and occupancy eligibility. Product decision and clearer confirmation text are recommended before using this action with real contracts.

## 8. Date and effective-end audit

SQL `DATE` values are parsed/serialized as `YYYY-MM-DD`; the UI formats date-only values without UTC-to-local day shifting. `end_date > start_date` is enforced. Termination date is constrained to the original Contract interval. Invoice code correctly resolves `termination_date` for a terminated Contract and otherwise `end_date`, retaining the original start-date billing anchor and truncating the final period.

Room availability uses date comparison against UTC start-of-day and active occupancy. The Requirement does not define a Contract business timezone. This is lower-priority but should be made explicit if Contract expiry/availability must roll over at Vietnam local midnight.

Persisted `expired` state is not currently derived or transitioned by any discovered backend worker/route. UI trusts the persisted status, so dates and status can diverge after expiry.

## 9. Activation audit

Activation is draft-only; idempotency header required; no `If-Match` is used. The backend locks Room and Contract, reloads current values, checks representative/Room/Property, date range/overlap and occupancy/parking capacity, then changes to `active/revision=1` and writes full safe baseline history atomically. The frontend shows a confirmation and lets the backend decide eligibility.

Activation does **not** create a RoomResident occupancy. That is consistent with Requirement's separate Resident/Room relationship, but the success UX does not clearly lead Admin to add occupants. It also does not refresh an embedded Room list because this detail page does not display one; it provides a link to the Room page, where status is derived from backend data.

## 10. Active edits and revision audit

Draft mutable fields are `contract_no`, representative, dates, rent, deposit, capacity and initial readings; no history/revision is written. Active mutable fields are representative, dates, rent, deposit, capacity and initial readings plus required `change_reason`; `contract_no` and Room are immutable. Active PATCH requires `If-Match: "<revision>"`; stale revisions return 409 without writes. No-op requires a valid reason/revision but adds no history. Material changes increment once and store changed-field before/after atomically.

The frontend form matches the allowlist, includes the reason, and submits the loaded revision. It refreshes on conflict and does not silently overwrite. API helper tests and backend regressions cover the contract; authenticated browser concurrency is still not tested.

## 11. Renewal audit

Renew is a separate `POST /renew`, with required idempotency key and predecessor revision. Body is exactly new `contract_no`, `start_date`, and `end_date`; backend clones terms, associates `previous_contract_id`, creates a draft revision 0, and leaves the predecessor untouched. Only one direct successor is allowed; eligible predecessor states are active/expired. UI correctly says “Tạo hợp đồng gia hạn” / “successor nháp” and does not imply in-place extension.

**P1 cross-domain risk:** backend clones predecessor `initial_electric_kwh` and `initial_water_m3`. Invoice generation for the successor uses prior readings from invoices of that successor Contract, then falls back to its initial readings. A new successor has no invoice history, so copying the original Contract's old meter baseline can charge the same intervening usage again. Renewal UI asks for no new meter reading. The existing decision “clone terms” did not explicitly settle meter baseline semantics. Define whether to carry forward the latest finalized predecessor reading or capture new start readings, then update the API/backend/UI as a separately approved change.

## 12. Termination audit

Only an active Contract can terminate. Backend requires date/reason/final readings/deposit deduction/settlement; rejects final readings below initial values, deduction above deposit, settlement not exactly deposit minus deduction, and any `unpaid` Invoice. It increments revision and atomically records history and closes linked active RoomResidents, parking assignments, active/cancellation-requested amenity subscriptions, and eligible planned cycles. It preserves invoice/payment rows. UI exposes only the active action, includes the fields, explains history retention, and maps unpaid invoice/capacity errors.

**P1 future-date risk:** date validation permits any date within the Contract term, including a future `termination_date`. The route then immediately changes Contract to `terminated` and marks linked occupancy/parking rows `ended` with that future date; it also ends amenity subscriptions immediately. Room availability and Occupancy status queries use row status, not a scheduled effective transition. Thus a future-dated termination can make a room appear vacant and linked occupancy inactive before the selected termination date. Requirement/API do not say whether future termination is permitted. Decide: reject future dates or implement a scheduled transition that leaves current relationships effective until that date.

**P1 Resident status inconsistency:** `PrismaContractRepository.terminate()` ends linked RoomResident rows but does not update `Resident.residence_status`. The separate `endOccupancy()` path recomputes the profile from all remaining active occupancies in the same transaction, and Requirement §7/Resident acceptance criteria require that invariant. If Contract termination ends the Resident's last active occupancy, the portal can still show `living` / “Đang ở.” If another active occupancy remains, the stored value may happen to remain correct, but that is not checked. Recompute affected Resident states atomically and add a Contract-termination regression covering last and remaining occupancies.

**P2 settlement rule gap:** API enforces arithmetic bounds only. It does not capture an itemized deduction basis/evidence or distinguish valid deductions from an arbitrary amount below the deposit. Requirement calls for “khoản khấu trừ hợp lệ” but does not define eligible reasons or approval/evidence. UI has one total deduction field and a reason textarea, so the field-level UX cannot prove deduction validity. Define that policy before production settlement use.

## 13. Occupancy interaction

Activation creates no occupancy. Admin must add/transfer RoomResident through the Resident/Occupancy module. Termination ends only active occupancy rows whose `contract_id` is this Contract and whose start date is not after the termination date; a future-start linked row blocks termination. Other unlinked or differently linked active occupancy is not ended. Room status is derived from an active Contract whose dates include today or any active occupancy; contract lifecycle never directly sets `Room.status`.

Resident profile residence status is maintained by occupancy operations, not by Contract activation. UI shows occupancy history in the Resident portal separately, but the Contract detail activation success does not state that a separate occupancy action may still be required. Add an explicit link/instruction as a frontend follow-up; do not infer automatic creation.

## 14. Invoice dependency

The current Contract termination debt check blocks if any linked Invoice has `status=unpaid`; no partial payment/refund workflow is implied. Invoice periods use Contract start anniversary and effective Contract end; the final invoice may end at termination date and full rent remains for that period, while utility usage uses final readings. Invoice implementation is already a separate module and was not changed in this audit.

The renewal meter-baseline issue above is the main Contract/Invoice correctness dependency discovered. Deposit settlement is currently a Contract command arithmetic check, not an Invoice/Payment refund; no backend cash-transfer/refund is triggered by the settlement fields.

## 15. Documents

Allowed document types are `contract`, `renewal`, `termination`, `attachment`. Admin and authorized related Resident can list safe metadata/read metadata; upload is Admin-only and creates an immutable version when storage/multipart are configured. DTO omits storage key; read URL is nullable/short-lived. Resident cannot upload or read Admin audit history. ContractChangeHistory is distinct from file version history.

Production object storage/multipart remain unconfigured. The backend returns `503 STORAGE_UNAVAILABLE`; UI explains this, surfaces the safe failure, and does not claim binary upload/read succeeded. This is known deployment debt and a partial document capability, not a Requirement/backend rule mismatch.

## 16. Admin UI audit

List shows code/ID, Property/Room, representative Resident, dates, capacity, rent, status/revision and server count/pagination. It supports API filters only. Detail groups identity/status, Property/Room, Resident, original/effective dates, capacity, financial terms, termination, actions, history, lineage and document metadata. Actions correspond to backend status guards. No frontend status write or Room status write exists.

The list does not provide the required code search. The `expiring_before` query is inclusive (`end_date <= supplied date`), but UI text says “đến trước ngày,” which can be read as strictly before; change the label to make inclusion of that date explicit (P2).

## 17. Resident UI and privacy audit

Resident page uses `/me/contracts`, own detail and authorized document reads. It shows code, dates, status, rent, capacity, termination/effective end and backend-provided successor. It does not show change history, internal `change_reason`, actor IDs, or another Resident's data. Successor visibility is never derived locally. Backend fix and tests independently scope successor by session Owner and Resident on both detail and list.

Resident Contract list cards omit Property name and Room code even though the safe Contract DTO contains `room.property` context; that context appears only when the user expands detail and is separately available in the occupancy section. For Residents with multiple contracts/rooms, add the safe Property/Room summary to each list card (P2). Browser privacy evidence is pending; automated backend tests and helper mapping pass.

## 18. Error and edge-case UX

| Condition | Backend result | Frontend behavior | Assessment |
|---|---|---|---|
| Invalid field/date/amount/capacity | `400 VALIDATION_ERROR` | Basic client validation; server message/fallback shown. | Adequate; server remains authority. |
| Foreign/missing Contract/Room/Resident | Generic `404 NOT_FOUND` | Safe error message shown; no existence probing. | Aligned. |
| Active Contract date overlap | `409 CONTRACT_DATE_OVERLAP` | Clear overlap explanation. | Aligned. |
| Occupancy/parking capacity | Specific `409` codes | Human-readable capacity explanations. | Aligned. |
| Stale revision | `409 CONTRACT_REVISION_CONFLICT` | Close stale editor, refresh current detail/history, show reload message. | Aligned; browser race not yet exercised. |
| Unpaid invoice on termination | `409 CONTRACT_HAS_UNPAID_INVOICES` | Explains outstanding invoice prevents termination. | Aligned; no invoice links/context in Contract screen. |
| Invalid lifecycle/renew conflict | `409 CONFLICT` | Uses server's safe message. | Adequate, but exact user wording depends on backend message. |
| Storage unavailable | `503 STORAGE_UNAVAILABLE` / null URL | Separates metadata from missing binary and reports no fake success. | Aligned; feature remains partial. |
| Expiring date boundary | Inclusive `<=` | Text implies strictly before. | P2 wording correction. |

## 19. CONTRACT BUSINESS RULE CONFLICTS

| Source A | Source B | Current backend | Current frontend | Recommended authority / decision |
|---|---|---|---|---|
| Requirement §9 requires lookup by Contract code. | API §5.7 list filter matrix omits `contract_no`. | No code filter/query implementation. | No code search UI. | Requirement remains the product source; approve API/backend/UI support, or explicitly change Requirement. |
| Requirement calls `resident_capacity` a snapshot at signing. | API §5.7 allows active PATCH of that field with revision/history and occupancy/parking guards. | Allows changing active capacity if current use fits. | Active form allows it without explaining it is an amendment to signed capacity. | Product must confirm whether an active signed capacity can be amended and under what terms; do not silently treat “snapshot” as immutable or mutable. |
| Requirement stores initial meter readings and renewal creates a successor. | API says renewal clones predecessor's initial readings; Invoice initializes successor usage from its own prior invoice or that initial reading. | Clones the old baseline; new Contract has no preceding invoice row. | Renewal form has no new meter fields. | Define carry-forward vs new-reading rule in canonical business/API sources before modifying the flow. |
| Requirement does not specify future termination scheduling. | API only constrains termination date to Contract dates. | Accepts future date but immediately closes linked statuses/availability. | Date input permits future dates; text says effective date may be earlier but does not warn about immediate closure. | Decide whether future termination is forbidden or scheduled; then align validation, transaction behavior and UI. |
| Requirement lists `expired` as a status. | API describes status pairing but no expiry command/scheduler behavior. | No discovered expiry transition/job; stale `active` persists past end date. | Displays stored status and offers actions based on it. | Define source/timezone and transition mechanism; canonical API plus backend must agree. |
| Requirement §7 and §21.1 says Resident status is derived from active Occupancies and must update atomically on end. | API §5.5 documents the normal occupancy-end route's status recomputation but §5.7 termination side effects do not mention Resident profile status. | Contract termination ends rows without recalculating impacted Resident profiles. | Portal may display stale `living` after their last active occupancy ended. | Requirement invariant remains authoritative; include profile recomputation in the Contract termination transaction and cover it with tests. |
| API §7 target requires replay-safe idempotency semantics. | Contract hardening/migration reports say implementation validates header only; replay persistence is pending. | No durable same-key replay or different-payload reuse rejection. | Generates a fresh key per request and prevents concurrent local double-click while pending. | Keep the API target authoritative and implement idempotency before production; current frontend does not substitute for server replay. |

These are unresolved cross-source differences or underspecified rules. This report does not choose new business policy or change any canonical source.

## 20. Gaps by severity

### P1 — resolve before full Contract E2E closure

1. **Required Contract code lookup is absent** from API/backend/UI.
2. **`expired` transition is absent**; persisted state and date-based effective state can diverge.
3. **Future termination closes dependent records immediately** while recording a future effective date.
4. **Contract termination does not recompute Resident `residence_status`** after ending linked occupancy rows.
5. **Renewal copies stale initial meter readings**, which can reset a successor invoice's utility baseline incorrectly.
6. **Idempotency replay is not implemented** despite the API target; retried commands are not guaranteed to replay safely.

### P2 — resolve or explicitly accept before production

1. Clarify whether an active signed `resident_capacity` may be amended; explain effects in UI.
2. Define evidence/eligibility for a “valid” deposit deduction; current checks only arithmetic.
3. Guide Admin from Contract activation to the separate Room occupancy workflow.
4. Show Property/Room context on Resident Contract list cards.
5. Avoid or clearly identify drafts on archived Properties that cannot activate.
6. Make the inclusive `expiring_before` date boundary clear in the filter label.

## 21. Recommended fix sequence

1. Product/API decision pass: future termination semantics, expiry boundary/transition, capacity amendment, renewal meter baseline, and deductible basis.
2. Contract API/backend/frontend pass for the P1 rules, including code lookup and server idempotency; do not implement Invoice work as part of that Contract task.
3. UI clarity pass for occupancy next step, archived-property selection, Resident Room/Property summary, capacity confirmation, and inclusive filter wording.
4. Configure Contract object storage/multipart when deployment work is authorized.
5. Run authenticated Admin/Resident E2E using disposable V1.4 records, checking privacy, persistence, revisions and effective Room/occupancy states.

## 22. E2E readiness decision

**CONTRACT BUSINESS REQUIREMENTS — ❌ GAPS MUST BE FIXED BEFORE E2E CLOSURE.**

Exact P1 blockers: Contract code lookup required by Requirement is missing; no backend expiry transition exists; future termination can end Room/occupancy/parking/amenity status early; Contract termination leaves Resident `residence_status` stale; renewed Contracts copy an old utility baseline that affects successor invoice calculations; and Contract commands do not implement the API's durable idempotency replay target. Authenticated browser E2E is also still pending, as recorded in the frontend migration report. No P0 security/privacy defect was found in the reviewed code; successor authorization and cross-Owner scoping are supported by automated tests.

This is a business audit only. No code, Database V1.4, Prisma, API Spec, Requirement, or Invoice implementation was changed. No authenticated browser flow was run in this audit.
