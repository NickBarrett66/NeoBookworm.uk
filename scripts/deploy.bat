@echo off
REM deploy.bat — Deploy both Cloudflare Workers
REM
REM Usage: scripts\deploy.bat staging
REM        scripts\deploy.bat production

setlocal
set "ENV=%~1"
set "REPO_ROOT=%~dp0.."

if "%ENV%"=="staging" goto :valid
if "%ENV%"=="production" goto :valid
echo Usage: scripts\deploy.bat staging^|production
exit /b 1

:valid
if "%ENV%"=="staging" (
  set "ENV_FLAG=--env staging"
  set "BOOKING_URL=https://neobookworm-booking-staging.nickbarrett.workers.dev"
  set "ENQUIRY_URL=https://neobookworm-landing-enquiry-staging.nickbarrett.workers.dev"
) else (
  set "ENV_FLAG="
  set "BOOKING_URL=https://neobookworm-booking.nickbarrett.workers.dev"
  set "ENQUIRY_URL=https://neobookworm-landing-enquiry.nickbarrett.workers.dev"
)

echo.
echo ========================================================
echo   Deploying Workers -- %ENV%
echo ========================================================
echo.

REM ── 1. landing-enquiry ───────────────────────────────────────────────────────
echo --- Deploying: neobookworm-landing-enquiry (%ENV%) ---
cd /d "%REPO_ROOT%\workers\landing-enquiry"
call npx wrangler deploy %ENV_FLAG%
if errorlevel 1 (
  echo ERROR: landing-enquiry deploy failed. Aborting.
  exit /b 1
)
echo.

REM ── 2. booking ────────────────────────────────────────────────────────────────
echo --- Deploying: neobookworm-booking (%ENV%) ---
cd /d "%REPO_ROOT%\workers\booking"
call npx wrangler deploy %ENV_FLAG%
if errorlevel 1 (
  echo ERROR: booking deploy failed.
  exit /b 1
)
echo.

echo ========================================================
echo   Deploy complete -- %ENV%
echo.
echo   Booking Worker:          %BOOKING_URL%
echo   Landing-enquiry Worker:  %ENQUIRY_URL%
echo.

if "%ENV%"=="production" (
  echo   REMINDER: Check that Vercel has deployed the latest main branch.
  echo   Dashboard: https://vercel.com/dashboard
  echo.
)

echo ========================================================
echo.
endlocal
