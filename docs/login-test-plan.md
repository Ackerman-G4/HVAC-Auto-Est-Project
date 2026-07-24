# Login & Full-System Test Plan

**Date:** 2026-05-06  
**Status:** Active  
**Auth Mode:** Local (no Firebase Web API Key configured — `.local-users.json` is the credential store)

---

## Root Cause Fixed

`.local-users.json` had two JSON syntax errors in the original `test@hvac-auto.dev` entry:
- Missing comma after `passwordHash` field
- `"role"; "admin"` used a **semicolon** instead of a colon

`readUsers()` silently catches JSON parse failures and returns `{ users: [] }`, causing every login attempt to fail with "Account not found".

**Fix applied:** Replaced with two clean accounts (admin + engineer) with freshly hashed passwords.

---

## Test Accounts (Local Mode)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@hvac-auto.dev` | `Admin@1234!` |
| Engineer | `engineer@hvac-auto.dev` | `Engineer@1234!` |

> These credentials live in `.local-users.json` (gitignored). Do not use in production.

---

## Phase 1 — Login Smoke Tests (Manual)

Run `npm run dev:stack` then open `http://localhost:3000`.

### 1.1 Happy-Path Login (Admin)

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/auth/login` | Login form renders, no crash |
| 2 | Enter `admin@hvac-auto.dev` / `Admin@1234!` | Fields accept input |
| 3 | Click **Sign In** | Redirect to `/` or `?next=` target |
| 4 | Check browser cookies | `hvac_auth_token` cookie set, `httpOnly` |
| 5 | Navigate to `/settings` | Settings page loads (admin sees edit controls) |
| 6 | Refresh page | Session persists (not logged out) |

### 1.2 Happy-Path Login (Engineer)

| # | Step | Expected |
|---|------|----------|
| 1 | Sign out (top-right menu) | Redirected to `/auth/login` |
| 2 | Enter `engineer@hvac-auto.dev` / `Engineer@1234!` | — |
| 3 | Click **Sign In** | Redirect to `/` |
| 4 | Navigate to `/settings` | Read-only view — no mutation buttons |
| 5 | Attempt `PUT /api/settings` via DevTools | `403 Forbidden` |

### 1.3 Negative Cases

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Wrong password for valid email | "Invalid password" error toast |
| 2 | Non-existent email | "Account not found" error toast |
| 3 | Empty form submission | Zod field validation errors inline |
| 4 | Access `/projects` while logged out | Redirect to `/auth/login?next=/projects` |

### 1.4 Register a New Account

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/auth/register` | Register form renders |
| 2 | Fill email/password/name | — |
| 3 | Submit | Account created as `engineer`, JWT set, redirect to `/` |
| 4 | Check `.local-users.json` | New entry appended with `role: "engineer"` |

---

## Phase 2 — RBAC Smoke Tests (Automated)

```powershell
# Quick RBAC check (negative + auth paths)
npm run validate:rbac

# Full RBAC with admin allow-path checks
$env:RBAC_ADMIN_EMAIL="admin@hvac-auto.dev"
$env:RBAC_ADMIN_PASSWORD="Admin@1234!"
npm run validate:rbac:positive
```

Expected: All engineer-denial checks return 401/403; admin allow-path checks pass for `/api/settings`, `/api/materials`, `/api/suppliers`.

---

## Phase 3 — Full System Validation (Automated)

### 3.1 Local Stack (no Firebase)

```powershell
# Start stack first (separate terminal)
npm run dev:stack

# Then in another terminal:
npm run validate:system:local
```

Covers: preflight → auth smoke → RBAC → dual-control → building simulation → catalog-admin → quality.

### 3.2 Strict Validation (with Firebase emulator)

```powershell
npm run validate:system:strict:local
```

Adds: strict preflight (Firebase Web API Key required) + positive auth bootstrap + strict RBAC.

### 3.3 Individual Smoke Scripts

| npm script | What it tests |
|------------|---------------|
| `validate:auth` | Login/logout endpoints, token cookie |
| `validate:auth:positive` | Auto-bootstraps user, confirms positive login |
| `validate:rbac` | Engineer denial (401/403) on admin routes |
| `validate:rbac:positive` | Admin role allow-path + engineer read access |
| `validate:dual-control` | Dual-control workflow (approve/reject BOQ) |
| `validate:building-simulation` | Building scope simulation engine end-to-end |
| `validate:catalog:admin` | Admin-only catalog CRUD + audit log writes |
| `validate:quality` | TypeScript build + ESLint |

---

## Phase 4 — Key Feature Flows (Manual)

After successful login as admin, exercise each major feature:

| Feature | Route | Smoke Check |
|---------|-------|-------------|
| Projects dashboard | `/projects` | List loads; create new project |
| Load calculation | `/load-calculation` | Room form submits, result renders |
| Equipment selection | `/equipment-selection` | Catalog loads; add to project |
| Quotation / BOQ | `/quotation` | BOQ generates; dual-control actions visible |
| CFD Simulation | `/simulation` | Cases load; mesh visualization renders |
| Airflow duct design | `/airflow-duct-design` | Duct form accepts inputs |
| Reports | `/reports` | Report list loads; export button available |
| Settings | `/settings` | Admin sees full form; engineer sees read-only |
| Diagnostics | `/diagnostics` | History table loads |
| Materials / Suppliers | `/materials` | Admin can create; engineer gets 403 on create |

---

## Phase 5 — Token Expiry & Refresh

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Token expires (1h TTL) | Auto-redirect to login on next API call |
| 2 | Refresh token valid (7d TTL) | Session silently renewed without redirect |
| 3 | Logout | `hvac_auth_token` cookie cleared; protected routes redirect |

---

## Quick-Start Commands Reference

```powershell
# Start full local dev stack
npm run dev:stack

# Reset test accounts manually (regenerate hashes)
node -e "const b=require('bcryptjs'); b.hash('Admin@1234!',10).then(h=>console.log(h))"

# Set role for an existing local user (admin CLI helper)
npm run auth:set-role -- --email admin@hvac-auto.dev --role admin

# Run all smoke checks in sequence
npm run validate:system:local
```

---

## Known Limitations (Local Mode)

- Google OAuth is disabled unless `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is set in `.env.local`
- JWT secret defaults to `hvac-local-dev-secret-change-in-production` — fine for local, not for staging
- Token refresh endpoint depends on the refresh token stored client-side; clearing cookies forces re-login
- Admin self-assignment on register is blocked by default (`ALLOW_ADMIN_SELF_ASSIGNMENT` must be `true`)
