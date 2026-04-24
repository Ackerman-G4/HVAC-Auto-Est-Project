# System Validation Runbook

This runbook operationalizes the validation plan into repeatable command steps.

## Phase 1 - Environment And Credentials

Run preflight:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate-preflight.ps1
```

Expected result:

- PASS for node, npm, npx availability
- PASS for at least one Firebase Admin credential strategy
- PASS for Firebase Web API key (or WARN in local emulator mode when strict auth checks are not required)

Optional strict checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate-preflight.ps1 -RequireJava -RequireFirebaseCli -RequireWebApiKey
```

Strict local wrapper (local emulator defaults plus JAVA_HOME fallback):

```bash
npm run validate:preflight:strict:local
```

If missing Firebase Web API key is reported, sync from Firebase WEB app config:

```bash
npm run firebase:web-key:sync
```

If Firebase CLI auth is expired:

```bash
npx firebase-tools login --reauth
```

## Phase 2 - Runtime Bootstrap

Start full local stack (recommended):

```bash
npm run dev:stack
```

The command runs preflight checks, validates process ownership, starts Firestore emulator/Next.js when needed, and reuses already-running workspace processes by default.

If emulator is already running and should be reused:

```bash
npm run dev:stack -- -ReuseRunningEmulator
```

If both Next.js and Firestore emulator are already running and should be reused:

```bash
npm run dev:stack:reuse
```

If Java is installed but not in PATH:

```powershell
npm run dev:stack -- -JavaHome 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
```

Optional Firestore emulator:

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
npm run emulator:firestore
```

## Phase 3 - Auth API Validation

Run auth smoke checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1
```

Run positive auth smoke with temporary-user bootstrap:

```bash
npm run validate:auth:positive
```

To include positive-path checks:

```powershell
$env:AUTH_SMOKE_EMAIL='engineer@example.com'
$env:AUTH_SMOKE_PASSWORD='StrongPass123!'
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1 -RequirePositive
```

Credential-based alternative:

```powershell
$secure = ConvertTo-SecureString 'StrongPass123!' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ('engineer@example.com', $secure)
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1 -Email 'engineer@example.com' -Credential $cred -RequirePositive
```

## Phase 4 - Core Dual-Control Flow Validation

Run dual-control smoke:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-dual-control.ps1
```

Manual equivalent checklist:

- docs/dual-control-smoke-checklist.md

## Phase 5 - Building Simulation Smoke Validation

Run building simulation smoke directly:

```bash
npm run validate:building-simulation
```

Note:

- This smoke check requires building simulation feature flags (`ENABLE_BUILDING_SIMULATION=true` and `NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION=true`) in the app process.
- `validate:system:local` and `validate:system:strict:local` set these flags automatically before starting the local validation app.
- Local validation wrappers also set `AUTH_RATE_LIMIT_DISABLED=true` to prevent auth endpoint 429 throttling during automated smoke sequences.

## Phase 6 - Quality And Security Gates

Run quality gates:

```bash
npm run validate:quality
```

## One-Command Pipeline

Run all phases in sequence:

```bash
npm run validate:system
```

`validate:system` now runs: preflight -> auth -> RBAC -> dual-control -> building simulation -> catalog admin -> quality.

For local Firestore emulator workflows:

```bash
npm run validate:system:local
```

For strict chain routing (raw when credentials exist, strict-local fallback otherwise):

```bash
npm run validate:system:strict
```

Strict local wrapper (always local app/emulator orchestration):

```bash
npm run validate:system:strict:local
```

All local wrappers that start an app process set building simulation feature flags automatically.

## Reporting Template

Capture each validation execution with:

- Date and environment (local/emulator/cloud)
- Commit hash under test
- Commands executed
- Pass/fail per phase
- Any remediation done before release
