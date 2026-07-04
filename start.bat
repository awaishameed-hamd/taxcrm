@echo off
title CA Firm CRM - Starting...

echo ========================================
echo   CA Firm CRM - Starting All Services
echo ========================================
echo.

:: Start PostgreSQL service
echo [1/3] Starting PostgreSQL...
net start postgresql-x64-18 >nul 2>&1
if %errorlevel%==0 (
    echo       PostgreSQL started successfully.
) else (
    echo       PostgreSQL already running or started.
)

echo.
echo [2/3] Starting Backend (port 4000) + Frontend (port 3000)...
echo       Press Ctrl+C to stop all services.
echo.
echo ========================================
echo.

:: Start both backend and frontend together
cd /d "%~dp0"
pnpm run dev
