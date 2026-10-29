# Góc Trọ V1.2 — API Specification

**Version:** 1.2  
**Base path:** `/api/v1`  
**Database alignment:** Shared Neon `production/neondb` is exact V1.18 as verified on 2026-10-29. Local database statements elsewhere in this document describe earlier snapshots and were not rechecked in this promotion. Invoice finalization, period-end reminder/next-day draft scheduling, and the Admin period workspace/readiness read model remain implemented. AWS has not been deployed. Real MoMo/ZaloPay payment and production Zalo delivery remain separate work.
**Status:** API Spec version remains 1.2. Property/Room contract status is stated in §5.4; this document does not itself change the database.

**Contract audit/revision status:** The §5.7 business rules are approved and physically supported by the current Database V1.10 and Prisma mapping; the Contract tables were introduced in earlier baselines. Contract API V1.3 is implemented in `SmartRentalManagement/backend`. Durable replay is implemented for create, activate, renew and terminate; document upload replay and production storage integrations remain excluded/pending. The API document version remains 1.2.

## 1. Scope and source of truth

This document maps the approved product rules to a REST API. Business authorization and validation happen on the backend; the frontend sends user intent and never supplies trusted identity or calculated financial state.

For approved product and business rules, `01_REQUIREMENTS.md`, the applicable approved change requests, `GOCTRO_FUNCTION_SCOPE.md`, and `GOCTRO_FUNCTION_MATRIX.md` are authoritative for their respective scope. The current shared Neon physical baseline is `database/baselines/v1.18/` together with `docs/DATABASE_CHANGELOG.md`; it includes team Cloudy V1.17 and the additive Superadmin V1.18 schema. `database/schema.prisma` maps application tables; platform additions use scoped SQL. Other implementation details not decided by these sources remain open rather than being invented here.

The API includes persistence for account invitations, renewal lineage, Contract document metadata, and V1.5 idempotency requests. Contract durable replay is implemented only for create, activate, renew and terminate. Document upload remains header-validated but has no durable replay because object storage is outside the PostgreSQL transaction. The historical V1.1 snapshot predates invoice draft/finalization support.

The shared V1.18 schema permits `admin`, `resident` and `superadmin`. No Superadmin account was created on Neon during the upgrade. Source-distribution instructions and current limits are in the [V1.18 team handoff](10_operations/V118_TEAM_HANDOFF_20261029.md). Historical V1.2 exclusions in this document do not describe every later team feature.

The Superadmin business direction recorded in `01_REQUIREMENTS.md` on 2026-10-26 is implemented in the V1.18 source. Its API paths are listed below. No email/Zalo provider is configured; provider-dependent initiation routes return `503 DELIVERY_NOT_CONFIGURED` in production or on Neon before creating tokens or records.

### V1.18 platform API

`/api/v1/platform/owners` (GET/POST), `/owners/:ownerId` (GET), `/owners/:ownerId/invitation-resend` (POST), `/accounts/:accountId/password-reset` (POST), `/accounts/:accountId/lock|unlock` (POST), `/properties` (GET), `/reports` and `/reports/:reportId` (GET), `/reports/:reportId/transition|notes` (POST), `/audit/recheck` (POST), and `/audit-events` (GET) are mounted under `/api/v1/platform`. Public report target/create paths are `/api/v1/public/platform-report-targets` and `/api/v1/public/platform-reports`. One-time Owner/operator invitation and reset paths are mounted under `/api/v1/auth`.

Superadmin role comes from the server session and cannot access Owner Admin/Resident data routes. The production source permits role-guarded Owner/Property/report reads, Owner lock/unlock, report handling and audit endpoints. Audit reading requires a separately granted `PLATFORM_AUDIT_READ` permission plus password recheck; the grant expires after 10 minutes idle or 30 minutes absolute. Owner invitation/reset links are single use. In local non-Neon demo mode their creation reports `demo_not_sent` and exposes a one-time demo link; on Neon **even when `NODE_ENV=development`**, and in production, Owner creation/invitation resend/password-reset initiation returns `503 DELIVERY_NOT_CONFIGURED` with no token or delivery claim until a provider is configured. Operator demo invitation endpoints remain `503 DEMO_ONLY` there. Existing valid Owner invitation/reset completion paths retain their one-time validation. The frontend only renders demo-link controls with explicit `NEXT_PUBLIC_PLATFORM_DEMO_LINKS=1` outside production; the Neon runner forces that flag off. [Runtime follow-up and testing limits](10_operations/NEON_V118_RUNTIME_READINESS_20261029.md).

## 2. Authentication and tenant context

### 2.1 Session model

- Use a server-managed opaque session in a cookie named `gt_session`; set `HttpOnly`, `Secure`, and `SameSite=Lax`, and scope it to the API origin. Never return a password hash or session secret in JSON.
- Unsafe cookie-authenticated requests require a CSRF token in `X-CSRF-Token` and same-origin checks. `GET /auth/csrf` issues or refreshes the token.
- The proposed session policy is 30 minutes idle and 12 hours absolute. Logout, password change/reset, or account lock revokes active sessions for that account. These durations are technical defaults to confirm before production.
- On authenticated activity, the backend renews the cookie together with the server-side idle expiry, never beyond the absolute expiry. Production session storage uses the shared PostgreSQL `auth_sessions` table in the current local V1.10 baseline; this does not change API paths or response bodies. AWS has not been deployed.
- `POST /auth/login` accepts email or phone plus password. Resident phone login normalizes input using the approved Vietnam rule before lookup: trim whitespace; remove space, `-`, and `.` separators; convert `0XXXXXXXXX`, `84XXXXXXXXX`, or `+84XXXXXXXXX` to canonical `+84XXXXXXXXX`; reject other international prefixes and invalid values. The same shared backend normalizer must be used for persistence and login. PostgreSQL enforces unique non-null `accounts.phone`, so a stored phone resolves to at most one Account; email remains globally unique. Login, reset, and account lookup responses must not reveal whether an account exists.
- Every authenticated request resolves role and identity from the validated session and current account status. A locked account cannot establish a session; an existing session is rejected after a lock is applied.

### 2.2 Authorization context

The API constructs this server-side context for every request:

```text
Admin:    account_id → owner_id
Resident: account_id → resident_id → residents.owner_id
```

In V1, each Owner has exactly one Admin Account, which is the authenticated authority for that Owner. Multi-admin, staff and delegated-admin models are not supported. The database enforces at most one Admin Account per Owner; account provisioning must maintain the one-account-per-Owner product invariant.

`owner_id`, `resident_id`, and `role` in a client body, query, or header are never authorization inputs. Reject unexpected authority fields with `400`; do not silently use them. For resource identifiers, resolve the record inside the caller's scope. A foreign-tenant ID is indistinguishable from a missing ID and returns `404`.

Admin scope is every Property owned by the authenticated Owner. Resident scope is the authenticated Resident's own profile, active/historical occupancy, relevant contracts/invoices/payments, subscriptions, vehicles/parking assignments, complaints, and notifications. Resident requests cannot act as another resident.

### 2.3 CCCD privacy

There is no global CCCD lookup API. `POST /residents/search` is Admin-only and searches exact `national_id` with `owner_id` taken from the session. Same CCCD in another Owner is treated exactly as not found. Do not put CCCD in URLs, access logs, traces, analytics, or error details. Apply a configurable rate limit and audit access to this endpoint.

## 3. HTTP and payload conventions

- JSON request/response uses UTF-8 and `application/json`, except Room image upload (`multipart/form-data`) and successful image-content reads (binary). Dates are `YYYY-MM-DD`; instants are RFC 3339 with UTC offset. Money is an integer VND amount, never a floating-point number.
- Serialize bigint identifiers as decimal strings to avoid JavaScript precision loss. Example: `"invoice_id": "5001"`.
- Successful JSON responses use `{ "data": ... }`. Collection responses also include `meta`: `{ "page", "page_size", "total_items", "total_pages" }`.
- Pagination is 1-based: `page=1`, `page_size=20`, maximum `page_size=100`. Stable ordering appends the resource ID as a tie-breaker. Reject unknown sort fields; each endpoint documents its allowlist.
- Standard list filters are scoped before search, filtering, count, and aggregation. IDs supplied as filters are still scope-checked.
- `PATCH` accepts only documented mutable fields. Server-derived fields and unknown fields are rejected. `DELETE` is a lifecycle/archive operation where history exists; it does not cascade-delete business history.
- Binary CT01 export uses a direct file response with `Content-Disposition` and `Cache-Control: no-store`. Successful Room image-content endpoints return image bytes with validated `Content-Type`, `X-Content-Type-Options: nosniff`, and authorization-appropriate cache headers; their errors use the common JSON error envelope. Other endpoints use JSON.

## 4. Error contract

All errors use one shape:

```json
{
  "error": {
    "code": "ROOM_CAPACITY_EXCEEDED",
    "message": "Số cư dân vượt sức chứa hợp đồng.",
    "details": { "capacity": 3, "active_occupancy_count": 3 },
    "request_id": "req_01J..."
  }
}
```

`details` may contain field errors or safe current-state values. It must not contain another Owner's identity, existence, room, contract, or resident data.

| HTTP | Use |
|---|---|
| `400` | Malformed JSON, unsupported fields, invalid query/pagination, field validation |
| `401` | Missing, expired, revoked, or invalid authentication; generic login/reset failure |
| `403` | Authenticated role lacks the operation permission; use only after a role-level check that does not disclose a foreign resource |
| `404` | Missing resource or resource outside caller scope; identical response for both |
| `409` | State conflict, duplicate in the same Owner, active contract/slot conflict, idempotency key reused with a different payload |
| `422` | Valid syntax but a business rule prevents the operation, with safe details |
| `429` | Rate limit exceeded; include `Retry-After` |
| `500` | Generic internal error with `request_id`; never return SQL/provider secrets |
| `502` / `503` | Provider or dependent service unavailable; do not mark an invoice paid because of an unavailable callback |

Common codes include `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RESIDENT_NOT_FOUND_IN_OWNER_SCOPE`, `CONFLICT`, `ROOM_CAPACITY_EXCEEDED`, `CONTRACT_DATE_OVERLAP`, `CONTRACT_HAS_UNPAID_INVOICES`, `CONTRACT_REVISION_CONFLICT`, `INVOICE_PERIOD_CONFLICT`, `INVOICE_ALREADY_FINALIZED`, `INVOICE_ALREADY_PAID`, `INVOICE_DATA_INCOMPLETE`, `INVOICE_NOT_PAYABLE`, `INVOICE_NOT_SENDABLE`, `INVOICE_AMENDMENT_NOT_ALLOWED`, `PAYMENT_NOT_ALLOWED_FOR_INVOICE_STATE`, `PAYMENT_SESSION_TERMINATED`, `PAYMENT_PENDING`, `PAYMENT_AMOUNT_MISMATCH`, `SLOT_UNAVAILABLE`, `PARKING_CAPACITY_EXCEEDED`, `SUBSCRIPTION_NOT_ELIGIBLE`, `CYCLE_NOT_CANCELLABLE`, and `IDEMPOTENCY_KEY_REUSED`. `CONTRACT_REVISION_CONFLICT` is HTTP 409 when an official Contract mutation's `If-Match` revision is stale; no Contract or history mutation is committed. `INVOICE_NOT_DRAFT` is not used by the current Invoice API; draft-only PATCH uses `INVOICE_AMENDMENT_NOT_ALLOWED` and finalize uses `INVOICE_ALREADY_FINALIZED`.

## 5. Endpoint contract by domain

`/api/v1` is omitted from paths below. All paths not labeled **Public** require a session.

### 5.1 Authentication and profile

| Method and path | Role | Behavior |
|---|---|---|
| `GET /auth/csrf` | Public | Issue/refresh CSRF token cookie/header for the current browser session |
| `POST /auth/login` | Public | Verify credentials, set session cookie, return safe account summary |
| `POST /auth/logout` | Admin, Resident | Revoke current session and clear cookie; idempotent |
| `GET /auth/me` | Admin, Resident | Current role, safe account summary, derived Owner/Resident profile reference |
| `POST /auth/change-password` | Admin, Resident | Verify current password, set new hash, revoke current and other sessions |
| `POST /auth/accept-invitation` | Public | Verified one-use enrollment; self-set password, no auto-login |
| `POST /auth/forgot-password` | Public | Start verified reset; always return generic `202` |
| `POST /auth/reset-password` | Public | Consume one-use, expiring reset token and set password |
| `GET /me/profile` | Admin, Resident | Admin returns Owner profile; Resident returns own Resident profile |
| `PATCH /me/profile` | Admin, Resident | Allowlisted contact/profile fields only; never accepts role, IDs, account status, or Owner scope |
| `GET /me/avatar` | Resident | Stream the authenticated Resident's own profile image; `404` when none is set |
| `PUT /me/avatar` | Resident | Replace own profile image using one multipart `file` (JPEG, PNG, WebP; max 5 MiB); server derives Resident identity and storage key; success `204` |
| `GET /residents/{resident_id}/avatar` | Admin | Read an in-scope Resident's profile image; read-only, foreign/missing profile or absent image returns generic `404` |

Login request:

```json
{ "login": "resident.one@example.test", "password": "<secret>" }
```

Login response (`Set-Cookie: gt_session=...`):

```json
{
  "data": {
    "account": { "account_id": "2", "role": "resident", "email": "resident.one@example.test", "status": "active" },
    "profile": { "resident_id": "1001", "full_name": "Cư dân mẫu An" },
    "expires_at": "2026-10-07T12:00:00Z"
  }
}
```

`password`, `password_hash`, session IDs, and reset tokens are never echoed. Password change/reset revokes current and other sessions and requires a new login.
Phone normalization is a shared application operation named `normalizeVietnamPhone(input)`; it returns one canonical `+84XXXXXXXXX` string or a validation failure. Auth login, Resident profile phone changes, and account provisioning must call the same implementation. No normalization helper is implemented by this database migration. For Resident profile self-service, the approved mutable profile includes phone/email and avatar; avatar bytes are stored outside PostgreSQL and the database stores only `residents.avatar_storage_key`. The client must not submit the storage key; the server derives it from the avatar storage operation. Local/development stores avatar files in private backend-managed storage; production requires a configured provider before the routes may be enabled. Admin can read an in-scope Resident avatar but cannot replace it through this API. Avatar responses are private/no-store and include a validated image content type plus `X-Content-Type-Options: nosniff`.

Session state/revocation is held in an infrastructure-level store, preferably Redis or a server-side session store. Password-reset tokens are short-lived, stored as hashes with TTL in Redis/another secure infrastructure store; PostgreSQL V1.1 has no reset-token or session table.

### 5.2 Resident account administration

| Method and path | Role | Behavior |
|---|---|---|
| `GET /accounts` | Admin | List own Admin account plus Resident accounts whose profiles belong to this Owner; filter `role,status,resident_id`; never list other Owners |
| `GET /accounts/{account_id}` | Admin | Safe account fields only; foreign account is `404` |
| `POST /residents/{resident_id}/account-invitations` | Admin | Persist token hash and start secure enrollment delivery; response omits plaintext/hash |
| `GET /residents/{resident_id}/account-invitations` | Admin | Read invitation audit for an in-scope Resident; token/hash never returned |
| `POST /account-invitations/{invitation_id}/revoke` | Admin | Revoke a pending invitation in this Owner; terminal states are not overwritten |
| `PATCH /accounts/{account_id}/status` | Admin | Lock/unlock an in-scope Resident account; lock revokes its sessions; Admin cannot change its own role or create another Admin |
| `POST /accounts/{account_id}/password-reset` | Admin | Start the same verified reset flow; Admin never sets or receives the Resident's password |

Account creation/setup is a one-time verified enrollment, not a plaintext-password field. The API does not expose `POST /accounts` with a password. `account_invitations` stores Owner, Resident, creating Admin, token hash, status, expiry, and accepted time; plaintext token is never stored or returned by API read/audit responses. Only one invitation may be pending per Resident; identity/token are immutable, and accepted/expired/revoked rows remain as audit history. The backend creates a cryptographically random one-time token, stores only its hash, and sends the plaintext only through the configured secure enrollment flow; the Admin create response contains invitation ID/status/expiry, not the token. Delivery remains an out-of-band verified channel because email/push is excluded from V1. Invitation expires and cannot be reused after acceptance, expiry, or revocation.

#### Accounts enrollment/reset completion contract — 2026-10-18

This additive technical contract implements the approved invitation 24-hour/one-use/Zalo/DEV-harness decisions. Reset TTL **30 minutes** is a new decision authorized by the 2026-10-18 completion prompt, not a historical approval. No physical V1.8 schema change.

- POST /residents/{resident_id}/account-invitations: Admin + CSRF + Idempotency-Key (1–128 visible ASCII). Body omitted, {} or {"resend":true}. Returns 202 {data:{invitation_id,resident_id,status,expires_at,delivery_status}}; no raw token/hash. Existing active account ->409 ACCOUNT_ALREADY_EXISTS. Pending invitation without resend ->409 INVITATION_PENDING, except retry of the same operation. resend reuses the SAME unexpired pending invitation/token/expiry; unavailable token material after restart ->503 ACCOUNT_DELIVERY_UNAVAILABLE, preserving it. Pending expired rows transition to expired under Resident lock before a new 24-hour invitation; terminal audit is never deleted. Phone/binding must still match the locked Resident. Revoke remains state-idempotent/header-validated, without durable response replay.
- POST /auth/credential-link/inspect (Public + CSRF): exact {purpose:"invitation"|"reset",token}. Read-only, rate-limited, no-store/no-referrer. Success200 {data:{valid:true,expires_at}}; no identity/contact/account fields. Checks current pending/unused state, expiry and invitation binding without consuming, issuing, extending or accepting a token. Invalid/expired/revoked/used/unrecoverable token ->400 TOKEN_INVALID with one generic message. Body carries the token, never query/path. No Idempotency-Key required for this non-mutating inspection. Final accept/reset still revalidates under its existing locks; inspection is not authority to skip validation.
- POST /auth/accept-invitation (Public + CSRF): exact {token,password}. Success 200 {data:{accepted:true}}; no auto-login. Token identity determines Resident/Owner/role; client identity fields rejected. Account creation + accepted_at/status update are atomic with Resident/invitation row locks; at most one concurrent accept succeeds. Existing Account or globally conflicting account phone/email ->409 ACCOUNT_IDENTITY_CONFLICT; never relink/overwrite. Invalid/expired/revoked/used token ->400 TOKEN_INVALID, no personal details. GET never consumes. Fresh enrollment requires a nonarchived Resident and normalized unique phone; the current locked Resident phone must equal the verified recipient binding captured at issuance (DEV lifecycle memory); missing binding state after restart fails closed.
- POST /auth/forgot-password (Public + CSRF): exact {login}; success always generic 202 {data:{requested:true}} for syntactically valid requests, independent of account existence, locked status, binding, delivery availability/failure. No Idempotency-Key required. Limit per IP and hashed normalized login, using Auth's configured attempt/window convention; 429 RATE_LIMITED + Retry-After independent of account existence. Only unambiguous login candidates can receive a reset. Repeated requests during an unexpired reset reuse that token, do not revoke valid links or reset TTL.
- POST /accounts/{account_id}/password-reset: Admin + CSRF + Idempotency-Key; {} only; scoped Resident account, foreign/missing404, own Admin403. Returns202 {data:{requested:true,delivery_status}} only after delivery outcome is known; unconfigured infrastructure ->503 ACCOUNT_DELIVERY_UNAVAILABLE. Admin never sees a token/password. Locked status is preserved.
- POST /auth/reset-password (Public + CSRF): exact {token,password}; success200 {data:{reset:true}}, no auto-login. Reset token cannot accept invitation and invitation token cannot reset. One use, expires after30minutes; successful reset revokes ALL reset tokens for the account and all sessions. Invalid/expired/used ->400 TOKEN_INVALID.
- POST /auth/change-password (authenticated + CSRF): exact {current_password,password}; success200 {data:{changed:true}}, revokes current+other sessions and outstanding resets, requires login again. Wrong current password ->401 UNAUTHENTICATED. This endpoint previously had no V1 implementation; no legacy flow is removed.

Password setting uses Auth V1 scrypt encoding, 12–1024 characters (12 minimum inherited from supported DEV provisioning policy), never plaintext persistence. Login/provision/reset use shared normalizeVietnamPhone for valid Vietnamese phones; existing local-format phone login remains compatible. Tokens are independent cryptographically random 256-bit values with purpose-separated SHA-256 hashes; only hashes enter database/reset storage. Rate limits cover consume attempts and administrative delivery by caller/target as well as forgot-password. No provider network call inside DB transactions. Delivery waits at most 10 seconds before returning unknown. Scoped mutations recheck identity/state inside locks. Session-store failure rolls back password mutation; reset remains unconsumed. Session revocation may be conservative if later DB commit fails. In local/dev one shared account gate serializes login (fresh credential read + verify + session publication), reset and change-password, preventing stale-password sessions from reappearing. This is single-process DEV assurance, not a cross-process distributed transaction.

Delivery uses a dedicated enrollment adapter and server-managed verified recipient binding, never phone alone or Invoice ZaloProvider. Outcomes: sent (only confirmed provider acknowledgement), dev_available (test harness only; no real message), rejected, failed, unknown (timeout/ambiguous). An explicit new resend operation may redeliver the same confirmed/failed link; a same-key retry returns its original metadata. Known failure may retry the same token; unknown outcome is not automatically redelivered. Availability is checked before token mutation; sending does not change passwords. Raw material exists only transiently in the secure delivery/test-harness process, never Admin API/audit/log/outbox plaintext. DEV retrieval is injected test harness only, not a public endpoint; production construction rejects DEV delivery and RAM reset/retry adapters. After restart unrecoverable pending links are not silently replaced. Local replay bookkeeping is bounded/expiring and not durable; generic §7 persisted replay remains outstanding.

Frontend: /accept-invitation#token=... and /reset-password#token=... keep token in component memory, remove fragment with history.replaceState, no localStorage/analytics; no GET consumption. /forgot-password submits the generic request. Token pages send Cache-Control:no-store, Referrer-Policy:no-referrer and a restrictive CSP without third-party resource origins. Password confirmation, pending/error/success and explicit login navigation are required. Admin Accounts uses paginated Owner-scoped Resident selection so profiles without Accounts can be invited.

Production remains blocked until verified Zalo recipient binding/provider, durable reset/replay/session storage and cross-process credential/session serialization are supplied and runtime-tested. Existing production session-store fail-closed startup is preserved. Local/test harness is not production Zalo evidence.

### 5.3 Public rooms and contact requests

#### Additive Public Sales explorer prototype (2026-10-15)

`GET /api/v1/public/explorer` accepts no query parameters and returns `{data:{mode:"live",provinces:[{code,name,public_properties,public_rooms,system_properties:null,boarding_properties:null,apartment_properties:null}],unmapped_rooms,note}}`. There are 34 two-character province codes. `public_properties` counts only active Properties with at least one eligible public available Room; it is **not** platform adoption. `public_rooms` uses the existing public visibility/availability predicate. Platform adoption and Property type are not authorized public data and remain null. Unknown province strings contribute only to `unmapped_rooms`, with no internal names or identifiers disclosed.

`GET /api/v1/public/explorer/rooms` requires `province_code` from that catalog and accepts the existing public Room filters/pagination/sort below except `province`. It returns the identical paginated public Room DTO. The server maps current/explicit pre-2025 province names to the stable code and applies all filters in PostgreSQL, including merged-province aliases. It rejects unknown parameters, invalid codes/ranges and invalid pagination with 400. No Property-name search, non-public inventory, Property identifiers, resident data or location coordinates are added. No database migration. These endpoints are additive; the existing public endpoints remain unchanged.

The Next.js public-search home is `/tim-phong`; `/rooms` remains a compatible explorer entry and normalizes to that search-home URL. `/intro/index.html` serves the intro; `/` remains an explorer entry; only explicit “Giới thiệu Góc Trọ” navigation returns there from the explorer/detail flow. Internal links use the same tab, and Room detail return links retain the explorer query through a validated `returnTo` value. Login links from the explorer use a same-origin public `next` destination for either role; default direct-login workspace routing and backend authorization remain unchanged. The public header reads the existing authenticated profile and displays its name instead of login links, including on Room detail. The obsolete `/public-sales` route is removed; implementation is shared in the private `app/_property-explorer` folder. Incoming search/filter links use the existing public Room list contract; selecting a geographic province uses the explorer's stable-code list contract. Its optional, manually selected demonstration adapter is frontend-only, visibly labeled, never activated automatically on API failure and never persisted in PostgreSQL.

| Method and path | Role | Behavior |
|---|---|---|
| `GET /public/rooms` | Public | Paginated listing of available Rooms; filter by `province,address,price_min,price_max,area_min,area_max,capacity_min,amenities,property_facilities`; sort by the allowlist below; no Property-name search |
| `GET /public/property-facilities` | Public | Distinct active shared Facility names for active Properties with at least one public available Room. Returns names only; no schedule, price, location, description, or booking status. |
| `GET /public/rooms/{room_id}` | Public | Public allowlist only; Room must be active, public, Property active, and available; otherwise return the same `404 NOT_FOUND` |
| `GET /public/room-images/{image_id}` | Public | Stream image only after rechecking parent Room visibility; otherwise generic `404` |
| `GET /me/room-images/{image_id}` | Resident | Stream an image only when its Room belongs to one of the authenticated Resident's current or historical occupancies; otherwise generic `404` |
| `POST /public/contact-requests` | Public | Persist a contact-only request for an active Property and optional Room; derive Property from Room when supplied and derive Owner from Property |

**Implementation status:** Public Room list/detail, image integration, Contact Request creation and the Owner-scoped Admin inbox are implemented and verified against local/development Database V1.4. Production-grade durable rate limiting and production image storage remain deployment work; the contract below is unchanged.

Structured Marketplace amenities are V1.16 and are applied on Neon shared-dev `production`; local `Goctro_dev_v18` remains V1.15. Existing Neon Rooms currently return an empty amenities array until an Owner confirms and saves each Room's amenity data.

The list and detail visibility predicate is `rooms.is_public=true`, `rooms.is_active=true`, effective Room status `available`, and Property status `active`. Effective availability is determined server-side using the Property/Room V1 rule: inactive Room first; otherwise occupied when a current active Contract or active Room occupancy exists; otherwise available. Never expose Resident names/CCCD, occupancy, Contract, Invoice, Owner/account IDs, manager-only fields, or non-public Room fields. A public Room ID is an identifier, not a credential. Return only this Room/Property allowlist: `room_id`, `room_code`, `property` (`name`, `province`, `address`), `property_facilities: string[]`, `default_rent`, `area_m2`, `default_capacity`, effective `status`, `public_description`, and `amenities: string[]`. `property_facilities` contains only active shared Facility names for this Property; it never includes descriptions, locations, booking schedules, prices, availability, or resident information. Amenities contain only owner-confirmed Marketplace codes from the allowlist in Database V1.16; predecessor rows remain empty until an Owner verifies and edits each Room. IDs and rent are decimal strings; `area_m2` is a two-decimal string. **Room image fields are implemented with Database V1.4.** Both public listing and detail add `cover_image: { "image_id": string, "url": string, "is_illustrative": boolean } | null` and the same ordered `images: [{ "image_id": string, "url": string, "is_cover": boolean, "sort_order": integer, "is_illustrative": boolean }]` gallery. This lets Marketplace cards and detail share the Room's photos; image delivery still rechecks public Room visibility on each request. `is_illustrative` is true only for the explicitly allowlisted temporary demo stock files; the UI must show “Ảnh minh họa” for them. No storage key, filesystem path, original filename, Owner ID, or internal storage metadata is returned. Reviews and promotions are not part of this contract.

List query contract:

- `province` and `address`: optional trimmed case-insensitive partial matches. Address matching must not search Property `name`.
- `price_min`, `price_max`: optional non-negative integer VND bounds against `rooms.default_rent`; reject malformed values and `price_min > price_max`.
- `area_min`, `area_max`: optional positive decimal m² bounds against `rooms.area_m2`; reject malformed values and `area_min > area_max`.
- `capacity_min`: optional integer from 1 through 1000000, matched against `rooms.default_capacity`.
- `amenities`: optional comma-separated list of distinct Database V1.16 codes (`air_conditioning`, `parking`, `wifi`, `elevator`, `washing_machine`, `refrigerator`, `water_heater`, `private_kitchen`, `private_bathroom`, `balcony`, `cats_allowed`, `dogs_allowed`). Every requested value must be present on the Room; unknown/duplicate codes are rejected. Admin room create/patch accepts `marketplace_amenities: string[]` from the same allowlist, under the session's Owner scope.
- `property_facilities`: optional repeated query parameter containing up to 10 distinct active Facility names (max 150 chars each), e.g. `property_facilities=Hồ bơi&property_facilities=Sân bóng đá`. Every selected name must exist and be active on the same Property as the Room; unknown, blank, duplicate, or over-limit values are rejected. `GET /public/property-facilities` returns distinct names only for active Properties that have at least one publicly eligible Room. Public Room list/detail and Explorer room DTOs include each Property's active Facility names. Facility booking schedules, prices, availability, descriptions and locations are not public through this contract.
- `page`, `page_size`: standard 1-based pagination from §3 (defaults 1/20, maximum 100). Return the standard `{data,meta}` envelope.
- `sort`: `newest` (default, `created_at DESC, room_id ASC`), `price_asc`, `price_desc`, `area_asc`, or `area_desc`; append `room_id ASC` as the stable tie-breaker. Unknown sort values are rejected.
- Availability is not a client filter: only available Rooms appear. Do not accept a filter that can make occupied/inactive/private Rooms public.

Room detail returns `{ "data": <public Room allowlist> }`. Listing returns `{ "data": [...], "meta": { "page", "page_size", "total_items", "total_pages" } }`.

Contact request body:

```json
{
  "room_id": "201",
  "requester_name": "Nguyễn An",
  "phone": "0901234567",
  "email": "an@example.test",
  "message": "Tôi muốn hỏi thêm thông tin phòng."
}
```

Exactly one target is required: `room_id` or `property_id`; both may be supplied only when the Room belongs to that Property. When `room_id` is supplied without `property_id`, derive Property from Room. A Room-targeted request is accepted only while that Room is public, active, available, and belongs to an active Property; a Property-only request requires an active Property. `requester_name` (2–200 chars) and `phone` (8–30 chars, validated phone syntax) are required; `email` and `message` are optional. Reject `owner_id`, account/resident IDs, preferred date/time, and unknown fields. Persist to `contact_requests` with `status=new`; the server sets timestamps and derives the correct Property/Owner scope. Return `201` with only the created request ID and status. Contact requests are not viewing appointments, bookings, reservations, or promises that the Owner has accepted the inquiry. Apply abuse/rate limits and avoid logging submitted phone/email/message contents.

Owner contact phone exists as an internal Owner field, but V1 has no explicit public-consent/visibility flag or public contact-phone API contract. Therefore V1 uses the persisted contact form only; do not expose Owner phone, Zalo, or account contact fields publicly until an explicit publication/consent rule exists. Contact-request persistence is attributable to Property and Room; V1 does not store a `source` attribution field.

**Room image delivery status:** `cover_image` and ordered `images` are returned by both public list and detail APIs. Every public image URL identifies a RoomImage association and resolves through a backend delivery route that rechecks that association's parent Room visibility predicate on each request; direct static/object URLs that continue serving a hidden Room are disallowed. A shared physical object may be served through another Room's own eligible association URL. A Room with no images returns `cover_image: null` and `images: []`. For the specifically authorized public-room demo photo fixture, the additive `is_illustrative` boolean identifies allowlisted stock assets without exposing their storage keys; clients label these images.

### 5.4 Properties and rooms

| Method and path | Role | Behavior |
|---|---|---|
| `GET /properties` | Admin | Own Properties; filter `status,province`; search `name,address,property_code`; success `200` |
| `POST /properties` | Admin | Create Property; `owner_id` comes from session; success `201` |
| `GET /properties/{property_id}` | Admin | Own Property only; success `200` |
| `PATCH /properties/{property_id}` | Admin | Allowlist `name,province,address,manager_name,status`; no owner transfer; success `200` |
| `DELETE /properties/{property_id}` | Admin | Archive (`status=archived`); never hard-delete history; success `200`, `409` if active operations prevent archive |
| `GET /properties/{property_id}/rooms` | Admin | Own Property rooms; filters `status,is_active,is_public`; optional `search` by room code; paginated; success `200` |
| `POST /properties/{property_id}/rooms` | Admin | Create Room in own Property; Owner/Property derived and verified; success `201` |
| `GET /rooms/{room_id}` | Admin | Room plus derived contract/occupancy summary in Owner scope; success `200` |
| `PATCH /rooms/{room_id}` | Admin | Update code, rent, area, capacity, public fields, or lifecycle fields under validations; success `200` |
| `DELETE /rooms/{room_id}` | Admin | Set inactive; reject if active occupancy/contract prevents it; preserve history; success `200` |

#### Room Images API — implemented for local/development V1.4

Database V1.4 provides the Room image entity, and the backend routes below are runtime verified for local/development. Production object-storage provider configuration remains pending. All paths are under `/api/v1`.

| Method and path | Role | Behavior |
|---|---|---|
| `GET /properties/{property_id}/rooms/{room_id}/images` | Admin | List images, ordered by `sort_order ASC, room_image_id ASC` |
| `POST /properties/{property_id}/rooms/{room_id}/images` | Admin | Multipart field `file`, one image per request, max 5 per Room; first successfully attached image becomes cover |
| `POST /properties/{property_id}/rooms/images/bulk-attach` | Admin | Multipart `room_ids` JSON array plus up to 5 repeated `files` parts; store each file once and attach it to every listed Room that was created successfully by the existing bulk-create orchestration |
| `PUT /properties/{property_id}/rooms/{room_id}/images/order` | Admin | Reorder every current image with an exact ordered ID list |
| `PUT /properties/{property_id}/rooms/{room_id}/images/{image_id}/cover` | Admin | Atomically set the only cover |
| `GET /properties/{property_id}/rooms/{room_id}/images/{image_id}/content` | Admin | Stream a Room image after verifying Owner/Property/Room/Image scope |
| `DELETE /properties/{property_id}/rooms/{room_id}/images/{image_id}` | Admin | Remove only this RoomImage association; promote this Room's next cover; delete physical object only after zero references |

For every Admin request, Owner comes from session and Property → Room → Image membership is verified. Foreign/missing IDs return the same generic `404 NOT_FOUND`. No client-supplied owner/property/room authority fields are accepted.

Single- and per-Room uploads use `multipart/form-data` with exactly one `file` part and no client-supplied image metadata. The shared bulk-attach route uses one JSON-encoded `room_ids` field and up to five repeated `files` parts. Allowed detected content types are `image/jpeg`, `image/png`, `image/webp`; maximum 5 MiB per file. Verify magic bytes, generate neutral storage keys server-side (for example `room-images/{yyyy}/{uuid}.{ext}`), and reject SVG, GIF, HEIC, unknown types, oversized content and path/name manipulation. Never accept or return `storage_key`. Use `413` for oversize and `422 VALIDATION_ERROR` for invalid content; return `409 ROOM_IMAGE_LIMIT_REACHED` when at capacity. Per-Room upload returns `201 { "data": <image> }`.

Room creation remains JSON and does not become multipart. In the single-create UI flow, first call `POST /properties/{property_id}/rooms`; after `201`, upload each selected image through that Room's image route. The first successfully attached image becomes cover. If some file requests fail, keep the Room and successful associations, and report failed files individually; do not roll back the Room.

The existing bulk Room flow creates Rooms through sequential JSON create calls. After the calls finish, submit only successful Room IDs to `/properties/{property_id}/rooms/images/bulk-attach`; failed Room IDs are never included. Accept 1–100 distinct IDs (matching the existing bulk-create limit); validate each exists under that Property, is in Owner scope, and has an empty gallery before storing any image. Each file is validated/stored once; for that file, insert one association per target Room with the same storage key, identical initial order, and cover flag. Association creation for one file is atomic across all target Rooms. If a file fails validation, storage or database attachment, report that file as failed and continue with other files; previously created Rooms and successful files remain. A mixed result returns `200` with per-file outcomes; no full bulk rollback occurs. The multipart parser must permit five 5 MiB files plus multipart framing; a per-file size error is reported for that file while other valid files continue.

Example multipart fields: `room_ids=["101","102"]`, then repeated `files` parts in selection order. Response shape (no physical key or filename):

```json
{
  "data": {
    "room_ids": ["101", "102"],
    "image_results": [
      { "file_index": 0, "status": "attached", "association_count": 2 },
      { "file_index": 1, "status": "failed", "code": "INVALID_IMAGE" }
    ]
  }
}
```

`file_index` maps to the user's selected-file order; the frontend can show its local filename without sending/storing it as server metadata. Empty `room_ids`, duplicate IDs, more than five files, foreign Rooms, or any target that cannot accept the full shared set fail safely before attachment. When bulk Room creation yields no successful Rooms, skip image attachment.

Admin image DTO:

```json
{
  "image_id": "801",
  "url": "/api/v1/properties/12/rooms/201/images/801/content",
  "is_cover": true,
  "sort_order": 1,
  "created_at": "2026-10-11T04:00:00Z"
}
```

At most five associations exist per Room, so Admin list is unpaginated `{ "data": [...] }`. Reorder body is `{ "image_ids": ["801", "802"] }`; it must contain every current ID exactly once, with no foreign/missing IDs. Server assigns dense `sort_order` from 1 and returns `200 { "data": [...] }`. Cover route has an empty body and returns `200 { "data": <selected image> }`; repeating the selected cover is idempotent. Delete returns `200 { "data": { "deleted_image_id": "801", "promoted_cover_image_id": "802", "physical_cleanup_pending": false } }`; `promoted_cover_image_id` is `null` when the Room has no remaining images. `physical_cleanup_pending` is true only when this was the last reference and object deletion needs retry. Removing an association never removes another Room's row. Clients cannot set `storage_key`, URL, filename, MIME, byte size or `is_cover=false`.

Public list and detail both return the cover plus `images` with `image_id,url,is_cover,sort_order,is_illustrative`, ordered by `sort_order ASC, room_image_id ASC`. Each `image_id` is a RoomImage association ID. Public delivery uses `/api/v1/public/room-images/{image_id}` and resolves the physical key through that association, then rechecks its parent Room's public, active, available state and active Property on every GET. Hiding Room A01 makes A01's association URL return generic `404` but does not break Room A02's separate eligible association URL to the same object. The handler sets a validated `Content-Type` and `X-Content-Type-Options: nosniff`; it never redirects to a storage URL.

Operations lock the parent Room row and run count/order/cover/delete metadata changes transactionally. First successful upload becomes cover independently for each Room. Set-cover clears the old cover and sets the target atomically. Deleting the cover promotes the remaining image with smallest `(sort_order, room_image_id)` in the same Room transaction. Bulk attach stores each validated physical object once and creates all associations for that file in one transaction, locking target Room rows in ascending ID order. Key-scoped advisory locks serialize attachment/deletion reference checks; only successful Room IDs are targeted. On DB/count failure, roll back that file's association group and clean the unreferenced object. Delete commits only the chosen association's removal, counts remaining rows for its key and schedules physical deletion only at zero. V1 does not accept a previous key for reattachment, so cleanup cannot race a supported client attach; future key reuse must hold a key lock through cleanup or add durable asset/cleanup state. Storage failure does not restore metadata and is handled by orphan reconciliation.

Storage metadata stores only an opaque `storage_key`; it may repeat across RoomImage rows for different Rooms, but `UNIQUE(room_id, storage_key)` prevents duplicates within one Room. No public URL or absolute filesystem path is stored. Local/dev uses a private backend-managed upload directory, never a directly exposed static directory. Production uses an S3-compatible/provider adapter selected later. Minimal adapter operations: `put(storage_key, bytes, content_type)`, `get(storage_key)`, `delete(storage_key)`. Public URL uses RoomImage ID as the association context so each read can recheck its own Room visibility.

`sort_order` is an integer beginning at 1 with `CHECK (sort_order >= 1)`. No unique `(room_id, sort_order)` is needed; the ID tie-breaker makes duplicate positions deterministic and reorder writes a dense sequence. A partial unique index enforces at most one cover; the service makes the first image a cover and promotes another image after deleting the cover, so every non-empty gallery has exactly one cover.

Room response may include `current_contract`, `occupancy_count`, `contract_capacity`, and effective `status`. These are server-derived, not client-set. `occupied` is computed from current active contract/occupancy; Admin can request `inactive`, or restore `available` only when no active occupancy/contract exists. Changing room default capacity does not override an active contract's capacity.

#### Property and Room JSON contract

All fields in Property/Room request and response JSON use `snake_case`. Prisma camelCase is internal only. Unknown request fields are rejected. IDs and VND BigInt values serialize as decimal strings; Room `area_m2` is a fixed two-decimal string. Booleans remain JSON booleans; `default_capacity`, `occupancy_count`, and `contract_capacity` are JSON numbers. Timestamps are RFC 3339 strings and date-only contract dates use `YYYY-MM-DD`. Nullable fields are present as `null`.

Single-resource success responses use `{ "data": { ... } }`. Collections use `{ "data": [...], "meta": { "page", "page_size", "total_items", "total_pages" } }`. Pagination defaults to page 1 and page size 20, page size maximum 100; ordering is stable and appends the resource ID.

All ten endpoints in this section are Admin-only. The Owner ID comes only from the authenticated session (`req.auth.ownerId`). Client `owner_id`, `resident_id`, and `role` in body, query, or header are rejected and are never authority. A response can represent the caller's `owner_id`, but sending it back does not grant scope. Missing and foreign-Owner resources both return `404 NOT_FOUND` with the same response.

#### Property fields and requests

| Field | Type | Create | PATCH | Response | Notes |
|---|---|---:|---:|---:|---|
| `property_id` | string (BigInt) | No | No | Yes | Server-generated |
| `owner_id` | string (BigInt) | No | No | Yes | Session-derived; response representation only |
| `property_code` | string | Required | No | Yes | Max 40; unique within Owner |
| `name` | string | Required | Yes | Yes | Max 150 |
| `province` | string | Required | Yes | Yes | Max 120 |
| `address` | string | Required | Yes | Yes | Required text; max 10000 characters in this API |
| `manager_name` | string on create; string or null on PATCH/response | Optional | Yes | Yes | Max 150; PATCH may clear with `null`; create accepts omission or a string |
| `status` | string | No | Yes | Yes | `active`, `building`, `paused`, `archived`; create explicitly starts `active` |
| `created_at`, `updated_at` | RFC 3339 string | No | No | Yes | Server-managed |

`POST /api/v1/properties` accepts only the required fields and optional `manager_name`; it rejects status, IDs, timestamps, and unknown fields. The server explicitly sets `status=active` and derives Owner from the session.

```http
POST /api/v1/properties
Content-Type: application/json
```

```json
{
  "property_code": "BH-01",
  "name": "Góc Trọ Biên Hòa",
  "province": "Đồng Nai",
  "address": "12 Đường Mẫu, Biên Hòa",
  "manager_name": "Nguyễn Văn A"
}
```

`PATCH /api/v1/properties/{property_id}` accepts only `name`, `province`, `address`, `manager_name`, and `status`; at least one is required. `property_id`, `owner_id`, `property_code`, `created_at`, and `updated_at` are read-only.

```json
{ "manager_name": null, "status": "paused" }
```

Property response example (create, detail, patch, and archive return this resource shape):

```json
{
  "data": {
    "property_id": "12",
    "owner_id": "5",
    "property_code": "BH-01",
    "name": "Góc Trọ Biên Hòa",
    "province": "Đồng Nai",
    "address": "12 Đường Mẫu, Biên Hòa",
    "manager_name": "Nguyễn Văn A",
    "status": "active",
    "created_at": "2026-10-08T04:00:00.000Z",
    "updated_at": "2026-10-08T04:00:00.000Z"
  }
}
```

`GET /api/v1/properties` supports only `status`, `province`, `search`, `page`, and `page_size`. `province` is a case-insensitive contains filter (max 120 characters); `search` is case-insensitive contains across `name`, `address`, and `property_code` (max 200 characters). `status` is one of the Property statuses above. `page` is a positive integer defaulting to 1 (maximum 1000000); `page_size` is a positive integer defaulting to 20 (maximum 100). Ordering is `name ASC, property_id ASC`.

```http
GET /api/v1/properties?status=active&province=Đồng%20Nai&search=BH&page=1&page_size=20
```

```json
{
  "data": [
    {
      "property_id": "12", "owner_id": "5", "property_code": "BH-01",
      "name": "Góc Trọ Biên Hòa", "province": "Đồng Nai",
      "address": "12 Đường Mẫu, Biên Hòa", "manager_name": "Nguyễn Văn A",
      "status": "active", "created_at": "2026-10-08T04:00:00.000Z",
      "updated_at": "2026-10-08T04:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total_items": 1, "total_pages": 1 }
}
```

`DELETE /api/v1/properties/{property_id}` sets `status=archived`; it does not hard-delete the Property or history. Any active Contract or active occupancy in its Rooms causes `409 CONFLICT`. Success is HTTP 200 with the archived Property in `{ "data": ... }`.

#### Room fields and requests

| Field | Type | Create | PATCH | Response | Notes |
|---|---|---:|---:|---:|---|
| `room_id` | string (BigInt) | No | No | Yes | Server-generated |
| `property_id` | string (BigInt) | Path only | No | Yes | Resolved within Owner scope |
| `owner_id` | string (BigInt) | No | No | Yes | Session-derived; response representation only |
| `room_code` | string | Required | Yes | Yes | Max 40; unique within Property |
| `status` | string | Optional | Yes | Yes | Request accepts `available` or `inactive`; response is effective and may be `occupied` |
| `area_m2` | string (fixed 2 decimals) | Required | Yes | Yes | Greater than zero; max `999999.99` and two fractional digits |
| `default_rent` | string (BigInt VND) | Required | Yes | Yes | Non-negative integer, max 18 digits; request also accepts JSON integer |
| `default_capacity` | number (integer) | Required | Yes | Yes | 1 through 1000000 |
| `is_active` | boolean | Optional | Yes | Yes | Persisted lifecycle flag |
| `is_public` | boolean | Optional | Yes | Yes | Public listing flag |
| `public_description` | string or null | Optional | Yes | Yes | Max 10000 characters; may be cleared with `null` |
| `current_contract` | object or null | No | No | Yes | Derived current active Contract summary |
| `occupancy_count` | number (integer) | No | No | Yes | Active occupancy rows |
| `contract_capacity` | number or null | No | No | Yes | Current Contract capacity snapshot |
| `created_at`, `updated_at` | RFC 3339 string | No | No | Yes | Server-managed |

`POST /api/v1/properties/{property_id}/rooms` accepts only `room_code`, `default_rent`, `area_m2`, `default_capacity`, and optional `is_active`, `is_public`, `public_description`, `status`. Defaults are `is_active=true`, `is_public=false`, `status=available`. If `status` is sent, it must agree with `is_active`: `available/true` or `inactive/false`. `room_id`, `property_id`, and `owner_id` are not body fields; Property is derived from the scoped path and Owner from the session.

```json
{
  "room_code": "P101", "default_rent": "3500000", "area_m2": "25.00",
  "default_capacity": 3, "is_active": true, "is_public": true,
  "public_description": "Phòng sáng, có ban công."
}
```

`PATCH /api/v1/rooms/{room_id}` accepts only `room_code`, `default_rent`, `area_m2`, `default_capacity`, `is_active`, `is_public`, `public_description`, and `status`; at least one is required. IDs, `owner_id`, `property_id`, timestamps, and derived summary fields are read-only. `occupied` is rejected in a request. `status`, when sent, sets its paired `is_active`; `is_active` alone also sets persisted `status` to `available` or `inactive`.

```json
{ "default_capacity": 4, "public_description": null }
```

Room detail/create/patch response example:

```json
{
  "data": {
    "room_id": "201", "property_id": "12", "owner_id": "5", "room_code": "P101",
    "status": "occupied", "area_m2": "25.00", "default_rent": "3500000",
    "default_capacity": 3, "is_active": true, "is_public": true,
    "public_description": "Phòng sáng, có ban công.",
    "created_at": "2026-10-08T04:00:00.000Z", "updated_at": "2026-10-08T04:00:00.000Z",
    "current_contract": {
      "contract_id": "301", "contract_no": "HD-2026-0301",
      "start_date": "2026-10-01", "end_date": "2027-09-30", "status": "active"
    },
    "occupancy_count": 2, "contract_capacity": 3
  }
}
```

`GET /api/v1/properties/{property_id}/rooms` supports `status`, `is_active`, `is_public`, `search`, `page`, and `page_size`. `search` is an optional case-insensitive partial match on `room_code` only, trimmed before use and limited to 200 characters; it is scoped to the authenticated Owner and the current Property. Search combines with status/boolean filters and pagination; an empty search returns the ordinary list. Status is `available`, `occupied`, or `inactive`; boolean query values are the strings `true` or `false`. Pagination defaults and limits match the Property list. Ordering is `room_code ASC, room_id ASC`. The parent Property is Owner-scoped; missing/foreign Property returns 404.

```http
GET /api/v1/properties/12/rooms?search=A01&status=available&is_active=true&is_public=false&page=1&page_size=20
```

```json
{
  "data": [
    {
      "room_id": "201", "property_id": "12", "owner_id": "5", "room_code": "P101",
      "status": "available", "area_m2": "25.00", "default_rent": "3500000",
      "default_capacity": 3, "is_active": true, "is_public": false,
      "public_description": null, "created_at": "2026-10-08T04:00:00.000Z",
      "updated_at": "2026-10-08T04:00:00.000Z", "current_contract": null,
      "occupancy_count": 0, "contract_capacity": null
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total_items": 1, "total_pages": 1 }
}
```

#### Room status, capacity, and deletion

Response `status` is effective, not a free-form client-set value: it is `inactive` when `is_active=false` or stored status is `inactive`; otherwise it is `occupied` when a current active Contract or active occupancy exists; otherwise it is `available`. `current_contract` is the active Contract covering the current date. An upcoming active Contract prevents deactivation but does not by itself make the Room's current effective status occupied. `occupancy_count` counts Room occupancy rows with active status. `contract_capacity` is `current_contract.resident_capacity`, or `null` without a current Contract.

`default_capacity` is the Room's default for future applicable Contracts and must be from 1 through 1000000 in this implementation. Changing it does not rewrite `resident_capacity` on an existing Contract.

`DELETE /api/v1/rooms/{room_id}` deactivates without hard deletion: sets `status=inactive` and `is_active=false`, preserving history. Any active Contract (including one whose start date is in the future) or active occupancy prevents deactivation and returns `409 CONFLICT`. Success is HTTP 200 with the resulting Room resource in `{ "data": ... }`.

#### Property/Room error examples

These examples use the common error envelope from §4. `details` is empty for these errors; each actual request gets a generated `request_id`.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "default_capacity phải là số nguyên từ 1 đến 1000000.", "details": {}, "request_id": "req_01J..." } }
```

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Vui lòng đăng nhập để tiếp tục.", "details": {}, "request_id": "req_01J..." } }
```

```json
{ "error": { "code": "FORBIDDEN", "message": "Tài khoản không có quyền thực hiện thao tác này.", "details": {}, "request_id": "req_01J..." } }
```

```json
{ "error": { "code": "NOT_FOUND", "message": "Không tìm thấy dữ liệu.", "details": {}, "request_id": "req_01J..." } }
```

```json
{ "error": { "code": "CONFLICT", "message": "Không thể ngừng hoạt động phòng đang có hợp đồng hoặc cư trú hoạt động.", "details": {}, "request_id": "req_01J..." } }
```

**Contract status:** Property and Room endpoints, JSON names/types, allowlists, response representations, pagination, tenant scoping, and lifecycle behavior in this §5.4 are reconciled with the implemented V1.2 backend and locked for client implementation. This locks Property/Room only; it does not claim other API domains are implemented or locked.

### 5.5 Residents and occupancy

#### Contract conventions and scope

All routes in this section are under `/api/v1`. JSON keys use `snake_case`; PostgreSQL `bigint` IDs are decimal strings; SQL `date` values use `YYYY-MM-DD`; timestamps use RFC 3339; nullable database fields serialize as `null`. A single resource uses `{ "data": {...} }`; a paginated collection uses `{ "data": [...], "meta": { "page", "page_size", "total_items", "total_pages" } }`.

Admin scope is derived only from `req.auth.ownerId`. `/me/rental` is Resident-only and derives both Owner and Resident from `req.auth.ownerId` and `req.auth.residentId`. IDs in the path select a resource within that scope; client-supplied Owner, role, or authenticated Resident identity never grants authority. Foreign or missing Residents, Rooms, Contracts, or occupancies return the same generic `404 NOT_FOUND`, except CCCD search uses the documented `RESIDENT_NOT_FOUND_IN_OWNER_SCOPE` code.

#### Endpoints

| Method and path | Role | Behavior |
|---|---|---|
| `GET /residents` | Admin | Own Owner's unarchived residents; filter `residence_status,residence_registration_status,property_id,room_id`; pagination |
| `POST /residents` | Admin | Create profile with Owner from session; optional CCCD; `residence_status` is server-managed and starts as `left`; duplicate CCCD is checked only in this Owner |
| `POST /residents/search` | Admin | Exact scoped CCCD lookup; request body avoids CCCD in URL |
| `GET /residents/{resident_id}` | Admin | Own Owner's profile and safe rental summary |
| `PATCH /residents/{resident_id}` | Admin | Update allowlisted profile, contact, CCCD, and residence-registration fields; `residence_status` is not writable; validate scoped CCCD uniqueness |
| `DELETE /residents/{resident_id}` | Admin | Archive profile; reject while an active contract/occupancy needs explicit close-out |
| `GET /rooms/{room_id}/residents` | Admin | Active residents and occupancy history for in-scope Room |
| `POST /rooms/{room_id}/residents` | Admin | Add occupancy with `resident_id`, optional `contract_id`, `started_at`; enforce same Owner/Property/Contract and capacity |
| `POST /occupancies/{occupancy_id}/end` | Admin | End occupancy with effective date; preserve history |
| `POST /residents/{resident_id}/transfer` | Admin | Atomically end selected old occupancy and create new Room/Contract occupancy |
| `GET /me/rental` | Resident | Own current/historical occupancies, Room, representative/contract context, and capacity-safe summary |

#### Resident resource field matrix

The Resident resource has the following scalar fields. Create/patch payloads may contain only the fields marked writable; response-only fields are server/database-owned.

| Field | JSON type | Create | PATCH | Response | Notes |
|---|---|---:|---:|---:|---|
| `resident_id` | decimal string | — | — | required | Server-generated primary key |
| `owner_id` | decimal string | — | — | required | Derived from Admin session; never client authority |
| `national_id` | string or `null` | optional | optional | string or `null` | Optional 12-digit CCCD; unique only within Owner |
| `full_name` | string | required | optional | required | 1–200 characters after trim |
| `phone` | string or `null` | optional | optional | string or `null` | Max 30 characters; nullable |
| `email` | string or `null` | optional | optional | string or `null` | Max 254 characters; nullable |
| `birth_date` | `YYYY-MM-DD` or `null` | optional | optional | date or `null` | SQL `date`; nullable |
| `gender` | string or `null` | optional | optional | string or `null` | Max 40 characters; nullable |
| `residence_status` | enum string | — | — | required | `living` or `left`; server-managed from active Occupancy |
| `residence_registration_status` | enum string | optional | optional | required | `not_completed`, `temporary_resident`, or `temporary_absence`; default `not_completed` |
| `archived_at` | RFC 3339 timestamp or `null` | — | — | required | Server-owned archive marker |
| `created_at` | RFC 3339 timestamp | — | — | required | Database-generated |
| `updated_at` | RFC 3339 timestamp | — | — | required | Database-managed |

`POST /residents` requires `full_name`. All other writable fields are optional; nullable fields may be omitted or sent as `null`. `residence_status` is not accepted on create; the backend creates a profile without active Occupancy as `left`. Unknown/server-managed fields, including `owner_id`, `resident_id`, `residence_status`, and `archived_at`, return `400 VALIDATION_ERROR`. PostgreSQL enforces `UNIQUE(owner_id, national_id)`; duplicate CCCD in this Owner returns `409 RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER`. The same CCCD under another Owner is permitted and is neither searched nor disclosed.

Example:

```http
POST /api/v1/residents
Idempotency-Key: resident-create-2026-001
Content-Type: application/json

{ "national_id": "079123456789", "full_name": "Nguyễn An", "phone": "0900000000", "email": "an@example.test", "birth_date": "1995-01-01", "gender": "unspecified" }
```

```json
{ "data": { "resident_id": "3001", "owner_id": "11", "national_id": "079123456789", "full_name": "Nguyễn An", "phone": "0900000000", "email": "an@example.test", "birth_date": "1995-01-01", "gender": "unspecified", "residence_status": "left", "residence_registration_status": "not_completed", "archived_at": null, "created_at": "2026-10-08T08:00:00.000Z", "updated_at": "2026-10-08T08:00:00.000Z" } }
```

Success is `201`. `PATCH /residents/{resident_id}` accepts the seven writable profile and registration fields in the matrix and no others; it must contain at least one field. `full_name` cannot be null. `national_id`, `phone`, `email`, `birth_date`, and `gender` may be cleared with `null`; `residence_registration_status` must be one of its allowed values and cannot be null. `residence_status` is server-managed and any attempt to patch it returns `400 VALIDATION_ERROR`. Changing CCCD rechecks uniqueness within the authenticated Owner and returns the same documented duplicate conflict. The endpoint cannot change Resident/Owner IDs or archive state; unknown fields return `400 VALIDATION_ERROR`. Success is `200` with the Resident resource.

`residence_status` is derived from active Occupancy and is never client authority. A newly created Resident with no active Occupancy is `left`. A successful `POST /rooms/{room_id}/residents` sets it to `living` in the same transaction as the new occupancy. `POST /occupancies/{occupancy_id}/end` ends the row, then counts remaining active Occupancies for the same Owner/Resident in that transaction: at least one means `living`, zero means `left`. Transfer ends source and creates destination atomically and leaves the Resident `living`; a destination error rolls back both the source transition and any status write. The Resident response continues to include `residence_status`. `residence_registration_status` is an independent writable registration workflow field and is not derived from Occupancy.

#### Resident list, detail, search, and archive

`GET /residents` accepts only these filters and pagination parameters:

| Query parameter | Type / allowed values | Behavior |
|---|---|---|
| `residence_status` | `living` or `left` | Exact status filter |
| `residence_registration_status` | `not_completed`, `temporary_resident`, or `temporary_absence` | Exact status filter |
| `property_id` | positive decimal string | Residents with an active occupancy in a Room of this Owner-scoped Property |
| `room_id` | positive decimal string | Residents with an active occupancy in this Owner-scoped Room |
| `page` | positive integer; default `1` | One-based page |
| `page_size` | integer 1–100; default `20` | Maximum page size 100 |

Owner scope and `archived_at IS NULL` are applied before filters. Room/Property filters match active occupancy rows only; a foreign ID produces the same empty collection as an unmatched in-scope filter. Results are stably ordered by `full_name ASC, resident_id ASC`. The page response follows the shared collection envelope. Each Resident includes its active `room_residents`; those rows are ordered by `started_at DESC, occupancy_id DESC` and include the Room, Property `{property_id,name}`, and Contract summary `{contract_id,contract_no,resident_capacity,status,revision,start_date,end_date}` when present.

`GET /residents/{resident_id}` returns the full Resident resource, including archived profiles, and its `room_residents` history ordered by `started_at DESC, occupancy_id DESC`. Each occupancy includes its Room, Property `{property_id,name,province,address}`, and, when linked, Contract summary `{contract_id,contract_no,representative_resident_id,start_date,end_date,status,resident_capacity,revision}`. No other Resident profile is included. Missing/foreign Resident returns `404 NOT_FOUND`.

`POST /residents/search` is Admin-only and accepts exactly `{ "national_id": "079123456789" }`; exact match only, body only, never a URL/query parameter. Lookup is `owner_id = req.auth.ownerId AND national_id = ...`; no global lookup occurs. A success is `200 { "data": <Resident resource> }`. No match—including a CCCD held only by another Owner—returns exactly the scoped not-found class below, with no CCCD in message/details:

```json
{ "error": { "code": "RESIDENT_NOT_FOUND_IN_OWNER_SCOPE", "message": "Không tìm thấy cư dân trong phạm vi quản lý.", "details": {}, "request_id": "req_01J..." } }
```

`DELETE /residents/{resident_id}` archives by setting `archived_at`; it never hard-deletes the Resident or related history. It returns `200 { "data": <archived Resident> }`. A repeated delete of an already archived profile also returns `200`; the current repository returns a smaller projection for that repeat (`resident_id`, `archived_at`, and the selected relationship arrays). An active occupancy or active representative Contract blocks archive with `409 CONFLICT`; explicit close-out is required first. The normal list excludes archived profiles, while scoped detail/search and historical reads may still find them.

#### Occupancy resource

The physical `RoomResident` scalar resource is:

| Field | JSON type | Notes |
|---|---|---|
| `occupancy_id` | decimal string | Server-generated |
| `room_id` | decimal string | Room identity |
| `property_id` | decimal string | Server-derived from Room |
| `owner_id` | decimal string | Server-derived from authenticated Owner |
| `resident_id` | decimal string | Resident selected by Admin; never authorization scope |
| `contract_id` | decimal string or `null` | Optional applicable Contract |
| `started_at` | `YYYY-MM-DD` | Occupancy start date |
| `ended_at` | `YYYY-MM-DD` or `null` | Set only by end/transfer lifecycle |
| `status` | `active` or `ended` | Database CHECK-backed lifecycle state |
| `created_at` | RFC 3339 timestamp | Database-generated |
| `updated_at` | RFC 3339 timestamp | Database-managed |

`GET /rooms/{room_id}/residents` first resolves the Room under `req.auth.ownerId`; foreign/missing Room is `404 NOT_FOUND`. It returns `{ "data": [...] }` with all active and ended occupancies, ordered by `started_at DESC, occupancy_id DESC`; it currently has no pagination envelope. Each row includes the complete Resident resource and, if linked, Contract summary `{contract_id,contract_no,status,start_date,end_date,resident_capacity,revision}`. No other Owner's rows are selected. This response does not add an `occupancy_count` field; capacity decisions count `room_residents` rows with `status=active` and `started_at <= effective_date`, never ended history.

`POST /rooms/{room_id}/residents` accepts exactly:

```json
{ "resident_id": "3001", "contract_id": "4001", "started_at": "2026-10-08" }
```

`contract_id` may be omitted or `null`; `resident_id` and `started_at` are required. Owner, Property, and Room are server-derived. The Resident, Room, and optional Contract must be in the caller's Owner scope; a supplied Contract must apply to the destination Room/Property and cover the effective date. If no `contract_id` is supplied, the backend selects the active Contract for that Room covering `started_at`, if one exists; otherwise it stores `null`. Duplicate active occupancy for the same Resident in the same Room returns `409 CONFLICT`. Success is `201 { "data": <RoomResident scalar resource> }` with `status=active`, `ended_at=null`, and all server/database fields.

For an applicable active Contract on `started_at`, capacity authority is `contracts.resident_capacity`; `rooms.default_capacity` cannot override that signed snapshot. If no applicable active Contract exists, use `rooms.default_capacity`. Count only active occupancy rows already started by the effective date. An insertion exceeding capacity returns `409 ROOM_CAPACITY_EXCEEDED`. Client-supplied capacity/count fields are rejected; capacity is never silently overridden. On success, the same transaction also sets the Resident's server-managed `residence_status` to `living`.

`POST /occupancies/{occupancy_id}/end` accepts exactly `{ "ended_at": "2026-10-08" }`. It is a lifecycle transition, not deletion: the row remains, `ended_at` is set and `status` becomes `ended`; `ended_at` must be on or after `started_at`. In the same transaction, the backend checks other active Occupancies for this Resident: any remaining means `residence_status=living`, otherwise it becomes `left`. Success is `200 { "data": <updated RoomResident scalar resource> }`. Foreign/missing occupancy is `404 NOT_FOUND`; invalid date is `400 VALIDATION_ERROR`; an already-ended occupancy returns `409 CONFLICT`.

`POST /residents/{resident_id}/transfer` accepts exactly:

```json
{ "source_occupancy_id": "5001", "room_id": "202", "contract_id": "4002", "started_at": "2026-10-08" }
```

`contract_id` may be omitted or `null`. The Resident is selected by the URL and authenticated Owner by session. `source_occupancy_id` must be that Resident's active occupancy in this Owner; `room_id` is the destination Room; an optional `contract_id` must be an applicable in-scope destination Contract; `started_at` is both the effective end date for the old row and the start date for the new row. If destination `contract_id` is omitted, the backend selects the active Contract for the destination Room covering `started_at`, if one exists; otherwise it stores `null`. Date must not precede source `started_at`; same-Room transfer and duplicate active destination occupancy return `409 CONFLICT`. Destination capacity follows the rule above.

The transfer transaction validates source and destination before writes, locks affected Room rows in stable ID order, then updates source (`ended_at=started_at`, `status=ended`) and creates the destination (`status=active`, `ended_at=null`) in one Serializable transaction. It keeps `residence_status=living` within that transaction; a destination validation/write failure rolls back all Occupancy and Resident-status writes. Success is `200` with the exact currently implemented shape: the source is represented by its ID, not a returned source object; `destination` is the newly created full RoomResident scalar resource.

```json
{ "data": { "source_occupancy_id": "5001", "destination": { "occupancy_id": "5002", "room_id": "202", "property_id": "101", "owner_id": "11", "resident_id": "3001", "contract_id": "4002", "started_at": "2026-10-08", "ended_at": null, "status": "active", "created_at": "2026-10-08T08:00:00.000Z", "updated_at": "2026-10-08T08:00:00.000Z" } } }
```

The database does not impose one active occupancy per Resident globally, and the backend does not silently merge multiple active occupancies. It rejects a duplicate active occupancy in the same Room and enforces Owner/Room/Contract consistency and capacity for each operation.

#### Resident self rental

`GET /me/rental` is Resident-only, takes no Resident ID in path/query/body, and derives identity entirely from session. Success is `{ "data": { "resident": <authenticated Resident plus included relation arrays>, "occupancies": [...], "representative_contracts": [...] } }`. The `resident` object itself includes `room_residents` and `representative_contracts`; the same relation arrays are also returned at the top-level as `occupancies` and `representative_contracts`, respectively, matching the current Prisma include/route serialization. `occupancies` contains that Resident's current and historical RoomResident rows ordered by `started_at DESC, occupancy_id DESC`, with Room, Property `{property_id,name,province,address}`, and linked Contract summary `{contract_id,contract_no,representative_resident_id,start_date,end_date,status,resident_capacity,revision}`. A Room may include `images: [{ room_image_id, url, is_cover, sort_order, is_illustrative }]` ordered with the cover first, then by `sort_order` and ID, plus `cover_image: { room_image_id, url, is_cover, sort_order, is_illustrative } | null`. URLs use the Resident-only image route below and `is_illustrative` is derived from the internal demo-key allowlist. No image storage key is returned. `GET /me/room-images/{image_id}` streams only an image whose Room has a current or historical RoomResident row for the same authenticated Owner and Resident; missing and foreign images both return generic `404 NOT_FOUND`. The route validates the response content type, sets `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`, and never returns storage keys. `representative_contracts` contains up to 20 of the Resident's own representative Contracts, newest `start_date` then `contract_id` first, with `{contract_id,contract_no,room_id,property_id,start_date,end_date,status,resident_capacity,representative_resident_id,revision}`. It includes no other Resident's profile or private data. Missing/foreign identity resolves to `404 NOT_FOUND`; Admin receives `403 FORBIDDEN`.

#### Error envelope and representative errors

All errors use `{ "error": { "code", "message", "details": {}, "request_id" } }`. Representative outcomes:

| Status | Code | Condition |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Unknown field, malformed ID/date/CCCD, unsupported filter, or invalid status |
| 401 | `UNAUTHENTICATED` | Missing/invalid session |
| 403 | `FORBIDDEN` | Wrong role for Admin/Resident route |
| 404 | `NOT_FOUND` | Missing or foreign Resident/Room/Contract/occupancy |
| 404 | `RESIDENT_NOT_FOUND_IN_OWNER_SCOPE` | Exact CCCD not found within authenticated Owner |
| 409 | `RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER` | Same-Owner CCCD collision |
| 409 | `ROOM_CAPACITY_EXCEEDED` | Active occupancy would exceed applicable capacity |
| 409 | `CONFLICT` | Duplicate same-Room active occupancy, archive/end lifecycle conflict, or other occupancy state conflict |

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Trường không được hỗ trợ: owner_id.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "UNAUTHENTICATED", "message": "Vui lòng đăng nhập để tiếp tục.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "FORBIDDEN", "message": "Tài khoản không có quyền thực hiện thao tác này.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "NOT_FOUND", "message": "Không tìm thấy dữ liệu.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER", "message": "CCCD đã được sử dụng trong phạm vi chủ trọ này.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "ROOM_CAPACITY_EXCEEDED", "message": "Số cư dân đang ở sẽ vượt sức chứa áp dụng cho phòng.", "details": {}, "request_id": "req_01J..." } }
{ "error": { "code": "CONFLICT", "message": "Cư dân đã có lượt cư trú hoạt động trong phòng này.", "details": {}, "request_id": "req_01J..." } }
```

CCCD is sensitive: it is never placed in a URL or error details, foreign-Owner existence is not disclosed, search is exact and Owner-scoped, and request/error logging must not capture raw CCCD.

**Idempotency implementation status (does not weaken the target contract in §7):** `Idempotency-Key` is required and header presence/shape is validated on `POST /residents`, `POST /rooms/{room_id}/residents`, `POST /occupancies/{occupancy_id}/end`, and `POST /residents/{resident_id}/transfer`. Durable replay storage is not implemented. Same-key/same-payload replay is therefore not yet guaranteed; this remains an infrastructure blocker and full §7 compliance must not be claimed for rollout/production until durable storage is provided.

**Resident/Occupancy API contract status: LOCKED / DOCUMENTED.** The endpoint paths, supported inputs, response shapes, scoping, status values, capacity rules, lifecycle behavior, and error outcomes above have been reconciled with the V1.2 implementation. Durable idempotency is explicitly a pending implementation requirement, not a claim of implemented replay behavior.

CCCD search request and generic not-found result:

```json
POST /api/v1/residents/search
{ "national_id": "079123456789" }

HTTP 404
{ "error": { "code": "RESIDENT_NOT_FOUND_IN_OWNER_SCOPE", "message": "Không tìm thấy cư dân trong phạm vi quản lý.", "details": {}, "request_id": "req_01J..." } }
```

This same response applies when the CCCD exists only under another Owner.

### 5.6 CT01 residence-registration list/export

| Method and path | Role | Behavior |
|---|---|---|
| `GET /properties/{property_id}/residence-registration/pending` | Admin | Paginated active residents across every Room in this Property with `residence_registration_status=not_completed` |
| `POST /properties/{property_id}/ct01/exports` | Admin | Export the reviewed Property-wide set as a document; no per-Resident export flow |

Export body is `{ "format": "docx", "reviewed": true }`. The endpoint returns a file stream and no-store headers. Export content is a draft assembled from permitted Resident fields; it does not claim to be the official legal form. The production template/content and official CT01 version must be verified before production. Export must apply Owner scope before selecting any Resident.

### 5.7 Contracts

All endpoints below are under `/api/v1`. JSON uses `snake_case`; BigInt IDs and integer VND amounts are decimal strings; SQL dates are `YYYY-MM-DD`; timestamps are RFC3339; `revision` and `resident_capacity` are JSON integers. Contract scalar nullable columns are included as `null`. A single resource uses `{ "data": {...} }`; a paginated list uses `{ "data": [...], "meta": { "page", "page_size", "total_items", "total_pages" } }`. ID request fields are positive decimal strings. Money accepts a decimal string (canonical client form) or a safe, nonnegative JSON integer; decimals accept a nonnegative decimal string or finite JSON number representable with at most three fractional digits.

| Method and path | Role | Input / behavior | Success |
|---|---|---|---|
| `GET /contracts` | Admin | Query filters `property_id,room_id,representative_resident_id,status,expiring_before,contract_no`; pagination `page,page_size`. Owner is applied from session. |
| `POST /contracts` | Admin | Required `Idempotency-Key`; body in create field matrix below. | `201`, one Contract resource. |
| `GET /contracts/{contract_id}` | Admin, authorized Resident | Owner-scoped for Admin; Resident must be representative or have an occupancy linked to this Contract. | `200`, one Contract resource; Resident view omits the representative Resident summary. |
| `PATCH /contracts/{contract_id}` | Admin | Status-dependent sparse body; see PATCH rules below. | `200`, one Contract resource. |
| `POST /contracts/{contract_id}/activate` | Admin | Required `Idempotency-Key`; body omitted or `{}` only. No `If-Match`. | `200`, active Contract at revision 1. |
| `POST /contracts/{contract_id}/renew` | Admin | Required `Idempotency-Key` and predecessor `If-Match`; exact body below. | `201`, successor draft Contract. |
| `POST /contracts/{contract_id}/terminate` | Admin | Required `Idempotency-Key`, `If-Match`, and body below. | `200`, terminated Contract. |
| `GET /contracts/{contract_id}/history` | Admin | Owner-scoped pagination `page,page_size`; default 1/20, maximum page size 100. | `200`, paginated audit entries. |
| `GET /contracts/{contract_id}/documents` | Admin, authorized Resident | Owner-scoped; Resident must be linked to the Contract. | `200`, document metadata array sorted by type ASC, version DESC. |
| `POST /contracts/{contract_id}/documents` | Admin | Required `Idempotency-Key`; target multipart `file` and `document_type`. Current upload status is specified below. | With storage/multipart configured, `201`, safe metadata. Current unconfigured storage returns `503 STORAGE_UNAVAILABLE`. |
| `GET /contract-documents/{document_id}` | Admin, authorized Resident | Owner-scoped for Admin; Resident must be representative or linked by occupancy to the document's Contract. | `200`, safe metadata and `download_url` (`null` when no adapter is available). |
| `GET /me/contracts` | Resident | Identity and Owner scope from session; `page,page_size` only, default 1/20, maximum size 100. | `200`, paginated own Contract resources without audit history. |

`GET /contracts` defaults to `page=1,page_size=20` (maximum 100), sorts by `start_date DESC, contract_id DESC`, and applies authenticated `owner_id` before optional filters. A valid filter ID that is absent or belongs to another Owner yields an empty page, not a cross-tenant existence signal. `contract_no` is trimmed, case-insensitive partial matching and composes with the other filters and pagination. `expiring_before` is inclusive, also applies `end_date >= current business date in Asia/Ho_Chi_Minh`, and implicitly restricts results to `status=active`; if `status` is explicitly supplied with it, only `active` is accepted. Before Contract reads, the backend synchronizes due `active → expired` transitions for the authenticated Owner using the same Vietnam business date. Invalid/unknown filters or pagination values return `400 VALIDATION_ERROR`. `GET /me/contracts` uses the same stable sort and pagination, with scope from the authenticated Resident profile.

#### Contract resource field matrix

| Field | JSON type | Create | Draft PATCH | Active PATCH | Response / ownership |
|---|---|---:|---:|---:|---|
| `contract_id` | decimal string | — | — | — | Server-generated, required. |
| `contract_no` | string (1–40 chars) | Required | Allowed | Rejected | Required; unique; editable only while draft. |
| `room_id` | decimal string | Required | Rejected | Rejected | Required; selected at creation and immutable through Contract PATCH. |
| `property_id` | decimal string | — | Rejected | Rejected | Required; derived from Room. |
| `owner_id` | decimal string | — | Rejected | Rejected | Required; derived from authenticated Admin/session context. |
| `representative_resident_id` | decimal string | Required | Allowed | Allowed | Required; Owner-scoped; actor/Resident authority never comes from client identity fields. |
| `previous_contract_id` | decimal string or `null` | — | Rejected | Rejected | Nullable; server-derived for renewal, otherwise `null`. |
| `start_date` | `YYYY-MM-DD` | Required | Allowed | Allowed | Required SQL date. |
| `end_date` | `YYYY-MM-DD` | Required | Allowed | Allowed | Required SQL date; strictly after `start_date`. |
| `status` | string enum | — | Rejected | Rejected | Required; `draft`, `active`, `expired`, or `terminated`; lifecycle-owned. |
| `revision` | JSON integer | — | Rejected | Rejected | Required; draft is 0; official states are >=1; lifecycle-owned. |
| `rent_amount` | integer VND decimal string | Required | Allowed | Allowed | Required; nonnegative; JSON safe integer accepted on input. |
| `deposit_amount` | integer VND decimal string | Required | Allowed | Allowed | Required; nonnegative; JSON safe integer accepted on input. |
| `resident_capacity` | JSON integer | Required | Allowed | Allowed | Required; integer 1–1,000,000. On an active Contract, an actual change is a formal amendment requiring `change_reason`, `If-Match`, revision increment and history. |
| `initial_electric_kwh` | decimal string or `null` | Required key; nullable | Allowed; nullable | Allowed; nullable | Required nullable column; nonnegative, max 3 fractional digits. |
| `initial_water_m3` | decimal string or `null` | Required key; nullable | Allowed; nullable | Allowed; nullable | Required nullable column; nonnegative, max 3 fractional digits. |
| `termination_date` | `YYYY-MM-DD` or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `termination_reason` | string or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `final_electric_kwh` | decimal string or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `final_water_m3` | decimal string or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `deposit_deduction` | integer VND decimal string or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `deposit_settlement_amount` | integer VND decimal string or `null` | — | Rejected | Rejected | Required nullable column; set only by termination lifecycle. |
| `created_at` | RFC3339 timestamp | — | Rejected | Rejected | Required; server-managed. |
| `updated_at` | RFC3339 timestamp | — | Rejected | Rejected | Required; server-managed. |

Response resources also include `room: { room_id, room_code, property: { property_id, name, province, address } }`. Admin responses include `representative_resident: { resident_id, full_name }`; Resident responses omit this related summary. Admin responses include the Owner-scoped direct `successor: { contract_id, contract_no, status, revision }` when present. Resident responses include that summary only if the successor independently matches the authenticated Owner and Resident authorization scope (representative or linked occupancy); a predecessor relationship alone does not authorize successor visibility. Otherwise `successor` is omitted. Create, list, detail, patch, activation, renewal, termination, and Resident self-list all serialize the full scalar resource above, including nullable lifecycle fields as `null`.

#### Create and state-dependent PATCH

`POST /contracts` body has exactly `contract_no,room_id,representative_resident_id,start_date,end_date,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3`. The two initial-reading keys are required but each may be `null`. The server derives `owner_id,property_id,status=draft,revision=0,previous_contract_id=null`; any extra or authority/lifecycle field is `400 VALIDATION_ERROR`. A Room/Resident outside the authenticated Owner scope or an inactive Room is hidden as `404 NOT_FOUND`. Current occupancy over the proposed snapshot returns `409 ROOM_CAPACITY_EXCEEDED`; active parking assignments plus unexpired pending Parking holds over it return `409 PARKING_CAPACITY_EXCEEDED`.

For `status=draft`, PATCH allows only `contract_no,representative_resident_id,start_date,end_date,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3`. It is sparse, requires at least one field, needs no `change_reason` or `If-Match`, keeps revision 0, and writes no ContractChangeHistory. Draft PATCH checks date ordering, Owner-scoped Resident, active Contract date overlap for the Room, and capacity when `resident_capacity` is supplied.

For `status=active`, PATCH allows only `representative_resident_id,start_date,end_date,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3,change_reason`. `change_reason` is required and nonblank (maximum 1000 characters); it is audit metadata, not a Contract resource field. Require `If-Match: "<revision>"`. The handler locks Room then Contract, reloads current state, validates the revision and affected date/Resident/capacity constraints, and updates only changed material fields. A no-op still requires a valid reason and matching revision, but leaves revision unchanged and creates no history. A material change increments revision once and writes one `material_update` event with changed-fields-only snapshots atomically. `contract_no` is immutable after activation. Generic PATCH on `expired` or `terminated` returns `409 CONFLICT`.

#### Status, revision, activation, and concurrency

Allowed status/revision pairing is `draft → revision 0`; `active|expired|terminated → revision >=1`. Draft create/edit has no durable official history. Activation accepts no client fields (omitted body or `{}`), requires `Idempotency-Key`, and does not use `If-Match`. It locks/reloads the draft and Room, requires draft/revision 0, a valid same-Owner representative and active Room, rejects an archived Property, validates dates, active-Contract overlap, occupancy and parking capacity, then atomically sets `active/revision=1` and creates the first history entry. A successor cannot activate until each utility has a resolved initial baseline.

Contract business date is `Asia/Ho_Chi_Minh`. An `active` Contract whose `end_date` is earlier than that date transitions to persisted `expired`; the `end_date` itself remains active through that date. Backend synchronizes the transition on authenticated Contract reads, under a Contract row lock and transaction. A successful transition increments revision once and adds one `status_transition` history event; repeated/concurrent reads do not duplicate the event. In the same transaction, active parking assignments end at `end_date`, pending Parking requests are cancelled and release their slot holds, active/cancellation-requested amenity subscriptions end at `end_date`, and planned amenity cycles starting at or after that boundary are cancelled. `terminated` never transitions to `expired`, and no status is reactivated automatically.

Activation history is `change_type=activation`, `revision=1`, `before_data={"status":"draft"}`. `after_data` contains `contract_no,room_id,representative_resident_id,start_date,end_date,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3,status`; it adds `previous_contract_id` only when non-null and contains no Resident PII. The lifecycle response is the full Contract resource described above.

`If-Match` accepts exactly a quoted nonnegative decimal integer, e.g. `If-Match: "3"`; weak tags, unquoted values, leading zero forms other than `"0"`, negative values, and unsafe integers are invalid. Missing or malformed header returns `400 VALIDATION_ERROR`. A stale revision returns `409 CONTRACT_REVISION_CONFLICT`; the operation commits no Contract/history mutation. Active PATCH, renewal, and termination require it. Draft PATCH and activation do not.

`resident_capacity` is the Contract's signed snapshot; changing `rooms.default_capacity` never rewrites it. A material change to capacity on an `active` Contract is an audited amendment: it requires nonblank `change_reason`, the current `If-Match`, a single revision increment, and one `material_update` history event. Backend checks active Room occupancy and active Parking assignments plus unexpired pending Parking requests against the proposed value and blocks a decrease below that usage; it does not silently remove occupants/assignments or modify `rooms.default_capacity`. Exceeding residents returns `409 ROOM_CAPACITY_EXCEEDED`; exceeding Parking use or held requests returns `409 PARKING_CAPACITY_EXCEEDED`. Overlap currently means another `active` Contract for the same Owner/Room with inclusive date intersection (`existing.start_date <= candidate.end_date` and `existing.end_date >= candidate.start_date`); it returns `409 CONTRACT_DATE_OVERLAP`. Draft creation does not run the overlap query; draft PATCH, activation, and renewal do. The overlap check is application logic, not a database exclusion constraint.

#### Renewal

`POST /contracts/{contract_id}/renew` requires `Idempotency-Key` and predecessor `If-Match`. Exact body (no other fields):

```json
{
  "contract_no": "HD-NEW-3002",
  "start_date": "2027-10-15",
  "end_date": "2028-10-14"
}
```

The successor clones predecessor `room_id,property_id,representative_resident_id,rent_amount,deposit_amount,resident_capacity`, but its initial Electricity/Water readings are a new Contract baseline and are never copied or resolved from predecessor final readings, predecessor Invoices, or Room history. They may be `null` on the `draft/revision=0` successor. Admin must PATCH each required initial reading onto the successor draft before activation; if either remains absent or invalid, activation returns `409 CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED`. The backend sets `owner_id` from the authenticated session and `previous_contract_id` to the predecessor ID. It is created as `draft/revision=0` without history and returned as a full Contract resource with HTTP 201. The predecessor and its revision are unchanged. Current eligible predecessor statuses are `active` and `expired`; only one direct successor is allowed. The backend checks revision, date validity, overlap with active Contracts, same-Owner representative, and capacity. Database constraints also enforce same Room/Owner lineage, no self-reference, and unique direct successor; longer-cycle rejection remains a backend responsibility. State/second-successor conflicts return `409 CONFLICT`; overlap, capacity, and stale revision use their specific 409 codes.

#### Termination

`POST /contracts/{contract_id}/terminate` requires `Idempotency-Key` and `If-Match: "<revision>"`. Exact body:

```json
{
  "termination_date": "2027-01-01",
  "termination_reason": "Hai bên thống nhất chấm dứt",
  "final_electric_kwh": "125.500",
  "final_water_m3": "44.000",
  "deposit_deduction": "500000",
  "deposit_settlement_amount": "3000000"
}
```

No extra fields or `change_reason` are accepted. Current validation requires `termination_reason` and both final readings; readings are nonnegative with at most three fractional digits and cannot be below a non-null initial reading. `termination_date` must be within the Contract start/end dates and must not be later than the current business date in `Asia/Ho_Chi_Minh`; future dates return `400 VALIDATION_ERROR` with “Ngày chấm dứt không được lớn hơn ngày hiện tại.” Deduction cannot exceed deposit and `deposit_settlement_amount` must equal `deposit_amount - deposit_deduction`. Only an `active` Contract may terminate. An unpaid Invoice returns `409 CONTRACT_HAS_UNPAID_INVOICES`. Success sets `status=terminated`, revision N→N+1, writes termination/settlement fields, appends one `status_transition` history event, and returns the full Contract resource with HTTP 200. The audit `after_data` records terminal status/date/reason/readings/deduction/settlement; `before_data` records prior status and null termination fields.

The same serializable transaction ends active Room occupancy rows for this Contract whose `started_at <= termination_date` (`status=ended, ended_at=termination_date`), then recomputes each affected Resident from all of their Owner-scoped active Occupancies (`living` if one or more remain, otherwise `left`). It also ends active parking assignments meeting that date condition, cancels pending Parking requests to release their slot holds, changes active or cancellation-requested amenity subscriptions to `contract_ended` with `effective_end_at=termination_date`, and cancels planned amenity cycles whose `cycle_start >= termination_date`. It preserves rows/history and does not delete or mutate invoices or payments. A future-start active occupancy after the termination date causes `409 CONFLICT` before writes.

#### Audit history and Resident privacy

`GET /contracts/{contract_id}/history` is Admin-only, Owner-scoped, paginated with `page,page_size` (default 1/20, max size 100); a Resident receives `403 FORBIDDEN`. Missing/foreign Contract is the same `404 NOT_FOUND`. Each item contains exactly `revision` (JSON integer), `change_type`, `change_reason` (string or null), `before_data`, `after_data`, `changed_by_account_id` (decimal string), and `created_at` (RFC3339). It is ordered `revision ASC, change_id ASC` for a stable audit timeline. Response is `{ "data": [...], "meta": { "page", "page_size", "total_items", "total_pages" } }`.

Residents may read only their own related Contract resources and may see the current revision, but do not receive ContractChangeHistory, `change_reason`, `before_data`, `after_data`, or actor information. Admin receives only the representative Resident summary; resident Contract response omits that summary. A successor is independently authorized for Resident visibility: it is included only when the successor itself is scoped to the authenticated Owner and the Resident is its representative or has a linked occupancy; predecessor authorization or `previous_contract_id` alone never grants visibility. If that independent check fails, omit the successor summary while returning the authorized predecessor normally. ContractChangeHistory records field/lifecycle audit and is distinct from ContractDocument file-version metadata.

#### Contract document APIs and current upload status

`GET /contracts/{contract_id}/documents` returns `data` as an array of safe metadata, ordered `document_type ASC, version DESC`. `GET /contract-documents/{document_id}` returns `{ "data": { ...metadata, "download_url": string|null } }`. Admin access is Owner-scoped; Resident access requires representative or Contract-linked occupancy. Metadata fields are `document_id,contract_id,property_id,owner_id,file_name,mime_type,file_size,document_type,version,checksum_sha256,status,uploaded_by_account_id,signed_at,signature_provider,signature_reference,created_at,updated_at`. BigInt fields serialize as decimal strings; `storage_key` is never selected into public DTOs or returned. A short-lived URL is produced only by a configured object-storage adapter; it is never persisted.

Target upload contract: multipart `file` plus `document_type`; backend derives Owner/Property/uploader, storage key, checksum, and next version. Each upload creates an immutable new version; it never overwrites an earlier document. Object staging precedes the metadata transaction; metadata allocation locks the Contract, derives next version per `(contract_id,document_type)`, stores SHA-256 and metadata, and cleans up the staged object if the DB transaction fails. This file-version history is separate from ContractChangeHistory.

Current implementation status: authorization and service boundary exist, but production object storage and multipart adapter are not configured. Current POST therefore returns `503 STORAGE_UNAVAILABLE` before attempting binary persistence. If an adapter is enabled without a multipart file, current route returns `400 VALIDATION_ERROR`. Do not treat binary upload as production-ready. GET remains available for existing metadata; `download_url` is `null` when storage is unavailable.

#### Contract error outcomes

All errors use `{ "error": { "code", "message", "details", "request_id" } }`.

| HTTP | Code | Contract condition / behavior |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Missing/unknown body fields; empty PATCH; invalid IDs, dates, amounts, capacity, filters, pagination, Idempotency-Key or If-Match syntax; invalid lifecycle body. |
| 401 | `UNAUTHENTICATED` | Missing/invalid session. |
| 403 | `FORBIDDEN` | Wrong role, including Resident history access or Admin calling `/me/contracts`. |
| 404 | `NOT_FOUND` | Missing or foreign Contract/Room/Resident/document; foreign resources are not distinguished from missing ones. |
| 409 | `CONFLICT` | Invalid lifecycle state, duplicate unique Contract number/document version, already-existing successor, inactive/archive state, or future occupancy prevents termination. |
| 409 | `CONTRACT_DATE_OVERLAP` | Candidate dates intersect another active Contract for the same Room and Owner. |
| 409 | `CONTRACT_HAS_UNPAID_INVOICES` | At least one scoped Invoice has status `unpaid` during termination. |
| 409 | `CONTRACT_REVISION_CONFLICT` | `If-Match` revision is stale; no mutation/history is committed. |
| 409 | `CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED` | A successor is missing one or more required utility baseline readings at activation. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | A covered command reuses the same scoped key with a different normalized semantic request. No second mutation is run. |
| 409 | `ROOM_CAPACITY_EXCEEDED` | Active Room occupancy exceeds proposed Contract capacity. |
| 409 | `PARKING_CAPACITY_EXCEEDED` | Active parking assignments exceed proposed Contract capacity. |
| 503 | `STORAGE_UNAVAILABLE` | Production object-storage adapter is not configured for upload. |
| 503 | `IDEMPOTENCY_REPLAY_UNAVAILABLE` | Stored success cannot be safely decrypted or its required historical key/fingerprint version is unavailable; the mutation is never rerun. |

Unauthenticated/non-Contract shared errors and internal `500 INTERNAL_ERROR` follow the common error contract in §2.

#### Idempotency implementation status and lock

All five Contract POST commands continue to require an `Idempotency-Key` with 1–128 visible ASCII characters. Durable replay is implemented only for `POST /contracts`, `/contracts/{contract_id}/activate`, `/renew`, and `/terminate`; `/documents` retains header validation but is excluded from durable replay. Authentication, active-account/role, Owner context, resource scope, and body validation run before a replay lookup. The namespace is Owner + authenticated Account + operation scope + SHA-256 key digest. A versioned fingerprint covers normalized semantic input (including parsed `If-Match` for renewal/termination); same key and payload replays the encrypted original successful status/body, while a changed payload returns `409 IDEMPOTENCY_KEY_REUSED`. AES-256-GCM response ciphertext is bound by AAD to request, Owner, Account, operation, key digest and fingerprint. The Contract mutation, official history/dependent lifecycle effects and completed replay row commit in one PostgreSQL transaction. Missing key versions, integrity failures and committed incomplete rows fail closed with generic `503 IDEMPOTENCY_REPLAY_UNAVAILABLE`; they never rerun the mutation. V1.5 has no TTL or cleanup. Production key material must come from deployment secret management; local development uses an ignored environment file. V1 defines one Owner = one Admin Account, enforced at most by `accounts.owner_id UNIQUE`; therefore the same-Owner multi-Admin isolation fixture is N/A by V1 data-model invariant. Cross-Owner isolation remains required and runtime-tested. Account ID remains in the namespace, replay lookup and AAD; if multi-admin is approved in a future version, same-Owner Account isolation becomes mandatory test coverage before release.

**Contract API contract status: LOCKED / DOCUMENTED.** Resident detail and `/me/contracts` independently scope each successor summary to the authenticated Owner and Resident; a successor that does not independently satisfy that authorization is omitted, while the authorized predecessor remains visible. Admin successor summaries remain Owner-scoped. The privacy blocker is resolved by the repository query boundary and covered by route/repository tests. Runtime replay for the four JSON mutation commands is implemented and PostgreSQL-tested; same-Owner multi-Account runtime isolation is N/A for V1 because the accepted account model permits one Admin Account per Owner. Document upload replay and production object storage/multipart remain pending and are excluded from the durable replay claim. These limits do not change endpoint/body semantics or the API contract version.

### Utility Tariff Configuration — Database V1.8

These Admin-only Property-scoped routes configure the existing Electricity and Water tables. The authenticated session supplies `owner_id`; clients cannot send tenant authority. A foreign Property is returned as `404 NOT_FOUND`.

| Method and path | Role | Behavior |
|---|---|---|
| `GET /properties/{property_id}/utility-tariffs` | Admin | Read Property-scoped Electricity/Water tariffs, published version history and Electricity tiers. |
| `POST /properties/{property_id}/utility-tariffs/{utility_type}/versions` | Admin | Atomically create and publish one complete version; `utility_type` is `electricity` or `water`. |

The POST body is an exact allowlist. Both utility types require `effective_from` (`YYYY-MM-DD`) and may include `source_name` and `source_reference`. Electricity requires `tiers:[{tier_no,lower_kwh,upper_kwh,unit_price}]` and does not accept a flat rate; Water requires integer-string `flat_unit_price` in VND/m³ and does not accept tiers. The server fixes Electricity to `kWh/PROGRESSIVE` and Water to `m3/FLAT`; it creates the Property/type tariff if absent, otherwise uses the sole active tariff. If multiple active tariffs make authority ambiguous, return `409 CONFLICT`. No client may select tariff IDs, version number, publication state, Owner, creator or publisher.

GET responds as `{data:{property:{property_id,name},tariffs:[{utility_tariff_id,utility_type,code,name,status,versions:[{utility_tariff_version_id,version_no,effective_from,unit,calculation_mode,flat_unit_price,source_name,source_reference,published_at,created_at,tiers:[{electricity_tariff_tier_id,tier_no,lower_kwh,upper_kwh,unit_price}]}]}]}}`. POST responds `201 {data:{utility_tariff_version_id,version_no,effective_from,unit,calculation_mode,flat_unit_price,source_name,source_reference,published_at,created_at,tiers,tariff:{utility_tariff_id,utility_type,code,name}}}`. BigInt IDs and VND rates are decimal strings; Electricity `flat_unit_price` is null, and Water `tiers` is an empty array.

Version creation, full tier insertion, and publication occur in one transaction. No draft lifecycle is exposed. Electricity tiers must start at zero, be numbered consecutively, be gapless/non-overlapping, have nonnegative integer VND rates, and have exactly one final open-ended tier. Water has one nonnegative integer VND/m³ rate. Invalid business input returns `400 VALIDATION_ERROR` with Vietnamese guidance; uniqueness/concurrency conflicts return `409 CONFLICT`. Published versions and tiers are immutable; later prices require a new effective-dated version. Billing continues to select the latest published version with `effective_from <= invoice.period_start`; there is no mid-period split. GET returns version metadata, publication status/time, source metadata, flat Water rate or Electricity tiers; the current applicable version in UI is derived as of the Vietnam business date.

For the first Invoice of a Contract, opening meter readings are managed through the existing Contract initial-reading fields, not arbitrary `meter_readings` CRUD. Draft Contracts use the existing sparse PATCH without revision; Active Contracts use the existing audited PATCH with `change_reason` and `If-Match`. Renewal successors require their own initial readings and do not inherit predecessor values. Later Invoice openings continue to come only from the nearest earlier finalized Invoice of the same Contract. Finalized snapshots remain immutable.

### 5.8 Invoices and Zalo OA

| Method and path | Role | Behavior |
|---|---|---|
| `GET /billing/workspace` | Admin | Read-only Owner-scoped operational view of each Contract's current billing period, current draft/finalized Invoice, backend-resolved readiness reasons, closeout reminder and unpaid overview. Filters: `page,page_size,property_id,room_id,resident_id,invoice_status,period_start,period_end,state`. |
| `GET /invoices` | Admin, Resident | Admin filters own `property_id,room_id,contract_id,resident_id,status,period_start,period_end`; Resident sees only invoices linked to own rental history |
| `POST /invoices` | Admin | Create a reviewed draft for an in-scope Contract; period/context are validated and due/finalized fields remain null |
| `POST /contracts/{contract_id}/invoices/generate` | Admin | For the next eligible Contract period, return the existing Invoice for its unique period or create a draft if none exists; server derives period and tenant context. The production server scheduler separately handles period-end reminders and next-day draft guarantees. |
| `GET /invoices/{invoice_id}` | Admin, authorized Resident | Return scoped Invoice detail. Admin receives the item/tier response defined below; authorized Resident keeps the existing scoped financial summary response. |
| `PATCH /invoices/{invoice_id}` | Admin | Draft-only; exact mutable inputs are `electricity_current_kwh` and `water_current_m3`; finalized amendment is not implemented; paid financial fields cannot be changed |
| `POST /invoices/{invoice_id}/finalize` | Admin | Atomically validate completeness, recalculate amounts, set finalization/due date and status unpaid; make a best-effort Zalo enqueue only after commit |
| `POST /invoices/{invoice_id}/send-zalo` | Admin | Queue only a finalized unpaid invoice for its authorized recipient; create a separate revision send log |
| `GET /invoices/{invoice_id}/zalo-send-logs` | Admin, authorized Resident | Read scoped send history; preserve every prior revision/send |

Invoice lifecycle is `draft → unpaid → paid`; `overdue` is derived and is never a persisted invoice status. Every Invoice uses `period_start` and `period_end`; `period_end >= period_start`; unique period identity is `(contract_id,period_start,period_end)`. The billing anchor is `contracts.start_date`, not deposit date or calendar month. Each monthly anniversary is calculated from the original Contract start anchor. If a target month lacks anchor day 29/30/31, clamp to that month's last day; never use a clamped date as the next anchor (no cumulative drift). Define `effective_contract_end_date` as `contracts.termination_date` when `contracts.status=terminated` and `termination_date` is present; otherwise use `contracts.end_date`. The period ends the day before the next anniversary, except the final period end is `min(normal_period_end,effective_contract_end_date)`. No billing period may start after that effective end date.

#### Current request and response contract

All paths below are mounted under `/api/v1`. `POST /invoices` accepts exactly `contract_id`, `period_start`, and `period_end` (ISO `YYYY-MM-DD`; IDs are decimal strings); all are required. `contract_id` must resolve inside the authenticated Admin Owner scope, and dates must match the contract-anchored period. The server derives Invoice number, Owner/Property/Contract context, revision, status, readings/amounts, finalization and due fields. Success is `201` with `{data: Invoice}`. A duplicate period returns `409 INVOICE_PERIOD_CONFLICT`.

`POST /contracts/{contract_id}/invoices/generate` accepts no body fields (body omitted or `{}`) and requires `Idempotency-Key`. It is an Admin HTTP endpoint (`200`, `{data: Invoice}`). It locks the Owner-scoped Contract, selects the next eligible ended period, and returns the existing Invoice for that period in its current state (including if already finalized/paid) or creates a draft if none exists. The hourly server scheduler separately records the period-end closeout reminder and ensures the draft on the following business calendar day; it has no separately authenticated HTTP role. The physical unique period key is the duplicate guard, and the scheduler is retry-safe with chronological catch-up across missed periods.

`GET /billing/workspace` is Admin-only and read-only. The Owner is always derived from the authenticated session; clients cannot send `owner_id`. It returns `200` as `{data: BillingWorkspaceRow[], meta:{page,page_size,total_items,total_pages}, summary:{...}}`. Filters are optional decimal-string business resource IDs (`property_id`, `room_id`, `resident_id`), `invoice_status` (`draft|unpaid|paid`), ISO date bounds (`period_start`, `period_end`) and `state` (`UPCOMING|IN_PROGRESS|REMINDER_DUE|MISSING_DRAFT|MISSING_DATA|READY_TO_FINALIZE|FINALIZED_UNPAID|OVERDUE|PAID`). Page size defaults to 20 and is capped at 50. Rows are stably ordered by Property name, Room code and Contract ID; the ID is not part of the user-facing label. Period dates are calculated independently from each Contract's original `start_date` anniversary and effective end date; the API does not represent one global calendar month.

Each row returns safe Property name/address and Room code, representative Resident name, Contract number, period range, `state:{code,label}`, `reminder:{due,recorded}`, `draft_expected`, nullable current Invoice metadata, and `missing_or_invalid:[{code,category,message}]`. Draft readiness is obtained by a read-only inspection that invokes the same meter continuity, utility tariff, Fixed/Flexible Service and Parking resolvers used by Invoice finalization. `ready_to_finalize` is represented by the row state only when every required resolver succeeds; the frontend must not infer readiness. Inspection does not finalize, consume charges, write snapshots or change Invoice status. Draft amount remains explicitly provisional.

State/invoice-status filtering is applied before pagination so `meta` reflects the filtered candidate set; because readiness is derived from source resolvers, such filtered requests inspect the Owner-scoped candidates before slicing the requested page. Unfiltered lists use database pagination. Per-page summary counters are explicitly named `*_on_page`; finalized-unpaid, paid and overdue counts and the bounded unpaid preview use Owner- and business-filtered Invoice queries. The read model does not fetch one API resource per Contract from the client. Reminder status is matched against existing durable `billing_period_closeout` notifications; the workspace does not enqueue duplicates. An ended period without its expected draft is shown as `MISSING_DRAFT`; the UI does not silently create or recover one. Invoice detail is the existing destination for meter entry, review/finalization, and read-only finalized history.

`PATCH /invoices/{invoice_id}` accepts a non-empty object containing only `electricity_current_kwh` and/or `water_current_m3`; each value is nonnegative with at most three fractional digits. It cannot set totals, service amount, status, revision, tenant/Contract context, or finalization/due fields. It returns `200` with `{data: Invoice}`. Draft changes run under an Invoice row lock and serializable transaction. Any finalized unpaid edit returns `409 INVOICE_AMENDMENT_NOT_ALLOWED`; a paid edit returns `409 INVOICE_ALREADY_PAID`. There is no controlled amendment command in this API version.

`POST /invoices/{invoice_id}/finalize` accepts an omitted body, `{}`, or a non-empty object containing only `electricity_current_kwh` and/or `water_current_m3`; meter values are checked against prior readings. It requires `Idempotency-Key`, is Admin-only, and returns `200` with `{data: Invoice}` after one serializable Invoice-row-locked transaction commits. Missing readings or unconfigured authoritative pricing returns `409 INVOICE_DATA_INCOMPLETE` and leaves the draft unchanged. A repeated finalize returns `409 INVOICE_ALREADY_FINALIZED`; paid returns `409 INVOICE_ALREADY_PAID`; invalid/decreasing readings return `400 VALIDATION_ERROR`. Zalo enqueue is attempted after commit; that attempt is best effort and does not change the successful finalize response or roll back the Invoice.

The current V1.2 request contract above models current Invoice readings only. The approved Requirement supersedes tariff-boundary segment reads: each utility has one tariff version per billing period, selected by period_start and held for that whole period. Do not split or prorate usage because a tariff changes mid-period. For each utility independently, the first Invoice of a Contract uses that Contract's initial reading; later Invoices use the nearest earlier finalized Invoice ending reading from the same Contract only. Draft/unfinalized Invoices and Invoices from other Contracts or Room history are not opening sources. If the nearest earlier finalized Invoice has a missing/invalid ending reading, or if no finalized Invoice exists and the Contract initial reading is missing/invalid, retain the Invoice as draft and block finalize. Renewal creates a new meter continuity and does not inherit predecessor readings. The approved V1.7 design requires the reading resource/field contract and response shape to be detailed for implementation; no intermediate reading is required merely for tariff changes.

`POST /invoices/{invoice_id}/send-zalo` accepts no body fields (body omitted or `{}`), requires `Idempotency-Key`, and is Admin-only. Success is `202` with `{data:{send_log_id,invoice_id,invoice_revision,status:"queued",created_at}}`. A draft, paid, or unfinalized Invoice returns `409 INVOICE_NOT_SENDABLE`. A missing recipient policy or unavailable queue/provider returns `503 SERVICE_UNAVAILABLE`; a provider failure after log allocation leaves a `failed` send-log row. The client cannot supply recipient Resident or phone. `GET /invoices/{invoice_id}/zalo-send-logs` returns `200` with `{data:[...]}`; Admin sees scoped send-log metadata including safe error text, while an authorized Resident sees only their Invoice history and no recipient ID/phone, provider response, or error text. A missing/foreign Invoice returns `404 NOT_FOUND` for both roles.

`GET /invoices` accepts only `page`, `page_size`, `property_id`, `room_id`, `contract_id`, `resident_id`, `status`, `period_start`, and `period_end`; default page is 1 and page size is 20, maximum 100. Resident may filter only by status and period. Success is `200` with `{data: Invoice[],meta:{page,page_size,total_items,total_pages}}`. Admin scope is derived from session Owner; Resident scope is derived from session Resident and same-Owner representative or Contract-specific occupancy. Foreign/missing detail IDs are indistinguishable (`404 NOT_FOUND`). Resident invoice and send-log access does not flow through `previous_contract_id`; the Resident must independently match the invoice Contract as representative or linked occupant.

`GET /invoices/{invoice_id}` returns `200` with `{data: InvoiceDetail}` after the existing session and resource-scope checks. The Admin `InvoiceDetail` extends the common Invoice fields with `itemization_available:boolean` and `invoice_items:InvoiceItem[]`. If `snapshot_kind=ITEMIZED`, `itemization_available=true` and `invoice_items` contains every immutable persisted item in item order (`invoice_item_id` ascending); each item exposes `invoice_item_id` (decimal string), `category`, `item_key`, `label` (the historical label snapshot), `description` (nullable historical description snapshot), `quantity` (decimal string), `unit`, `unit_price` (decimal string or null), and `amount` (decimal string). Only an `ELECTRICITY` item includes `electricity_tiers`, ordered by `tier_no`; each tier exposes `tier_no`, `lower_kwh`, nullable `upper_kwh` (null means open-ended), `quantity`, `unit_price` and `amount` (decimal strings). The server-returned amounts and tier rows are authoritative; clients must not recalculate or rebuild lines from current catalog/prices. Internal source references, provider details and unnecessary resident/vehicle identifiers are not returned in item rows.

For `snapshot_kind=LEGACY_AGGREGATE` or `NOT_FINALIZED`, the Admin detail response returns `itemization_available=false` and `invoice_items:[]`; aggregate fields/readings remain as available in the common Invoice DTO. It must not synthesize historical item lines or electricity tiers. For an authorized Resident, the endpoint retains the existing scoped financial summary DTO and does not add the Admin itemization fields in this task. Authorization, Owner/Resident scoping and foreign/missing `404` behavior are unchanged.

For all write endpoints, missing/malformed `Idempotency-Key` is `400 VALIDATION_ERROR`; current implementation validates only a 1–128 visible-ASCII-character header and does not implement durable replay or same-key payload conflict detection. Shared responses use the common `{error:{code,message,details},request_id}` envelope. Wrong role is `403 FORBIDDEN`, missing/invalid session is `401 UNAUTHENTICATED`, invalid body/query/path values are `400 VALIDATION_ERROR`, and scoped foreign/missing resources are `404 NOT_FOUND`. No invoice payment endpoint is implemented in this migration.

On `period_end`, the scheduler creates a reminder for Admin meter/service closeout only; it does not create a final invoice, send Zalo, or enable payment. On the next calendar day, scheduler ensures a draft exists. Retries and concurrent calls are idempotent; unique period identity is the final duplicate guard. Draft has `status=draft`, `finalized_at=null`, `due_date=null`. Amount fields/total may be provisional numeric values (including zero); zero does not establish completeness. API responses must identify a draft total as provisional. Draft remains draft until required meter/service data is valid.

For a final period, rent is a full period amount and is not prorated; electricity/water usage and usage-based charges are bounded by `effective_contract_end_date`. Fixed Services are charged for the full period, using the price version selected at period_start; a price change mid-period applies next period and does not prorate the current period. A normally expiring Contract uses `contracts.end_date`; an early-terminated Contract with `status=terminated` and a `termination_date` uses that termination date. Backend uses Property-scoped authoritative prices/rules, never client totals. Contract does not carry utility, service, or Parking price overrides.

`POST /invoices/{invoice_id}/finalize` is Admin-only. It resolves the authenticated Owner and loads the Invoice in that scope; requires draft; validates reliable beginning and ending/current readings for that same Contract and approved billable charges; calculates authoritative amounts and total; stores the final pricing snapshot; sets `finalized_at`; sets `due_date` to the calendar date of `finalized_at` in `Asia/Ho_Chi_Minh` plus 5 calendar days; sets `status=unpaid`; and commits these changes atomically. Electricity uses the effective multi-tier tariff selected at period_start and snapshots the applied tier quantities/rates/amounts. Water uses the single per-m³ rate selected at period_start. Fixed Service also uses its period-start price. The current V1.2 body/DTO does not express all V1.7 item, tier, tariff-version or billable-charge data. Business/database design is approved; exact V1.7 request/response fields and charge-input source remain implementation-contract work. Client cannot set tenant/Contract context, final status, `finalized_at`, `due_date`, `total_amount`, price authority or payment eligibility. Concurrent finalize requests are serialized by an Invoice row lock/serializable transaction; the second call returns `409 INVOICE_ALREADY_FINALIZED` (or `409 INVOICE_ALREADY_PAID` if Payment has transitioned it). Only after commit may the system attempt Zalo enqueue. Payment is enabled only after finalization.

Due date is always five calendar days after finalize in the business timezone. A due date itself is not overdue. `is_overdue = (status='unpaid' AND current_date in Asia/Ho_Chi_Minh > due_date)`. The response may include `is_overdue`; do not persist `overdue` in `invoices.status`.

Draft may be edited only through documented mutable fields. After finalize, material financial correction must use a controlled amendment behavior: validate and recalculate, increment `revision`, retain prior Zalo logs and send the new revision. Generic arbitrary PATCH is not an amendment workflow; if the dedicated controlled amendment operation is not implemented, reject such changes with `INVOICE_AMENDMENT_NOT_ALLOWED`. Paid invoices reject direct financial mutation and payment history is never overwritten. Correction/adjustment/refund workflow is outside V1.2.

The common Invoice DTO includes `invoice_id`, `contract_id`, `period_start`, `period_end`, `status`, `revision`, aggregate rent/utility/service amount buckets, meter readings, `total_amount`, `finalized_at`, `due_date`, derived `is_overdue`, `invoice_no`, `property_id`, timestamps, safe Contract/Room/Property summary, `snapshot_kind`, `amount_provisional`, and `payment_summary`; BigInt IDs are serialized as decimal strings. Draft fields remain provisional and finalization/due fields null. Admin detail item/tier response fields and legacy behavior are defined in the `GET /invoices/{invoice_id}` contract above. New finalized itemized invoices expose immutable category/label/quantity/unit/unit-price/amount snapshots and progressive Electricity tier rows; these are read from the finalized Invoice snapshot and never recomputed from current prices. Legacy aggregate and non-finalized details return an empty item list with `itemization_available=false`. The authorized Resident response remains unchanged and scoped as documented above.

Only `status=unpaid AND finalized_at IS NOT NULL` is sendable/payable. Zalo rejects draft and paid invoice as a new invoice send. Each send stores `invoice_revision` in a new log; previous logs are append-only. Payment-session and attempt commands reject draft, paid, or unfinalized invoices and recheck state in their authoritative transaction/read path. Callback verifies the provider, is idempotent/transactional, and rechecks invoice/payment state before applying `unpaid → paid`.

The billing anchor, monthly clamp/no-drift, final-period treatment, due-date formula and derived overdue remain resolved. Billing V1.7 business decisions now also lock: one Property tariff version per utility selected at `period_start`; progressive multi-tier electricity per kWh; single-rate water per m³; beginning readings scoped to one Contract (Contract initial for its first Invoice, nearest earlier finalized Invoice of that Contract for later periods, never across Contract/Room history); Fixed Service applies to all eligible Rooms in the Property and uses the period-start price; Flexible price is selected server-side by `occurred_at`; Parking recurring charges require an active paid entitlement and valid Property price at `period_start`, with mid-period starts charged from the next period and no proration; deterministic decimal-safe half-up rounding; append-only price history; and authoritative V1.7 Invoice Items with aggregates as compatibility snapshots. The Admin Invoice detail item/tier DTO and legacy response behavior are defined above. Still open are operational electricity tariff import/reconciliation, Flexible cancellation/refund details, exact API inputs/DTOs outside that Admin detail response, and Zalo operations. Until authoritative sources/readings/charges are available for a specific draft, finalization must remain blocked with `INVOICE_DATA_INCOMPLETE` or a documented configuration error. Draft generation/reminder may continue with explicitly provisional totals.

Zalo request does not accept a recipient ID/phone. Backend selects and validates the contract-linked recipient. Recipient policy (representative only versus all eligible residents), OA account/template, retry policy, and external provider protocol remain deployment decisions. The send API returns `queued` with `send_log_id` and `invoice_revision`; background delivery updates the log to `sent` or `failed`.

**Invoice + Zalo API status:** Existing lifecycle, tenant scope, final-period and request allowlists remain documented. The team checkout and shared Neon remain at Database V1.15; V1.16 is an isolated candidate only. The Invoice finalize/itemized workflow, period-end draft scheduler and Admin period-workspace read contract use Billing tables retained from V1.8. Billing service-data sources still require operational readiness where source data is absent; production Zalo delivery and real payment-provider integration remain separate gaps. The workspace is read-only and does not change financial rules.

### 5.9 Payments (MoMo and ZaloPay)

#### Demo payment for presentation (non-production only)

| Method and path | Role | Behavior |
|---|---|---|
| `GET /invoices/{invoice_id}/demo-payments` | Resident | List only the authenticated Resident's demo attempts for an eligible own Invoice |
| `POST /invoices/{invoice_id}/demo-payments` | Resident | Exact body `{ "outcome": "success" | "failed" }`; server uses the finalized Invoice total and records provider=`demo` in a distinct attempt. `success` atomically changes unpaid→paid and notifies the Owner Admin; `failed` records a demo insufficient-funds reason and leaves the Invoice unpaid. |
| `POST /me/feedback` | Resident | Exact body `{ "category": string, "content": string }`; associates a Complaint with the current active occupancy, appends its created history, and notifies the Owner Admin. |

These routes are enabled only outside production. The displayed QR is a non-scannable visual mock. No bank/wallet request, provider callback, external money transfer, or real-provider transaction is created. V1.12 changes only the `payment_transactions.provider` check to admit `demo`; the existing MoMo/ZaloPay provider path remains unchanged. `/notifications` remains account-scoped and supports type/read filters for the Admin bell (`invoice_demo_payment`, `resident_feedback`, `parking_request`, `service_booking_requested`, `billing_period_closeout`). The Admin bell counts unread items across all notification types, paginates the list, and links actionable items to their management screens. Resident complaint/room-request and Parking-request notifications are created for active Owner Admin accounts in the same transaction as each request; a new booking request for a flexible service follows the same rule.

| Method and path | Role | Behavior |
|---|---|---|
| `POST /invoices/{invoice_id}/payment-sessions` | Resident | Start checkout only for an own finalized `unpaid` invoice; backend rechecks status/finalized timestamp and creates UUID session and first transaction |
| `POST /payment-sessions/{payment_session_id}/attempts` | Resident | Retry in the same session only after a failed attempt and while fewer than two consecutive failures exist |
| `GET /payment-sessions/{payment_session_id}` | Resident | Read session-derived state only if at least one transaction belongs to the Resident's invoice |
| `GET /invoices/{invoice_id}/payments` | Admin, authorized Resident | List append-only attempts for a scoped invoice |
| `POST /payments/momo/callback` | Provider callback | Verify MoMo authenticity, process idempotently, update transaction/invoice under lock |
| `POST /payments/zalopay/callback` | Provider callback | Verify ZaloPay authenticity, process idempotently, update transaction/invoice under lock |

The API has no payment-session table. `payment_session_id` groups distinct `payment_transactions` attempts. A new session UUID is created only when a Resident intentionally starts checkout again. Draft, paid, or unfinalized invoices are not payable and return `409 PAYMENT_NOT_ALLOWED_FOR_INVOICE_STATE` (or the documented equivalent). State is rechecked inside the authoritative transaction/read path. Callback endpoints do not use a user session; they require provider signature/authenticity checks and allowlisted provider source controls where available; they also recheck invoice/payment state before applying `unpaid → paid`.

Create-session response:

```json
{
  "data": {
    "payment_session_id": "10000000-0000-4000-8000-000000000099",
    "session_status": "active",
    "failed_attempts": 0,
    "can_start_new_session": false,
    "invoice_status": "unpaid",
    "attempt": { "payment_transaction_id": "6006", "provider": "momo", "status": "pending", "amount": 4040000, "checkout_url": "https://provider.example/checkout/..." }
  }
}
```

Each retry inserts another Transaction with the same session ID. After the second consecutive failure, return `session_status=terminated`, `failed_attempts=2`, `can_start_new_session=true`, `invoice_status=unpaid`, and `next_action=return_to_home`. This ends that checkout only; it does not limit the lifetime attempts or disable the invoice. A pending attempt blocks another attempt in that session until resolved/expired according to the provider protocol.

Callbacks verify signature, merchant/order references, provider IDs, invoice, and exact outstanding amount. A payment is successful only for the full outstanding amount; no partial payment. Lock the invoice/transaction, insert/update exactly once using provider event/transaction IDs, and only then set Invoice paid. Amount mismatch or failed/pending status never pays an Invoice. Duplicate callbacks return the recorded outcome without creating another success. The unique success-per-invoice index is a final safeguard. Provider timeouts/reconciliation and exact MoMo/ZaloPay signature protocols must be set from official provider specifications during integration.

### 5.10 Property Facility, Paid Service, and pricing

**Current business meaning:** Facility (for example Pool/Gym) describes a shared Property asset and is not automatically paid or subscription-based. A separately configured zero-priced Flexible `BOOKING` service provides a free registerable amenity schedule; approval reserves the slot without creating a charge or Invoice Item. Positive-priced services may be Fixed (Property configured, charged per eligible Room, price selected at `period_start` and held for the period; in V1 it applies to all eligible Rooms in that Property) or Flexible (a valid service-generated billable charge; server selects the effective Property price at `occurred_at`; each charge belongs to an Invoice period when its `occurred_at` Vietnam calendar date in `Asia/Ho_Chi_Minh` is from `period_start` through and including `period_end`; no automatic refund/rewrite after billed/finalized). Booking offerings for shared amenities and incidental services (e.g. haircut/gardening) are separately configured per Property, display their schedule/availability, and wait for Owner approval; a positive-price booking creates its charge only after approval. Electricity uses the effective Property tariff selected at `period_start` and progressive kWh tiers; Water uses one effective Property price per m³. Water provider/locality/source details are informational audit metadata only, with no live provider integration. A tariff change during a period applies next period, with no split, day allocation, or tariff-boundary reading. Pricing authority is Property-scoped; Contract cannot override utility, service, or Parking prices. Free Parking entitlement creates no Invoice Item; legacy unclassified assignment is neither assumed paid nor free. Recurring Parking charge requires active paid entitlement, a valid Property price item/version, and eligibility at `period_start`; if it activates later, charge begins next period. No mid-period proration. V1.7 line/tier monetary amounts use decimal-safe half-up rounding and finalized total is the sum of rounded Invoice Item amounts.

Every effective price change appends a Price Version with effective date and source/reference where applicable. Historical prices remain append-only; finalized Invoice renders its own immutable item snapshot and never looks up the current catalog price/name. The existing Admin-only Flexible charge-creation endpoint remains an internal/operational capability for authorized service fulfillment and transition handling. For configured `BOOKING` services, Residents request an open slot; Admin approval creates a billable charge using the saved quote only when the price is positive. At price 0, approval reserves the free amenity slot without creating a charge. Other service-use and package-enrollment workflows remain outside this contract.

#### Admin Fixed/Flexible Service management contract

The following endpoints are mounted under `/api/v1` and are Admin-only. Owner is always derived from the authenticated session. Foreign or missing Owner/Property/item context uses the normal hidden `404` response. IDs are decimal strings; money is an integer VND string. Flexible `BOOKING` price 0 means a free registerable amenity; a positive price means an incidental paid service. Responses use `{data: ...}` and list responses include `{meta:{page,page_size,total_items,total_pages}}`.

| Method and path | Behavior |
|---|---|
| `GET /properties/{property_id}/pricing-items?kind=FIXED_SERVICE\|FLEXIBLE_SERVICE` | List this Property's selected service catalog and immutable published price history. Flexible services may be free registerable amenities (price 0) or positive-priced incidental services. Omit `kind` to list both kinds. |
| `POST /properties/{property_id}/pricing-items` | Create an active item. Exact body: `kind`, `code`, `name`, `unit`, optional `description`. `code` is unique within the Property. Owner is not accepted from the client. |
| `POST /properties/{property_id}/pricing-items` (V1.9 Flexible) | For `kind=FLEXIBLE_SERVICE`, exact body is `kind`, `code`, `name`, optional `description`, and `service_configuration`; the server sets `unit` to `lượt` for booking or `gói` for a subscription package. `service_configuration` contains `service_mode`, `available_weekdays` (ISO 1=Monday through 7=Sunday), `opens_at`, `closes_at`, and exactly one mode payload: `booking:{slot_duration_minutes,capacity_per_slot}` or `subscription:{duration_count,duration_unit}` where duration unit is `MONTH` or `YEAR`. Opening/closing use local `HH:mm`, must be same-day and ordered; at least one weekday is required. Booking duration must be a positive integer and fit the open window; capacity and package duration must be positive integers. The item and configuration are created atomically. Fixed Service request fields remain as previously defined. |
| `PUT /properties/{property_id}/pricing-items/{pricing_item_id}/service-configuration?kind=FLEXIBLE_SERVICE` (V1.9) | Owner-scoped Admin upsert of the same exact `service_configuration` object for an existing Flexible item. It updates the current weekly schedule and same-mode parameters. Once a mode is saved, changing between `BOOKING` and `SUBSCRIPTION` is rejected; create a new item to change product type. A V1.8 item with no configuration may be configured only when it has no published price versions; otherwise create a new item so old unit/price history is not relabeled. |
| `GET /properties/{property_id}/pricing-items?kind=FLEXIBLE_SERVICE` (V1.9) | Includes `service_configuration`, which is null for an unconfigured legacy V1.8 item; configured items include mode, selected weekdays, opening window and the applicable booking/package values. No availability instances or bookings are returned. |
| `POST /properties/{property_id}/pricing-items/{pricing_item_id}/retire?kind=FIXED_SERVICE\|FLEXIBLE_SERVICE` | Soft-retire an active item. Catalog/version/invoice history remains; no hard delete or reactivation endpoint is provided. |
| `GET /properties/{property_id}/pricing-items/{pricing_item_id}/price-versions` | Read the item's published price history in effective-date/version order. |
| `POST /properties/{property_id}/pricing-items/{pricing_item_id}/price-versions?kind=FIXED_SERVICE\|FLEXIBLE_SERVICE` | Atomically publish an immutable version. Exact body: `effective_from` (`YYYY-MM-DD`), `unit_price` (non-negative VND integer string), optional `source_name`, `source_reference`, `reason`. Duplicate effective date is `409`; the item must be active and its unit comes from the catalog. No draft lifecycle exists. |
| `GET /properties/{property_id}/flexible-service-charges?page=&page_size=` | List Owner/Property-scoped events with safe service, Room, Contract and Resident labels, amount snapshots and `READY/INVOICED/VOID` status. |
| `POST /properties/{property_id}/flexible-service-charges` | Record a Flexible event. Requires `Idempotency-Key`. Exact body: `room_id`, `contract_id`, optional nullable `resident_id`, `pricing_item_id`, positive `quantity` (up to 3 decimals), and timezone-qualified `occurred_at`. The server validates the Owner/Property/Room/Contract/Resident/item relation, Contract date range, and active Flexible item; resolves the latest published Property price on the `Asia/Ho_Chi_Minh` calendar date; and stores server-derived unit, unit-price/amount snapshots and a payload fingerprint. Same key and payload replays the original charge; same key with a different payload is `409`. New events start `READY`. |

#### Property shared Facility catalog

Facilities describe shared Property assets and have no pricing, billing, subscription or booking behavior. These Admin-only routes derive Owner from the authenticated session; a foreign or missing Property returns the normal hidden `404`. They reuse the existing `property_facilities` table and do not create/change database schema.

| Method and path | Behavior |
|---|---|
| `GET /properties/{property_id}/facilities` | Return active shared Facilities ordered by name. Response: `{ "data": { "property": { "property_id": string, "name": string }, "items": [{ "facility_id": string, "name": string, "description": string|null, "location": string|null, "active": boolean, "created_at": ISO-8601 }] } }`. No query parameters are accepted. |
| `POST /properties/{property_id}/facilities` | Create an active shared Facility. Exact body: `name` (required, max 150), optional `description` (max 10,000) and optional `location` (max 200). Duplicate name within the Property returns `409`; Owner/Property scope is server-derived. Success returns the created Facility DTO above with `201`. |

Cloudy may create a free shared Facility only after the Owner reviews and confirms Property, name and location. That action never creates a Pricing Item or financial record. For a paid Fixed Service, Cloudy separately uses the Pricing Item and Price Version routes above after explicit confirmation. Neither chat flow creates Flexible bookings or service charges.

#### Resident Flexible Service catalog read

| Method and path | Behavior |
|---|---|
| `GET /me/services` | Resident-only read of active `FLEXIBLE_SERVICE` catalog items for active Properties linked to the authenticated Resident's active Occupancies. The client cannot choose Owner, Resident, or Property scope. Returns each Property and its active services, description, unit, and at most one current price effective on the `Asia/Ho_Chi_Minh` calendar date; `current_price` is `null` until a price is effective. Retired items, Fixed Services, Parking, and price history are omitted. This endpoint does not request/use a service, reserve a time, create a charge, or initiate payment. |
| `GET /me/services/{service_id}/availability?date=YYYY-MM-DD` | Resident-only available slots for one active `BOOKING` service and date, scoped to the authenticated Resident's current active Occupancy and Contract. Returns the effective quoted price and only slots with remaining capacity, in `Asia/Ho_Chi_Minh`. `SUBSCRIPTION` packages do not use this endpoint. |
| `POST /me/services/{service_id}/bookings` | Exact body: `service_date`, `start_time`. A transaction revalidates service, active Occupancy/Contract, schedule, capacity and published price, then saves a `PENDING` request with a quote/context snapshot. It holds one place, not a charge; repeated requests for the same active slot return the original request. |
| `GET /me/service-bookings` | List the authenticated Resident's recent requests, decisions, quote and any linked charge/Invoice state. No client-selected Owner or Resident scope. |
| `POST /me/service-bookings/{booking_id}/cancel` | Cancel only the Resident's own `PENDING` request; this releases its place and creates no charge. An approved request cannot be cancelled through this endpoint. |
| `GET /properties/{property_id}/service-bookings?status=PENDING` | Admin-only list of pending requests in the authenticated Owner's Property, including Resident, Room, Contract, requested slot, quote and whether the request can still be approved. |
| `POST /properties/{property_id}/service-bookings/{booking_id}/decision` | Exact body: `decision` (`APPROVE` or `REJECT`) and optional `reason` (up to 1000 chars). Admin approval is allowed only before slot start and atomically rechecks schedule/capacity/Resident/Contract/quote. A positive quoted price creates one `READY` Flexible Service charge for normal Contract Billing; a zero-priced booking is approved and reserves the slot without creating a charge or Invoice Item. Rejection releases the place and creates no charge. Neither decision creates/finalizes/pays an Invoice. |

`GET /me/services` also returns `facilities` per currently occupied Property: active shared Property Facilities with `facility_id`, `name`, `description`, and `location`. Facilities describe shared assets and are display-only; they do not themselves expose availability or booking operations. A separately configured Flexible `BOOKING` service supplies schedule/capacity and booking behavior. With an effective zero price it represents a free registerable amenity (for example a pool or sports court); with a positive Owner-configured price it represents an incidental service (for example haircut or gardening). Both require Owner approval; only the positive-price booking creates a billable charge after approval. The catalog never auto-adds offerings to a Property.

Fixed price resolution uses the published Property version effective at Invoice `period_start`, for every eligible Room, for the full period without proration. Flexible charges are included only when their `occurred_at` Vietnam calendar date is within the Invoice's inclusive `period_start`–`period_end` range and matches its Contract/Room. Billing readiness and finalization use the existing same resolvers; a successful finalization consumes the eligible charge and creates the Invoice Item atomically. A failed finalization leaves the charge `READY`. The API has no edit/void operation for a billed charge and no note field because Database V1.8 has no note column. Future corrections must preserve financial history.

**Database V1.11 historical status:** V1.11 adds the Resident booking table to V1.10. The local backend target has since been promoted to V1.12; the current physical status and backup evidence are in `DATABASE_CHANGELOG.md`. Resident booking does not implement package enrollment or attendance-capacity workflows. Existing Billing, Parking and tariff tables remain in place; business rules remain governed by the Requirement.

**SUPERSEDED legacy V1.2 API contract:** The former Pool/Gym catalog/subscription/cycle endpoint table, 30-day cycle lifecycle, cancellation-at-cycle-end behavior, and “other is information only” rule are historical and not current product/API behavior. Database V1.7 retains legacy Amenity/subscription structures for data compatibility; their presence does not restore the superseded business rule.

### 5.11 Parking and vehicles

| Method and path | Role | Behavior |
|---|---|---|
| `GET /me/parking` | Resident | Current eligible contracts, active parking areas in their Properties, physically free configured slots compatible with the vehicle grouped by area (even when Contract capacity is full), own vehicles with `in_use`/`has_history`, requests and assignments. The Resident UI selects an area first and filters the slot list to that area; Room remains backend Contract context. Contract capacity is checked when submitting the request, not when listing physical availability. |
| `POST /me/parking-vehicles` | Resident | Create a vehicle for the authenticated Resident; body `{vehicle_type,plate_number?}` |
| `DELETE /me/parking-vehicles/{vehicle_id}` | Resident | Delete an own vehicle only if no Parking request or assignment history references it; return `409` when history must be preserved, and hidden `404` for a foreign/missing vehicle |
| `POST /me/parking-requests` | Resident | Submit `{parking_slot_id,vehicle_id,contract_id,started_at}` for an eligible own contract/vehicle; Resident UI sets `started_at` to the current Vietnam business date and does not ask for date entry; returns readable `409` with used/maximum capacity when the Contract is full; otherwise keeps a slot for at most 24 hours; creates no assignment or charge |
| `POST /me/parking-requests/{request_id}/cancel` | Resident | Cancel own pending request; release its held slot; preserve request history |
| `GET /properties/{property_id}/parking` | Admin | Property summary, areas/slots/configuration, vehicles, assignments, entitlements and pricing |
| `GET /properties/{property_id}/parking-areas` | Admin | List own Property areas and slot configuration |
| `POST /properties/{property_id}/parking-areas` | Admin | Create an area in own Property |
| `PATCH /parking-areas/{parking_area_id}` | Admin | Allowlisted `name`, `location`, `active`; cannot deactivate an area with an active assignment or pending request |
| `GET /parking-areas/{parking_area_id}/slots` | Admin | List physical slots, active assignments and configured offer |
| `POST /parking-areas/{parking_area_id}/slots` | Admin | Create an unconfigured physical slot; it is not bookable until configured |
| `PATCH /parking-slots/{parking_slot_id}` | Admin | `{status: "active"|"inactive"}`; cannot deactivate a slot with an active assignment or pending request |
| `PATCH /parking-slots/{parking_slot_id}/configuration` | Admin | Configure accepted vehicle category and FREE/PAID entitlement; a paid slot must reference an active Property `PARKING` price |
| `GET /properties/{property_id}/parking-residents` | Admin | Residents with active occupancy and Room/Contract context |
| `GET /properties/{property_id}/vehicles` / `POST /properties/{property_id}/vehicles` | Admin | List Property-context vehicles / create for an in-scope Resident |
| `GET /properties/{property_id}/parking-requests` | Admin | Owner/Property-scoped queue and request history; expired holds are released |
| `POST /properties/{property_id}/parking-requests/{request_id}/approve` | Admin | Revalidate request; create one active assignment from its saved slot offer |
| `POST /properties/{property_id}/parking-requests/{request_id}/reject` | Admin | Reject a pending request with required `{note}` reason; release slot/capacity |
| `GET /properties/{property_id}/parking-assignments` | Admin | Current and historical Owner/Property-scoped assignments |
| `POST /properties/{property_id}/parking-assignments` | Admin | Existing direct Admin assignment tool; validates complete Owner/Property relation chain and capacity |
| `PATCH /properties/{property_id}/parking-assignments/{assignment_id}/entitlement` | Admin | Change billability only before any finalized Invoice item references the assignment |
| `POST /parking-assignments/{assignment_id}/end` | Admin | End an active assignment with `{ended_at}`; preserve history |
| `GET /properties/{property_id}/parking-pricing` | Admin | List Property Pricing Items of kind `PARKING` and versions |

All Admin routes derive Owner identity from the authenticated session. Resident routes derive Resident and Owner from that session; supplied slot/vehicle/contract IDs are selections only and must be confirmed against the Resident's active occupancy and Property. Mutations require the authenticated role and normal V1 CSRF protection. Foreign Owner/Resident resources follow hidden `404` behavior; availability, capacity and status conflicts return a readable `409`.

An Admin configures each bookable slot with an accepted vehicle category (`MOTORCYCLE`, `CAR`, `BICYCLE`, `OTHER`, or null for any type) and an explicit FREE or PAID entitlement. Legacy slots without this configuration remain unavailable to Resident requests. `GET /me/parking` lists configured physical vacancies independently of remaining Contract capacity; `POST /me/parking-requests` checks capacity and returns a readable `409` with used/maximum counts if full. A resident can have only one pending request; a pending request reserves its slot and one unit of the Contract capacity for 24 hours. Expiration, resident cancellation, or Admin rejection releases the reservation and retains history. Approval atomically revalidates active Contract/occupancy, requested start date, vehicle ownership/type, slot, capacity and saved entitlement, then creates the assignment. Approval does not take payment.

Parking pricing mutations reuse the §5.10 `pricing-items` and `price-versions` endpoints with `kind=PARKING`; they do not create a separate price authority. Assignment creation validates same Owner and Property across slot/Room/Contract/Resident/Vehicle, current occupancy, no overlapping assignment, and active assignments plus pending holds below `contracts.resident_capacity`. Several vehicles belonging to one Resident do not increase Room capacity. On capacity reduction, return `409 PARKING_CAPACITY_EXCEEDED` until an authorized user resolves excess assignments; never silently delete an assignment.

Parking is the authority for entitlement type and what is assigned/active; Billing/Pricing is the authority for amount. Entitlements include free slot (no Invoice Item), paid slot, motorcycle/apartment vehicle card and future types; not every assignment is billable. A legacy unclassified assignment is not automatically classified as paid or free. A paid entitlement references the single Property pricing authority; do not duplicate the same price in Parking and Amenities/Billing. Charge basis may be per slot, per vehicle/card, or per billing period. Recurring charge requires an active paid entitlement, valid Property price item/version, and eligibility at `period_start`; if it starts after `period_start`, the first recurring charge is next period. No mid-period proration. Any future one-time activation charge must be a separate explicit item. The Admin APIs above create and preserve operational source records; Billing readiness/finalization remains the authority for period eligibility and Invoice snapshots.

### 5.12 Complaints

| Method and path | Role | Behavior |
|---|---|---|
| `POST /complaints` | Resident | Create a Complaint tied to the authenticated Resident and an eligible Property/optional Room |
| `GET /me/complaints` | Resident | List only complaints submitted by this Resident |
| `GET /complaints` | Admin | List complaints in own Owner scope; filter `property_id,room_id,status,priority,category,date_from,date_to` |
| `GET /complaints/{complaint_id}` | Admin, submitting Resident | Scoped detail and chronological history |
| `PATCH /complaints/{complaint_id}/status` | Admin | Valid status transition with audit history and resolution timestamp |
| `POST /complaints/{complaint_id}/notes` | Admin, submitting Resident | Append note/history event; no overwrite of prior history |
| `POST /complaints/{complaint_id}/reopen` | Admin, submitting Resident | Reopen a resolved/rejected case with reason; status becomes `in_progress` |
| `POST /me/feedback` | Resident | Save feedback as a Complaint against the authenticated Resident's active occupancy; append creation history and notify the Owner Admin |

Statuses are `pending`, `in_progress`, `resolved`, `rejected`; priorities are `low`, `normal`, `high`, `urgent`. Admin directly handles cases. A Resident may create category `Báo cáo nhà trọ`; it is the same Complaint entity. Status changes require a reason where applicable and add `complaint_history`; actor must be the same Owner or submitting Resident. There is no staff, assignment, employee queue, or separate report endpoint. SLA targets remain unspecified and are not enforced by this API.

### 5.13 Contact requests

| Method and path | Role | Behavior |
|---|---|---|
| `GET /contact-requests` | Admin | Own Property requests; filter by `property_id,status,created_at`; paginated |
| `GET /contact-requests/{contact_request_id}` | Admin | Own Property only |
| `PATCH /contact-requests/{contact_request_id}` | Admin | Update status `new/contacted/closed`; requester data is immutable through this endpoint |

Public creation is `POST /public/contact-requests` in §5.3. It is contact-only, never a viewing appointment. Backend derives Owner from Property and rejects a Room that is not in that Property.

### 5.14 Notifications and preferences

| Method and path | Role | Behavior |
|---|---|---|
| `POST /notifications/room-reminders` | Admin | Send one confirmed in-app reminder to active Resident accounts with a current Occupancy in one active Owner-scoped Room; backend derives Owner and recipients; no email/SMS/push |
| `GET /notifications` | Admin, Resident | In-app notifications for current account only; filter `unread,type`; paginated |
| `PATCH /notifications/{notification_id}/read` | Admin, Resident | Mark own notification read; foreign ID returns 404 |
| `POST /notifications/read-all` | Admin, Resident | Mark all current-account notifications read; idempotent |
| `GET /notification-preferences` | Admin, Resident | Current account's stored preferences |
| `PATCH /notification-preferences` | Admin, Resident | Update allowlisted in-app preferences; does not send a notification |

No email or push delivery endpoint exists in V1.

Room reminder request body is exactly `{property_id,room_id,message,confirmed:true}`. Both IDs are positive integer strings; message is trimmed and limited to 500 characters. The backend requires Admin and CSRF validation, verifies the active Property/Room under the authenticated Owner, and derives all recipients from current RoomResident/Resident/Account records; caller-supplied account, resident, or owner targets are rejected. Success returns the Room/property labels, recipient count and `delivery: "in_app"`, without exposing Resident identities. A Room outside the Owner scope returns 404; a room with no active Resident accounts returns 409. The Cloudy UI must show the exact target and editable content and wait for explicit confirmation before calling this endpoint. Repeated confirmed requests are separate reminders.

### 5.15 Dashboard and reports

| Method and path | Role | Behavior |
|---|---|---|
| `GET /dashboard/summary` | Admin | Read-only Owner-scoped operating report: active Properties/Rooms and occupancy, Resident residence-registration statuses, active Contracts nearing expiry, unpaid/overdue finalized Invoices, utility-use rankings, active vehicle counts, and unresolved Complaint counts/categories |
| `GET /properties/{property_id}/dashboard` | Admin | Same report restricted to one Property owned by the authenticated Owner; a foreign/missing Property returns the generic 404 |

Both endpoints return `{data:{generated_at,scope,properties,summary,financial,requests,highest_electricity_rooms,highest_water_rooms,most_vehicles_rooms,rooms}}`. `summary` contains counts and occupancy percentage; IDs and VND amounts are decimal strings. Room rows contain Property/Room business labels, occupancy count/capacity, incomplete-residence count, active assigned vehicle count/types, unresolved request count and the latest Invoice's meter usage/status. The utility ranking uses the most recent finalized Invoice per Contract from the last 180 days; usage is computed from that immutable Invoice's ending minus opening reading and is omitted when either reading is unavailable. This is not a live meter estimate. `unpaid_amount` is the sum of finalized unpaid Invoice totals, not a payment-provider settlement report. `financial` reports the last 12 calendar Invoice period-start months, including `rent_billed` (finalized Invoice rent component), `rent_on_paid_invoices` (rent component of Invoices currently marked paid), current-month equivalents, and outstanding rent component from finalized unpaid Invoices. All amounts are decimal strings. This grouping is by Invoice period, not cash receipt date; it is not an accounting cash-flow or profit report. No operating-expense ledger exists in the current schema, so net profit must not be inferred from rent. Current occupancy includes a Room with an active in-date Contract or an active RoomResident record. Expiring Contracts end within 30 Vietnam business dates. Open Complaints are `pending` or `in_progress`; closed counts are `resolved` or `rejected`. The response never includes Resident names, contact/identity details, vehicle plates, complaint text, Invoice IDs, or provider details. All queries derive Owner scope from the authenticated session; Property filters are applied to each metric. These aggregates are read-only and are not persisted as source of truth. No separate `room_reports` table or write API exists.

## 6. Transaction-sensitive operations

All listed operations run in a database transaction. External provider calls occur after commit through a worker or equivalent reliable dispatch; never hold a row lock while waiting for a network response.

| Operation | Rows to lock / checks | Atomic changes and side effects |
|---|---|---|
| Create draft Contract | Owner-scoped Room/Property and representative Resident; Room occupancy/parking counts | Serializable transaction; derive Owner/Property from session and Room; validate Room/Resident scope and capacity; create `status=draft, revision=0`; no ContractChangeHistory. Current create path does not issue an explicit `FOR UPDATE` query. |
| Draft PATCH | Contract and Room; Resident/capacity/date context as affected | Serializable transaction; explicitly lock Room then Contract using `FOR UPDATE`, reload, validate the draft allowlist, apply sparse changed fields; keep revision 0 and create no history. |
| Activate Contract | Draft Contract, Room, representative Resident, active Contracts for Room, occupancy/parking counts | Serializable transaction; explicitly lock Room then Contract; reload and validate state, Room/Property availability, dates/overlap, representative and capacity; set active/revision 1 and insert first `activation` baseline history row atomically. |
| Active material PATCH | Active Contract, Room, representative Resident, active occupancy/parking counts when capacity changes | Serializable transaction; explicitly lock Room then Contract; require current `If-Match`; validate allowlist, reason and affected rules; update changed fields/revision and append changed-fields-only `material_update` history atomically. Stale revision returns 409 without writes. |
| Renew Contract | Official predecessor Contract, Room, active Contracts for Room, representative Resident, occupancy/parking counts | Serializable transaction; explicitly lock Room then predecessor Contract; require predecessor `If-Match`; verify allowed status, direct successor, dates/overlap, Owner/same Room, and capacity; create successor draft at revision 0 with server-derived `previous_contract_id`; do not change predecessor or write successor history. |
| Transfer occupancy | Resident; source/destination Rooms and Contracts in stable ID order; active occupancy rows | End source occupancy and insert destination occupancy together; check target Owner/Contract/capacity; no partial move. |
| Change contract capacity | Contract and Room; active occupancy and parking assignments | Reject decrease below either active count; preserve existing data; no automatic removals. |
| Generate/create Invoice draft | Contract; invoice periods for that Contract | Resolve contract-anchored period (including clamp/final period), enforce unique period, and create/return one draft atomically. Scheduler retries and concurrent commands are idempotent. |
| Finalize Invoice | Invoice; Contract; required readings/service inputs; recipient context | Lock scoped draft, validate completeness, recalculate authoritative amount/total, set finalized timestamp/due date/status together, commit; only then enqueue Zalo. Concurrent calls cannot double-finalize. |
| Payment callback | Invoice; matching Transaction; provider event/transaction identity | Verify provider authenticity and full outstanding amount; deduplicate; recheck payable state; append/update attempt and transition unpaid to paid once. |
| Assign parking slot | Slot; Contract/Room; active slot/vehicle/room assignments; Resident/Vehicle | Verify one available slot, same tenant/property and contract eligibility, active count under capacity; insert one assignment. |
| Terminate Contract | Active Contract/Room; unpaid invoices; future/active occupancies; parking assignments; subscriptions/cycles | Serializable transaction; explicitly lock Room then Contract; require current `If-Match`; reject unpaid invoices/future-start active occupancy; validate termination date, readings, reason, and settlement; increment revision and append `status_transition`; close eligible dependent rows while preserving them. |
| Allocate Contract document version | Owner-scoped Contract; existing versions for `(contract_id,document_type)` | Stage object before transaction; serializable transaction and explicit Contract `FOR UPDATE`; derive `max(version)+1`, insert safe metadata/checksum; on DB failure attempt staged-object cleanup. Production storage/multipart adapter is pending. |
| Send Zalo invoice | Invoice revision; recipient relation; send log | Validate recipient; create a queued log for that revision, commit, then dispatch; update only that log with outcome. |

The former Amenity cycle operations and 30-day/720-hour rule are **SUPERSEDED** as current business/API behavior; do not use them as the default for Facility or Flexible Paid Service. Invoice cadence remains monthly from the original `contracts.start_date` anchor and must not use a fixed 30-day interval. Each utility selects one tariff version at period_start for the whole Invoice period; electricity uses tier detail and water one per-m³ price. Beginning readings use the Contract initial values for that Contract's first Invoice, then the nearest earlier finalized Invoice from the same Contract; there is no predecessor/Room inheritance. V1.7 design is approved; exact reading/item/tier-detail endpoint paths and DTO remain implementation-contract work.

## 7. Idempotency and retries

`Idempotency-Key` is required on these 33 currently specified client POST commands that create durable records, trigger delivery/export, or transition business state:

1. `POST /public/contact-requests`
2. `POST /properties`; `POST /properties/{property_id}/rooms`
3. `POST /residents`; `POST /residents/{resident_id}/account-invitations`; `POST /accounts/{account_id}/password-reset`
4. `POST /rooms/{room_id}/residents`; `POST /occupancies/{occupancy_id}/end`; `POST /residents/{resident_id}/transfer`
5. `POST /properties/{property_id}/ct01/exports`
6. `POST /contracts`; `POST /contracts/{contract_id}/activate`; `/renew`; `/terminate`
   `POST /contracts/{contract_id}/documents`; `POST /account-invitations/{invitation_id}/revoke`
7. `POST /invoices`; `POST /contracts/{contract_id}/invoices/generate`; `POST /invoices/{invoice_id}/finalize`; `POST /invoices/{invoice_id}/send-zalo`
8. `POST /invoices/{invoice_id}/payment-sessions`; `POST /payment-sessions/{payment_session_id}/attempts`
9. `POST /properties/{property_id}/parking-areas`; `POST /parking-areas/{parking_area_id}/slots`; `POST /me/vehicles`; `POST /residents/{resident_id}/vehicles`
10. `POST /parking-slots/{slot_id}/assign`; `POST /me/parking-assignments`; `POST /parking-assignments/{assignment_id}/end`
11. `POST /complaints`; `POST /complaints/{complaint_id}/notes`; `POST /complaints/{complaint_id}/reopen`
12. `POST /properties/{property_id}/flexible-service-charges`

Key scope is `(account or public caller, method, canonical route)`; replay with the same payload returns the original result, and replay with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`. Provider callbacks instead use provider event/transaction identities. Login, logout, CSRF, reset-token consumption, and `POST /notifications/read-all` use their own authentication/token or naturally idempotent semantics and do not require this header.

Provider callbacks use `(provider,provider_event_id)` or provider transaction identity for deduplication; duplicate verified callbacks return the already recorded outcome. Database V1.5 adds a Contract-specific idempotency table; it does not provide a generic replay store for the other listed domains. Those domains must be implemented independently without adding domain fields to this API contract. Natural database uniqueness remains the final guard for Contract number, invoice period, provider events, and one successful payment per Invoice.

Payment retries are grouped by `payment_session_id`; every attempt is a separate Transaction. At most two consecutive failures are allowed in one session. A fresh session is allowed for the same still-unpaid Invoice. This is not a two-failure lifetime cap.

Runtime implementation status: Contract create, activate, renew and terminate use durable Owner/Account-scoped replay as detailed in §5.7. Contract document upload and all other listed commands still have their documented header validation/target semantics but do not claim this runtime replay implementation. Full authenticated Admin/Resident Contract browser E2E remains a separate closure pass.

## 8. Derived and server-owned state

Clients may not set or override:

- `owner_id`, `role`, account/resident identity of the authenticated user, or authorization scope;
- `previous_contract_id` except as server-derived output of the renewal command; normal Contract create cannot set renewal lineage;
- effective Room occupancy/status/count and current Contract;
- Contract activation/expiry/termination state, overlap decisions, or capacity results;
- invoice lifecycle/finalization (`status`, `finalized_at`), `due_date`, `is_overdue`, total/payable amount, revision, owner/property/contract context, payment eligibility, or authoritative generated period/line calculations;
- payment success, provider callback fields, retry count/session termination, or checkout completion;
- Any Property price authority/version, client-supplied Invoice item/segment calculation, or finalized snapshot state;
- Parking availability/active count or whether an assignment fits capacity;
- Complaint actor/history timestamps, notification account ID, Zalo recipient, or send-log outcome.
- Contract document `owner_id`, `property_id`, `uploaded_by_account_id`, `version`, `checksum_sha256`, `storage_key`, or any storage-internal metadata.

Clients send inputs/intents such as room selection, meter readings, requested dates, vehicle selection, complaint text, and cancel/terminate intent. Backend derives identity/context and validates the state transition.

## 9. Core request/response examples

### 9.1 Create Resident (Admin)

```http
POST /api/v1/residents
Idempotency-Key: resident-create-2026-001
```

```json
{ "national_id": "079123456789", "full_name": "Nguyễn An", "phone": "0900000000", "email": "an@example.test", "birth_date": "1995-01-01", "gender": "unspecified" }
```

```json
{ "data": { "resident_id": "3001", "full_name": "Nguyễn An", "residence_status": "living", "residence_registration_status": "not_completed", "archived_at": null } }
```

If that CCCD is already used under this Owner: `409 RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER`. The same CCCD in another Owner does not cause this conflict.

### 9.2 Create and activate a Contract

```http
POST /api/v1/contracts
Idempotency-Key: contract-create-hd-2026-009
```

```json
{ "contract_no": "HD-2026-009", "room_id": "101", "representative_resident_id": "1001", "start_date": "2026-10-15", "end_date": "2027-10-14", "rent_amount": 3500000, "deposit_amount": 3500000, "resident_capacity": 3, "initial_electric_kwh": 1330, "initial_water_m3": 74 }
```

```json
{ "data": { "contract_id": "3002", "status": "draft", "revision": 0, "room_id": "101", "resident_capacity": 3 } }
```

Activation is a separate `POST /contracts/3002/activate`. It locks/reloads the draft and establishes `revision=1` with the first `activation` baseline history row in one transaction. Overlap returns `409 CONTRACT_DATE_OVERLAP`; foreign Room/Resident resolves as `404`. Activation does not use draft revision 0 as an `If-Match` token.

### 9.3 Generate and finalize an invoice

The request/response below records the existing V1.2 API shape only. It is incomplete for the approved Billing V1.7 Requirement: per-Contract beginning-reading source/provenance, electricity tier detail, tariff-version references, service-generated charge references, and Invoice item snapshots have no specified fields yet. Do not treat this example as the final V1.7 client contract.

```http
POST /api/v1/contracts/3001/invoices/generate
Idempotency-Key: invoice-3001-period-next
```

The server resolves the next eligible period from the Contract's original `start_date` anchor, applies month-end clamp without drift and truncates the final period at `effective_contract_end_date` as defined in §5.8. Create/generate ensures at most one Invoice for `(contract_id,period_start,period_end)` and is retry-safe at the unique-period boundary. Generate returns an existing Invoice in its current state rather than resetting it; otherwise it creates a draft. A new draft response includes `invoice_id`, `contract_id`, `period_start`, `period_end`, `status=draft`, `revision=1`, amount fields and provisional `total_amount`, `finalized_at=null`, `due_date=null`, and `is_overdue=false`. It does not open payment or enqueue Zalo. A draft may be generated while readings are incomplete or tariff configuration is not ready; no provisional amount is authoritative or payable.

At `period_end`, the scheduler creates only an Admin reminder. On the next calendar day it ensures a draft exists. Both jobs must be retry-safe and idempotent.

Finalize after the required data is entered:

```http
POST /api/v1/invoices/5001/finalize
Idempotency-Key: finalize-invoice-5001
Content-Type: application/json

{ "electricity_current_kwh": 120.5, "water_current_m3": 18.25 }
```

The request body only contains `electricity_current_kwh` and/or `water_current_m3`; it cannot supply service inputs, tenant/contract IDs, final amounts, status, revision, `finalized_at`, `due_date` or payment eligibility. Missing authoritative pricing returns `409 INVOICE_DATA_INCOMPLETE` and no transition occurs. The approved Requirement requires one effective tariff per utility selected at `period_start`, progressive Electricity tier calculation, one-rate-per-m³ Water calculation, a reliable opening reading from the Contract initial values on its first Invoice or the nearest earlier finalized Invoice of that same Contract thereafter, valid charges, and immutable Invoice item/tier snapshots. It explicitly excludes cross-Contract or Room-history reading inheritance and does not require intermediate readings to split mid-period tariff changes. The Admin finalized detail response is defined in the `GET /invoices/{invoice_id}` contract above. Due-date/status and post-commit Zalo behavior remain as documented.

Material amendment after finalize is controlled and not an arbitrary PATCH. If an explicit amendment operation/allowlist is not implemented, reject with `INVOICE_AMENDMENT_NOT_ALLOWED`. A permitted amendment recalculates financials, increments revision, retains older Zalo logs, then creates a send log for the new revision. Paid invoice financial mutation is rejected. A due date equal to today's date in `Asia/Ho_Chi_Minh` is not overdue; `is_overdue` becomes true only the following day while status remains unpaid.

The period cadence, month-end behavior, final-period treatment, reminder/draft timing and due-date formula are resolved. Billing V1.7 business/design decisions are approved: one period-start utility version, multi-tier Electricity, single-rate Water, rental-continuity reading inheritance, Fixed Service for all eligible Property Rooms, Flexible price at `occurred_at`, audit-only Water provider/locality metadata, Parking no-proration/next-period recurring start, decimal-safe half-up rounding, append-only history, and Invoice Items as authority for new itemized invoices. The Admin Invoice detail item/tier DTO and legacy response behavior are specified in §5.8; remaining exact schema/API fields relate to other endpoints and inputs. Still open are official Electricity import/reconciliation operations, Flexible cancellation/refund details, and Zalo provider/queue/recipient operations. Finalize must reject incomplete or unconfigured inputs with `INVOICE_DATA_INCOMPLETE` or a documented configuration error. Do not use hidden defaults, calendar-month starts or fixed 30-day Invoice periods.

### 9.4 Start payment and finish a two-failure session

```http
POST /api/v1/invoices/5001/payment-sessions
Idempotency-Key: checkout-5001-01
Content-Type: application/json

{ "provider": "momo" }
```

After two verified failed callbacks in this session, the attempt/session response is:

```json
{
  "data": {
    "payment_session_id": "10000000-0000-4000-8000-000000000001",
    "session_status": "terminated",
    "failed_attempts": 2,
    "can_start_new_session": true,
    "invoice_status": "unpaid",
    "next_action": "return_to_home"
  }
}
```

### 9.5 Provider callback

```http
POST /api/v1/payments/momo/callback
X-MoMo-Signature: <provider-signature>
```

```json
{ "order_id": "GT-5001-6006", "trans_id": "MOMO-123", "request_id": "GT-REQ-6006", "amount": 4040000, "result_code": 0, "event_id": "MOMO-EVT-123" }
```

```json
{ "data": { "accepted": true, "duplicate": false, "payment_transaction_id": "6006", "transaction_status": "success", "invoice_status": "paid" } }
```

The actual signature and payload mapping must match the selected official provider API. A duplicate event returns `duplicate=true` and its stored outcome.

### 9.6 Legacy Pool/Gym subscription example — SUPERSEDED

The prior V1.2 example modeled every paid Pool/Gym Amenity as a 30-day subscription with a `price_snapshot`. That business/API model is **SUPERSEDED / REPLACED** by the approved Facility vs Paid Service distinction. It is retained here only to identify the old contract and must not guide current implementation. Generic Facility/Paid Service, tariff-reading, price-version and Invoice-item business/database design is approved for V1.7; exact request/response examples remain implementation-contract work and are not specified here.

### 9.7 Assign a parking slot

```http
POST /api/v1/parking-slots/8101/assign
Idempotency-Key: parking-8101-vehicle-8301

{ "vehicle_id": "8301", "resident_id": "1001", "room_id": "101", "contract_id": "3001", "started_at": "2026-10-07" }
```

```json
{ "data": { "assignment_id": "8404", "parking_slot_id": "8101", "status": "active", "started_at": "2026-10-07", "active_room_slots": 1, "contract_capacity": 3 } }
```

Resident variant omits `resident_id` and uses `/me/parking-assignments`. A full slot or capacity breach returns `409 SLOT_UNAVAILABLE` or `422 PARKING_CAPACITY_EXCEEDED`. This example concerns assignment only and does not define pricing. V1.7 entitlement/billability rules are approved; exact request fields and price references remain implementation-contract work.

### 9.8 Create/update Complaint

```http
POST /api/v1/complaints
{ "property_id": "11", "room_id": "101", "category": "Báo cáo nhà trọ", "content": "Đèn hành lang tầng 2 bị hỏng.", "priority": "normal" }
```

```json
{ "data": { "complaint_id": "9003", "status": "pending", "priority": "normal", "created_at": "2026-10-07T10:00:00Z" } }
```

Admin transition:

```http
PATCH /api/v1/complaints/9003/status
{ "status": "in_progress", "reason": "Đã tiếp nhận kiểm tra." }
```

```json
{ "data": { "complaint_id": "9003", "status": "in_progress", "updated_at": "2026-10-07T10:10:00Z" } }
```

This writes a `complaint_history` row. Cross-Owner Property/Room returns `404`.

## 10. Endpoint matrix

All paths are relative to `/api/v1`. This matrix currently contains **115 endpoint definitions**. `Resident-self` means a Resident can act only on their own resource. `Admin-owner` means only the authenticated Owner's records. `Mixed-scope` means the endpoint applies distinct Admin/Resident filters described above.

| Method | Endpoint | Role | Scope | Transaction | Idempotent/replay | Notes |
|---|---|---|---|---|---|---|
| GET | `/auth/csrf` | Public | Browser session | No | Yes | Issue CSRF token |
| POST | `/auth/login` | Public | Credential | Yes | No | Rate-limited; generic failure |
| POST | `/auth/logout` | Admin, Resident | Current session | Yes | Yes | Revoke current session |
| GET | `/auth/me` | Admin, Resident | Current account | No | Yes | No secrets |
| POST | `/auth/change-password` | Admin, Resident | Current account | Yes | No | Revoke current and other sessions |
| POST | `/auth/credential-link/inspect` | Public | Token capability, no identity disclosure | No | Yes | Read-only expiry/state check |
| POST | `/auth/accept-invitation` | Public | One-use invitation | Yes | No | See enrollment completion contract |
| POST | `/auth/forgot-password` | Public | Verified account flow | Yes | Yes | Generic 202 |
| POST | `/auth/reset-password` | Public | One-use reset token | Yes | No | Token expires/consumed once |
| GET | `/me/profile` | Admin, Resident | Self | No | Yes | Role-shaped response |
| PATCH | `/me/profile` | Admin, Resident | Self | Yes | No | Allowlisted fields |
| GET | `/accounts` | Admin | Owner | No | Yes | Resident accounts in Owner |
| GET | `/accounts/{account_id}` | Admin | Owner | No | Yes | Foreign ID 404 |
| POST | `/residents/{resident_id}/account-invitations` | Admin | Owner Resident | Yes | Yes | Delivery channel open |
| GET | `/residents/{resident_id}/account-invitations` | Admin | Owner Resident | No | Yes | Audit; never return token/hash |
| POST | `/account-invitations/{invitation_id}/revoke` | Admin | Owner invitation | Yes | Yes | Pending only |
| PATCH | `/accounts/{account_id}/status` | Admin | Owner Resident account | Yes | No | Lock/unlock |
| POST | `/accounts/{account_id}/password-reset` | Admin | Owner Resident account | Yes | Yes | Verified reset only |
| GET | `/public/rooms` | Public | Public allowlist | No | Yes | Province/address/attributes only |
| GET | `/public/rooms/{room_id}` | Public | Public Room | No | Yes | Public-safe fields |
| POST | `/public/contact-requests` | Public | Property/optional Room | Yes | Yes | Contact only, no booking |
| GET | `/properties` | Admin | Owner | No | Yes | Search/filter |
| POST | `/properties` | Admin | New Owner Property | Yes | Yes | Owner from session |
| GET | `/properties/{property_id}` | Admin | Owner | No | Yes | Foreign ID 404 |
| PATCH | `/properties/{property_id}` | Admin | Owner | Yes | No | No Owner transfer |
| DELETE | `/properties/{property_id}` | Admin | Owner | Yes | Yes | Archive/deactivate |
| GET | `/properties/{property_id}/utility-tariffs` | Admin | Owner Property | No | Yes | Published history and tiers |
| POST | `/properties/{property_id}/utility-tariffs/{utility_type}/versions` | Admin | Owner Property | Yes | No | Atomic create + publish; see Utility Tariff Configuration |
| GET | `/properties/{property_id}/rooms` | Admin | Owner Property | No | Yes | Paginated |
| POST | `/properties/{property_id}/rooms` | Admin | Owner Property | Yes | Yes | Create Room |
| GET | `/rooms/{room_id}` | Admin | Owner | No | Yes | Includes derived state |
| PATCH | `/rooms/{room_id}` | Admin | Owner | Yes | No | Capacity/lifecycle checks |
| DELETE | `/rooms/{room_id}` | Admin | Owner | Yes | Yes | Deactivate; retain history |
| GET | `/residents` | Admin | Owner | No | Yes | Filter/paginate |
| POST | `/residents` | Admin | Owner | Yes | Yes | Scoped CCCD unique |
| POST | `/residents/search` | Admin | Owner | No | Yes | Exact CCCD, no global lookup |
| GET | `/residents/{resident_id}` | Admin | Owner | No | Yes | Foreign ID 404 |
| PATCH | `/residents/{resident_id}` | Admin | Owner | Yes | No | Scoped CCCD check |
| DELETE | `/residents/{resident_id}` | Admin | Owner | Yes | Yes | Archive when safe |
| GET | `/rooms/{room_id}/residents` | Admin | Owner Room | No | Yes | Active + history |
| POST | `/rooms/{room_id}/residents` | Admin | Owner Room/Resident | Yes | Yes | Capacity/contract check |
| POST | `/occupancies/{occupancy_id}/end` | Admin | Owner occupancy | Yes | Yes | Preserve history |
| POST | `/residents/{resident_id}/transfer` | Admin | Owner Resident | Yes | Yes | Atomic transfer |
| GET | `/me/rental` | Resident | Resident-self | No | Yes | Rental/occupancy summary |
| GET | `/properties/{property_id}/residence-registration/pending` | Admin | Owner Property | No | Yes | All rooms, pending only |
| POST | `/properties/{property_id}/ct01/exports` | Admin | Owner Property | Yes | Yes | Reviewed draft file |
| GET | `/contracts` | Admin | Owner | No | Yes | Filters |
| POST | `/contracts` | Admin | Owner | Yes | Yes | Create draft |
| GET | `/contracts/{contract_id}` | Admin, Resident | Owner / Resident-self | No | Yes | Scoped detail |
| PATCH | `/contracts/{contract_id}` | Admin | Owner | Yes | No | Draft revision 0/no audit; active material update requires reason + If-Match + atomic history |
| POST | `/contracts/{contract_id}/activate` | Admin | Owner | Yes | Yes | Draft→active revision 1 + first baseline history atomically |
| POST | `/contracts/{contract_id}/renew` | Admin | Owner | Yes | Yes | If-Match; successor draft revision 0, no history |
| GET | `/contracts/{contract_id}/history` | Admin | Owner | No | Yes | Paginated official audit history |
| GET | `/contracts/{contract_id}/documents` | Admin, Resident | Owner / Resident-self | No | Yes | Version metadata; temporary URL |
| POST | `/contracts/{contract_id}/documents` | Admin | Owner | Yes + object storage | Yes | New immutable version |
| GET | `/contract-documents/{document_id}` | Admin, Resident | Owner / Resident-self | No | Yes | Metadata; temporary URL |
| POST | `/contracts/{contract_id}/terminate` | Admin | Owner | Yes | Yes | If-Match; revision increment + audit + debt/dependent lifecycle checks |
| GET | `/me/contracts` | Resident | Resident-self | No | Yes | Own linked contracts |
| GET | `/invoices` | Admin, Resident | Owner / Resident-self | No | Yes | Scoped filters |
| POST | `/invoices` | Admin | Owner Contract | Yes | Yes | Create reviewed draft; no final due/payment |
| POST | `/contracts/{contract_id}/invoices/generate` | Admin, system scheduler | Owner Contract | Yes | Yes | Idempotently ensure contract-anchored draft |
| GET | `/invoices/{invoice_id}` | Admin, Resident | Owner / Resident-self | No | Yes | Includes finalize/due fields and derived overdue |
| PATCH | `/invoices/{invoice_id}` | Admin | Owner | Yes | No | Draft fields only; finalized amendment is controlled |
| POST | `/invoices/{invoice_id}/finalize` | Admin, authorized backend workflow | Owner Invoice | Yes | Yes | Atomic calculation/finalize; Zalo after commit |
| POST | `/invoices/{invoice_id}/send-zalo` | Admin | Owner Invoice | Yes + dispatch | Yes | Finalized unpaid only; revision send log |
| GET | `/invoices/{invoice_id}/zalo-send-logs` | Admin, Resident | Owner / Resident-self | No | Yes | Append-only history |
| POST | `/invoices/{invoice_id}/payment-sessions` | Resident | Resident-self Invoice | Yes + provider | Yes | New UUID session; finalized unpaid only |
| POST | `/payment-sessions/{payment_session_id}/attempts` | Resident | Session's own Invoice | Yes + provider | Yes | Same session retry |
| GET | `/payment-sessions/{payment_session_id}` | Resident | Session's own Invoice | No | Yes | Session derived from attempts |
| GET | `/invoices/{invoice_id}/payments` | Admin, Resident | Owner / Resident-self | No | Yes | Attempts history |
| POST | `/payments/momo/callback` | MoMo | Provider-signed | Yes | Yes | Idempotent callback |
| POST | `/payments/zalopay/callback` | ZaloPay | Provider-signed | Yes | Yes | Idempotent callback |
| GET | `/properties/{property_id}/pricing-items` | Admin | Owner Property | No | Yes | Fixed/Flexible catalog; `?kind=PARKING` returns Parking catalog and versions |
| GET | `/me/services` | Resident | Resident-self active Occupancy | No | Yes | Active Flexible catalog/current effective price for current occupied Properties |
| POST | `/properties/{property_id}/pricing-items` | Admin | Owner Property | Yes | Yes | Create Fixed/Flexible/PARKING catalog item |
| POST | `/properties/{property_id}/pricing-items/{pricing_item_id}/retire` | Admin | Owner item | Yes | No | Soft-retire; preserves history |
| GET | `/properties/{property_id}/pricing-items/{pricing_item_id}/price-versions` | Admin | Owner item | No | Yes | Immutable published history |
| POST | `/properties/{property_id}/pricing-items/{pricing_item_id}/price-versions` | Admin | Owner item | Yes | Yes | Atomic append-only publish |
| GET | `/properties/{property_id}/flexible-service-charges` | Admin | Owner Property | No | Yes | Paginated charge history |
| POST | `/properties/{property_id}/flexible-service-charges` | Admin | Owner Property/Contract | Yes + Idempotency-Key | Yes | Validate relation and snapshot effective price |
| GET | `/properties/{property_id}/parking` | Admin | Owner Property | No | Yes | Operational overview with areas, slots, vehicles, assignments, entitlement and pricing summaries |
| PATCH | `/parking-areas/{parking_area_id}` | Admin | Owner Area | Yes | No | Edit name/location or status; preserve linked history |
| GET | `/properties/{property_id}/parking-residents` | Admin | Owner Property | No | Yes | Active occupancy/Contract contexts for Parking operations |
| GET/POST | `/properties/{property_id}/vehicles` | Admin | Owner Property/Resident | Read / Yes | Yes | List or create a vehicle for an in-scope resident |
| GET | `/properties/{property_id}/parking-assignments` | Admin | Owner Property | No | Yes | Current and historical assignments with explicit billability |
| POST | `/properties/{property_id}/parking-assignments` | Admin | Owner Property/Contract | Yes | Yes | Lock and validate relation chain, Contract capacity, slot/vehicle availability; atomically create assignment and classification |
| PATCH | `/properties/{property_id}/parking-assignments/{assignment_id}/entitlement` | Admin | Owner Assignment | Yes | No | Explicit paid/free/unclassified classification; finalized Invoice history prevents reclassification |
| GET | `/properties/{property_id}/parking-pricing` | Admin | Owner Property | No | Yes | List Property `PARKING` pricing items and append-only price versions |
| POST | `/parking-assignments/{assignment_id}/end` | Admin | Owner Assignment | Yes | Yes | End assignment by date; preserve history and finalized Invoice snapshots |
| — | — | — | — | — | — | Former Amenity catalog/price/subscription/cycle routes are SUPERSEDED as current contract; Fixed/Flexible Paid Service contract is specified in §5.10 |
| GET | `/properties/{property_id}/parking-areas` | Admin, Resident | Owner Property / Resident-self | No | Yes | Scoped areas |
| POST | `/properties/{property_id}/parking-areas` | Admin | Owner Property | Yes | Yes | Create area |
| GET | `/parking-areas/{parking_area_id}/slots` | Admin, Resident | Owner / Resident-self | No | Yes | Availability derived |
| POST | `/parking-areas/{parking_area_id}/slots` | Admin | Owner | Yes | Yes | Create physical slot |
| PATCH | `/parking-slots/{slot_id}` | Admin | Owner | Yes | No | Active assignment check |
| GET | `/vehicles` | Admin | Owner | No | Yes | Owner list |
| GET | `/me/vehicles` | Resident | Resident-self | No | Yes | Own vehicles |
| POST | `/me/vehicles` | Resident | Resident-self | Yes | Yes | Create own vehicle |
| POST | `/residents/{resident_id}/vehicles` | Admin | Owner Resident | Yes | Yes | Create vehicle |
| PATCH | `/vehicles/{vehicle_id}` | Admin, Resident | Owner / Resident-self | Yes | No | Preserve history |
| GET | `/parking-assignments` | Admin, Resident | Owner / Resident-self | No | Yes | Scoped filters |
| POST | `/parking-slots/{slot_id}/assign` | Admin | Owner | Yes | Yes | Lock slot/Contract |
| POST | `/me/parking-assignments` | Resident | Resident-self | Yes | Yes | Own active Contract |
| POST | `/parking-assignments/{assignment_id}/end` | Admin, Resident | Owner / Resident-self | Yes | Yes | Preserve history |
| POST | `/complaints` | Resident | Resident-self + valid Property | Yes | Yes | Report is category |
| GET | `/me/complaints` | Resident | Resident-self | No | Yes | Own only |
| GET | `/complaints` | Admin | Owner | No | Yes | Filters |
| GET | `/complaints/{complaint_id}` | Admin, Resident | Owner / submitting Resident | No | Yes | History included |
| PATCH | `/complaints/{complaint_id}/status` | Admin | Owner | Yes | Yes | Transition + history |
| POST | `/complaints/{complaint_id}/notes` | Admin, Resident | Owner / submitting Resident | Yes | Yes | Append note |
| POST | `/complaints/{complaint_id}/reopen` | Admin, Resident | Owner / submitting Resident | Yes | Yes | Reason required |
| GET | `/contact-requests` | Admin | Owner | No | Yes | Contact-only list |
| GET | `/contact-requests/{contact_request_id}` | Admin | Owner Property | No | Yes | Foreign ID 404 |
| PATCH | `/contact-requests/{contact_request_id}` | Admin | Owner Property | Yes | No | Status only |
| POST | `/notifications/room-reminders` | Admin | Current Owner's active Room and its active Resident accounts | Yes | Yes | Explicit confirmation; in-app only |
| GET | `/notifications` | Admin, Resident | Current account | No | Yes | In-app only |
| PATCH | `/notifications/{notification_id}/read` | Admin, Resident | Current account | Yes | Yes | No cross-account read |
| POST | `/notifications/read-all` | Admin, Resident | Current account | Yes | Yes | Idempotent |
| GET | `/notification-preferences` | Admin, Resident | Current account | No | Yes | Stored preferences |
| PATCH | `/notification-preferences` | Admin, Resident | Current account | Yes | No | No delivery side effect |
| GET | `/dashboard/summary` | Admin | Owner | No | Yes | Derived summary |
| GET | `/properties/{property_id}/dashboard` | Admin | Owner Property | No | Yes | Derived summary |

## 11. Role/permission matrix

`R` = read; `C` = create; `U` = update; `A` = archive/deactivate; `—` = no access. All permissions are additionally scoped as in §2.

| Resource | Public | Admin | Resident |
|---|---|---|---|
| Public Room Listing | R public fields | R/C/U/A own | R public + own rental |
| Property | — | R/C/U/A own | R safe rental context only |
| Room | R public fields | R/C/U/A own | R own current/historical room |
| Resident | — | R/C/U/A own | R/U own permitted profile only |
| CCCD lookup | — | R exact, Owner-scoped | — |
| Occupancy | — | R/C/U/A own | R own history |
| Account | — | R/C/U resident accounts; U status/reset | R own summary; U own password |
| Account invitation | — | R/C/revoke own Owner invitations | — |
| Contract | — | R/C/U/activate/renew/terminate own | R own linked contracts |
| Contract documents | — | R/C own; upload creates new version | R own linked metadata/download |
| Invoice | — | R/C/U own | R own linked invoices |
| Utility Tariff | — | R/C publish own Property | — |
| Payment | — | R own transactions | R/C own checkout and attempts |
| Zalo OA invoice send/log | — | C/R own | R own send history |
| Facility/Paid Service/Pricing | — | Fixed/Flexible catalog, price-version, Facility and booking decision routes specified | R active shared Facilities and Flexible catalog via `/me/services`; Resident can check availability/book and Owner approves; positive-price approval creates a charge, zero-price approval is free |
| Parking/vehicles | — | R/C/U/A own | R/C/U own vehicle/assignment |
| Complaint | — | R/U own | R/C own |
| Contact Request | C | R/U own | — |
| CT01 list/export | — | R/export own Property | — |
| Notification/preferences | — | R/U own account | R/U own account |
| Dashboard | — | R own | — |
| Refund/provider refund | — | — | — |
| Foxi/OCR/Camera/SaaS/booking/staff assignment | — | — | — |

## 12. Explicitly out of scope

- `appointment booking`, room-viewing schedule, and any route that pretends a contact request is a booking;
- separate `room_reports`; “Báo cáo nhà trọ” is a Complaint category;
- SaaS plans, Foxi, OCR, camera AI, email/push, provider refund, staff/CSKH/technician roles, Complaint assignment;
- the superseded Pool/Gym 30-day subscription/cycle model is not the current business contract; replacement Facility/Paid Service business/database design is approved for V1.7 implementation, while exact endpoint/DTO details remain implementation work;
- client-side authority over Owner, paid status, total, cycle snapshot, slot availability, or operational state.

If a legacy route offers one of these, it is **Legacy/demo only — do not migrate to V1 API.**

## 13. Open implementation blockers before backend work

These are not changes to Requirement or database; resolve them in backend implementation planning:

1. **Billing service-data readiness:** Database V1.8 and backend resolvers support the approved Invoice calculation inputs; the read-only Admin workspace reports missing/invalid inputs before finalization. Remaining operational service-data source gaps and the authenticated workspace browser closure still need to be reconciled. Do not trust browser totals. Real payment-provider integration and production Zalo delivery remain separate work; the non-production demo payment and Resident feedback implementation is applied on local V1.12, with authenticated review pending.
2. **Controlled finalized-invoice amendment contract:** material corrections after finalize must recalculate, increment revision and resend while paid amounts remain immutable. The exact permitted amendment fields, authorization and whether a dedicated command is needed must be explicitly specified before allowing amendment; generic PATCH is not sufficient.
3. **Verified account delivery and security-store deployment:** invitation persistence is implemented by `account_invitations`; decide the out-of-band enrollment delivery channel because email/push is out of scope. Session/revocation and reset-token architecture is Redis or a secure server-side/transient store (hashed reset token with TTL); choose/configure the actual deployment, TTL, and revocation policy. Neither session nor reset tokens are PostgreSQL business tables.
4. **Contract object-storage operations:** Contract API V1.3 is implemented and locked in §5.7. Choose the concrete S3/MinIO/equivalent provider, retention/backup and orphan-reconciliation operations for `contract_documents`, which stores file metadata/version history only. Production multipart upload is pending provider/adapter configuration. Contract field audit is not document file versioning. No electronic-signature provider is selected; this is only a blocker if real electronic signing is introduced.
5. **CT01 production export:** official template/version and legal process remain to be verified. The API contract only promises a reviewed draft export.
6. **Zalo OA:** account/template/provider callback/retry policy and exact recipient rule (representative or all eligible occupants) remain open. The send eligibility rule (finalized unpaid only) is resolved.
7. **SLA:** Complaint SLA target and priority-specific timing remain open; no timing promise is made by this API.
8. **Remaining idempotency infrastructure:** V1.5 `contract_idempotency_requests` covers Contract create/activate/renew/terminate only. Durable replay for other §7 commands remains to be designed and implemented by domain; document upload requires a separate object-storage-safe approach. Billing scheduler reminder and draft effects have their own retry-safe V1.8 implementation.

## 14. Validation checklist

- Every endpoint maps to Requirement V1 and respects Admin Owner scope or Resident self scope.
- Invitation tokens are one-time, stored as hashes only, scoped to one Owner, and never returned in audit responses. Session/reset state stays in infrastructure stores.
- Contract renewal retains the prior Contract and sets `previous_contract_id`; document updates create immutable metadata versions while binary stays in object storage.
- `rooms.default_capacity` is the Room default; signed `contracts.resident_capacity` is a snapshot and is not changed by later Room-default edits.
- CCCD search is Owner-scoped, uses a request body, and gives the same not-found result for another Owner's record.
- Public Room and Contact Request expose only allowlisted public data; there is no viewing booking.
- Invoice periods use the original Contract start anchor with monthly anniversary, 29/30/31 month-end clamp without cumulative drift, and final-period truncation at `effective_contract_end_date` (`termination_date` for terminated Contracts when present, otherwise `end_date`). No period starts afterward. Full rent is charged for the final period; usage-based items use actual usage through that effective date.
- At `period_end`, scheduler only reminds; next calendar day it idempotently ensures one draft exists. Draft has null `finalized_at`/`due_date`, provisional totals, and cannot be paid or sent through Zalo.
- Finalize is atomic, validates completeness and recalculates amounts; due date is the Asia/Ho_Chi_Minh finalized calendar date plus five days. Overdue is derived from unpaid and current local date greater than due date.
- Payment and Zalo endpoints reject draft/unfinalized/paid invoices as applicable; callbacks recheck state transactionally; Zalo logs are retained per revision; paid financial fields cannot be directly changed.
- Payments use MoMo/ZaloPay, append one transaction per attempt, require full amount, verify callbacks, deduplicate, and cap consecutive failure at two per session only.
- Pool/Gym do not default to a paid subscription; the former 30-day cycle model is SUPERSEDED. Facility/Paid Service distinction and the approved V1.7 rules follow Requirement; Fixed/Flexible Admin catalog, price-version and charge-entry contract is specified in §5.10.
- Each utility uses one tariff version selected at period_start for the full period; electricity uses progressive multi-tier kWh rates and water one rate per m³. A mid-period tariff change applies next period; no tariff split, day allocation or boundary reading is required for the change.
- Beginning readings are resolved per Contract: its first Invoice uses its own initial readings; later Invoices use the nearest earlier finalized Invoice ending reading from that same Contract. Renewal/predecessor and Room history are never reading sources; missing/invalid readings keep the Invoice draft and block finalization.
- Fixed Service is Property-scoped, applies to every eligible Room in V1, and uses the price version effective at period_start for the whole period; new price applies next period, with no price-change proration. Flexible Paid Service requires a valid service-generated billable charge and resolves its price by occurred_at; no automatic refund/rewrite after billed/finalized.
- Parking owns entitlement and assignment state; Billing/Pricing owns amount using one Property price authority. Free entitlement creates no Invoice Item, and legacy unclassified assignments are not implicitly billable. A paid entitlement must be active and priced at period_start; a mid-period start charges from next period, with no proration. Any later activation fee must be separate.
- V1.7 amount calculations use decimal-safe arithmetic: electricity rounds each tier, Water rounds its final line, and Flexible/Parking round each line using half-up; invoice total is the sum of rounded item amounts. New finalized V1.7 invoices use Invoice Items as the financial-detail authority and derive aggregate compatibility fields; legacy V1.6 invoices retain aggregate-only snapshots with `itemization_available=false`.
- Price history is append-only; finalized Invoice exposes immutable item snapshots and never recalculates from current prices or catalog labels.
- Parking uses physical slots and active Contract capacity with transaction locks; no override or silent deletion.
- CT01 is Property-wide and pending-registration-only; export remains a reviewed draft until official form verification.
- Zalo send logs preserve every revision; Complaint has no assignment role; refund, SaaS, Foxi, OCR, camera AI, email/push, and staff APIs are absent.

**Implementation gate:** Invoice lifecycle/period/Zalo behavior is physically supported by current local Database V1.12 and Prisma mapping. Database V1.1–V1.11 are historical predecessors on the configured local application target. Contract audit/revision behavior remains physically supported and documented in §5.7; durable replay covers create/activate/renew/terminate while document upload replay remains excluded. V1.11 adds Resident booking; V1.12 only expands the demo payment provider value. Invoice finalization, scheduler/reminder and the Admin period workspace/readiness read model are implemented; missing authoritative source data keeps an individual draft blocked until corrected. Real-provider Payment and production Zalo delivery remain separate work. This API document does not itself change the physical database.




## Local-only Cloudy AI demo — authorized 2026-10-28

This is outside the production `/api/v1` business API. It does not enable product AI in V1. In the local guest flow, preparation uses Qwen3 1.7B and does not read room data; only explicit confirmation triggers read-only calls to the existing public room API.

- `POST /api/cloudy/chat`: Next Node route, development only. Other modes return 404 before inference.
- Requires loopback URL hostname (`localhost`, `127.0.0.1`, `[::1]`), matching Host and same Origin. No authenticated business records are accessed.
- JSON body `{ "message": "Tìm phòng ở Bến Nắng dưới 4 triệu", "mode": "new" }`; `mode` defaults to `new`. For `continue`, require `context` from the last accepted response (price/area comparison arrays, location, occupants, amenities); reject context in `new`. Context is validated and never interpreted as executable instructions; trimmed nonempty message, maximum 500 JavaScript string units, body maximum 4096 bytes. Raw history, model overrides and other keys are rejected.
- Prepare HTTP 200: `{ "text": "...", "source": "public_database", "model": "qwen3:1.7b", "status": "awaiting_confirmation", "context": {...} }`; unclear/unsupported criteria return `needs_clarification` and null context. Confirm HTTP 200 returns `preview` or `no_matches`, source `public_database`, and the accepted context. Text lists at most five currently public rooms. It is not SQL or a production room schema.
- Errors: 400 invalid body/message, 403 origin/host rejection, 413 oversized body, 415 unsupported content type, 429 another inference active in this Next process, 503 unavailable/invalid/timed-out worker. Error JSON contains `error` and may contain a safe `message`. All replies use `Cache-Control: no-store`.
- No persistence, booking or automatic relaxation. User-authorized continuation (2026-10-28): `continue` retains accepted filters and replaces fields explicitly supplied by the new turn; exact removal commands can clear a field. `new` ignores prior filters. Clarification preserves previous context only in continue mode; failed/aborted transport never commits context. Dataset is `data/room-ai/v1/rooms.json`; Ollama is fixed to local Qwen3 1.7B. Server deadline 110 seconds. Browser abort propagates to the Python process when received; this does not guarantee immediate cancellation inside Ollama.

### Guest confirmation update — 2026-10-28

This supersedes immediate retrieval in the local Cloudy contract above. Normal message requests (optional `action: "prepare"`) only interpret the request and return `status: "awaiting_confirmation"`, the proposed filter `context`, and a plain-language summary. They do not load or filter the catalog. When no filter is specified, the summary must explicitly say it covers all public rooms and offer edit-to-narrow or confirm-all actions before retrieval. Ambiguous or unsupported requests return `needs_clarification` with null context and no confirmation action. The response must echo the unrecognized phrase when available, ask a targeted follow-up when possible (for example, ask for a maximum monthly budget when the user says “cheap”), explain unsupported location proximity filters and offer the supported province/address alternative, then wait without continuing the query; it must not guess a filter. In `continue`, an explicit “add” amenity update unions the new amenities with accepted amenities; an explicit amenity replacement replaces that field, and other fields remain as previously specified unless updated.

After the guest explicitly confirms, send exactly `{ "action": "confirm", "context": <proposed filters> }` to the same route. Context schema is revalidated. Confirmation makes GET requests only to the existing `/api/v1/public/rooms` API; no SQL is generated. Supported filters are rent, area, capacity, a normalized text match against public province/address fields, and exact structured amenity codes from V1.16. Every requested amenity is required and comes from the Owner-maintained Room listing fields; the model does not infer features from descriptions. An unspecified amenity request requires clarification. Extra message/mode keys are rejected for confirmation. This local read-only route accepts client-provided filters, not a signed proposal token; it does not authorize business writes.

Client holds a proposal separately from confirmed context. Editing input/changing mode invalidates the proposal; a newer request or an abort cannot commit an old reply. Only successful confirmation enables continuation using those filters. Retry after a confirmation transport error uses the unchanged proposal. Session remount drops both proposal and confirmed filters. Owner/Resident assistant contracts are unaffected.

See [integration evidence](07_modules/public-marketplace/CLOUDY_LOCAL_AI_INTEGRATION_REPORT.md) for limits and verification.


### Local-only Cloudy Owner advisor — 2026-10-28

Approved follow-up 2026-10-29 — `resident_profile_lookup` supersedes the earlier refusal for read-only identity lookup. Only the authenticated Admin/Owner session may use this task. The exact request shape is `{ "task":"resident_profile_lookup", "period":"", "room":"", "residentQuery":"..." }`; the server uses the same session cookie to read the existing Owner-scoped `GET /residents` list. It returns one uniquely matched resident by full name, or occupants of one explicit room; duplicate resident names or duplicate room codes require clarification. An unscoped/account-wide request returns no personal profiles; a named room returns only the current occupants of that Room. Existing Admin fields may be displayed: full name, room/property, CCCD/CMND, phone, email, birth date, gender, residence status and residence-registration status. The query and returned profile data must bypass Qwen/LLM, and the UI replaces the raw lookup message with a generic history label. The task has no write/export/share behavior and adds no backend endpoint or schema. Guest and Resident Cloudy roles do not inherit this capability.


2026-10-29 local follow-up: questions containing a `DEMO-<timestamp>-<8 hex>` code are routed deterministically and read through the authenticated account's `invoice_demo_payment` notifications, then joined by Invoice number to Owner-scoped `GET /invoices?status=paid`. The local POST shape is `{task:"transaction_lookup",period:"",room:"",transactionCode}`; it returns a simulated-payment label and the existing Admin invoice link. No backend route or schema is added. Requests for resident names/contact/CCCD receive an explicit privacy response; Owner Cloudy chat supports only aggregate resident statistics. Requests to add, collect, save, edit or reveal personal/sensitive fields are deterministically assigned `sensitive_data_refusal` before the local model; the UI clears the input and retains only a generic sanitized user bubble, so the original text is not forwarded to the model or echoed into chat history. No Owner-management API or database behavior is changed.

Next.js development route `/api/v1/cloudy/owner` (outside canonical `/api/v1`) powers the Admin Cloudy panel directly, without the standalone port 4332 server. Every GET/POST validates `gt_session` with backend `/auth/me` and requires active Admin. GET returns the current account's task/period/room catalog. POST accepts exactly `{question}` to classify a task; recognized read-only tasks (`invoices`, `unpaid`, `paid`, `utilities`, `missing`, `overview`, `requests`, `open_requests`, `actionable_requests`, `amenity_requests`, `common_area_requests`, `feedback_messages`, `residents`, `resident_ranking`, `resident_registration_by_room`, `available_rooms`, `vehicle_counts`, `vehicle_total`, `property_total`, `electricity_ranking`, `electricity_lowest`, `water_ranking`, `frequent_requests`) then accept exactly `{task,period,room}` and run without a confirmation click. Questions mentioning Contracts are deterministically classified as navigation-only task `contract_management`; the UI explains that Cloudy chat does not read contract details and links to `/admin/contracts` or `/admin/reports`, without calling Contract APIs or changing lifecycle state. The deterministic router recognizes “cho tôi hóa đơn tháng 9” as `invoices`; this lists all invoice statuses for the selected `period_end` month, including drafts, finalized unpaid and paid invoices. Drafts are labeled as not yet receivable and have no payable total. `unpaid` remains limited to finalized unpaid invoices, and `paid` lists only finalized paid invoices in the selected `period_end` month; the unqualified elliptical follow-up “thế đã thanh toán” after an unpaid-invoice query reuses that query's month and room scope. `available_rooms` is a no-period task: its deterministic request router recognizes vacant-room wording before invoice classification, and the live adapter traverses Owner-scoped Properties and their existing `GET /properties/{property_id}/rooms` lists, returning only effective `available` Rooms with safe room/property, area and default-rent details. `vehicle_counts` reads existing `GET /properties/{property_id}/parking-assignments` for each Owner Property and counts distinct vehicles with active assignments, without a period; `vehicle_total` returns that distinct active-assignment total without a per-room ranking. `electricity_ranking` reads finalized invoices for the selected period and their saved detail snapshots; it ranks per-Room summed current-minus-previous kWh, skipping drafts and missing/invalid readings. `water_ranking` uses the same finalized-invoice and valid-meter rules for m³ water usage and ranks by Room for the selected period. `resident_ranking` ranks current living Residents by active Room residence link and `resident_registration_by_room` aggregates living Residents with incomplete registration by Room; both return counts only, with no resident identity or contact details. `open_requests` returns one aggregate count over only `pending` and `in_progress` rows, excluding `resolved` and `rejected`; it reads the existing Owner-scoped Room-request response and discloses the 100-latest-row cap. `frequent_requests` groups the `GET /room-requests` response by Room and creation month. `feedback_messages` recognizes questions like “có bao nhiêu tin nhắn phản hồi từ khách” and counts/displays only Owner-scoped Room requests/Complaints by creation month; it does not include pending service bookings or the Superadmin-only AI unresolved-feedback inbox. The endpoint returns at most the 100 latest Room requests; the response discloses when this limit may make the count incomplete. These tasks perform no writes. When scope is missing or ambiguous, UI asks only for the missing month/room; omitted month defaults to the current displayed month for period-based tasks and omitted room means all Owner rooms. The live adapter traverses all pages of Owner-scoped `/residents` and returns aggregate counts only, without resident names or contact/identity details. Identity and Owner scope are server-derived; no client authority fields, writes or AI financial calculations. Mutations and request decisions remain separate and require explicit confirmation. Local host and POST same-origin checks, 4 KiB body limit, no-store. Anonymous/expired session 401, Resident 403, auth unavailable 503, production disabled 404. This local demo does not replace Invoice/Billing API contracts.

2026-10-29 read-only query additions: `overview` reads `GET /billing/workspace` readiness rows and includes only `MISSING_DATA`, `MISSING_DRAFT`, `REMINDER_DUE`, and `READY_TO_FINALIZE`; it does not treat every unpaid/draft invoice as a data issue. `missing` reads the same Owner-scoped endpoint in pages of 20 and returns backend `missing_or_invalid` reasons plus ended periods missing an expected draft. The adapter allows 30 seconds per workspace request and preserves safe backend error messages/request IDs. `property_total` counts Properties in the authenticated Owner scope. `electricity_lowest` ranks valid current-minus-previous readings ascending on finalized invoices. At that earlier checkpoint, questions asking who rented a room returned the privacy response; the approved `resident_profile_lookup` follow-up above supersedes it and requires one unique name or explicit room scope. `actionable_requests`, `amenity_requests`, and `common_area_requests` filter only the existing `GET /room-requests` list: actionable/amenity requests require `pending` or `in_progress`; common-area reports filter the category/content terms; an optional selected month filters by `created_at`. Detail text redacts phone numbers, identity numbers, and email addresses. `open_requests` continues returning a count of `pending`/`in_progress` only, with optional month filtering. No endpoint, API contract, or database write is added.


Owner local demo correction (2026-10-28): the Next route must reside at `/api/v1/cloudy/owner` to receive the existing `gt_session` Path=/api/v1 cookie. This is a frontend local-demo route, not a new backend production route. GET includes the `requests` task; confirmed task requests returns scoped synthetic request rows. Additional exact POST shape `{requestId,action,revision,reason,confirmed:true}` applies an allowlisted simulation transition with nonempty reason, revision check and history, scoped by validated account/owner. Foreign request 404; stale/invalid transition 409; no persistent DB writes or charges. State is process-local and resets on restart. This does not replace canonical booking/Complaint commands.

## Resident assistant and meter approval — approved 2026-10-28

All paths below use /api/v1 and existing session/CSRF middleware. Anonymous is denied; Resident-only commands reject Admin. Identity/Owner scope is always server-derived. JSON image bodies accept at most 8 MB; other JSON routes retain 1 MB. Missing required database tables return 503 FEATURE_NOT_READY.

| Method/path | Contract |
|---|---|
| POST /me/assistant/chat | Resident; exact body `{message}` (1–500 chars), optionally plus `{context:{last_intent}}`, where `last_intent` is exactly one of `services`, `meter`, `requests`, or `invoice`. The frontend sends only the most recent topic for the currently open chat; it never sends raw message history, room/service/Invoice IDs, or other user data. Context is used only for a clearly elliptical follow-up and never overrides a new explicit intent. Local Qwen3 1.7B classifies services/meter/requests/invoice/help; invoice-location, service-list, explicit meter submission and lookup of recorded meter readings, service-status, and complaint phrases, plus broad add-amenity requests, are recognized deterministically. Response intent includes `meter_readings`; this directs the client to the authenticated Resident invoice list and displays recorded opening/ending electricity and water readings read-only. A broad add-amenity request returns intent=amenity_choice and asks whether the Resident wants to view/book existing services or request room equipment; no write occurs until the Resident submits the room request and the Owner confirms. Unclear or uncertain requests use intent=help with explicit clarification rather than a guessed task. Response data `{intent,text,contextual}`; `contextual` is true only when the prior topic resolved an elliptical follow-up, and reply text states that no booking, request, meter submission or payment was performed. No mutation, SQL or model-selected resource identifiers; invoice location is answered from the separately scoped GET /me/meter-targets list, and the Resident must choose the intended room/period. Service status uses the Resident-scoped GET /me/service-bookings list. 429 busy, 503 AI unavailable. |
| GET /me/meter-targets | Resident; up to 50 draft Invoice targets scoped to currently active Occupancy/Contract, with invoice_id, contract_id, room_id, property_id, room_code, property_name, period_start/end. No client-selected tenant scope. |
| POST /me/meter-ocr | Resident; exact body image (data URI JPEG/PNG/WebP <=5 MB decoded; <=20 million input pixels). Returns data {reading: string or null}; ambiguous/low-confidence returns null. 429 busy, 503 unavailable/timeout; caller may enter a reading manually from the image. Does not persist or mutate Invoice. |
| POST /me/meter-submissions | Resident; exact invoice_id, utility ELECTRICITY/WATER, reading decimal string (0–999999999.999), image. Revalidates current scope/draft and same-Contract opening reading. Saves PENDING with normalized JPEG and prior draft reading; data {submission_id,status}. Repeated identical pending submission returns original; conflicting pending request 409. |
| GET /me/meter-submissions | Resident own history, newest pending first, at most 100, no image bytes. |
| GET /meter-submissions | Admin own Owner queue/history, at most 100, no image bytes. |
| GET /meter-submissions/{id}/image | Authenticated; Owner Admin or submitting Resident only; foreign resource 404; JPEG private/no-store. |
| POST /meter-submissions/{id}/decision | Admin; exact decision APPROVE/REJECT, optional reason <=1000 chars. Invoice-first row locks. Approval checks active context, draft, unchanged current draft reading, authoritative same-Contract continuity and nondecreasing proposed reading; atomically updates draft utility and decision audit. Rejection only records decision. Same repeated decision returns result; opposite after decision 409. No finalize, total calculation, payment or Zalo. |

List rows: submission_id, invoice_id, utility, reading, status, decision_note, created_at, decision_at, room_code, property_name, period_start/end. BigInt IDs are decimal strings; timestamps/dates serialize ISO. Backend client-authority rejection continues to apply. Resident service registration reuses existing BOOKING endpoints and approval contract; SUBSCRIPTION enrollment remains deferred.

## Resident room requests and confirmed equipment — 2026-10-28

All paths /api/v1, existing session/CSRF and authority-rejection middleware. Real persisted Complaint workflow, separate from owner-advisor synthetic request demo.

| Endpoint | Contract |
|---|---|
| GET /me/room-request-targets | Resident only; returns rooms for currently active Occupancy/Contract, each occupancy_id/room_id/property_id/contract_id/resident_id/room_code/property_name/equipment, plus equipment_options {code,name}. Max 100 rooms. |
| POST /me/room-requests | Resident only; exact occupancy_id, request_key UUIDv4, equipment_code (supported code or null), content 5–5000 chars. Server derives identity/context; creates pending Complaint + extension + history + Admin notification. Same retry key and exact content returns existing result; mismatched retry 409. Duplicate open equipment/room or existing equipment 409; foreign/noncurrent occupancy 404. |
| GET /me/room-requests | Resident own Complaint history, newest 100, including older feedback. |
| GET /room-requests | Admin Owner-scoped Complaint history, newest 100, including older feedback. |
| POST /room-requests/{id}/decision | Admin only; exact decision START/APPROVE/REJECT, required reason 1–1000 chars. START pending→in_progress; APPROVE pending/in_progress→resolved; REJECT pending/in_progress→rejected. Same decision state repeats idempotently, contradictory terminal decision 409. Equipment approval revalidates original active occupancy/contract and atomically inserts room equipment plus status/history/notification. Free-text complaints never modify equipment. |
| GET /rooms/{room_id}/equipment | Owner Admin or Resident with active occupancy for that Room; returns {code,name,confirmed_at} array; foreign scope 404. |

Complaint list DTO: complaint_id,room_id,property_id,room_code,property_name,category,content,status,created_at,equipment_code,equipment_name,history[{action,from_status,to_status,note,created_at}]. IDs decimal strings; dates ISO. Create/decision return {complaint_id,status}. Supported equipment FRIDGE/AIR_CONDITIONER/WASHING_MACHINE/WATER_HEATER/BED/WARDROBE/DESK. Presence only, no serial or quantity. AI chat adds intent requests; model output never grants authority or performs writes. UI requires explicit submission and Owner confirmation of actual supplied equipment. No automatic fee, rent change or invoice mutation. This delivery does not expose reopen/amendment operations for equipment requests.


Owner Cloudy live adapter (2026-10-28): frontend local route `/api/v1/cloudy/owner` now defaults to authenticated reads of the configured backend. GET returns source=database, synthetic=false, current Vietnam date, scoped room labels and periods. Confirmed task POST reads full paginated Property/Room/Invoice/Billing-workspace data; Invoice month is period_end month. Utilities use saved detail snapshots; legacy tiers are not synthesized. Requests combine up to 100 latest /room-requests (limit disclosed) by creation month and pending service bookings by service_date month; links use existing Admin management screens. Local synthetic action POST is rejected in live mode. Existing backend contracts/authorization/CSRF/state transitions unchanged. No live financial data goes to the task-classification model.

## Cloudy unresolved-message review — V1.17 API implementation; rollout pending

This addendum records the earlier Cloudy V1.17 design for opt-in Resident feedback and the separate Superadmin review workspace. Cloudy V1.17 and additive platform V1.18 have since been applied to shared Neon; see the [V1.18 database evidence](10_operations/NEON_PLATFORM_V118_APPLY_20261029.md). No Superadmin account was provisioned by that upgrade. See [the change request](07_modules/superadmin/CLOUDY_UNRESOLVED_FEEDBACK_CHANGE_REQUEST.md). Existing Owner/Admin routes and their owner-scoped authorization remain unchanged.

### Resident opt-in and capture

| Method | Path | Role | Scope | Mutation | Contract |
|---|---|---|---|---|---|
| GET | `/me/assistant/feedback-preference` | Resident | Current account | No | Return whether the account opted in; do not reveal any captured-message history |
| PUT | `/me/assistant/feedback-preference` | Resident | Current account | Yes | Set `{ "enabled": true/false }`; authenticated + CSRF |

The chat route captures the message server-side only after the classifier returns `help` and the persisted opt-in is enabled. No separate client-submittable capture endpoint exists: the client cannot claim an intent or submit arbitrary text to the inbox. The response may say whether capture occurred, but never returns the global inbox or dedupe digest. If opt-in is disabled, retain no message text.

### Separate Superadmin platform routes

| Method | Path | Role | Scope | Mutation | Contract |
|---|---|---|---|---|---|
| GET | `/platform/cloudy/unresolved-feedback` | Superadmin | Platform inbox | No | Filter/paginate by status, intent and date; bounded sanitized text only |
| GET | `/platform/cloudy/unresolved-feedback/{feedback_id}` | Superadmin | Platform inbox | No | One sanitized entry and review metadata |
| PATCH | `/platform/cloudy/unresolved-feedback/{feedback_id}` | Superadmin | Platform inbox | Yes | Set status, curated intent label or evaluation-set version; append immutable reviewer/time audit; require current state/version to prevent lost updates |

Superadmin sessions use a distinct role. `requireSuperadmin` must protect only `/platform/*`; every existing Owner and Resident route continues to reject this role. Admin and Resident sessions must receive 403 on platform routes. Provisioning is invite-only to a verified email with a one-time token; invitee sets their own password. No self-signup, shared/default password, seed account, client role selection, or login bypass is allowed.

The platform UI may curate sanitized examples for versioned prompts/evaluation tests. It cannot fine-tune, deploy, or change a production model. Feedback and its review history are deleted 30 days after first capture; duplicate occurrences do not extend the deadline. No API permits export or bulk download.
