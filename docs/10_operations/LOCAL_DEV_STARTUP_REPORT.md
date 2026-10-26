# Local Development Startup (Windows)

## Entry hiện hành — 2026-10-23

Mở `setup.bat`, chọn Cài đặt lần đầu hoặc Cập nhật và khởi động. Cài mới cố định localhost:5432/postgres/Goctro_dev_v18, chỉ hỏi mật khẩu PostgreSQL ẩn khi thiếu. Env target khác không bị ghi đè; chọn Cập nhật để giữ target cũ. Menu cập nhật thay thế hai launcher cũ, giữ dữ liệu/env/credential, không tự seed/provision/reset. RESET là công cụ CLI riêng có xác nhận. Xem [hướng dẫn hiện hành](DATABASE_V1_8_SETUP.md). Các phần bên dưới là bằng chứng lịch sử của launcher trước menu, không phải hướng dẫn target hiện tại.

## One-command startup (historical)

From the repository root, run:

```powershell
npm run dev:all
```

The launcher checks TCP reachability for PostgreSQL at `localhost:5432`, verifies that `backend/.env` exists, and validates privately that the effective `DATABASE_URL` points to a local `Goctro_test3` or `Goctro_dev_v18` database. It never prints the connection URL or its credentials. It then checks the backend and frontend ports. It uses the existing workspace scripts to start missing services and bounded health retries (30 seconds for the API and 45 seconds for Next.js).

Current target allowlist (2026-10-23): `Goctro_test3` and `Goctro_dev_v18`. The launcher still requires a loopback host and PostgreSQL port `5432`; arbitrary database names and remote hosts remain rejected. Earlier verification below records the target used during that original startup task and is historical evidence.

Expected successful output:

```text
PostgreSQL       OK
Backend          OK
Database health  OK
Frontend         OK
CSRF             OK
Frontend: http://localhost:3000
Login:    http://localhost:3000/login
```

The CSRF check verifies an HTTP 200 response, token presence, and the expected credentialed frontend CORS origin without printing the token or cookie.

## Process safety

- A healthy `GET /api/health` response with `{ "status": "ok", "service": "backend" }` is reused; the launcher does not start a duplicate backend.
- When a backend listener is unhealthy, the launcher inspects the PID, executable, command line, and parent chain. It only stops a process tree when the listener is verified as this repository's `src/server.ts` (or built backend) and the linked Node/tsx/npm workspace process. Unknown owners are never killed.
- A frontend listener is reused only when it is reachable and its Next.js process belongs to this repository. An unrelated process on port 3000 is left untouched and reported.
- `npm run dev:stop` stops only listener process trees positively identified as this repository's backend or frontend. It never stops PostgreSQL.
- The launcher does not restore PID state after reboot and does not trust stale PID files. It does not run migrations, schema SQL, or seed scripts.
- The historical wrapper has been retired in favor of the setup menu.
- Backend logs are written under the ignored `.local/dev-all/` directory; database URLs and secrets are not printed by the launcher.

## Checks and recovery

| Output code | Meaning / action |
|---|---|
| `POSTGRES_NOT_REACHABLE` | PostgreSQL did not accept a TCP connection on localhost:5432. Start the existing PostgreSQL 18 service, then rerun the command. The launcher does not start or stop the database. |
| `PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS` | Port 4000 is occupied but the owner is not a verified project backend. Inspect the reported PID/image yourself; the launcher will not terminate it. |
| `BACKEND_HEALTH_TIMEOUT` | The project backend did not return HTTP 200 within 30 seconds. Inspect `.local/dev-all/backend.log` and its `.err` file. |
| `BACKEND_DB_HEALTH_FAILED` | The API is responding, but its PostgreSQL health check failed. Check the local database/service and `backend/.env` privately. No migration or seed was run. |
| `FRONTEND_START_FAILED` | Next.js did not become reachable within 45 seconds, or port 3000 belongs to an unrelated process. Inspect `.local/dev-all/frontend.log` and its `.err` file. |

If a restart is necessary, use:

```powershell
npm run dev:stop
npm run dev:all
```

`dev:stop` intentionally leaves PostgreSQL running.

## Authentication session behavior

Development Auth uses an in-memory session store. Restarting the backend invalidates existing DEV sessions; sign in again after a restart. This startup work does not change session storage or authentication rules.

## Root cause recorded

The previous outage had a Node process listening on port 4000, but host-level TCP connection attempts to both `localhost` and `127.0.0.1` timed out before an HTTP response. Restarting only the verified project backend restored `/api/health` and `/api/health/db`. The new launcher checks the health response instead of assuming that a listening socket or startup log means the API is ready, and it refuses to kill an unidentified owner.

## Verification performed

| Scenario | Result |
|---|---|
| A — no app servers running | PASS. `dev:all` started backend and frontend; PostgreSQL stayed running. |
| B — both app servers healthy | PASS. `dev:all` reused both and reported health without starting duplicates. |
| C — verified project Node process accepts TCP but never answers HTTP | PASS. The process identity was verified, that backend tree was restarted, and API/database/frontend/CSRF checks passed. |
| D — unrelated PowerShell process occupies port 4000 without a health response | PASS. `PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS` was reported; the test confirmed the process remained alive until explicitly cleaned up. |
| E — PostgreSQL probe port unavailable | PASS. `POSTGRES_NOT_REACHABLE` was reported within the bounded check; no new app process was started. |

Final verification returned HTTP 200 for `/api/health` through both localhost and 127.0.0.1, `/api/health/db`, `/api/v1/auth/csrf`, and the frontend root. `backend/.env` was confirmed to target `localhost:5432/Goctro_test3` without displaying credentials.

## Files changed

- `package.json` — added `dev:all` and `dev:stop` commands.
- `scripts/dev-all.ps1` — prerequisite, process ownership, bounded health, and startup logic.
- `scripts/dev-stop.ps1` — safe stop for verified project backend/frontend process trees.
- Historical launcher wrapper — retired in favor of the setup menu.
- `docs/10_operations/LOCAL_DEV_STARTUP_REPORT.md` — this guide and diagnostics.
