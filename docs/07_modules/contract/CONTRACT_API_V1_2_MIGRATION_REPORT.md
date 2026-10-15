# Contract API V1.2 Migration Report

**Status: BLOCKED — stopped before backend implementation.**

## Source review

- `GocTro-SmartBuilding/docs/04_API_SPEC.md`, §5.7 Contracts and §6 transaction-sensitive operations.
- `GocTro-SmartBuilding/Database V1.2/schema.sql` and `erd.md`.
- `SmartRentalManagement/database/schema.prisma` (current V1.2 mapping).
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` for contract capacity and lifecycle context.

## Blocking API/database inconsistency

API Spec §5.7 says material financial/date/capacity changes need validation and **revision/audit requirements**. API Spec §5.7 and §8.4 also state that durable audit of Contract field changes is separate from document file-version history. Database V1.2 has `contracts` and immutable `contract_documents` versions, but no Contract revision field, Contract change-history table, or durable audit store. Prisma maps no such model either.

Document versions cannot satisfy the separate Contract-field audit requirement: their immutable file metadata records uploads, not before/after values, actor, or reason for edits to Contract fields. Implementing PATCH as if that requirement were met would claim behavior unsupported by the locked schema; inventing an in-memory or log-only audit would not provide durable history.

The exact durable audit mechanism and required revision/audit payload are not defined in the reviewed sources. Per the migration instruction to stop on an API Spec/database conflict, no Contract route, repository, lifecycle mutation, or legacy route retirement was started.

## Other deployment dependency

API Spec §5.7 requires binary documents in S3/MinIO/equivalent object storage and specifies staged upload/cleanup and temporary download access. No configured object-storage provider/adapter was identified in the current backend foundation. This must be resolved before claiming document upload/download implementation; PostgreSQL remains metadata-only.

## Validation

- No database connection or database command was used.
- No backend code or Prisma/database source was modified.
- No Contract tests, typecheck, or build were run because implementation was stopped at the source inconsistency gate.

## Required resolution

Approve a durable Contract audit/revision design (including fields/events, actor, and reason requirements) and its persistence location, then resume Contract migration against that agreed source. Select/configure the object-storage adapter before implementing document binary operations.

**Files modified:** this report only.
