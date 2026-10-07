# Góc trọ

Monorepo scaffold for migrating the existing UI to Next.js, adding a Node.js API, and using PostgreSQL.

## Structure

- `frontend/` — Next.js App Router application.
- `backend/` — Node.js, Express, and TypeScript API.
- `database/` — PostgreSQL schema, Prisma migrations, and local demo seed data.
- `legacy/` — preserved HTML/CSS/JS reference app, assets, and wireframes used during migration.
- `docs/` — domain model and project notes.

## Requirements

- Node.js 24.11 or newer and npm 11.6 or newer.
- Docker Desktop (or Docker Engine with Compose) for the local PostgreSQL service, or a PostgreSQL instance matching `DATABASE_URL`.

## Start development

1. Install dependencies: `npm install`
2. Copy `backend/.env.example` to `backend/.env`.
3. Start PostgreSQL: `npm run db:up`
4. Generate the Prisma client: `npm run db:generate`
5. Apply the schema: `npm run db:migrate`
6. Load development sample data: `npm run db:seed`
7. Start frontend and backend: `npm run dev`

The public homepage runs at `http://localhost:3000`; sign-in is available at `/login`.
The development seed creates three role-based demo accounts: `admin`, `landlord`, and `tenant`. Each uses `123456` by default; set `DEV_ADMIN_PASSWORD`, `DEV_LANDLORD_PASSWORD`, and `DEV_TENANT_PASSWORD` before running the seed to change them. These credentials are for local development only.

`ADMIN` can manage the full system and create accounts at `/admin/accounts`. `LANDLORD` can manage only properties assigned to that account and their related rooms, tenants, contracts, invoices, amenities, and requests. Landlords choose which rooms to publish; published vacant rooms from all landlords appear together on the public homepage. `TENANT` can view only their linked profile, contracts, invoices, amenity bookings, and support requests at `/tenant`. The demo landlord is assigned Tòa A; the demo tenant is linked to Nguyễn Văn A.

## API currently available

- `GET /api/health` — API process health.
- `GET /api/health/db` — PostgreSQL connection health.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — local session login/logout.
- `GET /api/public/rooms`, `POST /api/public/viewing-requests` — paginated public marketplace listings and viewing requests. Only rooms marked for marketplace publication appear.
- `GET /api/tenants?page=1&pageSize=20&search=` — searchable, paginated tenant list with current room and vehicle details.
- Staff endpoints for properties/rooms, tenants, contracts, invoices, amenities/bookings, viewing requests, and maintenance requests require an admin or landlord session; landlord queries are scoped to assigned properties.
- The management UI is available at `/admin/properties`, `/admin/tenants`, `/admin/contracts`, `/admin/invoices`, `/admin/amenities`, `/admin/bookings`, `/admin/viewings`, `/admin/complaints`, and `/admin/accounts` (admin only).

Start the preserved reference app with `node legacy/server.js` if needed. The Next.js app is the active frontend.

The Prisma schema is in `database/schema.prisma`; migrations are kept in `database/migrations`. Domain documentation is in `docs/DOMAIN_MODEL.md`. The initial migration and seed data are for local development and should be reviewed before applying to a shared database.
