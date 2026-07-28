# Overhaul v3 — Results & Status

Rolling status of the MASTER-PLAN-v3 phases as landed on `main` /
`main-backup2` / `overhaul-v3`. Every commit passed the gate
(`npm run check` = tsc + eslint + vitest, plus `next build`).

## Metrics snapshot

| Metric | Baseline | Now |
|---|---|---|
| Pages > 1000 lines | 8 | **2** (only `simulation/viewer` 1672, `simulation/engine` 1641) |
| Test cases | 6 | **96** |
| Vulnerabilities (high) | 12 | **9*** |
| `npm run check` one-command gate | — | ✅ added |

\* Down from 19. All remaining are the same `brace-expansion <=5.0.7` DoS
(GHSA-mh99-v99m-4gvg), now confined to **dev-only lint tooling**
(`eslint` → `@eslint/eslintrc`, and eslint-config-next's
import/jsx-a11y/react plugins → `minimatch@3`).

**Why the rest can't be fixed today** (verified, not assumed): the patch exists
only from `brace-expansion@3.0.4`/`5.0.8`, and that line changed its export from
a callable function to a plain object. `minimatch@3.x`/`5.x` call
`require('brace-expansion')(…)`, so *any* override to a patched version is a
guaranteed `TypeError` — this is what broke `@eslint/config-array` in the
earlier attempt. No patched release keeps the callable CommonJS API. Upgrading
`eslint`→10 was also tried and reverted: `eslint-plugin-react/import/jsx-a11y`
are all already at their latest versions and none support eslint 10 (peer `^9`
max), so eslint 10 crashes the lint run outright.

**What was fixed:** the two chains that touch runtime/user-facing code are gone
— `exceljs` (via `archiver@8`, whose `readdir-glob@3` → `minimatch@10` →
patched `brace-expansion@5`) and `firebase-admin` (via `rimraf@6` → `glob@11` →
`minimatch@10`). Because `archiver@8` is three majors above what exceljs
declares and no test covers it, XLSX export was verified by generating a real
workbook and round-tripping the bytes.

## Phase status

### Phase 0 — Safety net ✅
Golden money-path tests + `openfoam-export` smoke frozen. `engine-invariants.md`
documents the contract.

### Phase 1.1 — Simulation consolidation 🟡 (stores merged; pages pending)
- ✅ Pure logic extracted to `src/features/simulation/viewer/` (types, constants,
  helpers) during the CFD scene fix.
- ✅ Auto-detect consolidated to one placer (`autoDetectEquipment`); the viewer's
  divergent `inferRacksFromRoom`/`inferHVACFromRoom` deleted.
- ✅ **Stores merged.** `simulation-engine-store` → `simulation-engine-slice`
  (a `StateCreator` slice), composed into `useSimulationStore`
  (`SimulationStoreState = base CFD slice + engine slice`). The one field
  collision (`result`) was renamed `caseResult`/`resetEngine` (unread by any
  consumer); the engine page migrated to `useSimulationStore`; the standalone
  engine store is deleted. One source of truth for viewer/workspace/engine.
- ✅ **Navigation unified.** A shared `simulation/layout.tsx` tab bar
  (Overview / Workspace / 3D Viewer / Engine) makes the three views read as one
  workspace.
- ⬜ **Still deferred**: merging the three view *bodies* into a single `page.tsx`
  (viewer 1672 + engine 1641 + workspace 700). Re-evaluated this session and
  confirmed (not just assumed) that visual verification isn't possible in this
  environment: these routes are auth-gated client-side, so the dev server
  serves an empty shell to any non-interactive fetch — a merge of ~4,000 lines
  of 3D/canvas state could silently ship broken and no automated check
  (tsc/eslint/vitest/build) would catch it. The structural intent (one store,
  one workspace nav) is met; the body-merge stays parked until it can be
  reviewed in a browser.

### Phase 1.2 — Monolith decomposition ✅
materials 1098→174, reports 1077→125, projects/[id] 2202→357, floorplan
1921→617. All logic moved into `src/features/<domain>/` (hooks + presentational
components). Only the 2 simulation pages remain large (see 1.1).

### Phase 2 — Design system 2.0 🟡 partial
- ✅ Dark theme fully in place (tokens under `[data-theme="dark"]`, `ui-store`
  toggle, applied to `<html>`, theme toggle in the command palette).
- ✅ `PageHeader` + breadcrumbs pattern, `panel-glass`/elevation used broadly.
- ✅ **Consistency audit + mechanical fixes.** Audited all 22 route pages against
  the PageHeader/skeleton/EmptyState/token checklist. Fixed the concrete,
  objectively-verifiable gaps: added `PageHeader` to the dashboard and
  load-calculation (the only two pages with no title at all); swapped
  hand-rolled empty-state markup for the shared `EmptyState` component
  (dashboard recent-activity, simulation viewer results/TileFlow panels);
  replaced two hardcoded non-token colors with `warning`/`success` tokens
  (materials read-only banner, reports backfill status) that were silently
  wrong under dark theme. Left the "Command Deck" in-card header pattern
  alone (equipment-selection, airflow-duct-design, diagnostics, simulation
  launcher/workspace/viewer) — it's a deliberate, already-consistent design,
  not a gap; the audit's own comparison would have looked worse stacking a
  second header on top of it.
- ⬜ **Deferred**: the full subjective per-page visual redesign sweep (spacing,
  hierarchy, information density judgment calls) — still out of scope without
  browser-based visual review.

### Phase 3 — Motion system 🟡 mostly done
Shared system already exists (`src/lib/ui/motion.ts`, `src/animations/`). New
overlays (command palette, shortcuts sheet, CalcBreakdown) consume it and are
reduced-motion aware. Remaining: retire a few inline variant objects.

### Phase 4 — UX flows 🟡 partial
- ✅ 4.2 WorkflowRail (wave 1), 4.3 Command palette (wave 1).
- ✅ 4.4 CalcBreakdown "explain the numbers" drawer — wired on load-calculation
  and equipment-selection over the engines' existing formula traces.
- ✅ 4.1 Guided project wizard — `projects/new` rebuilt as a 4-step stepper
  (Basics → Building → Conditions → Review) with per-step validation and a
  localStorage-persisted draft.
- ✅ 4.5 Autosave status indicator (`AutosaveIndicator`) on project detail,
  wired to the debounced local-snapshot autosave (saving / saved / offline).
- ✅ 4.6 First-run onboarding tour (`OnboardingTour`) — dismissible 4-step tour,
  "don't show again" persisted.
- ✅ 4.7 Keyboard shortcuts sheet (`?`) + `g d` / `g p` navigation chords.

### Phase 5 — Resilience & performance ✅ (5.4 partial)
- ✅ 5.1 error/loading/not-found coverage (wave 1).
- ✅ 5.2 code-splitting: R3F canvases, fabric, pdfmake/exceljs already lazy;
  **recharts now fully removed from every route's first-load JS** (dashboard,
  reports, and the 3 calculators dynamic-import their charts);
  `optimizePackageImports` for recharts/lucide/framer.
- ✅ Backend: local-firestore in-memory cache + 67MB→4MB prune (API 15–28 ms).
- ✅ 5.4 API error envelope — a shared `errorResponse(status, error,
  description, code)` helper already yields a consistent `{ error, description,
  code }` body (frontend-compatible) used across routes. The structured `code`
  the plan asked for is present; a full reshape to `{ error: { code, message }}`
  is intentionally avoided (breaking for the `{ error, description }` consumers).
  Remaining polish: migrate ~14 inline `{ error }` returns onto the helper.

### Phase 6 — Engine hardening ✅
- ✅ 6.1 invariant suites: `equipment-selection.test.ts` (7),
  `airflow-duct.test.ts` (7), plus scene/hotspot/normalize suites from the CFD
  fix. 91 cases total (incl. the 7.1 admin-mutation guard suite).
- ✅ 6.3 `docs/engine-invariants.md`.

### Phase 7 — Admin & owner ✅
- ✅ 7.1 Admin console — Dashboard (stats), Users, All Projects, Audit Log
  (action + search filters), Price Controls (override editor with
  catalog-price diff), behind an RBAC guard. **In-UI user mutations now
  shipped**: `PATCH /api/admin/users/[id]` (admin-only, rate-limited,
  audit-logged) backed by a pure `assertAdminMutationAllowed` guard (9 unit
  tests) that blocks self-lockout and removing the last enabled admin; works
  in both firebase and local-auth modes (local store gained a `disabled` flag
  enforced at sign-in). Lock/unlock and promote/demote buttons + a confirm
  dialog are wired into the Users panel. Password resets and new-account
  provisioning remain CLI-only by design.
- ✅ 7.2 Diagnostics **System Health board** — `SystemHealthCard` at the top of
  `/diagnostics`: backend connectivity + latency, an in-browser engine self-test
  (runs the pure equipment + airflow engines, asserts sane output), and
  online status.
- ✅ 7.3 `npm run check` one-command gate + developer-docs refresh (README stack
  & scripts, new `docs/architecture-v3.md` with directory/store/route maps).

## Recommended next session
1. **Phase 1.1 page unification** — the only item left that needs a human in a
   browser. Store, nav, and equipment-placement pipeline are already unified;
   the remaining work is merging 3 large, stateful 3D/canvas page bodies
   (~4,000 lines total) where an automated gate cannot catch a layout or
   wiring regression. Do this with a live dev server and visual review.
2. Phase 2 full subjective redesign sweep (spacing/hierarchy/density) — the
   objective consistency gaps (headers, empty states, color tokens) are closed;
   what's left is genuine design judgment.
