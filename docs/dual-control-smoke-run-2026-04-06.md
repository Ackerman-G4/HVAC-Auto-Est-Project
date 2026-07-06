# Dual-Control Smoke Run Report (2026-04-07)

Runner: scripts/smoke-dual-control.ps1
Target: http://127.0.0.1:3000

## Result
- Status: Blocked before step 1 completion
- Failed step: Create project (`[1/14]`)
- HTTP result: 500 Internal Server Error

## Root Cause
Firebase Admin credentials are not configured in the active runtime environment, so the API cannot initialize Firestore access.

## Evidence
- Smoke runner output: `DUAL-CONTROL SMOKE FAILED: The remote server returned an error: (500) Internal Server Error.`
- Direct API error payload from `POST /api/projects`:
  - `{"error":"Failed to create project","description":"Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.","code":"UNKNOWN_ERROR"}`
- Environment presence check (current shell):
  - `FIREBASE_PROJECT_ID=False`
  - `FIREBASE_CLIENT_EMAIL=False`
  - `FIREBASE_PRIVATE_KEY=False`
  - `FIREBASE_SERVICE_ACCOUNT_JSON=False`
  - `GOOGLE_APPLICATION_CREDENTIALS=False`

## Next Run Command
After configuring Firebase credentials, rerun:
- npm run dev
- ./scripts/smoke-dual-control.ps1

## Required Credential Options
Use one of the following:

1. Discrete env vars:
	- `FIREBASE_PROJECT_ID`
	- `FIREBASE_CLIENT_EMAIL`
	- `FIREBASE_PRIVATE_KEY`

2. Single JSON env var:
	- `FIREBASE_SERVICE_ACCOUNT_JSON`

3. ADC path:
	- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a valid service-account JSON file.
