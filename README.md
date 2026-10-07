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

The public homepage runs at `http://localhost:3000`; the admin area is available after sign-in at `/login`.
After `npm run db:seed`, sign in with `admin` / `123456` (or the value of `DEV_ADMIN_PASSWORD`). This is a local demo account; change it before using a shared environment.

## API currently available

- `GET /api/health` — API process health.
- `GET /api/health/db` — PostgreSQL connection health.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — local session login/logout.
- `GET /api/public/rooms`, `POST /api/public/viewing-requests` — available rooms and public viewing requests.
- `GET /api/tenants?page=1&pageSize=20&search=` — searchable, paginated tenant list with current room and vehicle details.
- Admin endpoints for properties/rooms, tenants, contracts, invoices, amenities/bookings, viewing requests, and maintenance requests support list and CRUD/status operations and require an admin session.
- The admin UI is available at `/admin/properties`, `/admin/tenants`, `/admin/contracts`, `/admin/invoices`, `/admin/amenities`, `/admin/bookings`, `/admin/viewings`, and `/admin/complaints`.

Start the preserved reference app with `node legacy/server.js` if needed. The Next.js app is the active frontend.

The Prisma schema is in `database/schema.prisma`; migrations are kept in `database/migrations`. Domain documentation is in `docs/DOMAIN_MODEL.md`. The initial migration and seed data are for local development and should be reviewed before applying to a shared database.
