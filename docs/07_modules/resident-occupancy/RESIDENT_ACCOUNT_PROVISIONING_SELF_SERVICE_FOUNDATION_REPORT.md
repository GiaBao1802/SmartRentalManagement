# Resident Account Provisioning + Self-Service Foundation Pass

**Ngày:** 2026-10-12  
**Trạng thái:** `BLOCKED BEFORE IMPLEMENTATION`  
**Phạm vi:** Account/Invitation schema, canonical Account API contract, Auth V1, Resident self-service and frontend readiness audit.  
**Database V1.5:** unchanged; no database commands or application mutations were run.

## 1. Executive summary

The physical schema already has the core records and constraints for a Resident invitation: Owner, Resident, creating Admin, token digest, lifecycle status, expiry and acceptance time. Account is 1:1 with Resident and the Auth V1 model derives Resident authority through that relation.

Implementation stopped before code changes. The canonical API contract explicitly says the Admin invitation-create response omits the plaintext token and that plaintext is delivered only through a configured secure enrollment flow. The repo has no email/SMS/Zalo enrollment provider or established dev-only token delivery convention. Returning the token in the existing Admin response would contradict the locked contract; creating a new development-only token endpoint would invent a security path without an existing approved convention. `/me/profile` also has no field-level self-edit allowlist in Requirement/API, and invitation expiry has no specified duration. No code or canonical contract was changed to guess those decisions.

## 2. Existing Account schema

`accounts` has `account_id` primary key; nullable `owner_id` and `resident_id`; `role`; nullable globally unique `email`; nullable `phone`; required `password_hash`; `status` (`active|locked`); login and audit timestamps. Database checks require exactly the role-shaped relationship: Admin has Owner and no Resident; Resident has Resident and no Owner. `owner_id UNIQUE` enforces at most one Admin Account per Owner; `resident_id UNIQUE` enforces at most one Account per Resident. Password hash is `text`, and no pending-account state exists.

Prisma `Account` maps the existing fields and relations. Auth V1 account lookup resolves the current account, then derives Resident Owner scope from the linked Resident; the client cannot choose role, Owner or Resident identity.

## 3. Existing AccountInvitation schema

`account_invitations` stores `invitation_id`, `owner_id`, `resident_id`, `created_by_account_id`, unique 64-character lowercase hexadecimal `token_hash`, `status` (`pending|accepted|expired|revoked`), `expires_at`, nullable `accepted_at`, and created/updated timestamps. Composite foreign keys bind the Resident and creating Account to the same Owner. Checks validate expiry/acceptance consistency. A partial unique index permits only one `pending` invitation per Owner/Resident. Database triggers protect immutable invitation identity/token/expiry fields and terminal state history.

The Prisma `AccountInvitation` mapping represents these fields and relationships. The schema has sufficient persistence for the documented one-time invitation lifecycle.

## 4. Database change assessment

No schema delta was identified for the contracted invitation lifecycle. Database V1.5, Prisma, migration, validator and seed were not modified. This is not runtime validation of the invitation flow; no invitation service currently exists to exercise against PostgreSQL.

## 5. Resident Account cardinality and authority

The existing schema enforces at most one Account for a Resident. Resident accounts have role `resident`, `owner_id IS NULL`, and a linked `resident_id`; authenticated Owner context is derived through `Resident.owner_id`. Admin account cardinality remains one Admin per Owner. No multi-admin path is needed or permitted.

## 6. Admin provisioning flow

Canonical API §5.2 already defines `POST /residents/{resident_id}/account-invitations` as Admin-only, Owner-scoped, and requires token-hash persistence plus secure enrollment delivery. Current `createV1Router` mounts Auth and Resident/Occupancy routers but no account/invitation router. No backend invitation repository/service/route, frontend invitation helper or Admin provisioning UI was found. Therefore own-Resident invite, duplicate-account handling, archived eligibility and reinvitation behavior are not implemented or runtime-verified.

## 7. Invitation lifecycle

Canonical API describes pending → accepted, expired or revoked; only one pending invite per Resident; identity/token are immutable; accepted/expired/revoked rows remain as history. The DB can enforce the pending uniqueness and immutable-history invariants. No application transition code currently exists. Exact API status mapping, expiration sweep/on-read transition and reinvitation semantics must be implemented according to that contract without replacing terminal audit rows.

## 8. Token storage and security

The schema stores only `token_hash`, with a unique lowercase SHA-256-sized hex representation; it does not store a raw token. No token-generation/hash/constant-time lookup implementation exists. No invitation logging path exists to review. A future implementation must generate cryptographically random opaque tokens, persist only a digest, avoid logging token/password/session/CSRF secrets and return no digest in API responses.

## 9. Expiry

Requirement/API require an expiring one-use invitation and the schema stores `expires_at`, but no duration or project convention establishes a TTL. No TTL was invented. Before implementation, choose an approved duration or explicitly authorize a configurable implementation default with a development value and a production-required configuration. An unconfigured/permanent invitation is not acceptable.

## 10. Password setup

Auth V1 uses the existing asynchronous password hash/verify implementation (`backend/src/auth/password.ts`) and login rejects invalid/ambiguous/locked accounts generically. No Resident setup endpoint exists. Any setup flow must reuse that implementation and canonical password policy, create no plaintext persistence/logging and then use normal Auth V1. Password length/policy must not be independently invented for enrollment.

## 11. Atomic acceptance

No acceptance transaction exists. The intended transaction, consistent with API/schema, is to lock the pending invitation, verify digest/status/expiry and current Resident eligibility, ensure no linked Account or conflicting login identifier, create the role-shaped Resident Account with password hash, mark invitation accepted, then commit. Database uniqueness and row locking must make concurrent use single-winner; in-memory locks alone are insufficient.

## 12. Duplicate and replay behavior

The DB prevents two Resident Accounts for the same Resident and two pending invitations for that Resident. It does not alone define HTTP idempotency or acceptance response semantics. No invite or acceptance API exists, so duplicate account, consumed-token replay, expired token, invalid token and concurrent accept behavior are unimplemented/unverified.

## 13. Owner isolation

Composite FKs bind invitation Resident and creator Account to the invitation Owner. Application authorization still must scope the Resident from the authenticated Admin Owner, use privacy-safe not-found behavior for foreign IDs, and never accept client-supplied `owner_id`, `resident_id` or role as authority. No invitation code currently exercises those rules.

## 14. Resident Auth login

Auth V1 already supports both roles and derives Resident profile from the authenticated Account relation. There is no account created by a business provisioning path in this pass. Therefore a newly provisioned Resident login and session were not tested.

## 15. `/auth/me`

The route is implemented for authenticated accounts and returns safe Account summary plus derived role-shaped profile. No Resident session created through invitation acceptance exists, so the requested Resident-specific `/auth/me` result remains unverified.

## 16. `/me/profile` GET

Canonical API §5.1 lists Admin and Resident role-shaped self-profile responses; no route is mounted. Resident should resolve only through authenticated account context, without an ID input. The exact safe response fields are not fully specified beyond role-shaped profile references in Auth. No implementation was made pending implementation contract precision.

## 17. `/me/profile` PATCH

Canonical API says allowlisted contact/profile fields but does not name the self-edit fields. Requirement §16 only says users can update their profile within allowed fields. Admin Resident PATCH allows a wider list but is not approval for the Resident's self-service allowlist. No fields were guessed and no PATCH route was implemented. Product/API clarification should specify fields, nullability and validation.

## 18. Forbidden self-edit fields

Regardless of the pending allowlist, Resident must not change `owner_id`, `resident_id`, Account role/status, `residence_status`, occupancy, Room, Contract authority/state, archive state or backend timestamps. `national_id` also must remain read-only unless canonical product policy explicitly permits self-service CCCD change and defines verification. No self-profile route exists to test rejection.

## 19. `residence_status` protection

Resident Admin create/PATCH already reject client writes to this backend-derived field; status is synchronized by Occupancy logic. There is no `/me/profile` PATCH to test yet. The required self-service rejection/no-mutation regression was therefore not run.

## 20. `/me/rental` readiness smoke

Resident-only `/me/rental` route/repository exists and unit coverage verifies self-scope and Admin denial. No valid Resident session could be established through the missing provisioning flow, so authenticated runtime `/me/rental` was not run. The next portal closure remains explicitly out of scope for this pass.

## 21. Frontend Admin provisioning

No Resident invite API helper or provisioning action exists. Since canonical create response must omit raw token and no delivery provider is configured, an Admin button that only creates an inaccessible invitation would be misleading. No UI was added.

## 22. Frontend onboarding

No setup route/form exists. No UI was added without a supported way for a Resident to receive the raw token and without a decided expiry policy. A future setup screen should handle invalid/expired/consumed states and then route to normal login; it must not expose editable Owner/Resident IDs.

## 23. Resident self-profile UI

The current Resident portal has no verified profile/settings surface suitable for wiring. No portal redesign or new settings UI was added. API foundation alone was not implemented because route allowlist is unresolved.

## 24. Existing wording gap

The previous closure report documented that list/create copy calls a never-occupied Resident “Đã rời đi”, whereas detail correctly says “Chưa lưu trú”. This pass did not touch Resident Admin UI. The list response has no history-presence signal, so do not infer departure from `residence_status=left` alone.

## 25. Unit tests

No code changed, so no tests were added or run. Required future focused tests include token generation/digest, expiry, invalid/consumed/replay, duplicate Account, Owner scope, password policy/hash/no-plaintext, profile GET/PATCH allowlist, forbidden fields and `residence_status` immutability.

## 26. PostgreSQL integration/concurrency

No DB command, schema operation, seed or mutation was run. Invitation transaction, concurrent acceptance and rollback are unverified. After implementation, test two concurrent acceptance requests against PostgreSQL and verify one Account/link and one consumed invitation only.

## 27. Frontend validation

Not run; frontend was unchanged. Typecheck, API tests, production build and focused invitation/setup/profile API mapping tests remain pending.

## 28. Backend regressions and typecheck/build

Not run; backend was unchanged. Auth, Resident/Occupancy, Contract, Property/Room, Room Images and Invoice/Zalo regression suites remain pending for an implementation pass. Known prior backend typecheck/build debt was 174 diagnostics (173 in legacy `backend/src/app.ts`, plus one Resident test type error); this pass did not verify whether that baseline has changed. No diagnostics were introduced because no code was edited.

## 29. Security logging review

No invitation logging code exists to inspect. Existing Auth responses omit password hash and return opaque session cookies via HttpOnly cookie. Invitation implementation must ensure raw token, plaintext password, password hash, session cookie and CSRF token are never logged; audit events may use internal IDs/status only.

## 30. Database V1.5 and delivery status

Database V1.5 remains unchanged. Email/push is excluded from V1; no SMS/Zalo enrollment provider or configured secure delivery adapter was found. Canonical API explicitly requires an out-of-band configured verified channel, forbids raw token in Admin create response and says Admin gets only invitation ID/status/expiry. A dev-only token return would need explicit API/security authorization and a clearly isolated convention; none currently exists. Do not claim an invitation was delivered.

## 31. Readiness, blockers and exact next task

**Provisioning architecture complete:** NO. **Resident self-service foundation complete:** NO.  
Blocking decisions/integration:

1. Select/approve a verified invitation delivery mechanism that can deliver the one-time token without returning it in the Admin API or logging it. For local smoke, explicitly approve a separate development-only token retrieval mechanism if no provider is available; it must be inaccessible in production and documented in the API/security contract.
2. Set invitation TTL semantics (or approve a configurable implementation default, with production required configuration).
3. Define exact `/me/profile` self-edit field allowlist, nullability and validation; explicitly protect all authority/state fields.
4. Define what login identifier is established during enrollment when the Resident profile has no email or phone; only verified identifiers should be used.

After these are resolved, implement invitation/admin and acceptance routes, self-profile endpoints, minimal Admin/onboarding UI, then run PostgreSQL atomic/concurrency and Auth E2E. The separate next task remains **Resident Authenticated Portal E2E + UI Status Wording Fix + Final Resident/Occupancy Lock**. Parking, Complaint, CT01 and Payment remain out of scope.

### Final requested status

| Item | Result |
|---|---|
| Provisioning architecture complete | NO — persistence exists; delivery and implementation are blocked |
| Database V1.5 changed | NO |
| Admin invite/provision | NOT IMPLEMENTED |
| Foreign Owner protection | DB relations are scoped; invitation route behavior unimplemented |
| Token hashing | Schema supports digest; no runtime implementation |
| Expiry | Timestamp supported; TTL undecided; enforcement unimplemented |
| One-time use | Schema statuses support it; runtime unimplemented |
| Concurrent acceptance | NOT TESTED |
| Duplicate Account guard | Unique `resident_id` constraint exists; runtime behavior unimplemented |
| Password setup | NOT IMPLEMENTED |
| Resident login from new invite | NOT TESTED |
| `/auth/me` Resident session | Existing route; not tested with provisioned Resident |
| `/me/profile` GET | NOT MOUNTED |
| `/me/profile` PATCH | NOT MOUNTED; allowlist unspecified |
| `residence_status` protection | Existing Admin Resident API PASS; self-profile route not present to test |
| `/me/rental` authenticated smoke | NOT RUN — no provisioned Resident session |
| Frontend validation totals | NOT RUN — no frontend changes |
| Backend regression totals | NOT RUN — no backend changes |
| Backend typecheck/build | NOT RUN; prior baseline 174 diagnostics, not revalidated |
| Delivery provider | NONE CONFIGURED; API contract requires secure out-of-band delivery |
| Next task | Resolve delivery, TTL, profile allowlist and verified login identifier; then implement foundation. Afterwards run Resident Authenticated Portal E2E + UI Status Wording Fix + Final Resident/Occupancy Lock. |

**Files modified:** this report and `docs/DOCUMENT_CATALOG.md` only. Backend, frontend, canonical Requirement/API, Prisma, Database V1.5, migrations and seed were not modified.
