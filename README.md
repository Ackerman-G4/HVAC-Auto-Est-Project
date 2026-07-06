# HVAC Auto Estimation Project

HVAC Auto Estimation is a Next.js + TypeScript platform for HVAC engineering workflows: project setup, load calculations, equipment sizing, BOQ generation, diagnostics, simulation, and reporting.

This repository now runs on Firebase (Auth + Firestore via firebase-admin). Legacy Prisma/PostgreSQL files have been removed from active runtime usage.

## Current State (2026-04-07)

- Runtime and API data layer aligned to Firebase.
- Firestore rules and indexes live under `config/firebase`.
- Local startup scripts are idempotent (safe to re-run when app/emulator is already running).
- Validation scripts cover preflight, auth smoke, dual-control smoke, and full system checks.
- UI shell includes workspace mode controls (Beginner/Professional) and light/dark theme state.

## Local System Snapshot (This Machine)

Captured from this workspace on Windows:

- Node.js: `v24.14.0`
- npm: `11.9.0`
- Firebase CLI: `15.8.0`
- Java: not currently in PATH (scripts include JAVA_HOME auto-detection/fallback)
- Python: `3.14.3` via `.venv\Scripts\python.exe`
- Virtual environment note: `.venv\Scripts\Activate.ps1` and `.venv\Scripts\activate` are currently missing in this workspace; use the python executable directly.

## Key Paths

- `src/app` - App Router pages and API handlers
- `src/lib/firebase` - Firebase Admin bootstrap and Firestore store adapters
- `src/lib/functions` - domain computation modules
- `src/components` - UI and visualization components
- `scripts` - dev/runtime/validation PowerShell automation
- `config/firebase` - Firestore rules and indexes
- `docs` - runbooks and test artifacts

## Prerequisites

- Node.js 20+ (workspace currently on 24.x)
- npm 10+ (workspace currently on 11.x)
- Firebase CLI (`npm i -g firebase-tools` or `npx firebase-tools`)
- Java 17+ for Firestore emulator
- Optional: Python 3.11+ for `services/calc-engine`

## Install

```bash
npm install
```

## Environment Notes

At least one Firebase Admin credential strategy is required for non-emulator auth paths:

1. `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_SERVICE_ACCOUNT`)
2. `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (or `_BASE64`)
3. `GOOGLE_APPLICATION_CREDENTIALS` (service-account file path)

For local emulator flows, scripts use:

- `FIRESTORE_EMULATOR_HOST=127.0.0.1:9080`
- `FIREBASE_PROJECT_ID=demo-hvac-auto`
- `GCLOUD_PROJECT=demo-hvac-auto`

Web API key vars used by auth smoke/strict checks:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `FIREBASE_WEB_API_KEY`

Sync helper:

```bash
npm run firebase:web-key:sync
```

## Development Commands

### Recommended local runtime

```bash
npm run dev:stack
```

This command now reuses an already-running app and emulator for this workspace by default.

### Other runtime commands

```bash
npm run dev
npm run dev:no-turbo
npm run dev:raw
npm run dev:raw:no-turbo
npm run dev:stack:no-turbo
npm run dev:stack:reuse
npm run dev:emulator
npm run dev:emulator:no-turbo
npm run emulator:firestore
```

## Validation Commands

```bash
npm run validate:preflight
npm run validate:preflight:strict
npm run validate:preflight:strict:local
npm run validate:auth
npm run validate:auth:positive
npm run validate:rbac
npm run validate:rbac:positive
npm run validate:rbac:positive:strict
npm run validate:rbac:positive:raw
npm run validate:dual-control
npm run validate:catalog:admin
npm run validate:catalog:admin:strict
npm run validate:quality
npm run validate:system
npm run validate:system:strict
npm run validate:system:strict:raw
npm run validate:system:local
npm run validate:system:strict:local
```

System validation modes:

- `validate:system` uses resilient local-friendly checks (including RBAC fallback behavior when strict admin bootstrap is unavailable).
- `validate:system:strict` is a smart entrypoint: it runs raw strict validation when CI or strict credentials are present, otherwise it routes local shells to strict local orchestration.
- `validate:system:strict:raw` enforces strict preflight + strict positive auth/RBAC + strict catalog mutation validation for CI or release gates.
- `validate:system:local` orchestrates a local end-to-end run by loading env files, ensuring emulator context, launching a dedicated local validation app instance, executing each validation step against an explicit base URL, then cleaning up started processes.
- `validate:system:strict:local` orchestrates strict validation locally (emulator + dedicated app instance) and enables emulator-only admin self-assignment for temporary strict smoke credentials.

## CI Strict Validation

GitHub Actions workflow:

- `.github/workflows/validate-system-strict.yml`

It executes `scripts/ci-validate-system-strict.ps1`, which:

- verifies required commands and environment variables
- starts Firestore emulator + Next.js app in background
- runs `npm run validate:system:strict`
- uploads `.logs/*` artifacts on every run

Required GitHub repository secrets:

- `FIREBASE_WEB_API_KEY`

Provide one strict credential strategy:

- `FIREBASE_SERVICE_ACCOUNT_JSON`, or
- both `RBAC_ADMIN_EMAIL` and `RBAC_ADMIN_PASSWORD` for a pre-provisioned admin account

Conditionally required when using the pre-provisioned admin credential strategy:

- `RBAC_ADMIN_EMAIL`
- `RBAC_ADMIN_PASSWORD`

RBAC validation notes:

- `validate:rbac` always checks unauthorized (`401`) and engineer-forbidden (`403`) behavior across settings/materials/suppliers role gates, and auto-bootstraps a temporary engineer user when needed.
- `validate:rbac:positive` auto-bootstraps a temporary admin user when admin credentials are missing; if promotion is blocked by missing Firebase Admin credentials, it falls back to non-strict RBAC checks for local continuity.
- `validate:rbac:positive:strict` enforces strict failure when admin bootstrap/promotion cannot complete.
- If you already have admin credentials set and want no bootstrap side effects, use `validate:rbac:positive:raw`.

Catalog admin validation notes:

- `validate:catalog:admin` performs admin mutation checks for settings/materials/suppliers and verifies payload validation failures (`400`) for malformed writes. It skips when admin credentials are unavailable.
- `validate:catalog:admin:strict` verifies settings/materials/suppliers audit-log emission in the `auditLogs` collection and requires emulator context (`FIRESTORE_EMULATOR_HOST`). If admin credentials are absent, it auto-bootstraps a temporary admin user in emulator-backed runs.

## Role Provisioning (Admin Bootstrap)

Public registration defaults to engineer role. To assign admin role securely, run the local Firebase Admin utility:

```bash
npm run auth:set-role -- --email your-user@example.com --role admin
```

Dry run example:

```bash
npm run auth:set-role -- --email your-user@example.com --role admin --dry-run
```

You can also target a uid directly:

```bash
npm run auth:set-role -- --uid <firebase-uid> --role admin
```

## Firebase Project Alias Note

- `.firebaserc` default project is currently `hvac-auto-67f97`.
- Emulator scripts use `demo-hvac-auto` by default for local isolated runs.
- Keep this distinction in mind when running raw Firebase CLI commands.

## Python Calc Engine (Optional)

See `services/calc-engine/README.md` for API and startup details.

## Troubleshooting

- `EADDRINUSE` on app port: use `npm run dev` or `npm run dev:stack` (both are reuse-aware for workspace processes).
- Firestore emulator startup failures: ensure Java is installed; scripts can auto-detect common JDK install paths or accept `-JavaHome`.
- Preflight reports missing Admin credential strategy: set one of the credential options listed above.
- Missing Firebase Web API key: run `npm run firebase:web-key:sync`.
- `.venv` activation fails in PowerShell: run `.\.venv\Scripts\python.exe` directly, or recreate the environment with `py -3 -m venv .venv`.

## Updated Push Notes (Corrected To Actual Changes)

Branch: `main-backup2`

1. `3f2cc43` - Auth smoke workflow fixes and positive auth validation command
2. `7452698` - Local dev startup reuse improvements and missing script files added
3. `c4dea1d` - `dev:stack` made idempotent by default
4. `e524a7d` - UI shell theme and workspace mode controls
5. `70c7c6d` - Remaining migration batch merged (Firebase config/stores, API/page updates, Prisma removals, docs/run artifacts)

## License

Internal project (no open-source license declared in this repository).
