@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules" (
  echo Dependencies are not installed. Run setup.bat first.
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
