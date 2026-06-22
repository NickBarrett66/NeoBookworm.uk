@echo off
REM run-migrations.bat — Apply D1 migrations for both Workers
REM
REM Usage: scripts\run-migrations.bat staging
REM        scripts\run-migrations.bat production

setlocal
set "ENV=%~1"
set "REPO_ROOT=%~dp0.."

if "%ENV%"=="staging" goto :valid
if "%ENV%"=="production" goto :valid
echo Usage: scripts\run-migrations.bat staging^|production
exit /b 1

:valid
if "%ENV%"=="staging" (
  set "ENV_FLAG=--env staging"
) else (
  set "ENV_FLAG="
)

echo.
echo ========================================================
echo   Running D1 migrations -- %ENV%
echo ========================================================
echo.

REM ── landing-enquiry ───────────────────────────────────────────────────────────
echo --- workers\landing-enquiry ---
cd /d "%REPO_ROOT%\workers\landing-enquiry"
call npx wrangler d1 migrations apply DB %ENV_FLAG% --remote
echo.

REM ── booking ───────────────────────────────────────────────────────────────────
echo --- workers\booking ---
cd /d "%REPO_ROOT%\workers\booking"
call npx wrangler d1 migrations apply DB %ENV_FLAG% --remote
echo.

echo ========================================================
echo   Migrations complete for: %ENV%
echo ========================================================
echo.
endlocal
