# Neon shared database setup — 2026-10-28

## Target and state

- Neon project: `goctro-shared-dev` (`patient-scene-93926977`)
- Organization: `org-cool-term-43890018`
- Branch: `production` (`br-spring-frog-a1rqjhvq`), default branch
- Region: AWS Asia Pacific (Singapore)
- PostgreSQL: 18.6
- Schema: exact V1.15 baseline, 47 tables; catalog verified after installation
- Data: shared synthetic demo dataset; no real customer or local database rows were copied.

The local populated `Goctro_dev_v18` remains separate and unchanged. The Neon project is the shared cloud target. It contains 100 synthetic public/available rooms across five properties in Đồng Nai and five in TP. Hồ Chí Minh, owned by five synthetic Owner accounts. Ten synthetic Resident accounts are also present, including the requested Gmail login. These rows are shared by all developers connected to the project.

## Developer setup

For detailed first-time onboarding of a teammate who has never used Neon, follow [Neon teammate onboarding](NEON_TEAMMATE_ONBOARDING.md).

Each developer needs their own Neon login and project-level **Editor** permission; pulling Git code does not grant cloud access. Prefer inviting a teammate as an organization Collaborator, then grant Editor only on `goctro-shared-dev`. Collaborators have no default project access, while Neon Viewer cannot see connection strings; Editor is needed for the CLI to pull `DATABASE_URL`. Each invited developer signs in with their own account. Do not put Neon credentials or connection strings in Git.

After pulling the repository's latest `main`, open `setup.bat` and select **5. Dùng database chung Neon (cloud)**. The option first verifies the Git branch is `main` and the current commit exactly matches `origin/main`; it stops with update instructions if either check fails. It does not switch branches or overwrite local work. Git `main` is the application-code branch; Neon `production` is the shared database branch. The option:

1. Reuses `neon.cmd` if installed, otherwise runs `npx neon@latest` without changing PowerShell execution policy.
2. Opens Neon browser sign-in only when that developer has no authenticated CLI profile.
3. Links the local workspace to this organization/project and the `production` branch with env pulling disabled, then pulls only the Postgres variables into `.env.neon`.
4. Preserves existing app-specific values in `.env.neon`, adds missing development-only settings, and verifies the cloud connection with a read-only query for the database name and 47-table catalog.
5. After that successful check, removes only the `DATABASE_URL` line from `backend/.env`. It does not delete the local database or its data, and it preserves the rest of `backend/.env`.
6. Requires a second explicit confirmation before starting the app.

`.neon` and `.env.neon` are Git-ignored; each developer creates them locally. `dev:neon` explicitly loads values from `.env.neon` over inherited shell variables and refuses to start unless the host, database and branch match this Neon target. `DATABASE_URL` is the pooled application connection. `DATABASE_URL_UNPOOLED` is for separately reviewed schema/migration work; the setup option never uses it. The root `.env` is unchanged; only the backend's old database URL line is removed, and its other settings remain. The setup option never bootstraps, seeds, resets, migrates, or changes cloud data. Since this is a shared branch, application writes made by any user are visible to the team.

The shared synthetic data has 5 Owner/Admin accounts, 10 Properties, and 100 public/available Rooms (50 each in Đồng Nai and TP. Hồ Chí Minh). Room descriptions vary across TV, refrigerator, AC, kitchen, water heater, wardrobe, desk, laundry and Wi-Fi. Structured additions include 50 property facilities, 12 synthetic vehicles, 10 Parking areas, 80 active typed slots and 10 FREE_SLOT entitlements. No resident tenancy or Parking assignment is fabricated. `room_equipment` is intentionally empty: adding room equipment requires a valid resident request and Admin confirmation under V1.15, so per-room TV/fridge currently appear in room descriptions. Owner/Admin accounts are `admin.owner01@example.test` through `admin.owner05@example.test`; Resident accounts are `resident.02@example.test` through `resident.10@example.test`, plus the requested Gmail. Each uses the same randomly generated demo password, provided separately to the user and not stored in Git. These are synthetic login fixtures, not verified email identities; change the password before non-demo use.

The Neon runner clears a root-level `PORT` inherited from `.env.neon` so Next.js uses port 3000; the backend reads `backend/.env` or its default and uses port 4000. Open the UI at `http://localhost:3000`; port 4000 is the API.

## Read and write behavior

A read-only database role can display data but cannot persist UI actions. For example, an Admin approving a Parking request must call the authenticated backend approve endpoint; the backend validates Owner scope and writes the resulting assignment to Neon. The frontend never connects to Neon directly. The pooled Neon application URL currently supports normal application writes, while the setup verifier itself runs only a read-only query.

To start the already-configured app manually, run `npm run dev:neon`. If a frontend or backend is already running on ports 3000 or 4000, stop that development session before starting another; Next.js refuses a second dev server using the same build directory.

## Installation and verification evidence

`neon init` linked this repository locally and created `neon.ts`. `neon config plan` reported no changes, with Postgres as the only utilized service. `neon deploy --no-env-pull` completed and confirmed the branch already matched the policy. Environment variables were pulled into the ignored `.env.neon`, leaving local environment files intact.

Before schema installation, the Neon database had zero public tables. The V1.15 artifacts passed their SHA-256 check through the repository's `loadBaseline` routine. The exact clean-install `schema.sql` was applied to the direct connection in one transaction only after confirming the expected project, branch, database, PostgreSQL major version, and empty schema; the transaction compared the resulting catalog to `expected-catalog.json` before commit. Result: 47 tables. The canonical sample `seed.sql` was not executed. Later, the separately reviewed 100-room synthetic dataset above was inserted into the existing V1.15 schema in one transaction after confirming every application table was empty. The local pre-V1.15 dump was not imported because its legacy records failed current V1.15 integrity triggers; failed attempts rolled back with Neon unchanged.

Verification on 2026-10-28:

- `npm run build` — PASS (frontend Next.js production build and backend TypeScript build).
- Backend `/api/health` — HTTP 200.
- Backend `/api/health/db` — HTTP 200, real PostgreSQL query through Neon.
- Backend `/api/v1/public/explorer/rooms?province_code=01&page_size=1` — HTTP 200, database-backed empty result.
- Frontend `/login` and `/api/health` — HTTP 200.
- Synthetic dataset verification — exact V1.15 catalog PASS; 5 owners/admins, 10 properties, 100 rooms, 10 resident profiles/accounts, 50 property facilities, 12 vehicles, 10 Parking areas, 80 typed slots, and 10 FREE_SLOT entitlements. Room descriptions include varied TV/refrigerator/facility details.
- Backend authentication — requested Resident login and one Admin login, followed by `/auth/me` session checks: HTTP 200 for both roles.
- Public room API — Đồng Nai and TP. Hồ Chí Minh filters each returned HTTP 200 and 50 rooms; room description payloads include TV and refrigerator examples. Admin property/Parking and Resident vehicle APIs returned HTTP 200. `npm run dev:neon` is running with frontend `localhost:3000` and backend `localhost:4000` for user testing.

The initial `npm run dev:neon` attempt encountered an already-running Next dev server on port 3000 and exited after Next reported its existing lock. The running frontend was left intact; the Neon-connected backend remained available on port 4000 and passed the checks above. The new setup option checks Neon connectivity before launch and asks the developer to close existing sessions first.

The current local database setup/migration scripts intentionally restrict writes to local PostgreSQL. Do not point them at Neon or run `db:seed`, reset, or `db push` there. A reviewed remote migration procedure is needed before future schema changes. Every teammate needs their own Neon account, must accept an organization invitation, and must receive project-level Editor permission before setup option 5 can pull credentials. Pulling Git code or registering with Neon alone does not grant project access. At the latest access check (2026-10-28), invitations for `tv999ht@gmail.com` and `Lamsonhung1999@gmail.com` were still pending; neither had project access yet.
