@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-interactive.ps1"
set "GOCTRO_EXIT=%ERRORLEVEL%"
if %GOCTRO_EXIT% EQU 0 (
  echo.
  echo [Góc Trọ] Đang mở màn hình giới thiệu trên trình duyệt...
  start "" "http://localhost:3000/"
)
echo.
pause >nul
exit /b %GOCTRO_EXIT%
