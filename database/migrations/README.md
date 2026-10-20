# Historical Prisma/demo migrations

The three existing timestamped migrations describe the original demo schema (`user_accounts`, `tenants`, `lease_contracts`, uppercase roles). They do not produce the SQL Database V1.8 schema (`accounts`, `residents`, `contracts`, Owner tenant scope, 40 tables, SQL triggers/CHECKs/partial indexes).

Preserved unchanged as history. Both root and backend `db:migrate` commands now fail before connecting. Never apply this history on top of V1.8; do not use `migrate resolve` to assert equivalence.

For a new empty database use `db:bootstrap` and `db:seed` with explicit target confirmation. For existing data follow [DATABASE_V1_8_SETUP.md](../../docs/10_operations/DATABASE_V1_8_SETUP.md).
