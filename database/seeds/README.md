# Historical demo seed

`seed.ts` exists but uses legacy Prisma models and demo credentials; it is kept as historical source only. No current `db:seed` command invokes it. The current guarded seed loads `database/baselines/v1.8/seed.sql` and refuses any existing application data or structural drift.

See [DATABASE_V1_8_SETUP.md](../../docs/10_operations/DATABASE_V1_8_SETUP.md).
