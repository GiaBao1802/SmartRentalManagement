# Database V1.11

V1.11 is the additive Resident booking baseline: the complete 42-table V1.10 schema (including persistent `auth_sessions`) plus `resident_service_bookings`, for 43 public tables on PostgreSQL 18.6. V1.10 artifacts remain unchanged.

## Artifacts

- `schema.sql` and `seed.sql`: clean-install schema and synthetic seed. The seed contains no Resident booking rows.
- `expected-catalog.json`: structural catalog used by setup/inspection; it contains no application data.
- `migrations/V1_10_to_V1_11_resident_service_bookings.sql`: standard additive upgrade from the canonical V1.10 baseline.
- `migrations/V1_10_local_booking_branch_to_V1_11_auth_sessions.sql`: narrow local recovery for the pre-release `Goctro_dev_v18` branch that had bookings but not upstream auth sessions. The setup tool accepts this path only after an exact catalog match.
- `runtime_validator.sql`: inherited populated-database CORE validation, adjusted to 43 tables.
- `runtime_validator_resident_bookings.sql`: 17 booking-schema checks; writes only a temporary results table and rolls back.
- `runtime_validator_fixture.sql`: seed-dependent regression suite. Run only on a disposable, clean V1.11 install after seed, never on a populated target.

## Behavior

Residents submit one-person requests against Admin-configured `BOOKING` slots. `PENDING` and `APPROVED` requests reserve capacity. The request stores the effective published price and contract context. Admin approval creates one `READY` Flexible Service charge at the saved quote for the ordinary Contract Invoice period. The request is not itself an Invoice; it does not finalize, send or pay an Invoice. `SUBSCRIPTION` package enrollment and payment remain outside this release.

## Upgrade order

For existing databases, use the guarded setup tool: V1.8 → V1.9 → V1.10 (auth sessions) → V1.11 (Resident bookings). Confirm a verified backup before allowing migration. Do not use Prisma `db push` or reset. The setup tool never seeds a populated database and refuses the `Goctro_test3` migration target.

V1.10 remains the team's immutable auth-session baseline and stays at 42 tables on `Goctro_test3`. V1.11 is applied to the authorized local development target `Goctro_dev_v18`; it does not contain local records or credentials in Git.
