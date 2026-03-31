# HVAC Auto-Est Migration & Cleanup Plan

This document outlines the strategy for migrating the HVAC Auto-Estimation project from its current Prisma/PostgreSQL architecture to a unified **Firebase** ecosystem (Realtime Database, Authentication, and Hosting).

## 1. Current State Assessment
The project currently uses a relational database (PostgreSQL via Neon) and Prisma ORM. 

### Current Architecture:
- **Database:** PostgreSQL (Neon)
- **ORM:** Prisma
- **Auth:** JWT-based custom auth (bcrypt, jwt, Prisma)
- **Data Model:** Highly relational (Projects -> Floors -> Rooms -> Equipment/BOQ/Simulations)
- **API Pattern:** RESTful Next.js Route Handlers (using `prisma.$transaction`, `include`, and `upsert`)

### What is Missing/Incomplete:
- **Real-time Synchronization:** The current architecture relies on standard HTTP request/response cycles.
- **Google Authentication:** Current login is email/password-based with local database storage.
- **Effortless Deployment:** Current setup might need complex environment variable management; Firebase Hosting offers a more integrated flow.
- **Offline Capabilities:** No built-in support for offline data persistence or synchronization.
- **Data Denormalization:** The SQL schema is normalized and needs transformation for NoSQL performance.

---

## 2. Migration Strategy: Firebase Ecosystem

### Step 1: Firebase Environment Setup & Hosting
- **Initialization:** Create a Firebase project and enable Realtime Database, Authentication, and Hosting.
- **Firebase CLI:** Run `firebase init` to configure the workspace for hosting (targeting the Next.js build output).
- **Security Rules:** Define JSON-based rules to restrict data access based on `auth.uid`.
- **Dependencies:** 
  - Install `firebase`, `firebase-admin`, and `react-firebase-hooks`.
  - Uninstall `prisma`, `@prisma/client`, `bcryptjs`, and `jsonwebtoken`.

### Step 2: Firebase Authentication (Google Login)
- **Enable Google Provider:** Configure the Google sign-in provider in the Firebase Console.
- **Client-Side Refactor:** 
  - Replace `src/app/api/auth/login.ts` and `register.ts` logic with client-side `signInWithPopup(auth, googleProvider)`.
  - Create a custom hook or context (`src/lib/auth/AuthContext.tsx`) to manage user session using `onAuthStateChanged`.
  - Update `src/components/layout/app-shell.tsx` (or equivalent) to show/hide content based on auth state.

### Step 3: Data Model Transformation (Relational to NoSQL)
We will map the relational tables to a JSON tree:
- `/users/{uid}/profile`: User-specific metadata.
- `/users/{uid}/projects/{projectId}`: Core project data.
- `/projects/{projectId}/floors/{floorId}`: Floor-specific layouts.
- `/projects/{projectId}/rooms/{roomId}`: Detailed room calculations and equipment.
- `/projects/{projectId}/boq`: Bill of Quantities.
- `/simulations/{projectId}`: Heavy CFD data (tiled for performance).

### Step 4: Infrastructure & API Refactor
- **New DB Client:** Create `src/lib/db/firebase.ts` to export initialized `db` and `auth` objects.
- **API Helpers:** Update `src/lib/utils/api-helpers.ts` to handle Firebase-specific exceptions and data mapping.
- **CRUD Operations:** Replace Prisma calls (`findUnique`, `create`, `update`, `delete`) with Firebase equivalents (`get()`, `set()`, `update()`, `remove()`).

### Step 5: Logic Refactoring
- **Transactions:** Replace `prisma.$transaction` with Firebase's multi-path updates (using `update({ '/path1': data, '/path2': data })`) to ensure atomicity.
- **Calculations:** Update `src/lib/functions/cooling-load.ts` and others to accept/return data in the new Firebase-friendly format.
- **State Management:** Update `src/stores/project-store.ts` to use Firebase listeners (`onValue`) for truly real-time updates.

---

## 3. Cleanup & Dead Code Removal

### Database & Auth Cleanup:
1. **Remove Prisma:**
   - Delete the `prisma/` directory entirely.
   - Delete `prisma.config.ts`.
   - Remove `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, and `JWT_SECRET` from `.env`.
2. **Remove Auth Routes:**
   - Delete `src/app/api/auth/login.ts`.
   - Delete `src/app/api/auth/register.ts`.
   - Delete `src/app/api/auth/profile.ts` (migrate to Firebase Auth SDK client-side).
3. **Update Scripts:**
   - Remove `prisma generate` and `prisma db push` from `package.json`.
   - Replace Next.js deployment scripts (e.g., Netlify) with `firebase deploy`.

### Code Cleanup:
1. **Remove Imports:** Global search and replace for `import { prisma } from '@/lib/db/prisma'` and remove the file `src/lib/db/prisma.ts`.
2. **Standardize Data Access:** Ensure all data fetching goes through a single Firebase-based pattern.
3. **Dead Code Elimination:** Remove any types in `src/types/` that were purely for Prisma compatibility but are no longer needed for the JSON-based data structure.

---

---

## 5. Advanced Features for Full-Fledged Web App

### Phase 7: Engineering & Commercial Enhancements
1. **Advanced Reporting Engine:**
   - Implement full PDF export using `pdf-make` with professional templates (Letterhead, Design Parameters, Summary Tables).
   - Add Excel/CSV export for Bill of Quantities (BOQ) and detailed cooling load breakdowns.
2. **Automated Equipment Selection:**
   - Integrate a rule-based engine that suggests specific AC units from the catalog based on calculated TR/BTU load.
   - Implement auto-matching for Multi-Split and VRF combinations.
3. **Materials & Suppliers Marketplace:**
   - Complete CRUD for global materials and Philippine-based suppliers.
   - Add cost estimation logic that updates project totals in real-time based on selected equipment and material prices.
4. **Project Dashboard & Analytics:**
   - Create a central dashboard showing aggregate TR, total estimated cost, and project status distributions.
   - Visual charts for energy efficiency (EER) across multiple projects.

### Phase 8: Multi-User Collaboration & Security
1. **User Role Management:**
   - Implement `Admin`, `Engineer`, and `Viewer` roles using Firebase Auth Custom Claims.
   - `Viewer`: Read-only access to projects.
   - `Engineer`: Full project editing.
   - `Admin`: User management and global material editing.
2. **Project Sharing:**
   - Allow users to "Invite" others to a project via email, creating a shared access list in RTDB: `/projects/{projectId}/collaborators/{uid}`.
3. **Offline Persistence & Conflict Resolution:**
   - Enable `db.enablePersistence()` for mobile/web offline support.
   - Implement basic "Last Write Wins" or timestamp-based merging for simultaneous edits.
4. **Production Security Rules:**
   - Harden Firebase Security Rules to prevent unauthorized data scraping or spoofing.
   - Validate data structures using RTDB `.validate` rules or a shared Zod schema layer in API routes.

---

## 6. Maintenance & DevOps
1. **Firebase Hosting CI/CD:** Set up GitHub Actions to auto-deploy on `push` to `main`.
2. **Environment Synchronization:** Use Firebase Remote Config for feature flags (e.g., enabling/disabling CFD simulation beta).
3. **Error Tracking:** Integrate a tool like Sentry to monitor client-side Firebase and API route exceptions.
