# Góc Trọ — Room Images V1 Schema & Migration Design

**Ngày:** 11/10/2026  
**Trạng thái:** `DESIGN PROPOSED / IMPLEMENTATION PENDING`  
**Database baseline:** V1.3 remains current LOCK baseline (26 public tables). This design proposes the next additive baseline, Database V1.4; it does not alter V1.3.  
**Phạm vi:** RoomImage schema, migration, API/storage contract, Admin/Public UI plan and validation plan. No migration or product code was executed.

## 1. Final decision

Use a dedicated `room_images` association with `rooms 1:N room_images`. A Room may have zero through five associations. A non-empty gallery has exactly one cover per Room. Multiple rows for different Rooms may reference the same opaque storage key; expose image bytes through routes that validate the RoomImage association's Owner scope or current public Room visibility on every read.

Use **5 images per Room** as the V1 hard limit. It supports a cover plus a small set of useful room angles while limiting storage and upload abuse. No current codebase constraint justifies increasing it to eight. The limit is enforced by the backend while locking the Room row and by a database trigger that checks the resulting per-Room count; the migration adds no duplicated counter column.

The first successfully attached image becomes cover. Setting another cover is atomic. Deleting the cover promotes the remaining image with lowest `(sort_order, room_image_id)`. `sort_order` starts at 1 and ties resolve by `room_image_id ASC`.

### SHARED GALLERY / CREATE + BULK CREATE REVISION

**Status:** Approved business decision; design-only revision. Database V1.3 stays the current LOCK baseline. The earlier assumption that `storage_key` is globally unique is **SUPERSEDED** by this revision.

`RoomImage` is a per-Room association, while `storage_key` identifies the physical object. A shared physical object has one association row per Room, and each Room independently owns its cover/order/delete behavior. Keep only `room_images` for V1; a separate `media_assets` table is not needed because upload keys are server-generated, immutable, never accepted from clients, and shared only as part of one bulk attach orchestration. The exact uniqueness rule is `UNIQUE (room_id, storage_key)`; add an index on `storage_key` for reference-count checks.

Use neutral keys such as `room-images/{yyyy}/{uuid}.{ext}`. Do not embed a Room ID or Owner ID in the key. Public and Admin resources use `room_image_id`, which identifies an association; they never expose `storage_key`.

**Single Room creation:** the create form may select 0–5 images in the same UX. Submit the existing JSON Room-create request first, then upload each selected file to the created Room. The first successful image becomes that Room's cover. If some uploads fail, keep the Room and successful images; report each failed file in the UI with retry guidance. Do not roll back the Room.

**Bulk Room creation:** preserve the current frontend orchestration that creates Rooms individually and records successful Room IDs. Afterward, submit selected files once to the shared attach endpoint with only successful IDs. Validate/store each physical file once, then create a separate `RoomImage` row for every successful Room using the same key. Initialize the same order and cover flag in every target Room. A file's associations across the submitted Rooms are atomic as a group; a failed file does not prevent other selected files from attaching. Rooms whose create call failed receive no image rows. Five files shared by ten successful Rooms produce 50 rows and five physical objects.

Per-Room edits remain independent. Removing an image deletes only that RoomImage row; other Rooms keep their rows. Private uploads generate a new key used by only that Room. Cover changes, reorder and promotion are always scoped to the one Room. A shared object is physically deleted only after a serialized reference-count check confirms zero remaining rows.

**Delete/reference-count safety:** all association writes/removals for a key take a transaction-scoped PostgreSQL advisory lock derived from the opaque key; bulk writes also lock target Room rows in ascending ID order. Bulk attachment writes all RoomImage rows for one file in one DB transaction. The supported API never accepts a prior key for reattachment, so a last-reference cleanup cannot race a client-driven reattach; future internal flows that reuse a key must hold a key-scoped lock across the final count and physical delete, or add a durable asset/cleanup record before enabling that flow. Concurrent removals of associations for one key serialize, count after deleting the target association, and schedule physical deletion only at zero. Because no supported operation can reattach the old key, post-commit cleanup cannot race a V1 attachment. If object deletion fails, keep metadata deleted and retry orphan reconciliation; no remaining row may point to a missing object.

The design remains `IMPLEMENTATION PENDING`; no migration or product code was run in this revision.

## 2. Source audit

Reviewed `docs/DOCUMENTATION_RULES.md`, canonical Requirement/API Spec, `database/schema.prisma`, Database V1.3 schema/ERD/seed/changelog, Property/Room route/repository, public sales funnel audit and homepage, plus current Contract document storage boundary.

- Current physical database is V1.3 LOCK with 26 public tables. `rooms` has no image column and there is no `room_images` table. Existing `rooms` rows need no backfill.
- Prisma `Room` has `is_public`, `is_active`, `status`, `public_description`, rent, area and capacity; it has relations to Contracts, occupancy and Property amenities but none for images.
- Admin Room API is Owner-scoped at Property/Room level and Room removal is deactivation, not hard delete. Repository computes availability from current active Contract or active occupancy.
- Current Room page creates Rooms one by one in a sequential frontend loop, collecting success/failure per room code; there is no backend bulk-create endpoint. Keep this orchestration and pass only successful Room IDs to the future shared-image endpoint.
- Current single-create `save()` and bulk `saveBulk()` call `roomApi.create()` without image selection or upload; the picker/upload integration described here is future work, not present behavior.
- Current public homepage/legacy endpoints do not support authoritative room image data; `.room-art` is placeholder art. Public sales funnel audit is `CURRENT`, and already records the no-image gap.
- Contract documents define a storage interface with staging/read-url operations; runtime wires `UnconfiguredObjectStorage`. There is a test fake, but no configured local filesystem or production object-storage adapter for uploads. No room-image upload route, multipart handler, or image-serving route exists.
- V1.3 Database changelog says schema changes require a new version and runtime validation; do not edit the locked V1.3 artifacts in place.

## 3. Proposed schema

| Column | Type | Null/default | Purpose |
|---|---|---|---|
| `room_image_id` | `bigint` identity PK | required | Public/admin opaque resource identifier, serialized as decimal string |
| `room_id` | `bigint` FK | required | Parent Room |
| `storage_key` | `varchar(512)` | required, nonblank | Server-generated opaque physical-object key; may repeat across Rooms, never sent to clients |
| `is_cover` | `boolean` | required, default `false` | Cover selection |
| `sort_order` | `integer` | required, default `1`, `>= 1` | Gallery order |
| `created_at` | `timestamptz` | required, `now()` | Record creation time |

Do not add `public_url`: URL is derived from an API route. Do not store original filename, absolute path, file bytes, or duplicated content type/size for V1; the generated key extension represents the already-validated type, and the upload stream enforces the byte limit. No `updated_at` is needed because image metadata has no general edit operation; reorder/cover changes are the only metadata mutations and do not require an audit timestamp in current Requirement.

### Migration SQL draft (design only; not executed)

Target migration: `Database V1.4/migrations/V1_3_to_V1_4.sql`, additive to V1.3. Preserve all existing rows and constraints.

```sql
BEGIN;

CREATE TABLE room_images (
    room_image_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id       bigint NOT NULL
                  REFERENCES rooms(room_id) ON DELETE RESTRICT,
    storage_key   varchar(512) NOT NULL,
    is_cover      boolean NOT NULL DEFAULT false,
    sort_order    integer NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_images_storage_key_not_blank CHECK (length(btrim(storage_key)) > 0),
    CONSTRAINT room_images_room_storage_key_key UNIQUE (room_id, storage_key)
);

CREATE INDEX room_images_by_room_order
    ON room_images(room_id, sort_order, room_image_id);

CREATE INDEX room_images_by_storage_key
    ON room_images(storage_key);

CREATE UNIQUE INDEX room_images_one_cover_per_room
    ON room_images(room_id) WHERE is_cover;

-- Serialize writes per Room, then validate the final count after each INSERT
-- statement. This catches a multi-row SQL insert as well as concurrent uploads.
CREATE FUNCTION lock_room_for_image_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM rooms WHERE room_id = NEW.room_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room does not exist' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER room_images_lock_parent_before_insert
    BEFORE INSERT ON room_images
    FOR EACH ROW EXECUTE FUNCTION lock_room_for_image_insert();

CREATE FUNCTION prevent_room_image_reparent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.room_id <> OLD.room_id OR NEW.storage_key <> OLD.storage_key THEN
        RAISE EXCEPTION 'Room image parent and physical object are immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'room_images_identity_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER room_images_identity_immutable
    BEFORE UPDATE OF room_id, storage_key ON room_images
    FOR EACH ROW EXECUTE FUNCTION prevent_room_image_reparent();

CREATE FUNCTION enforce_room_image_limit_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected_room_id bigint;
    image_count integer;
BEGIN
    FOR affected_room_id IN
        SELECT DISTINCT room_id FROM inserted_room_images ORDER BY room_id
    LOOP
        SELECT count(*) INTO image_count
        FROM room_images WHERE room_id = affected_room_id;
        IF image_count > 5 THEN
            RAISE EXCEPTION 'A Room can have at most 5 images'
                USING ERRCODE = '23514', CONSTRAINT = 'room_images_max_5_per_room';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE TRIGGER room_images_max_5_after_insert
    AFTER INSERT ON room_images
    REFERENCING NEW TABLE AS inserted_room_images
    FOR EACH STATEMENT EXECUTE FUNCTION enforce_room_image_limit_after_insert();

COMMIT;
```

The BEFORE INSERT trigger serializes writers on the parent Room row. The statement trigger checks the committed-plus-current row count after all rows in the statement are visible, so multi-row inserts cannot bypass the cap. Backend upload still checks the count under the same Room lock to return a clear `409` before relying on the database guard. SQLSTATE `23514` is the database cap/positive-order check; partial unique violation protects cover uniqueness. PostgreSQL 18 runtime tests are required before locking this design.

Do not add an `ON DELETE CASCADE`. Normal Room lifecycle is deactivate/archive and retains history; current API does not hard-delete Rooms. `RESTRICT` prevents an accidental Room hard delete from silently removing image metadata and leaving untracked blobs. An explicit future retention/purge workflow must delete image metadata and objects intentionally.

## 4. Relationship and Prisma design

```text
Room 1 ─── 0..5 RoomImage
RoomImage.room_id → Room.room_id
```

Proposed Prisma mapping (not applied):

```prisma
model Room {
  // existing fields/relations remain as-is
  images RoomImage[]
}

model RoomImage {
  roomImageId BigInt   @id @default(autoincrement()) @map("room_image_id")
  roomId      BigInt   @map("room_id")
  storageKey  String   @map("storage_key") @db.VarChar(512)
  isCover     Boolean  @default(false) @map("is_cover")
  sortOrder   Int      @default(1) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  room        Room     @relation(fields: [roomId], references: [roomId], onDelete: Restrict)

  @@unique([roomId, storageKey], map: "room_images_room_storage_key_key")
  @@index([roomId, sortOrder, roomImageId], map: "room_images_by_room_order")
  @@index([storageKey], map: "room_images_by_storage_key")
  @@map("room_images")
}
```

Prisma cannot express the partial unique index or the statement trigger/checks as full model constraints. Keep those in migration SQL and document them as database-enforced rules. Do not add `room_images` to current `schema.prisma` until V1.4 implementation is approved and migrated.

## 5. Relationship invariants

- Room may have 0–5 images.
- `room_images.room_id` is required and FK-restricted. The same storage key may appear in different Rooms; `UNIQUE (room_id, storage_key)` prevents a duplicate association within one Room.
- An image cannot be reassigned to another Room after creation; the database trigger rejects `room_id` changes.
- At most one cover is guaranteed by PostgreSQL partial unique index.
- Every non-empty Room image set has one cover: first successful attachment sets cover; deleting cover promotes smallest `(sort_order, room_image_id)`; cover change is transactional. Service logic enforces this lower-bound invariant; the partial unique index handles concurrent attempts at a second cover.
- The Room parent row is locked for upload, set-cover, reorder and delete metadata operations. Backend validates Property and Room ownership before file/metadata operations.
- `sort_order >= 1`; query order is `sort_order ASC, room_image_id ASC`. Reorder must include all IDs exactly once and writes 1..N. Do not add a `(room_id, sort_order)` unique constraint; deterministic ID tie-breaker avoids transient uniqueness conflicts during reorder.

## 6. Image limit and file validation

Hard limit: **5 RoomImage associations per Room**. A normal per-Room multipart request uploads one image; the shared bulk-attach request accepts up to five files and attaches each to multiple target Rooms. Both API/service and DB statement trigger enforce capacity for every Room. Do not offer configurable or unlimited count in V1.

Allowed detected formats:

- JPEG (`image/jpeg`, `.jpg`)
- PNG (`image/png`, `.png`)
- WebP (`image/webp`, `.webp`)

Maximum is **5 MiB per image**. Validate request byte count while streaming; do not trust `Content-Length`. Verify file signatures/magic bytes, not only browser MIME or filename. Reject SVG (active content), GIF, HEIC (no conversion pipeline), malformed/unknown signatures, empty files, and oversized files. Ignore original filename for keys and response. Server generates UUID and extension only after MIME/signature agreement. Normalize/validate generated key; no `..`, absolute paths, backslashes or client path components. Serve with explicit validated `Content-Type`, `X-Content-Type-Options: nosniff`, and no inline HTML/SVG content.

## 7. Storage strategy

Two layers:

1. **Local/dev:** backend-managed private directory, e.g. `backend/.local-storage/room-images/`. Keep outside frontend `public/`, do not mount with `express.static`, and add it to local ignore rules in the implementation task. Use adapter operations `put(storage_key, bytes, content_type)`, `get(storage_key)`, `delete(storage_key)`.
2. **Production:** provider-neutral adapter backed by a selected S3-compatible/object-storage provider. Bucket, credentials, encryption, lifecycle, backups and retention are deployment configuration, not values in PostgreSQL.

PostgreSQL stores only a neutral `storage_key` of form `room-images/{yyyy}/{uuid}.{ext}`. No Room/Owner ID, absolute Windows path, or original filename is stored. Each `room_image_id` has its own URL even when several association rows resolve to one physical object. Public URL is derived by backend as `/api/v1/public/room-images/{image_id}`. Admin URL is the scoped content path from §8. Avoid direct public bucket/static URLs: every image read rechecks visibility for the association's parent Room, so making one Room private/inactive/occupied/Property inactive hides that association without affecting another eligible Room's association to the same object. This is a proxy read, not an expiring signed URL that survives visibility changes.

Current Contract document storage is only an interface (`stage`, `createReadUrl`) with `UnconfiguredObjectStorage` wired in runtime and a test fake. It is not a usable RoomImage local adapter. Reuse the boundary concepts, not the Contract document semantics; add a RoomImage-specific adapter or safely generalize storage in the implementation pass.

## 8. Admin API contract

All APIs require Admin session + CSRF for unsafe methods. Owner is derived from session. Verify Property belongs to Owner, Room belongs to Property, and Image belongs to Room. Return the same generic 404 for foreign/missing resources. Do not accept Owner ID from the client.

| Method | Route | Contract |
|---|---|---|
| GET | `/api/v1/properties/{property_id}/rooms/{room_id}/images` | Unpaginated ordered list, `{data:[...]}` |
| POST | same `/images` | Multipart `file`; one image; `201` and created resource |
| POST | `/api/v1/properties/{property_id}/rooms/images/bulk-attach` | Multipart `room_ids` JSON array plus up to five repeated `files`; one object per file, associations for all successful Room IDs |
| PUT | same `/images/order` | JSON `{ "image_ids": ["801", "802"] }`; exact permutation of current images |
| PUT | same `/images/{image_id}/cover` | Empty body; atomically set only cover |
| GET | same `/images/{image_id}/content` | Authenticated image bytes after scope check |
| DELETE | same `/images/{image_id}` | Delete this RoomImage association + promote local cover; delete object only at zero references |

Admin JSON image resource:

```json
{
  "image_id": "801",
  "url": "/api/v1/properties/12/rooms/201/images/801/content",
  "is_cover": true,
  "sort_order": 1,
  "created_at": "2026-10-11T04:00:00Z"
}
```

The list is unpaginated because the hard maximum is five. IDs are decimal strings; all request/response keys use snake_case. Per-Room upload accepts exactly one `file`; bulk attach accepts distinct, in-scope `room_ids` whose galleries are empty and up to five `files`. Validate all target Room scope before storing. For each file, store once and insert associations for every target Room atomically; use the first successful file as cover in every Room and dense order across targets. A per-file failure is returned in `image_results` and does not undo Rooms or other successful files. More than five files, empty/duplicate Room IDs and unexpected multipart fields are rejected. No raw storage key is part of request/response data. Limit conditions return `409 ROOM_IMAGE_LIMIT_REACHED`; content/size validation returns `422 VALIDATION_ERROR`/`413`; missing/foreign image returns generic `404`.

Reorder returns `200 { "data": [...] }` with the refreshed ordered resources. Set-cover returns `200 { "data": <selected image> }`; selecting the current cover again is idempotent. Delete returns `200 { "data": { "deleted_image_id": "801", "promoted_cover_image_id": "802", "physical_cleanup_pending": false } }`, where the promoted ID is `null` when no images remain and the cleanup flag reports retryable physical deletion debt. Content GET streams bytes with validated `Content-Type`, `X-Content-Type-Options: nosniff` and private/no-store cache headers.

Create Room and upload are separate operations: create Room first, then upload images. No multipart image data is included in Room create/update transaction. Single create UI chains existing JSON `POST /rooms` then one upload request per selected file; partial image failures leave Room and successful images intact and are shown individually. Bulk UI keeps the current sequential `POST /rooms` orchestration, then calls bulk attach once with successful Room IDs and selected files. A file's associations are all-or-none across its target Rooms; failed Room create IDs are excluded and partial image failures do not roll back any Room.

## 9. Public API shape

- Public list exposes one `cover_image`, or `null` when no image exists:

```json
{ "image_id": "801", "url": "/api/v1/public/room-images/801" }
```

- Public detail exposes the gallery ordered by `(sort_order ASC, room_image_id ASC)`:

```json
{
  "images": [
    { "image_id": "801", "url": "/api/v1/public/room-images/801", "is_cover": true, "sort_order": 1 },
    { "image_id": "802", "url": "/api/v1/public/room-images/802", "is_cover": false, "sort_order": 2 }
  ]
}
```

When there are no images, return `cover_image: null` in list and `images: []` in detail. Never expose storage key, filesystem path, original filename, Owner ID, local directory, provider bucket, or internal checksum. For each metadata response, images are present only if parent Room is public, active, available and Property is active. Each image-content GET repeats this check; hidden Room returns generic 404 and no bytes.

## 10. Admin UI plan

Add an optional picker (0–5 files) to the single Room create form and the existing bulk-create form. Single create saves Room first, then uploads selected files in selection order and reports per-file results without undoing Room creation. Bulk create keeps the existing sequential Room creation flow, sends only successful Room IDs plus the selected files once, and reports each image's result; if no Room succeeds, skip image upload. After creation, add a “Hình ảnh phòng” section to Room detail/edit with ordered thumbnails, a clear per-Room cover badge, upload button/count feedback, set-cover action, simple up/down reorder, and delete confirmation. One Room's edits only change its RoomImage rows. Disable duplicate submissions while pending; show per-file validation errors and retryable storage errors. Never display `storage_key` or original path. If Room has no images, show a branded placeholder and explain it is not a stored image.

## 11. Public UI plan

- Listing cards use the cover URL when present; otherwise show Góc Trọ branded illustration/placeholder that is not persisted as a RoomImage.
- Public detail displays cover and thumbnail gallery, with explicit no-image placeholder state.
- Do not substitute stock room photography. Broken image URL falls back to branded placeholder and does not hide textual listing details.
- Both image metadata and image GET must follow current public visibility; client cache should not retain image bytes beyond normal browser caching policy. Set conservative cache headers (`private/no-store` for admin; short public cache or no-store until invalidation strategy exists).

## 12. Security and visibility

- Admin operations resolve Owner from session and validate the full Property → Room → Image chain.
- Public metadata only comes from eligible Rooms. Public byte route rechecks eligibility for each request, closing the direct-URL-after-unpublish gap.
- Storage keys are random and non-authoritative; IDs are never credentials. No public list endpoint returns hidden Room or image metadata.
- Stream caps, MIME/signature checks, random names, path normalization, parser limits, rate limiting and PII-safe operational logs are required.
- Local file storage is outside web root and not served statically. Production bucket must be private; public reads pass through app authorization/visibility handler.

## 13. File lifecycle

| Event | Metadata | Physical object |
|---|---|---|
| Single upload succeeds | Insert one `room_images` association | Put one object first; cleanup if DB insert fails |
| Shared bulk upload succeeds | Insert one association per successful Room, all with the same key | Put each selected object once; never copy bytes per Room |
| Room deactivated/archived | Preserve rows | Preserve files; public list/content route hides them |
| Remove image from one Room | Delete only that Room's row and promote its cover atomically | Keep object while any row has the key; delete only at zero references |
| Room hard delete | Normally unsupported; FK `RESTRICT` blocks while images exist | Never implicitly cascade-delete files |
| Object missing during read | Metadata remains; report storage error safely | Return 503/404 policy without exposing key/path; alert/reconcile |

Logical association deletion is authoritative. Serialize association deletion/count checks by key, remove only the selected RoomImage row, and schedule object cleanup only after the committed reference count is zero. Since V1 never accepts a client-supplied key or reattaches a previously issued key, cleanup cannot race a supported new attachment; each bulk request commits all its rows for one object atomically before exposing association IDs. If cleanup fails, log a safe event and retry object-store reconciliation. Any future API that reuses an existing object key must hold a key-scoped lock through the final count and physical delete (or add a durable asset/cleanup record) before it is enabled. Avoid holding a DB transaction open during remote object-store writes.

## 14. Failure consistency

**Single upload:** validate stream and size → store one object under a generated neutral key → begin DB transaction → lock parent Room row → verify scope/state and count < 5 → choose `sort_order=max+1` and set `is_cover=true` if no cover → insert row → commit. If any DB step fails, delete the unreferenced object; if cleanup fails, record orphan diagnostic.

**Shared bulk attachment:** prevalidate the distinct Owner-scoped Room IDs under the requested Property and require empty galleries (the route is for the just-created bulk Room set). Process files independently. For each selected file, validate/store bytes once, generate one key, then begin a DB transaction, take a key-scoped advisory lock, lock all target Room rows in ascending ID order, recheck scope and capacity for every target, and insert one association per target Room. Successful files receive identical dense order across targets; the first successful file is cover in every target Room, even when earlier selected files failed. Commit all rows for that file together. If that file fails, roll back its association group, clean up its now-unreferenced object, report its file index as failed and continue with remaining files. Rooms successfully created earlier remain. Never return the key to the client.

**Set cover:** verify Owner/Property/Room/Image, lock Room row, clear existing cover and set selected image in one DB transaction; partial unique index remains the final concurrency guard.

**Reorder:** validate exact ID permutation, lock Room, update all `sort_order` values in one transaction. Stable ID tie-break keeps reads deterministic while updates happen.

**Delete:** verify scope, take the key-scoped advisory lock, lock the Room row, delete only its association and promote that Room's deterministic next cover in one transaction; count remaining rows for the key in that transaction. Delete bytes only when the committed count is zero; otherwise retain them. Concurrent removals serialize on the key so only the final removal schedules cleanup. Object deletion failure is cleanup debt, not a reason to restore the externally visible association.

## 15. Migration design

Use an additive `Database V1.3 → V1.4` migration, tentatively `Database V1.4/migrations/V1_3_to_V1_4.sql`, after the new design/change is approved. The SQL draft in §3 defines table, FK, nonblank check, composite `UNIQUE (room_id, storage_key)`, lookup/order indexes, partial unique cover index, immutable association identity and max-five trigger. Update ERD, clean-install schema, Prisma, seed (optional zero or representative RoomImage records only if the seed adds valid binary storage fixtures; otherwise leave seed image-free), migration validator and changelog in that future implementation task.

Do not mutate Database V1.3 locked schema or run this SQL in the design pass. Require PostgreSQL 18 clean-install and populated V1.3 migration validation before V1.4 can become the current locked baseline.

## 16. Prisma impact

Add `Room.images RoomImage[]` and a `RoomImage` model mapped to `room_images`; IDs use `BigInt`, public JSON IDs serialize as decimal strings, `storageKey` stays internal, and relation uses `onDelete: Restrict`. Prisma models FK, `@@unique([roomId, storageKey])` and the `storageKey` lookup index. Partial unique cover index, positive sort check, immutable identity and max-count trigger remain SQL-enforced because Prisma cannot represent them fully. No current Prisma file was edited or generated.

## 17. Existing-data impact

No backfill is required. Existing Rooms start with zero image rows; there are no fake/default/stock RoomImage rows. Migration is additive and leaves existing Room IDs/data unchanged. Rollback after files have been uploaded is not a simple table drop; production migration rollback must first block uploads and inventory/remove stored objects or preserve table/data for forward recovery.

## 18. Requirement changes

Updated only the Property/Room image paragraph in canonical `docs/01_REQUIREMENTS.md`: Admin can select up to five images in single/bulk Room creation, shared images apply to successfully created Rooms, and galleries can later diverge independently. The existing Public cover/gallery requirement was not changed. Current Database V1.3 still lacks support; image requirement is pending the next database version.

## 19. API Spec changes

Updated only image-related content-type, public image response/delivery wording in §5.3, and the proposed Room Images API subsection under Property/Room in canonical `docs/04_API_SPEC.md`. The subsection defines single-create follow-up uploads, shared bulk attachment to successful Room IDs, per-file partial failure, and per-Room management. Other endpoints and business contracts were not changed. All image API behavior remains `IMPLEMENTATION PENDING` and requires Database V1.4; no runtime support is claimed.

## 20. Test plan

**Schema/migration (PostgreSQL 18):** clean install and populated V1.3 upgrade; FK rejects missing Room; `ON DELETE RESTRICT`; same `(room_id, storage_key)` rejected while the same key across Rooms succeeds; blank key and sort order below 1 rejected; second cover same Room rejected but covers in different Rooms allowed; sixth association rejected; concurrent inserts across five slots cannot exceed five; migration preserves existing Room data/counts and inserts no fake image rows.

**Backend:** single create with 0, 1 and 5 images; partial image failure leaves Room and successful associations intact and reports each failed file. Bulk create shares each physical upload once across all successful Room IDs; failed Rooms get no rows; each image's association group is atomic; partial file failure leaves other files successful; first successful file is cover in all target Rooms; same key is allowed across Rooms but duplicate within one Room is rejected; five-image capacity holds for every target. Per-Room removal leaves other associations and bytes; bytes are retained above zero references and deleted/retried only at zero; cover remains independent per Room even when keys match. Include concurrent deletes of several associations to prove only final-reference cleanup occurs, and verify V1 API cannot reattach an old key. Also validate format/size/path checks, reorder, cleanup and cross-scope errors.

**Public:** same physical asset can appear through multiple eligible Rooms; hiding one Room makes only its association URL return generic 404 while another eligible Room still serves its own association URL; list/detail and no-image behavior stay correct; payload never includes key/path/Owner/filename; branded fallback shown without fake rows.

## 21. Production debt

- Select and configure an S3-compatible/object-storage provider, private bucket, encryption and credential rotation.
- Define backup/restore and retention/deletion policy with database-to-object consistency.
- Implement orphan detection/reconciliation and operational metrics/alerts.
- Decide whether CDN is useful; if used, define purge/invalidation semantics compatible with prompt unpublishing.
- Virus/content scanning may be added if threat model/operations require it; not a V1 image-editor feature.
- Image optimization/resizing/thumbnail generation is deferred; V1 stores validated originals and serves safe bytes.
- Public delivery proxy capacity/cache behavior needs production load review.

## 22. Implementation sequence

1. Approve the revised Room Images design.
2. Create Database V1.4 artifacts.
3. Run the V1.3 → V1.4 migration design/implementation.
4. Update Prisma mapping.
5. Validate clean install and populated-database upgrade on PostgreSQL 18.
6. Implement the storage adapter.
7. Implement Room Image backend routes and service.
8. Integrate images into single Room creation.
9. Integrate shared images into bulk Room creation.
10. Implement the Public Sales Funnel with Room images.
11. Run browser and regression checks.
12. Lock V1.4 only after every validation gate passes.

## 23. Definition of Done

- Database V1.4 clean install and populated V1.3 migration pass on PostgreSQL 18; no loss of existing Rooms.
- `room_images` and Prisma relation match approved physical names/types/FK.
- PostgreSQL enforces FK, nonblank key, `UNIQUE (room_id, storage_key)`, positive ordering, at most one cover per Room, and max five associations per Room; backend transaction tests confirm concurrent cap/reference cleanup safety.
- Admin APIs enforce full tenant scope and support single/bulk upload, list, per-Room cover/reorder/delete, partial failure reporting, and reference-safe cleanup.
- Local storage is private and production adapter is configurable; no binary or absolute path is stored in PostgreSQL.
- Public list/detail and every image-byte read follow current Room/Property visibility; no metadata/key leakage.
- Empty image state uses a brand placeholder that is not stored as room data.
- File validation, failure cleanup, orphan reconciliation, API tests and browser regression pass.
- Database changelog labels V1.4 current LOCK only after all validation gates pass.

## Files/documentation changed in this design pass

- `SmartRentalManagement/docs/07_modules/public-marketplace/ROOM_IMAGES_V1_SCHEMA_MIGRATION_DESIGN.md` (this design)
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md` (catalog entry)
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` (Public and Property/Room image requirements)
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` (proposed image API/response contract)

No database, Prisma, migration, seed, backend, frontend, or runtime data was changed. No SQL or migration command was run.
