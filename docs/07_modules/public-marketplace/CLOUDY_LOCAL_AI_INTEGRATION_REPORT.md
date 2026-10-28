# Cloudy local AI integration — 2026-10-28

Status: CURRENT, local development demo; production AI remains deferred.

## Public database read follow-up — 2026-10-28

Per user request, guest confirmation now calls the existing public `GET /api/v1/public/rooms` endpoint against the configured local backend. It does not connect directly to PostgreSQL and does not write records. Qwen's prepare response remains a proposed filter set; only the separately confirmed structured filters reach the API. Price, area and capacity use API filters; location is matched against public province/address fields. The API has no structured amenity field, so those requests are clarified rather than guessed. Results show up to five public rooms, sorted by rent, and make no booking promise.

Live read verification: the local public API reported two public rooms. Actual Qwen3 1.7B inference for “Tìm phòng ở Đà Nẵng dưới 4 triệu cho 2 người” returned `awaiting_confirmation` with the expected location, strict rent upper bound and capacity, without room records. Passing that context to the new Cloudy database adapter returned one match. No DB/API/backend schema writes, environment changes, or computer-use actions were made. Focused TypeScript tests: 22/22 passed; Python suite: 15/15 passed; frontend typecheck passed.

## Response validation hardening — 2026-10-28

The public API adapter now validates each room's display fields and pagination metadata, rejects inconsistent totals/page sizes during a multi-page scan, and refuses oversized scans before reading page data. This prevents malformed or shifting API responses from being rendered as plausible results. Result wording now says “dữ liệu hiện tại” rather than implying the records are real customer listings; the shared development database can contain synthetic public records.

Verification: 24/24 focused TypeScript tests and frontend typecheck PASS. A fresh read against the current local API (100 public listings, Đồng Nai and TP. Hồ Chí Minh) returned a matching public result for Đồng Nai, below 4,000,000 VND and capacity two. No DB writes, API/schema changes or computer-use actions.

## Vietnamese query regression — 2026-10-28

Unseen live-model checks exposed that the location candidate parser treated the period in “TP.” as sentence punctuation. This blocked otherwise supported requests combining an abbreviated city name with price and area ranges. The parser now retains periods inside location names and trims only trailing punctuation. Added deterministic regression cases for “TP. Hồ Chí Minh” with price/area ranges and sentence-final punctuation.

Verification: 17/17 Python tests PASS. Live Qwen3 1.7B now returns `awaiting_confirmation` with location TP. Hồ Chí Minh, price 2–3 million and area 20–30 m². A live continuation “thêm cho 2 người” correctly preserves Đồng Nai and the under-4-million price condition while adding capacity two. This is a small targeted evaluation, not a broad accuracy score. No DB writes, API/schema changes or computer-use actions.

## Clickable room detail links — 2026-10-28

Each Cloudy result now includes a “Xem chi tiết phòng” link to the existing public detail route `/rooms/{room_id}`. The adapter accepts numeric room IDs only, emits a dedicated internal marker, and the chat UI linkifies that marker only in assistant messages; user-entered text and arbitrary URLs remain plain text. The existing public detail screen loads the current room data and contact form.

Focused Cloudy tests and frontend typecheck pass. The link route and API are unchanged; no database or business writes.

## Delivered

The user requested integration into the existing mascot. Development now connects Cloudy to a Next route and a repository-contained Python worker using local Ollama Qwen3 1.7B. The model returns intent/candidate decisions as JSON; deterministic guards validate and filter the 300-room synthetic catalog. The frontend receives plain text, a synthetic-source flag, model name and result status. It never generates or executes SQL.

The existing mascot placement, session boundary, drag behavior, memory-only messages, cancellation and retry remain. The new Lọc mới/Lọc tiếp controls support filter continuity: only accepted structured conditions carry over, never raw message history. Updated fields replace previous same-field conditions; unsupported/ambiguous turns require clarification. Every reply states that rooms are synthetic; prices are room rent excluding utilities. Ambiguous/unsupported conditions ask for clarification and no-match responses do not loosen conditions. Production sending remains disabled; the endpoint is development and loopback only.

No database, schema, dataset, real room API, environment file or production dependency was changed. The separate Node advisor demo remains separate. No commit or push.

## Verification

- Focused TypeScript tests: 12/12 passed (service, suggestion boundary, route validation/concurrency/errors).
- Python worker tests: 3/3 passed (input and grounded rendering; model calls stubbed in unit tests).
- Frontend typecheck passed after `next typegen` regenerated stale route declarations.
- Production build passed on retry. The initial invocation stopped after compilation with an installed Next.js 16.4.0 security upgrade notice; retry retained that notice but completed. A dependency security update remains recommended. Existing middleware deprecation also remains. Neither dependency nor middleware migration was included here.
- Actual browser on `/landing`: `Tìm phòng ở Bến Nắng giá dưới 4 triệu` returned 14 matches and the expected top five, headed by SYN-R0003 at 1,500,000 VND. `Phòng có máy lạnh giá không quá 5 triệu` returned 99 matches after closing, reopening and retrying. History survived and the user message was not duplicated. Narrow viewport screenshot showed the scrollable reply and composer.
- Earlier lab V3 recorded 48/48 targeted repeated cases; those are tuned regression evidence, not a fresh unbiased production evaluation. This integration did not retrain the model or establish broad accuracy.

## Remaining checks

Next AI-demo task: evaluate an unseen multi-turn filter suite. Session-key/service tests now cover logout/account/role transitions; actual authenticated UI transitions remain unverified. Physical mobile keyboard, broad unseen Vietnamese queries and production hosting are not verified. Filter continuation is supported; vague comparative references without a numeric target still require clarification. Aborting a browser response does not prove Ollama stopped computation immediately.

The repository's primary Exact Next Task (authenticated V1.12 demo payment review) is unchanged.

Run instructions and test commands: [Cloudy local runbook](../../../scripts/cloudy-ai/README.md). Local endpoint contract: [API specification](../../04_API_SPEC.md). Scope exception: [Requirements §17](../../01_REQUIREMENTS.md#17-foxi).

## Continuation update — 2026-10-28

User requested a visible choice between new and continued filtering. Two pressed-state buttons now show the active mode; continuation is unavailable until a filter has been accepted. Every user message records its chosen mode, including retry. New mode sends no old context. Close/reopen preserves the service context; session remount resets it. Successful and no-match replies show the effective conditions; continuation clarification retains the last accepted context. Explicit single-command constraint removal is supported. Arbitrary chat memory and automatic interpretation of vague relative amounts are not claimed.

Verification: Python 9/9 and focused TypeScript 15/15 pass. Real Qwen3 sequence Bến Nắng under 4 million → thêm máy lạnh → dưới 3 triệu produced 14 → 9 → 6 matches while preserving location and AC. A new search in Dương Mơ drops the old AC constraint. These are targeted cases, not a general accuracy score.

Browser follow-up: new search → continue with AC returned 14 → 9 matches; selecting new search in Dương Mơ returned 13 matches without the old AC requirement. The visible active-mode buttons and user-message mode labels matched each request. Frontend typecheck and production build passed. Visual inspection caught focus-induced scrolling of the outer chat panel; it now uses clipped outer overflow with a separately scrollable message area, a taller desktop panel and distinct selected button styling. Screenshot confirmed header, mode selector and composer remain visible. Physical mobile keyboard remains unverified.


## Session isolation audit — 2026-10-28 (no computer use)

Source audit found that the old chat key included route scope and account ID but omitted auth status and role. A same-account role change on a public route could therefore retain the previous chat. The key now includes route scope, auth status, account ID and role. Role/status changes also close the panel; the existing keyed React remount resets messages, draft, filter mode and the private service instance, while unmount cleanup aborts the pending request. No auth-provider behavior was changed.

21/21 focused TypeScript tests and frontend typecheck PASS. Added checks cover account/role changes on public routes, loading/logout transitions, route-group changes, separate service contexts, a delayed reply arriving after abort, and retaining accepted filters after continuation clarification/transport failure. These are pure boundary/service tests plus source inspection of the React wiring, not DOM lifecycle tests or an authenticated end-to-end login/logout run. No browser/computer-use actions were performed in this audit. DB, model, dataset and API contract unchanged. No new build was required for this small session-key change; prior build evidence belongs to the continuation update above.


## Guest confirmation gate — 2026-10-28

CURRENT guest behavior now supersedes the immediate retrieval described in earlier milestones. Message preparation interprets the request and summarizes all supported filters, without loading/filtering rooms. The guest chooses “Đúng rồi, tìm phòng” or “Sửa yêu cầu”. Confirmation performs deterministic retrieval of the exact proposed filters, with no second model inference. New and continued filters both require confirmation. Unsupported/unclear conditions remain non-confirmable.

Client proposal is separate from accepted context. Editing input or mode invalidates it; stale replies cannot restore it. Cancellation/failure during confirmation permits retry of the same proposal. Existing account/role/session boundaries discard it. The synthetic read-only API validates supplied filter shape; this is a UI confirmation workflow, not a signed authorization protocol. Owner and Resident flows, DB, model and dataset unchanged.

22/22 focused TypeScript tests, 14/14 Python tests and frontend typecheck PASS. Worker tests explicitly fail if preparation loads or filters the catalog, and confirm that confirmation does not call the model. Client tests cover edits, stale results, aborted confirmation/retry, separate sessions and mismatched confirmation filters. No computer use or visual verification in this pass.

Live worker verification with Qwen3 1.7B: Bến Nắng below 4 million returned awaiting_confirmation without room IDs; explicit confirmation returned 14 matches. Continuing with AC again returned awaiting_confirmation, then 9 matches only after confirmation. Production build completed on retry; the initial invocation stopped after successful compilation/typechecking due to the existing Next.js 16.4.0 security advisory. Upgrading the installed Next.js remains recommended; no dependency upgrade was made here. Next guest-demo task: unseen multi-turn correction/confirmation cases. Primary project Exact Next Task unchanged.
