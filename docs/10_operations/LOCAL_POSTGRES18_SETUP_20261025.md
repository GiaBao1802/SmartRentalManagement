# Local PostgreSQL 18 setup — 2026-10-25

CURRENT — local runtime verified.

- PostgreSQL 18.6 Windows binaries downloaded from EDB over HTTPS, extracted to .local/postgresql18/pgsql. Separate cluster .local/postgresql18/data listens only on localhost:5433 with SCRAM authentication. PostgreSQL 17.11 / goctro at port 5432 was preserved.
- New database Goctro_dev_v18: canonical V1.8 bootstrap, seed and catalog inspection PASS (40 tables). No schema promotion or legacy migration.
- Existing backend/frontend/root env backed up under ignored .local/setup-backups before configuration. Backend now uses new database, NODE_ENV=development, random session secret and random idempotency key. Credentials remain in ignored backend/.env.
- INITIAL provisioning for the two reviewed seed accounts succeeded. Admin and Resident email logins both returned HTTP 200. Demo password is the published local-only value documented in the setup runbook.
- Setup update flow installed dependencies, generated Prisma and recorded dependencies/prisma/runtime stamps. API health, DB health and /login returned HTTP 200. Browser visual UI was not reviewed.
- Per-user Startup shortcut Goctro PostgreSQL 18.lnk launches .local/start-postgres18.ps1 hidden at Windows sign-in. No administrator service installed. This workspace must stay at its current path for the shortcut to work. Manual start: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .local/start-postgres18.ps1.
- On subsequent runs open setup.bat and choose option 2 (update/start). First-time mode uses fixed port 5432 and should not be used for this existing port-5433 configuration.

Next local task: review Admin and Resident UI at http://localhost:3000/login. Business module next task and project baseline unchanged.
