# Room Images V1.4 Runtime Verification Report

**Date:** 2026-10-11  
**Status:** `ROOM IMAGES BACKEND — RUNTIME VERIFIED FOR LOCAL/DEV V1.4`  
**Scope:** PostgreSQL 18 runtime verification of the Room Images backend, HTTP routes, Auth/CSRF, and local development storage. This does not implement the public marketplace Room list/detail/contact funnel.

## 1. Executive summary

The V1.4 clean install, seed and database validator passed. The backend was exercised over real HTTP against that database, with real generated image bytes and the local filesystem. Gallery CRUD, shared bulk attachment/reference cleanup, visibility checks, Owner isolation, the five-image race and SQLSTATE `40001` handling all passed.

Runtime verification exposed two repository issues. Prisma rejected the gallery's combined ordering input, and Prisma could not deserialize the `void` result returned by the advisory-lock query. Both were fixed in `backend/src/room-images/room-image.repository.ts`; the complete runtime smoke then passed **50/50**.

## 2. Sources reviewed

- `docs/DOCUMENTATION_RULES.md`
- `docs/07_modules/public-marketplace/ROOM_IMAGES_V1_SCHEMA_MIGRATION_DESIGN.md`
- `docs/07_modules/public-marketplace/DATABASE_V1_4_ROOM_IMAGES_MIGRATION_REPORT.md`
- `docs/07_modules/public-marketplace/ROOM_IMAGES_V1_BACKEND_IMPLEMENTATION_REPORT.md`
- Canonical Requirement and API Spec in the adjacent `GocTro-SmartBuilding` project
- `Database V1.4/schema.sql`, `seed.sql`, and `runtime_validator.sql`
- `database/schema.prisma`, current Room Images routes/repository/service/storage/tests, and Auth/session/CSRF startup code

## 3. Disposable database setup

Created a fresh PostgreSQL 18 cluster and database for this verification only:

| Setting | Result |
|---|---|
| PostgreSQL | 18.6 |
| Host/port | `127.0.0.1:55432` |
| Database | `goctro_room_images_v14_smoke_20261011` |
| Public base tables | 27 |
| `schema.sql` | PASS |
| `seed.sql` | PASS |
| `runtime_validator.sql` | **87/87 PASS** |

The validator's temporary records were rolled back. The smoke database, cluster, Admin credentials, test property/rooms, storage files, and temporary harness/logs were removed after verification. No connection was made to `localhost:5432/Goctro_test3`.

## 4. Backend runtime configuration

Started the existing backend dev command on port `4400` with process-only environment overrides pointing to the disposable database. `backend/.env` was not changed. `NODE_ENV=development` selected the local filesystem adapter and in-memory development session store. No production configuration was changed.

- `GET /api/health` — 200
- `GET /api/health/db` — 200 against the disposable V1.4 database
- `GET /api/v1/properties` after login — 200, confirming V1 routes were mounted

## 5. Auth and CSRF

Used the two synthetic seed Admin/Owner identities. Their disposable database password hashes were provisioned with the backend's scrypt format; no plaintext password was stored. For each Owner:

- `GET /api/v1/auth/csrf` — 200 and CSRF cookie/token returned
- `POST /api/v1/auth/login` — 200 and `gt_session` issued
- `GET /api/v1/auth/me` — 200 with Admin role and correct Owner context

Unsafe Room Image and fixture-management requests carried the authenticated session, matching CSRF cookie/header, and allowed Origin.

## 6. Smoke Property and Rooms

Created one disposable Property and three Rooms through the authenticated Property/Room API: `DEV-SMOKE-IMG-A01`, `A02`, and `A03`. No Room IDs or Owner IDs were hardcoded into the application.

## 7. Single uploads and gallery list

Generated valid PNG, JPEG, and WebP fixtures locally with Sharp. All three real multipart uploads returned 201. The first image became cover; the list returned stable order and only the safe DTO fields:

`image_id`, `url`, `is_cover`, `sort_order`, `created_at`

No `storage_key` was returned. Admin content delivery returned the exact uploaded bytes, correct content type, and `X-Content-Type-Options: nosniff`.

## 8. Five-image limit

Uploaded five associations into A01. The sixth returned `409 ROOM_IMAGE_LIMIT_REACHED`; the DB count stayed at five and the failed upload left no physical file.

## 9. Cover, reorder, and delete

- Set-cover returned 200; repeating it was idempotent and left exactly one cover.
- Reordering returned the requested order with dense positions 1–5.
- Missing-ID and duplicate-ID permutations returned 400 without changing the gallery.
- Deleting a non-cover compacted positions and removed its final-reference file.
- Deleting the cover promoted the next ordered image deterministically.
- Deleting the remaining gallery left zero rows and no cover.

## 10. Invalid image inputs

Malformed JPEG and SVG returned 422; an image exceeding 5 MiB returned 413. None created DB associations or storage files.

## 11. Shared bulk attach and partial failure

Bulk-attached three valid images to A02 and A03, plus one invalid SVG. The response retained the valid results and reported `INVALID_IMAGE` for the failed file. The DB contained six associations across three shared keys, with independent RoomImage IDs and per-Room covers. The filesystem contained exactly three physical objects. The failed file created no association or orphan.

## 12. Independent edits and shared reference cleanup

Deleting one shared association from A02 kept A03's association and the physical object. A03 cover/reorder edits did not change A02. Deleting the last association for the shared key reduced its DB reference count to zero and deleted the object; `physical_cleanup_pending` was false.

The optional runtime fault injection for a deliberately failing physical delete was not forced. The Room Images automated suite covers that adapter failure and its cleanup-pending response.

## 13. Public image delivery

Anonymous `GET /api/v1/public/room-images/{image_id}` returned 200 with the matching bytes/content type, `nosniff`, and `Cache-Control: private, no-store`. The API response did not disclose the storage key.

## 14. Public visibility rechecks

The same image URL returned 404 when the Room was private, inactive, occupied, or its Property was paused. It returned 200 after each state was restored. Occupancy was created and ended through the authenticated Resident/Occupancy API lifecycle.

## 15. Shared-object visibility

A02 and A03 referenced the same physical key through different RoomImage rows. With A02 private and A03 public/available, the A02 image ID returned 404 while the A03 image ID returned 200. This required behavior passed.

## 16. Real five-image concurrency

Started with exactly four A01 images and issued two concurrent real HTTP upload requests against the V1.4 database. One returned 201 and one returned `409 ROOM_IMAGE_LIMIT_REACHED`; the final gallery count was five. The failed upload's object was cleaned up, with no raw database error exposed.

## 17. SQLSTATE `40001` mapping

Held the same PostgreSQL transaction advisory lock used by the Room Images insert guard, then made a real upload request. PostgreSQL produced the serialization conflict; the backend returned `409 ROOM_IMAGE_RETRY_REQUIRED`, with no SQLSTATE, stack trace, or Prisma details in the response. The failed upload file was cleaned and the gallery remained at four rows.

## 18. Owner isolation

Authenticated Owner 2 attempted to list, upload, reorder, set cover, delete, and read Owner 1's image content. All six requests returned the same generic 404 behavior.

## 19. Storage inspection

Image objects were written under the private backend-local storage directory (`backend/.local-storage/room-images`), outside `frontend/public`. DB keys matched the neutral generated form `room-images/{year}/{uuid}.{jpg|png|webp}`; they contained no absolute path or original filename. There was no public static-file route bypass. Final smoke cleanup verified zero test association rows and zero test image files.

## 20. Database inspection

Direct queries during the smoke confirmed at most five rows per Room, exactly one cover for each non-empty gallery, dense 1-based ordering, shared keys across Rooms with distinct association IDs, and no keys outside the generated neutral format. Same-Room duplicate keys, second covers, and sixth rows were also rejected by the clean-install V1.4 runtime validator.

## 21. Automated regression suites

All requested suites passed after the repository fixes:

| Suite | Result |
|---|---:|
| Room Images | 21/21 |
| Auth | 20/20 |
| Property/Room | 44/44 |
| Resident/Occupancy | 49/49 |
| Contract | 112/112 |
| Invoice/Zalo | 36/36 |
| **Total** | **282/282** |

## 22. Typecheck, build, and production debt

`npm run typecheck --workspace=@goctro/backend` and `npm run build --workspace=@goctro/backend` both remain blocked by **174 existing legacy diagnostics**, concentrated in `backend/src/app.ts` and `backend/src/residents/resident.test.ts`. There were **zero Room Images or V1 router diagnostics** in either run. No unrelated legacy code was changed.

Production still needs a configured durable object-storage adapter and operational orphan reconciliation. This verification covers the local/dev filesystem adapter only; it does not claim production storage readiness.

## 23. Definition of Done

- [x] Fresh disposable PostgreSQL 18 V1.4 database; schema and seed pass; 27 public tables
- [x] Locked runtime validator passes 87/87
- [x] Backend health, DB health, Auth, CSRF, session, and Owner context pass
- [x] Single upload/list/content, five-image cap, cover/reorder/delete pass
- [x] Shared bulk attach, partial failure, independent edits, and final-reference cleanup pass
- [x] Public delivery, all visibility rechecks, and shared-object visibility pass
- [x] Real concurrent cap and real SQLSTATE 40001 API mapping pass
- [x] Owner isolation and storage/database inspections pass
- [x] Regression suites pass 282/282
- [x] Typecheck/build run; legacy failures recorded; no new Room Images diagnostics
- [x] Disposable DB, cluster, credentials, storage objects, and harness cleaned up
- [x] `Goctro_test3`, Database V1.4 source files, Prisma, frontend, and other business domains were not modified in this pass

## 24. Final closure decision

**ROOM IMAGES BACKEND — ✅ RUNTIME VERIFIED FOR LOCAL/DEV V1.4.** All mandatory database/runtime/concurrency/security checks passed. The pre-existing backend typecheck/build failures and production object-storage work remain documented limitations; neither produced a Room Images diagnostic during this pass.

## 25. Recommended next task

**Property/Room Room-Images Impact Audit + Frontend Integration.** After that, continue with the Public Sales Funnel backend/frontend work.
