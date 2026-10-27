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

For existing databases, use the guarded setup tool: V1.8 → V1.9 → V1.10 (auth sessions) → V1.11 (Resident bookings). Confirm a verified backup before allowing migration. Do not use Prisma `db push` or reset. The setup tool never seeds a populated database and refuses migrations on the named `Goctro_test3` target. That target was subsequently upgraded by the owner-authorized canonical SQL migration described below; it no longer needs an upgrade.

V1.10 remains the team's immutable 42-table auth-session predecessor. The populated `Goctro_test3` database was later backed up and upgraded with the canonical V1.10→V1.11 migration under explicit owner authorization. It is now the configured local application target at V1.11 with 43 tables; `Goctro_dev_v18` remains a separate V1.11 safety copy. See [Database Changelog](../../../docs/DATABASE_CHANGELOG.md) for target-specific evidence. Git contains no local records or credentials.
