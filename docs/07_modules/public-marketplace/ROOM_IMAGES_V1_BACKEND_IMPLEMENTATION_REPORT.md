# Góc Trọ — Room Images V1 Backend + Storage Implementation Report

- Date: 2026-10-11
- Status: **Backend implementation complete; automated checks pass; PostgreSQL V1.4 runtime smoke not verified**
- Scope: Room Images backend, private local/development storage, Admin APIs, shared bulk attachment, public image-content delivery and tests.
- Authority: locked Database V1.4 report/schema/Prisma mapping and canonical Room Images API contract. No database or Prisma changes were made.

## 1. Executive summary

Implemented private local/development storage, detected-format and decode validation, Owner-scoped Admin gallery operations, shared bulk attachment with per-file outcomes, and association-specific public image delivery. Unsafe Admin methods use the existing V1 authentication, Owner context and CSRF middleware. Storage keys and local paths are absent from DTOs and errors.

The implementation is integrated with the locked V1.4 `RoomImage` Prisma model. The configured local `Goctro_test3` database was read-only checked and has 26 public tables with no `room_images` table, so it is V1.3 and was not modified. No backend listener was running. Consequently, no live database upload, 40001 race, or Admin login smoke is claimed. Application and HTTP behavior was verified with tests using mock repositories/storage.

## 2. Runtime/database baseline

- Locked source baseline: Database V1.4, PostgreSQL 18, 27 public tables; previous implementation report records schema/seed and 87/87 validator PASS.
- Current local environment: `Goctro_test3`, PostgreSQL listener on localhost:5432, 26 public tables, `room_images` absent; confirmed by read-only SELECT.
- Backend listener: none on port 4000; `/api/health` and `/api/health/db` did not respond.
- No local database writes, schema execution, migration, seed, or Prisma database commands were run.

## 3. Files changed

- `backend/src/room-images/storage.ts`
- `backend/src/room-images/validation.ts`
- `backend/src/room-images/room-image.repository.ts`
- `backend/src/room-images/room-image.service.ts`
- `backend/src/room-images/room-image.routes.ts`
- `backend/src/room-images/room-image.test.ts`
- `backend/src/room-images/room-image.repository.test.ts`
- `backend/src/room-images/room-image.routes.test.ts`
- `backend/src/auth/v1.router.ts`
- `backend/src/app.ts`
- `backend/package.json`, root `package-lock.json`
- `.gitignore`
- `docs/DOCUMENT_CATALOG.md`
- This report.

`database/schema.prisma`, Database V1.4 SQL, migrations, canonical Requirement/API Spec, frontend and other business modules were not changed.

## 4. Storage implementation

Added a provider-neutral `put/get/delete` boundary and a local adapter rooted at `backend/.local-storage/room-images/`, outside frontend public assets and not mounted as static content. Keys are generated as `room-images/{yyyy}/{uuid}.{ext}`; original file names are never used to resolve a path. The adapter validates the opaque-key format, resolves paths under its private root, writes with exclusive creation, removes incomplete writes best-effort, and returns bytes rather than paths. The storage directory is ignored by Git.

Production selects an explicit unconfigured adapter; upload/read fail with a safe `503 STORAGE_UNAVAILABLE`. No production filesystem or object-store readiness is claimed.

## 5. File validation

- Per-image limit is 5 MiB; multipart requests have bounded aggregate limits before parsing.
- JPEG, PNG and WebP signatures are checked against the declared MIME and optional file extension, then decoded with Sharp to reject malformed content.
- Empty files, SVG, GIF, HEIC, unknown/malformed data, mismatched MIME/extensions, path-like filenames, unexpected form fields and oversized input reject safely.
- The original filename is used only for validation and is not persisted or returned. Sharp is used for decoding only; no resize, compression or thumbnail is performed.

## 6. Admin APIs

Mounted under `/api/v1`:

- `GET /properties/{property_id}/rooms/{room_id}/images`
- `POST /properties/{property_id}/rooms/{room_id}/images`
- `PUT /properties/{property_id}/rooms/{room_id}/images/order`
- `PUT /properties/{property_id}/rooms/{room_id}/images/{image_id}/cover`
- `DELETE /properties/{property_id}/rooms/{room_id}/images/{image_id}`
- `GET /properties/{property_id}/rooms/{room_id}/images/{image_id}/content`

Owner is derived from the authenticated Admin session. Each repository query checks Owner → Property → Room → association scope; missing/foreign resources use the generic `404`. Lists sort by `(sort_order, room_image_id)`. Upload chooses first cover and next dense position inside a transaction after locking the Room. Reorder validates the exact permutation and assigns `1..N`. Cover selection is transactional and idempotent. Delete removes only the chosen association, compacts positions, promotes the lowest remaining association when needed and counts references before physical cleanup.

Database/Prisma serialization conflicts including SQLSTATE `40001` are mapped to a retryable `409 ROOM_IMAGE_RETRY_REQUIRED`; raw SQL details are not returned. The database max-five guard remains authoritative.

## 7. Bulk shared-image behavior

`POST /properties/{property_id}/rooms/images/bulk-attach` accepts one `room_ids` JSON array and up to five repeated `files` parts. It checks 1–100 distinct target IDs and verifies every Room is scoped to that Owner/Property and every gallery is empty before storing any file. Each selected file is validated and stored once. A transaction locks target Rooms in ascending order and adds one association per Room using the same key, order and independent cover state. Per-file transactions are atomic; an invalid file rolls back and cleans only its own object while other files continue. Outcomes use the contract's `room_ids` and `image_results` shape and do not disclose keys or filenames.

Tests cover a mixed success/failure/success sequence and one-key/multiple-association behavior using repository/storage fakes. Database atomicity under concurrent writes remains unverified against PostgreSQL V1.4 in this environment.

## 8. Public image delivery

`GET /api/v1/public/room-images/{image_id}` is unauthenticated. The repository resolves the selected association and checks on every request that its Room is public and active, effective status is available (no current active Contract or active occupancy), and its Property is active. A hidden/missing association returns generic `404`. A shared object is resolved through each RoomImage association, preserving per-Room visibility. Responses stream bytes with the detected `Content-Type`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`; there is no redirect or static path.

## 9. Public Room API integration status

Public Room list/detail routes are not implemented in the backend yet. Per task scope, no sales-funnel endpoints were added. `cover_image` and `images[]` serialization/wiring remain deferred to the Public Sales Funnel backend pass; no fake image rows are created.

## 10. Security and tenant scope

- Existing V1 auth, Admin role and CSRF middleware are reused.
- Client Owner, storage key, path, public URL and image metadata are not accepted as authority.
- Public reads revalidate the association's own Room each time, even when the physical key is shared.
- File bodies are capped per request and per image; logs omit bytes, keys, file paths and credentials.

## 11. Failure cleanup

- A failed single-image database association triggers best-effort physical cleanup.
- Each failed bulk-file transaction cleans that file's object and continues the next selected file.
- On final-reference deletion, metadata commits first; failed physical deletion returns `physical_cleanup_pending=true` and logs only an operational category. It does not restore the association.
- Durable orphan reconciliation, retry queue and monitoring are production debt.

## 12. Concurrency handling

The repository locks the parent Room for single association/order/cover/delete operations. Bulk locks all target Rooms in ascending ID order and takes a transaction-scoped advisory lock for the storage key. Delete takes the same key-scoped lock before deleting/counting. SQLSTATE `40001`/Prisma serialization failures map to a safe retryable conflict. Unit tests verify this mapping and five-image boundary decisions, but live concurrent fifth/sixth upload and final database count were not tested because the available Goctro_test3 database is V1.3 and there is no V1.4 backend runtime.

## 13. Automated tests

Room Images suite: **21 tests, PASS** (storage, binary/signature/full decode validation, multipart bounds, route auth/CSRF, Owner 404, DTO secrecy, upload/list/order/cover/delete/bulk/public content, transactional repository behavior, five-file bulk and 40001 mapping).

Regression suites:

| Suite | Result |
|---|---:|
| Auth | 20/20 PASS |
| Property/Room | 44/44 PASS |
| Resident/Occupancy | 49/49 PASS |
| Contract + document | 112/112 PASS |
| Invoice + Zalo | 36/36 PASS |

Total reported tests across these suites: 282 PASS, 0 failed.

Backend `typecheck` and `build` remain failed by existing legacy diagnostics in `backend/src/app.ts` (demo routes still reference removed Prisma legacy models/fields) and one existing `backend/src/residents/resident.test.ts` type mismatch. Filtering diagnostics showed no errors in `src/room-images`, its router mount, or new RoomImage wiring. No legacy code was changed in this pass.

## 14. Regression results

All requested regression suites passed. Contract and Invoice suites passed after V1 router/storage integration was touched. No frontend code was changed.

## 15. Runtime smoke

**Not run against V1.4.** Read-only checks found no local backend listener on port 4000 and confirmed `Goctro_test3` has 26 public tables and no `room_images`. That database was left unchanged. HTTP behavior was smoke-tested through the isolated test server in the route suite with mocked auth-backed repositories and storage; this does not substitute for PostgreSQL integration.

## 16. Known production debt

- Configure a private S3-compatible or equivalent production storage provider.
- Add durable orphan reconciliation/retries, operational monitoring and retention/backup policy.
- Run a PostgreSQL 18 integration/concurrency suite using a disposable Database V1.4 instance before accepting the module as runtime-verified.
- Wire public list/detail image fields in the Public Sales Funnel backend pass.
- Production request throttling and content-security operations need deployment-level review.

## 17. Definition of Done

| Requirement | Status |
|---|---|
| Local/dev private storage and safe keys | PASS (unit verified) |
| Signature, MIME, full decode and size validation | PASS (unit verified) |
| Owner-scoped Admin list/upload/order/cover/delete/content routes | PASS (HTTP tests with repository fake) |
| Shared bulk attach and partial results | PASS (service/API tests with repository fake) |
| Public association-specific eligibility query and byte delivery | PASS (route/query implementation; live DB not verified) |
| SQLSTATE 40001 safe handling | PASS (unit mapping; live conflict not exercised) |
| PostgreSQL V1.4 integration and concurrency runtime | DEFERRED — local DB is V1.3; no V1.4 listener/backend |
| Public Room list/detail `cover_image` / `images[]` | DEFERRED — Public Sales Funnel backend not present |
| Regression suites | PASS |
| Documentation updated | PASS |

## 18. Final status

Room Images backend and local/development storage code are implemented and all automated/mock-backed route and service checks pass. The module is **not marked runtime-verified or fully closed** until tested against a disposable PostgreSQL 18 Database V1.4 instance, including actual concurrent upload and cleanup behavior. Production storage remains unconfigured.

## 19. Recommended next task

Run Room Images PostgreSQL 18 integration and concurrency smoke against a disposable Database V1.4 database, then implement the Public Sales Funnel backend list/detail/contact routes and wire its safe `cover_image`/`images[]` serializers.
