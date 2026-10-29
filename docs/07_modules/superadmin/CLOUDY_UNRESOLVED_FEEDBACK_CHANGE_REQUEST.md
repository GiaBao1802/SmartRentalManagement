# Cloudy unresolved-message review — Database V1.17 change request

- Date: 2026-10-29
- Status: **IMPLEMENTED IN SOURCE; V1.17 REHEARSAL PASS; ROLLOUT AND SUPERADMIN PROVISIONING PENDING**
- Scope: capture Resident Cloudy messages classified as `help`, then let an invited Superadmin review curated examples for future prompt/rule/evaluation improvements.
- Physical database remains Neon shared-dev `production` V1.16 (47 tables); local `Goctro_dev_v18` remains V1.15. This document does not authorize or record a database write.

## Product behavior

1. Capture only a single authenticated Resident message when the Resident assistant actually returns its explicit `help`/not-understood intent. Do not capture successful turns, the full transcript, model chain-of-thought, room/contract/invoice identifiers, or anonymous/public Cloudy conversations.
2. Tell Residents in plain language that a message the assistant cannot understand may be submitted for service improvement. Make submission opt-in, and provide a way to turn it off. If consent is absent, Cloudy still answers normally and stores nothing.
3. Before persistence, trim and cap the message at 500 characters; remove email addresses, phone-like numbers, and Vietnamese 12-digit identity-number patterns. Discard empty text after redaction. Do not attach account, resident, room, session, IP, or request-body identifiers. Redaction is best-effort and is not a guarantee that arbitrary names or addresses are removed; the notice must say not to include sensitive details.
4. Store a bounded model/intent label and timestamps needed for product debugging. Do not persist the Qwen prompt, assistant response, image, or unrelated chat context.
5. Deduplicate repeated identical redacted messages with a keyed digest; increment a count and update last-seen rather than retaining another user event. The digest secret is server-side and must not be exposed to the browser.
6. The Superadmin workspace may list, inspect, classify, mark as duplicate/no-action, and mark a sanitized example as included in a versioned evaluation set. Review actions retain actor and timestamp. No UI action directly fine-tunes Qwen or deploys a prompt.
7. Initial improvement means human-curated examples, explicit intent labels, and regression tests/prompts reviewed and deployed through normal code release. Automated model training/fine-tuning is out of scope.

## Approved Database V1.17 delta

V1.17 is additive relative to V1.16 and must preserve all existing rows. Extend `accounts.role` to include `superadmin` while preserving the ownership XOR rule for `admin` and `resident`; a Superadmin has both `owner_id` and `resident_id` NULL. Add nullable `accounts.cloudy_feedback_opt_in_at` as the Resident's opt-in state (NULL means off; opt-out sets NULL). Add `cloudy_unresolved_feedback` with a generated ID, unique keyed digest, sanitized message, constrained source/intent/status codes, model version, occurrence count, first/last seen timestamps, optional latest reviewer account and reviewed timestamp, and optional evaluation-set version. Foreign key reviewer to `accounts`; no foreign key from feedback to a Resident or Account. Add `cloudy_unresolved_feedback_reviews` as an append-only audit of each status/label/evaluation-set review action, with reviewer account, prior/new state and timestamps; its rows cascade only when the parent feedback is removed for retention. Add indexes for status/last-seen review queues, review history and retention timestamps. The project owner selected 30-day retention from `first_seen_at`; duplicate occurrences do not extend the deadline. An hourly cleanup job deletes expired feedback and its review history soon after the deadline. V1.17 adds two tables to the 47-table V1.16 catalog (49 total).

Statuses: `new`, `reviewed`, `no_action`, `included_in_eval`. A review update must be atomic and idempotent; an already reviewed item cannot be silently overwritten. Every accepted review change appends an audit row and updates the latest-review summary on the feedback row.

## Implemented API boundary

- Resident: `GET /api/v1/me/assistant/feedback-preference` and `PUT /api/v1/me/assistant/feedback-preference` manage opt-in. The chat route captures only after server classification returns `help` and the stored opt-in is enabled; there is no client-submittable capture endpoint. Session-derived identity/scope is used; no client-supplied identity or intent is accepted.
- Superadmin: `/api/v1/platform/cloudy/unresolved-feedback` has paginated list/detail and status/label/evaluation review endpoints, protected by authentication plus `requireSuperadmin`. Each accepted change appends its own audit record; the latest reviewer summary is updated atomically. Existing Owner/Admin/Resident routes continue to reject `superadmin`.
- `/api/v1/auth/me` returns a Superadmin profile for a valid active account. No account has been created or invited; the email and invite flow remain deferred. No default/shared password, public signup, seed account, or client role assignment is added.

Source implementation and V1.17 migration artifacts are complete. The database was rehearsed only on `goctro-cloudy-v117-test-20261029`; no shared-dev or local apply, invite, or authenticated Superadmin browser review has occurred.

## Security, privacy and validation gates

- The first Superadmin identity needs the project owner's chosen verified email and must be provisioned through the approved one-time invitation path; this request does not select an email or create an account.
- A human-readable opt-in notice and preference behavior must be accepted before storing Resident text.
- Chosen retention: 30 days from `first_seen_at`; the delete job must be verified in tests.
- Chosen rehearsal target: a disposable normal Neon branch cloned from shared-dev `production`, named `goctro-cloudy-v117-test-20261029`, expiring 2026-11-05. This does not authorize migration against the parent `production` branch.
- Build a V1.17 migration from exact V1.16, rehearse on a disposable PostgreSQL 18 database and Neon branch, verify the 49-table catalog and existing-account/row preservation, then obtain separate explicit approval before any protected/shared target apply. Never use `db push` or seed a live account.
- Source tests cover role isolation, PII redaction, keyed dedupe hashing, review payload validation, opt-in capture gating, 30-day cutoff calculation, and reviewer identity derived from session. The selected-branch migration rehearsal verifies 49 tables, empty new tables/preferences, and preservation of all predecessor rows. A rollback-only PostgreSQL test on that branch confirms audit UPDATE/DELETE and parent expiry deletion without cleanup scope are blocked, while transaction-scoped retention cleanup can cascade the audit. Dedupe concurrency and authenticated browser review remain outstanding.

## Open items for implementation

1. The verified email for the first Superadmin invitation is deferred until later; do not create an account or send an invitation in this task.
2. Keep the current implementation and V1.17 test-branch rehearsal; do not apply to shared-dev `production`, local `Goctro_dev_v18`, or invite an account in this task.
3. Resume rollout only after the owner supplies a verified Superadmin email and explicitly authorizes the relevant protected database target and invitation.

Cloudy source behavior and the test branch now implement the selected workflow, but the shared-dev/local databases and account access remain unchanged until rollout is separately authorized.
