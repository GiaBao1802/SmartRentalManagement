# Neon shared database setup — 2026-10-28

## Target and state

- Neon project: `goctro-shared-dev` (`patient-scene-93926977`)
- Organization: `org-cool-term-43890018`
- Branch: `production` (`br-spring-frog-a1rqjhvq`), default branch
- Region: AWS Asia Pacific (Singapore)
- PostgreSQL: 18.6
- Schema: exact V1.15 baseline, 47 tables; catalog verified after installation
- Data: schema only. No seed, demo account, room fixtures, or local database rows were copied.

The local populated `Goctro_dev_v18` remains separate and unchanged. The Neon project is the shared cloud target. Its branch currently returns zero public rooms until the real dataset is imported.

## Developer setup

For detailed first-time onboarding of a teammate who has never used Neon, follow [Neon teammate onboarding](NEON_TEAMMATE_ONBOARDING.md).

Each developer needs their own Neon login and project-level **Editor** permission; pulling Git code does not grant cloud access. Prefer inviting a teammate as an organization Collaborator, then grant Editor only on `goctro-shared-dev`. Collaborators have no default project access, while Neon Viewer cannot see connection strings; Editor is needed for the CLI to pull `DATABASE_URL`. Each invited developer signs in with their own account. Do not put Neon credentials or connection strings in Git.

After pulling the repository, open `setup.bat` and select **5. Dùng database chung Neon (cloud)**. The option:

1. Reuses `neon.cmd` if installed, otherwise runs `npx neon@latest` without changing PowerShell execution policy.
2. Opens Neon browser sign-in only when that developer has no authenticated CLI profile.
3. Links the local workspace to this organization/project and the `production` branch with env pulling disabled, then pulls only the Postgres variables into `.env.neon`.
4. Preserves existing app-specific values in `.env.neon`, adds missing development-only settings, and verifies the cloud connection with a read-only query for the database name and 47-table catalog.
5. After that successful check, removes only the `DATABASE_URL` line from `backend/.env`. It does not delete the local database or its data, and it preserves the rest of `backend/.env`.
6. Requires a second explicit confirmation before starting the app.

`.neon` and `.env.neon` are Git-ignored; each developer creates them locally. `dev:neon` explicitly loads values from `.env.neon` over inherited shell variables and refuses to start unless the host, database and branch match this Neon target. `DATABASE_URL` is the pooled application connection. `DATABASE_URL_UNPOOLED` is for separately reviewed schema/migration work; the setup option never uses it. The root `.env` is unchanged; only the backend's old database URL line is removed, and its other settings remain. The setup option never bootstraps, seeds, resets, migrates, or changes cloud data. Since this is a shared branch, application writes made by any user are visible to the team. The branch currently has schema only, so importing the reviewed real dataset remains a separate task.

The Neon runner clears a root-level `PORT` inherited from `.env.neon` so Next.js uses port 3000; the backend reads `backend/.env` or its default and uses port 4000. Open the UI at `http://localhost:3000`; port 4000 is the API.

## Read and write behavior

A read-only database role can display data but cannot persist UI actions. For example, an Admin approving a Parking request must call the authenticated backend approve endpoint; the backend validates Owner scope and writes the resulting assignment to Neon. The frontend never connects to Neon directly. The pooled Neon application URL currently supports normal application writes, while the setup verifier itself runs only a read-only query.

To start the already-configured app manually, run `npm run dev:neon`. If a frontend or backend is already running on ports 3000 or 4000, stop that development session before starting another; Next.js refuses a second dev server using the same build directory.

## Installation and verification evidence

`neon init` linked this repository locally and created `neon.ts`. `neon config plan` reported no changes, with Postgres as the only utilized service. `neon deploy --no-env-pull` completed and confirmed the branch already matched the policy. Environment variables were pulled into the ignored `.env.neon`, leaving local environment files intact.

Before schema installation, the Neon database had zero public tables. The V1.15 artifacts passed their SHA-256 check through the repository's `loadBaseline` routine. The exact clean-install `schema.sql` was applied to the direct connection in one transaction only after confirming the expected project, branch, database, PostgreSQL major version, and empty schema; the transaction compared the resulting catalog to `expected-catalog.json` before commit. Result: 47 tables and no seeded rows. The synthetic `seed.sql` was not executed.

Verification on 2026-10-28:

- `npm run build` — PASS (frontend Next.js production build and backend TypeScript build).
- Backend `/api/health` — HTTP 200.
- Backend `/api/health/db` — HTTP 200, real PostgreSQL query through Neon.
- Backend `/api/v1/public/explorer/rooms?province_code=01&page_size=1` — HTTP 200, database-backed empty result.
- Frontend `/login` and `/api/health` — HTTP 200.

The initial `npm run dev:neon` attempt encountered an already-running Next dev server on port 3000 and exited after Next reported its existing lock. The running frontend was left intact; the Neon-connected backend remained available on port 4000 and passed the checks above. The new setup option checks Neon connectivity before launch and asks the developer to close existing sessions first.

The current local database setup/migration scripts intentionally restrict writes to local PostgreSQL. Do not point them at Neon or run `db:seed`, reset, or `db push` there. A reviewed remote migration procedure is needed before future schema changes. For now, invite the teammates who need access and prepare the real-data import separately; the cloud branch contains schema only.
