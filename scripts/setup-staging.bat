@echo off
REM setup-staging.bat — Provision staging Cloudflare resources (run once)
REM
REM Usage: scripts\setup-staging.bat
REM
REM After this script finishes:
REM   1. Copy the database_id values printed below into the two wrangler.toml files
REM   2. Copy the KV namespace id into workers\booking\wrangler.toml
REM   3. Run:  scripts\run-migrations.bat staging

setlocal
set "REPO_ROOT=%~dp0.."

echo.
echo ========================================================
echo   NeoBookworm -- Staging resource provisioning
echo ========================================================
echo.

REM ── 1. Booking D1 database ──────────────────────────────────────────────────
echo Creating D1 database: bookings-staging ...
cd /d "%REPO_ROOT%\workers\booking"
call npx wrangler d1 create bookings-staging
echo.
echo ^>^>^> COPY the database_id printed above into:
echo     workers\booking\wrangler.toml  -^>  [env.staging] [[d1_databases]] database_id
echo.
pause

REM ── 2. Landing-enquiry D1 database ──────────────────────────────────────────
echo.
echo Creating D1 database: neobookworm-enquiries-staging ...
cd /d "%REPO_ROOT%\workers\landing-enquiry"
call npx wrangler d1 create neobookworm-enquiries-staging
echo.
echo ^>^>^> COPY the database_id printed above into:
echo     workers\landing-enquiry\wrangler.toml  -^>  [env.staging] [[d1_databases]] database_id
echo.
pause

REM ── 3. Booking KV namespace ──────────────────────────────────────────────────
echo.
echo Creating KV namespace: TOKEN_CACHE-staging ...
cd /d "%REPO_ROOT%\workers\booking"
call npx wrangler kv namespace create TOKEN_CACHE-staging
echo.
echo ^>^>^> COPY the id printed above into:
echo     workers\booking\wrangler.toml  -^>  [env.staging] [[kv_namespaces]] id
echo.
pause

REM ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo ========================================================
echo   Resource creation complete.
echo.
echo   Next step -- apply migrations to staging databases:
echo     scripts\run-migrations.bat staging
echo ========================================================
echo.
endlocal
