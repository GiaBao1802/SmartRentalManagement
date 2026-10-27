# Resident demo payment, notifications, and feedback

**Date:** 2026-10-27
**Status:** Source implemented; V1.12 applied to local backend target; authenticated UI review pending.
**Scope:** Resident invoice presentation-only payment simulation; Admin in-app notification bell; Resident feedback intake. No real payment-provider integration.

## Delivered in source

- Resident can open an issued unpaid Invoice, view a clearly labeled non-scannable QR illustration, then choose simulated success or the `Test` failure result (default reason: insufficient balance).
- Success records a `provider=demo` PaymentTransaction with a demo code and timestamp and transitions the finalized unpaid Invoice to paid in one serializable database transaction. It creates an account-scoped Admin notification. Failure is separately recorded and leaves the Invoice unpaid.
- Demo endpoints are disabled in production. They do not call banks/wallets, create provider callbacks, or move money.
- AdminShell has a bell beside the account controls, matching the location in the supplied screenshot. The panel filters Invoice/feedback notification types and read/unread state. Read state uses the existing account-scoped notifications API.
- Resident Notifications has a feedback form. It stores the entry as a Complaint for the Resident's active occupancy, appends its initial history event and notifies the Owner Admin.
- The established Góc Trọ v2 identity tokens, logo and typography are unchanged.

## Database status and safety

V1.12 is additive to immutable V1.11 and expands only the `payment_transactions.provider` constraint to include `demo`. V1.11 and prior baseline artifacts remain unchanged. Existing Complaint, ComplaintHistory and Notification tables are reused; no other schema changes are proposed.

`backend/.env` pointed to populated `Goctro_dev_v18` (V1.11); `Goctro_test3` was absent on this PostgreSQL instance. Before migration, `.local/backups/Goctro_dev_v18_pre_V1_12_20261027.dump` was created and verified with `pg_restore --list` (508 entries; SHA-256 `4FDEAD23131431D96D5867BE504464E82CDAA4F8FEFB60BA5793D3C63434794A`). The exact-catalog V1.11→V1.12 migration passed; read-only state/inspect confirmed V1.12. No seed/reset or service restart ran.

Read-only runtime checks returned HTTP 200 for API health, database health, and the local login page. The unauthenticated demo-payment history route returned its expected 401, confirming the route is mounted. No payment transaction or invoice was changed during this check.

## Not verified

- Frontend and backend TypeScript typechecks passed. Production build, automated tests and browser review were not run.
- End-to-end Resident→Admin notification, filtering/read state, feedback persistence and invoice payment history remain pending authenticated local-app review.
- The QR is intentionally decorative and cannot be scanned; it is not a payment QR.

## Exact next task

Reload the local app against `backend/.env`, then review simulated success/failure, Resident transaction history, Admin notification filters/read state and Resident feedback.
