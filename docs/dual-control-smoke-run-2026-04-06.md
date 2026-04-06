# Dual-Control Smoke Run Report (2026-04-06)

Runner: scripts/smoke-dual-control.ps1
Target: http://127.0.0.1:3000

## Result
- Status: Blocked before step 1 completion
- Failed step: Create project
- HTTP result: 500 Internal Server Error

## Root Cause
Server log reports missing Neon DB connection string:
- Expected env vars: NEON_DATABASE_URL or NETLIFY_NEON_DATABASE_URL (or DIRECT_URL)
- Current shell and .env do not define any of these vars

## Evidence
- Smoke runner output: "The remote server returned an error: (500) Internal Server Error"
- API log: "Missing Neon database connection string. Set NEON_DATABASE_URL (or NETLIFY_NEON_DATABASE_URL on Netlify) to your Neon URL."

## Next Run Command
After setting a valid DB URL env var, run:
- npm run dev
- ./scripts/smoke-dual-control.ps1
