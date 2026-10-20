@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "package-lock.json" (
  echo package-lock.json is missing. Re-clone the project and run setup.bat.
  goto :failed
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install the required Node.js version, then run setup.bat.
  goto :failed
)

echo Validating installed dependencies...
call npm ls --workspaces --include=dev --depth=0 --json >nul 2>nul
if errorlevel 1 (
  echo Dependencies are incomplete or do not match package-lock.json. Run setup.bat first.
  goto :failed
)

if not exist "backend\.env" (
  echo backend\.env is missing. Run setup.bat, then configure DATABASE_URL for your local database.
  goto :failed
)

echo Starting the checked local development stack...
echo Existing healthy services are reused; unrelated processes are not stopped.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
if errorlevel 1 goto :failed

echo.
echo Startup completed. The browser should open at http://localhost:3000
endlocal
exit /b 0

:failed
echo.
echo Web startup failed. Review the message above and the local startup logs.
pause
endlocal
exit /b 1
