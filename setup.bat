@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================
echo Goctro - first-time setup for Windows
echo ==============================================

if not exist "package.json" (
  echo ERROR: package.json was not found. Run this file from the downloaded project folder.
  goto :failed
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is missing. Install Node.js 24.11 or newer, then reopen this file.
  goto :failed
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<24||(major===24&&minor<11)) process.exit(1)"
if errorlevel 1 (
  echo ERROR: This project requires Node.js 24.11 or newer.
  node --version
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js 24.11 or newer with npm enabled.
  goto :failed
)

for /f "delims=" %%V in ('npm --version') do set "GOCTRO_NPM_VERSION=%%V"
node -e "const [major,minor]=process.argv[1].split('.').map(Number); if(major<11||(major===11&&minor<6)) process.exit(1)" "%GOCTRO_NPM_VERSION%"
if errorlevel 1 (
  echo ERROR: This project requires npm 11.6 or newer. Current npm: %GOCTRO_NPM_VERSION%
  goto :failed
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo ERROR: Could not create the local Docker Compose .env example.
    goto :failed
  )
  echo Created root .env for Docker Compose. Configure its password before db:up.
)

if not exist "backend\.env" (
  copy /Y "backend\.env.example" "backend\.env" >nul
  if errorlevel 1 (
    echo ERROR: Could not create backend\.env from its example.
    goto :failed
  )
  echo Created backend\.env from the checked-in example.
) else (
  echo Keeping existing backend\.env. Local values were not overwritten.
)

if not exist "frontend\.env.local" if exist "frontend\.env.example" (
  copy /Y "frontend\.env.example" "frontend\.env.local" >nul
  if errorlevel 1 (
    echo ERROR: Could not create frontend\.env.local from its example.
    goto :failed
  )
  echo Created frontend\.env.local from the checked-in example.
)

echo.
echo Installing locked project dependencies with npm ci...
call npm ci
if errorlevel 1 (
  echo ERROR: Dependency installation failed. Check the npm output above and retry setup.bat.
  goto :failed
)

echo.
echo Generating the Prisma client (does not connect to or modify PostgreSQL)...
call npm run db:generate
if errorlevel 1 (
  echo ERROR: Prisma client generation failed. Check backend\.env and the npm output above.
  goto :failed
)

echo.
echo Setup complete.
echo Before launch, configure backend\.env DATABASE_URL for a local PostgreSQL 18 database
echo containing the project's Database V1.8 schema. Do not use a shared/production database.
echo The launcher currently expects localhost:5432/Goctro_test3.
echo Database provisioning is not included: this setup does not run migrations, schema SQL, or seed.
echo Follow docs\10_operations\DATABASE_V1_8_SETUP.md for guarded db:bootstrap and db:seed.
echo The old db:migrate command is blocked because its Prisma history belongs to the legacy demo.
echo When the local database is ready, double-click launch.bat.
echo.
pause
exit /b 0

:failed
echo.
echo Setup did not finish. No migration or seed was run.
pause
exit /b 1
