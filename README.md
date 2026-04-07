# HVAC Auto Estimation Project

HVAC Auto Estimation is a full-stack HVAC engineering and estimating platform built with Next.js and TypeScript. It supports end-to-end workflows from project setup to cooling-load calculations, equipment sizing, BOQ generation, simulation support, diagnostics, and reporting.

The project is now aligned on Firebase (Auth + Firestore via firebase-admin). Legacy Prisma/PostgreSQL paths were removed.

## What The Project Currently Includes

- Project lifecycle management (create, update, archive/delete)
- Floor and room modeling APIs with cooling-load recalculation
- Equipment auto-sizing and manual override workflows
- BOQ generation and per-line override flows
- Pricing policy override model (labor, overhead, contingency, VAT)
- Materials and suppliers catalog APIs
- Diagnostics module with persisted history
- Simulation module and 3D visualization surfaces
- Reports and export-oriented pages
- Settings page with defaults and placement rules
- Dual-control behavior (suggested -> override -> final) with smoke test support

## Tech Stack

- TypeScript
- React 19
- Next.js App Router (v16)
- Tailwind CSS 4
- Firebase Admin SDK (Firestore + Auth integration)
- Framer Motion, Recharts, Three.js stack for UI and visualization
- Optional Python calc engine under services/calc-engine

## Project Structure

- src/app: App Router pages and API route handlers
- src/lib/firebase: Firebase bootstrap and Firestore store adapters
- src/lib/functions: Domain calculations (cooling load, sizing, diagnostics, simulation)
- src/components: UI and visualization components
- config/firebase: Firestore rules and indexes
- scripts: Utility scripts including smoke testing
- docs: Project notes and test reports

## Current App Pages

- /: Dashboard and project overview
- /projects: Project list and management
- /projects/new: New project setup wizard
- /projects/[id]: Project engineering workspace (loads, equipment, BOQ, exports)
- /projects/[id]/floorplan: Floorplan editor and room geometry workflow
- /projects/[id]/floorplan/preview: Floorplan visualization preview
- /materials: Materials and suppliers workspace
- /diagnostics: HVAC diagnostics workspace
- /simulation: Simulation workspace (CFD and optimization related flows)
- /reports: Reporting and export views
- /quotation: Quotation and costing-oriented view
- /settings: Application defaults and rule configuration

## API Route Map

All routes below are implemented under src/app/api and return JSON responses.

### Authentication

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| POST | /api/auth/register | Register user via Firebase Identity Toolkit and set role claim |
| POST | /api/auth/login | Sign in and return token plus user profile |
| GET | /api/auth/profile | Validate bearer token and return profile payload |

### Projects Core

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | /api/projects | List projects and create project records |
| GET, PUT, DELETE | /api/projects/[id] | Get full project, update metadata/pricing, delete/archive project |
| POST | /api/projects/[id]/calculate | Run cooling-load calculations across project rooms |

### Floors And Rooms

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | /api/projects/[id]/floors | List/add floors |
| PUT, DELETE | /api/projects/[id]/floors/[floorId] | Update/remove floor |
| GET, POST | /api/projects/[id]/rooms | List/add rooms |
| PUT, DELETE | /api/projects/[id]/rooms/[roomId] | Update/remove room and load-related fields |

### Equipment And BOQ

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | /api/projects/[id]/equipment | List selections and run auto/manual selection |
| PUT, DELETE | /api/projects/[id]/equipment/[selectionId] | Override/reset/remove selected equipment item |
| GET, POST | /api/projects/[id]/boq | Fetch or regenerate BOQ for a project |
| PUT, DELETE | /api/projects/[id]/boq/[itemId] | Override/reset/remove a BOQ line item |

### Catalog And Settings

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | /api/materials | List/create material records |
| PUT, DELETE | /api/materials/[id] | Update/remove a material |
| GET, POST | /api/suppliers | List/create supplier records |
| PUT, DELETE | /api/suppliers/[id] | Update/remove a supplier |
| GET, PUT | /api/settings | Read/update global app settings |
| GET | /api/equipment | Read equipment catalog data |

### Diagnostics And Simulation

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| POST | /api/diagnostics | Execute diagnostics workflow and persist result |
| GET | /api/diagnostics/history | Read diagnostics history entries |
| POST | /api/simulation | Run simulation/compliance/failure/PUE/optimization actions |

## API Request And Response Examples

The snippets below are representative payloads for the current API handlers.

### 1) Register User

Request:

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
	"email": "engineer@example.com",
	"password": "StrongPass123!",
	"name": "HVAC Engineer",
	"role": "engineer"
}
```

Response (200):

```json
{
	"token": "<firebase-id-token>",
	"user": {
		"id": "uid_123",
		"email": "engineer@example.com",
		"name": "HVAC Engineer",
		"role": "engineer"
	}
}
```

### 2) Create Project

Request:

```http
POST /api/projects
Content-Type: application/json
```

```json
{
	"name": "Office Tower A",
	"clientName": "ACME Dev Corp",
	"buildingType": "commercial",
	"location": "Quezon City",
	"city": "Manila",
	"totalFloorArea": 1200,
	"floorsAboveGrade": 6,
	"floorsBelowGrade": 1,
	"outdoorDB": 35,
	"outdoorRH": 55,
	"indoorDB": 24,
	"indoorRH": 50,
	"notes": "Phase 1 estimate"
}
```

Response (201):

```json
{
	"project": {
		"id": "project_123",
		"name": "Office Tower A",
		"status": "draft",
		"outdoorWB": 27.9,
		"floors": []
	}
}
```

### 3) Run Cooling-Load Calculation

Request:

```http
POST /api/projects/project_123/calculate
```

Response (200):

```json
{
	"results": [
		{
			"roomId": "room_1",
			"roomName": "Conference Room",
			"totalLoad": 8123.5,
			"trValue": 2.31,
			"btuPerHour": 27720
		}
	],
	"summary": {
		"roomCount": 8,
		"totalLoadWatts": 68420.2,
		"totalTR": 19.45,
		"totalBTU": 233400
	}
}
```

### 4) Auto-Size Equipment

Request:

```http
POST /api/projects/project_123/equipment
Content-Type: application/json
```

```json
{
	"autoSize": true,
	"budgetLevel": "mid-range",
	"preferredBrand": "Daikin"
}
```

Response (201):

```json
{
	"results": [
		{
			"room": "Conference Room",
			"equipment": {
				"id": "sel_1",
				"brand": "Daikin",
				"model": "FTKF50",
				"type": "wall_split",
				"capacityTR": 1.5,
				"quantity": 1
			},
			"alternatives": []
		}
	]
}
```

### 5) Generate BOQ

Request:

```http
POST /api/projects/project_123/boq
Content-Type: application/json
```

```json
{}
```

Response (201):

```json
{
	"boq": {
		"items": [
			{
				"section": "A",
				"category": "equipment",
				"description": "Wall Split Unit",
				"quantity": 2,
				"unit": "set",
				"unitPrice": 45000,
				"totalPrice": 90000
			}
		],
		"grandTotal": 512340.75
	}
}
```

### 6) Update Settings

Request:

```http
PUT /api/settings
Content-Type: application/json
```

```json
{
	"defaultIndoorDB": 24,
	"defaultIndoorRH": 50,
	"laborRate": 0.35,
	"overheadPercent": 15
}
```

Response (200):

```json
{
	"settings": {
		"defaultIndoorDB": 24,
		"defaultIndoorRH": 50,
		"laborRate": 0.35,
		"overheadPercent": 15
	}
}
```

### 7) Run Diagnostics

Request:

```http
POST /api/diagnostics
Content-Type: application/json
```

```json
{
	"systemType": "split",
	"applicationType": "commercial",
	"weakAirflow": true,
	"highHumidity": true,
	"supplyTempWarm": 18,
	"returnAirTemp": 27
}
```

Response (200):

```json
{
	"result": {
		"faults": [
			{
				"code": "DIRTY_FILTER",
				"severity": "medium",
				"confidence": "high"
			}
		]
	}
}
```

### 8) Run Simulation Action

Request:

```http
POST /api/simulation
Content-Type: application/json
```

```json
{
	"action": "pue",
	"racks": [],
	"hvacUnits": [],
	"lightingPowerKW": 12,
	"otherPowerKW": 8
}
```

Response (200):

```json
{
	"analysis": {
		"itLoadKW": 0,
		"coolingLoadKW": 0,
		"totalFacilityKW": 20,
		"pue": 1.0
	}
}
```

## Environment Variables

Create .env.local and configure one Firebase admin credential strategy:

### Option A: Discrete service-account variables

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Option B: Full service-account JSON

```bash
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### Auth REST key (required for register/login endpoints)

```bash
FIREBASE_WEB_API_KEY=your-web-api-key
# or
NEXT_PUBLIC_FIREBASE_API_KEY=your-web-api-key
```

### Optional runtime/environment keys

```bash
FIREBASE_PRIVATE_KEY_BASE64=base64-encoded-private-key
FIREBASE_DATABASE_URL=https://<project>.firebaseio.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://<project>.firebaseio.com
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## NPM Scripts

```bash
npm run dev          # Idempotent Next.js dev launcher (Turbopack)
npm run dev:no-turbo # Idempotent Next.js dev launcher without Turbopack
npm run dev:raw      # Raw Next.js dev server (Turbopack)
npm run dev:raw:no-turbo # Raw Next.js dev server without Turbopack
npm run dev:stack    # One command: preflight, start-or-reuse Firestore emulator, then start-or-reuse app
npm run dev:stack:no-turbo # One-command stack startup without Turbopack (also reuses running processes)
npm run dev:stack:reuse # Explicit alias for reusing running app/emulator processes
npm run dev:emulator # Next.js dev server with Firestore emulator env wiring
npm run dev:emulator:no-turbo # Emulator env wiring without Turbopack
npm run emulator:firestore # Start Firestore emulator (port 9080)
npm run firebase:web-key:sync # Sync Firebase Web API key into .env.local
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint scan
npm run audit:check  # npm audit (moderate threshold)
npm run audit:fix    # npm audit fix
npm run validate:preflight    # Environment and credentials preflight
npm run validate:preflight:strict # Preflight with Java/Firebase CLI/Web API key required
npm run validate:preflight:strict:local # Strict preflight with local emulator defaults and JAVA_HOME fallback
npm run validate:auth         # Auth API smoke checks (negative + optional positive)
npm run validate:auth:positive # Auth API smoke checks including positive path (auto bootstrap)
npm run validate:dual-control # Dual-control workflow smoke checks
npm run validate:quality      # Lint + build + dependency audit
npm run validate:system       # End-to-end validation pipeline
npm run validate:system:local # End-to-end validation with local emulator env defaults
```

## Firestore Emulator

firebase.json is configured to load:

- config/firebase/firestore.rules
- config/firebase/firestore.indexes.json

Start emulator (requires Java installed and available to Firebase tools):

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
npm run emulator:firestore
```

One-command local runtime (recommended):

```bash
npm run dev:stack
```

This command performs preflight checks, verifies app/emulator ownership, starts Firestore emulator and Next.js when needed, or reuses already-running workspace processes.

If you want to explicitly force emulator-only reuse behavior:

```bash
npm run dev:stack -- -ReuseRunningEmulator
```

If both Next.js and Firestore emulator are already running and should be reused explicitly:

```bash
npm run dev:stack:reuse
```

If Java is installed but not in PATH, provide JAVA_HOME explicitly:

```powershell
npm run dev:stack -- -JavaHome 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
```

Start app with emulator env pre-wired (recommended):

```bash
npm run dev:emulator
```

Default Firebase project alias is defined in .firebaserc.

## Smoke Test Runner

Automated dual-control smoke flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-dual-control.ps1
```

Auth smoke flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1
```

One-command positive auth smoke flow (generates a temporary account when needed):

```bash
npm run validate:auth:positive
```

To include positive-path login/profile checks, provide known credentials:

```powershell
$env:AUTH_SMOKE_EMAIL='engineer@example.com'
$env:AUTH_SMOKE_PASSWORD='StrongPass123!'
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1 -RequirePositive
```

Or pass an explicit credential object:

```powershell
$secure = ConvertTo-SecureString 'StrongPass123!' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ('engineer@example.com', $secure)
powershell -ExecutionPolicy Bypass -File scripts/smoke-auth.ps1 -Email 'engineer@example.com' -Credential $cred -RequirePositive
```

To run positive checks only against an existing account without auto-registration:

```powershell
npm run validate:auth:positive -- -SkipUserBootstrap
```

System preflight (checks runtime tools and required Firebase env wiring):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate-preflight.ps1
```

Strict preflight (requires Java, Firebase CLI, and Firebase Web API key):

```bash
npm run validate:preflight:strict
```

Strict local preflight (injects local emulator env and JAVA_HOME fallback):

```bash
npm run validate:preflight:strict:local
```

If strict preflight reports missing Firebase Web API key, sync it from Firebase app config:

```bash
npm run firebase:web-key:sync
```

If Firebase CLI shows invalid credentials, reauthenticate first:

```bash
npx firebase-tools login --reauth
```

Full validation pipeline:

```bash
npm run validate:system
```

Local emulator validation pipeline (sets FIRESTORE_EMULATOR_HOST/FIREBASE_PROJECT_ID/GCLOUD_PROJECT):

```bash
npm run validate:system:local
```

Checklist reference:

- docs/dual-control-smoke-checklist.md
- docs/system-validation-runbook.md

## Security Note

Current Firestore rules in config/firebase/firestore.rules are permissive for development/testing. Before production use, replace with least-privilege rules tied to authenticated users and role checks.

## Deployment Notes

- Firebase Hosting is configured in firebase.json (frameworks backend region: asia-southeast1)
- Netlify config is present (netlify.toml) using npm run build:netlify

## Troubleshooting

- Could not load the default credentials:
	Configure FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS.
- API error ECONNREFUSED 127.0.0.1:8080:
	Set FIRESTORE_EMULATOR_HOST=127.0.0.1:9080 (matches firebase.json emulator port).
- App port conflict (3000 already in use):
	`npm run dev` now reuses an existing workspace Next.js process automatically. If the port is owned by a different process, stop that process (for example: taskkill /PID <pid> /F), then retry.
- Missing Firebase Web API key:
	Set FIREBASE_WEB_API_KEY or NEXT_PUBLIC_FIREBASE_API_KEY.
- Firestore emulator fails on startup:
	Verify Java installation and JAVA_HOME/path before running firebase emulators.
