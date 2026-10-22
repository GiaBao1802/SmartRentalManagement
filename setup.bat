@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-interactive.ps1"
set "GOCTRO_EXIT=%ERRORLEVEL%"
echo.
pause >nul
exit /b %GOCTRO_EXIT%
