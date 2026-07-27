# Overhaul v3 — Results & Status

Rolling status of the MASTER-PLAN-v3 phases as landed on `main` /
`main-backup2` / `overhaul-v3`. Every commit passed the gate
(`npm run check` = tsc + eslint + vitest, plus `next build`).

## Metrics snapshot

| Metric | Baseline | Now |
|---|---|---|
| Pages > 1000 lines | 8 | **2** (only `simulation/viewer` 1672, `simulation/engine` 1641) |
| Test cases | 6 | **82** |
| Vulnerabilities (high) | 12 | **19*** |
| `npm run check` one-command gate | — | ✅ added |

\* The 19 are one `brace-expansion <=5.0.7` DoS chain reached only via eslint
tooling + exceljs/firebase-admin's internal glob usage (dev-time / non-user-
facing). The only fix is a major bump that breaks `@eslint/config-array`'s path
matcher — attempted and reverted. Accepted-risk transitive dep. All
user-facing / runtime highs (Next SSRF/DoS, sharp/libvips, postcss) were fixed.

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
- ⬜ **Deferred**: merging the three view *bodies* into a single `page.tsx`
  (viewer 1672 + engine 1641 + workspace 700). The structural intent (one store,
  one workspace nav) is met; the remaining body-merge is a large cosmetic
  consolidation with layout-nesting risk — best done with visual verification.

### Phase 1.2 — Monolith decomposition ✅
materials 1098→174, reports 1077→125, projects/[id] 2202→357, floorplan
1921→617. All logic moved into `src/features/<domain>/` (hooks + presentational
components). Only the 2 simulation pages remain large (see 1.1).

### Phase 2 — Design system 2.0 🟡 partial
- ✅ Dark theme fully in place (tokens under `[data-theme="dark"]`, `ui-store`
  toggle, applied to `<html>`, theme toggle in the command palette).
- ✅ `PageHeader` + breadcrumbs pattern, `panel-glass`/elevation used broadly.
- ⬜ **Deferred**: the full per-page visual redesign sweep across all 23 pages —
  large subjective design work, out of scope for a verified-increment run.

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
  fix. 82 cases total.
- ✅ 6.3 `docs/engine-invariants.md`.

### Phase 7 — Admin & owner ✅ (7.1 mostly)
- ✅ 7.1 Admin console — already a real console: Dashboard (stats), Users, All
  Projects, Audit Log (action + search filters), Price Controls (override editor
  with catalog-price diff), behind an RBAC guard. Gap: in-UI user
  lockout/unlock is still CLI-provisioned (needs a new, security-sensitive admin
  mutation endpoint — deliberately deferred).
- ✅ 7.2 Diagnostics **System Health board** — `SystemHealthCard` at the top of
  `/diagnostics`: backend connectivity + latency, an in-browser engine self-test
  (runs the pure equipment + airflow engines, asserts sane output), and
  online status.
- ✅ 7.3 `npm run check` one-command gate + developer-docs refresh (README stack
  & scripts, new `docs/architecture-v3.md` with directory/store/route maps).
- ⬜ Deferred: in-UI user management mutations (lockout/unlock/role change) —
  needs a new, security-sensitive admin endpoint.

## Recommended next session
1. **Phase 1.1 page unification** — the store is now merged, so the 3 simulation
   pages can compose shared feature components behind one route (`/simulation`
   with Layout / Engine / Results tabs) + redirects. The remaining large
   simulation item.
2. Phase 2 per-page design sweep; Phase 4.1 project wizard; Phase 7.1 admin
   console.
