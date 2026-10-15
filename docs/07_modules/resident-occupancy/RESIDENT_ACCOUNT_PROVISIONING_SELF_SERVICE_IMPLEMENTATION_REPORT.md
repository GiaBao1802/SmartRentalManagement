# Resident Account Provisioning + Self-Service Implementation Pass

**Ngày:** 2026-10-12  
**Trạng thái:** `BLOCKED — STOPPED AT DATABASE PRECHECK`  
**Database target:** Goctro_test3 / PostgreSQL 18.6 (runtime connection not verified in this pass)  
**Database V1.5 modified:** NO

## 1. Executive summary

Implementation stopped before code or canonical-document changes, as required by the Database V1.5 safety gate. Read-only source inspection found two physical-schema gaps for the newly approved behavior: there is no Resident avatar storage reference, and `accounts.phone` has no uniqueness constraint/index. A profile PATCH that updates the account phone safely cannot rely on application-only duplicate checks under concurrent requests. The locked baseline cannot support the full requested contract as stated.

The backend health endpoints at `localhost:4000` were unreachable. A read-only Prisma connection attempt could not initialize, so the live database table count, constraints and current data were not reverified. Locked SQL and Prisma source both lack the required avatar field; SQL and Prisma also show no unique Account phone constraint. No DB command or mutation was made.

## 2. Approved decisions recorded for the blocked pass

The prompt approves Zalo invitation delivery, a development-only token/link retrieval fallback when delivery is unavailable, a 24-hour invitation lifetime, one-time use, Resident login by phone/password, and self-edit of phone/email/avatar. Authority fields and residence/contract/occupancy state remain immutable to Residents. These approvals do not authorize changing the locked Database V1.5 physical baseline.

## 3. Database precheck results

| Check | Result |
|---|---|
| Locked Database V1.5 SQL source readable | PASS |
| Prisma source readable | PASS |
| Backend `/api/health` | FAIL — localhost:4000 unreachable |
| Backend `/api/health/db` | FAIL — localhost:4000 unreachable |
| Read-only live PostgreSQL connection | FAIL — Prisma could not initialize a connection |
| Live DB/version/table inventory in this pass | NOT VERIFIED |
| `account_invitations` source table exists | PASS |
| Locked source has 28-table V1.5 baseline | Prior baseline only; not reverified live |
| Schema/Prisma avatar reference on Resident | MISSING |
| Unique constraint/index on `accounts.phone` | MISSING |

## 4. Existing Account and invitation model

The locked schema has `accounts.account_id` as PK; nullable `owner_id` and `resident_id`; role; globally unique nullable email; nullable phone; required password hash; active/locked status; and timestamps. `owner_id UNIQUE` and `resident_id UNIQUE` enforce at most one corresponding Account. A DB check enforces role-shaped ownership: Admin maps to Owner only; Resident maps to Resident only. `accounts.phone` is nullable but has no unique constraint or unique index. The existing Auth query can detect ambiguous phone candidates, but that does not implement the approved phone-unique invariant.

`account_invitations` already contains Owner, Resident, creating Account, unique token hash, pending/accepted/expired/revoked status, expiry, acceptance time and audit timestamps. Composite foreign keys bind the invite's Resident and creating Admin to the same Owner; a partial unique index permits one pending invitation per Resident. These fields are sufficient for the approved invitation lifecycle without changing V1.5.

## 5. Required physical schema delta

Do not apply this proposal to V1.5. Create a new approved Database version/migration before implementing the complete approved behavior:

1. Add a nullable Resident avatar storage reference, proposed as `residents.avatar_storage_key TEXT NULL`, with a unique constraint/index for non-null keys so generated file references cannot be shared accidentally. Store only a backend-generated key; keep binary files outside PostgreSQL. Confirm retention/deletion semantics in the migration design.
2. Enforce uniqueness for non-null `accounts.phone` (for example a unique partial index). Before applying, audit existing values and normalize them consistently; resolve duplicate normalized phones before the unique index is created. Phone normalization and migration policy must be documented so equivalent formats cannot bypass uniqueness.

V1.5 remains the current locked baseline until a separately approved next version is implemented and validated. The unique phone change is required for reliable concurrent account creation and phone edits; the avatar reference is explicitly required by the requested filesystem-storage flow.

## 6. Provisioning architecture

Not implemented. Current V1 router mounts Auth and Resident/Occupancy routes but no Account or invitation routes/service/repository. The existing table is ready for persistence, but code does not create or accept invitations.

## 7. Admin invitation

Not implemented or runtime-tested. Once schema and application work resumes, use the canonical path `POST /residents/{resident_id}/account-invitations`, derive Owner from the Admin session, scope the Resident, require valid phone and no existing Account, and return safe metadata only. Foreign Resident behavior must remain privacy-safe.

## 8. Token generation and hashing

Not implemented. Required design: cryptographically random opaque token, SHA-256 digest stored in `token_hash`, raw token absent from DB/logs. The normal Admin response must never return raw token/hash. Development retrieval must be separately gated and impossible to enable in production.

## 9. Invitation TTL

Approved duration is 24 hours. Runtime behavior is not implemented. The intended expiry is `created_at + 24 hours`; acceptance must reject at/after expiry according to a single documented boundary convention and transition pending invitations to expired where appropriate.

## 10. One-time lifecycle

The schema supports pending, accepted, expired and revoked states, but no transition code exists. Acceptance must atomically set accepted state and `accepted_at`; replay must reject without account mutation.

## 11. Zalo delivery abstraction

Not implemented or verified. Add a provider interface accepting Resident, normalized phone, enrollment URL and expiry. No configured invitation Zalo provider was found. Do not report delivery as sent until a real provider confirms it.

## 12. Development-only retrieval

Not implemented. The prior foundation audit found no established development-only token retrieval convention. The new prompt expressly approves one for local/dev, but it must be isolated from the ordinary Admin response and production must hard-disable it. Design and security tests remain pending behind the schema gate.

## 13. Enrollment URL

Not implemented. Planned shape is `/resident/setup-account?token=...`; token is the only invitation identity in the URL. Production base URL and local base URL configuration remain unimplemented.

## 14. Password setup and Account transaction

Not implemented. Use the current Auth V1 password hashing and validation. Acceptance must lock/validate the invitation, verify expiry/eligibility/no existing Account, check phone uniqueness, hash password, create role `resident` with `owner_id=NULL` and the invited Resident ID, then consume the invite in one PostgreSQL transaction. No implicit session behavior is planned; normal login follows setup.

## 15. Concurrency, duplicate and replay guards

Not implemented or tested. DB already provides one Account per Resident and one pending invite per Resident. `accounts.phone` uniqueness is missing and is part of the required next-version delta. Concurrent acceptance must be tested against PostgreSQL with two requests using the same token; exactly one may create/link the Account.

## 16. Resident phone login and normalization

Not implemented. Existing Auth V1 supports email or phone lookup and returns generic failure for ambiguous candidates. Approved Resident authority is phone/password; Admin email behavior must remain unchanged. Existing V1 phone validation/normalization does not establish a canonical stored format or uniqueness. The next version must normalize input consistently and persist one canonical format, without transforming unsupported international numbers incorrectly.

## 17. `GET /auth/me`

Existing Auth V1 route supports role-shaped identity, but no invitation-created Resident Account exists. Resident `/auth/me` runtime result is not verified in this pass.

## 18. `GET /me/profile`

Not mounted. The approved response should derive Resident from the authenticated Account and return safe profile fields: name, phone, email, avatar reference/URL, and read-only national ID/residence status only if the API contract exposes them. No Resident ID input should be accepted.

## 19. `PATCH /me/profile`

Not mounted. Approved editable fields are phone, email and avatar. `phone` and `email` must update both Resident and Account copies transactionally where both are stored. Phone change must enforce uniqueness and invalidate login under the old phone. No avatar field exists in the locked schema, which is the hard stop. Other profile and authority fields must be rejected.

## 20. Forbidden fields and residence status

No self-profile endpoint exists to test. Resident must not modify national ID, Owner/Resident IDs, role, Account status, `residence_status`, Room, Occupancy, Contract state/authority, archived state or timestamps. Residence status remains derived from active Occupancies. Existing Admin Resident create/PATCH validation protects its server-managed status, but this does not prove a nonexistent self-profile route.

## 21. Email behavior

Approved self-edit is recorded; no implementation exists. Email is not Resident login authority under the new decision. Any value must use canonical email validation and update Resident/Account copies consistently. Existing global unique constraint on `accounts.email` remains applicable.

## 22. Avatar storage and file validation

Not implemented. Local filesystem storage should follow the existing Room Images storage safety pattern, validate JPEG/PNG/WebP MIME and magic bytes, enforce size limits, decode safely where supported, and use generated keys. No `avatar` or avatar-reference column is present in SQL or Prisma. Per the explicit instruction, this finding stops implementation; no filesystem or database writes were made.

## 23. Frontend Admin, setup and profile

No code changed. Admin invitation action, safe status/expiry display, setup form, error states, and minimal profile editing remain pending. No Resident portal redesign was attempted.

## 24. Authenticated `/me/rental` smoke

Not run. Backend health was unavailable and no newly provisioned Resident session can exist before invitation implementation.

## 25. Security logging review

No invitation logging implementation exists to audit. Future code must never log raw token, plaintext password, password hash, session cookie or CSRF token. Delivery result logs may use internal invitation/Resident/Owner IDs and status only.

## 26. Unit tests

Not run; no code changed. Required tests include random token/digest, 24-hour expiry boundaries, invalid/expired/consumed/revoked, replay, reinvite, duplicate Account/phone, Owner scope, password hashing/no plaintext, profile allowlist/status immutability, and avatar MIME/signature/size/path/rollback behavior.

## 27. PostgreSQL integration and concurrency

Not run. Local backend health and direct Prisma initialization failed, so PostgreSQL 18 reachability and concurrent transaction behavior could not be validated. Do not mark any live DB E2E gate PASS based on the prior baseline report.

## 28. Authenticated runtime E2E

Not run. No Admin invite → token retrieval → setup → Resident login → `/auth/me` → `/me/profile` → phone update/relogin → avatar → `/me/rental` sequence was attempted. No session was forged and no direct DB write used.

## 29. Frontend and backend validation

Not run because implementation stopped before source changes. Frontend typecheck/API tests/build and Auth, Resident/Occupancy, Contract, Property/Room, Room Images, Invoice/Zalo regressions remain pending. Backend typecheck/build was not rerun; the previous report documented 174 legacy diagnostics, but current count is not reverified.

## 30. Zalo status and limitations

Zalo invitation delivery is **NOT VERIFIED**; no provider/configuration was found. DEV-only token retrieval is **NOT IMPLEMENTED**. The normal Admin API response remains constrained to safe metadata. Full production delivery requires configured Zalo OA credentials/template/provider behavior and secure delivery evidence.

## 31. Database status, next task and final gate

**Database V1.5 changed: NO.** No schema, Prisma, migration, seed, validator, direct SQL or DB mutation was performed. Canonical Requirement/API were also not changed because the explicit missing-avatar schema gate requires stopping and reporting first.

**Implementation PASS: NO.** The exact next task is **Database V1.6 Room/Resident Avatar Reference + Account Phone Uniqueness Change Request and Migration Design**, including populated-database duplicate-phone audit and migration strategy. After that version is approved, implement the provisioning/self-service flow and rerun runtime E2E. Do not begin full Resident Portal E2E until provisioning gates pass.

| Requested gate | Result |
|---|---|
| Admin invite | NOT IMPLEMENTED |
| Foreign Owner protection | NOT IMPLEMENTED at invitation route |
| Token hash | NOT IMPLEMENTED; schema field exists |
| TTL 24h | APPROVED, NOT IMPLEMENTED |
| One-time use | NOT IMPLEMENTED |
| Concurrent accept | NOT TESTED |
| Duplicate Account guard | Schema guard exists; route not implemented |
| Zalo delivery | NOT VERIFIED |
| DEV-only retrieval | NOT IMPLEMENTED |
| Password setup | NOT IMPLEMENTED |
| Phone login | NOT IMPLEMENTED for the approved phone-unique policy |
| `/auth/me` | Existing route; no provisioned Resident runtime test |
| `/me/profile` GET/PATCH | NOT MOUNTED |
| Phone/email updates | NOT IMPLEMENTED |
| Avatar | BLOCKED — locked schema lacks storage reference |
| `residence_status` protection | Existing Admin Resident API; self-profile gate not testable |
| `/me/rental` authenticated smoke | NOT RUN |
| Frontend/backend tests | NOT RUN |
| Database V1.5 | UNCHANGED |

**Modified files:** this report and `docs/DOCUMENT_CATALOG.md` only. No backend/frontend source, canonical Requirement/API, Database V1.5, Prisma, migration, seed or validator changed.
