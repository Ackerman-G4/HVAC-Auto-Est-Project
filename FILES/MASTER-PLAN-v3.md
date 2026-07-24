# MASTER PLAN v3.0 — HVAC Studio Total System Overhaul
**Copy everything in this file into Claude Code. Run from the repo root on branch `main-backup2`. Execute all phases in order, in one session. Do not stop at plans — ship working code.**

---

## MISSION

You are executing a complete edge-to-edge overhaul of HVAC Studio (Next.js 16.2.6 / React 19.2.3 / Tailwind 4 / zustand 5 / React Three Fiber / Firebase / framer-motion 12). Two goals, equally weighted:

1. **The user's life gets easier.** A Philippine HVAC contractor should be able to go from "new project" to "exported BOQ" without confusion, dead ends, or unexplained numbers.
2. **The owner's life gets easier.** One simulation page instead of three. One store per domain. Pages small enough to edit without fear. Tests that catch money bugs before clients do.

The system must look, feel, and navigate like a brand-new product when this is done — while the verified calculation core keeps producing identical numbers.

---

## GROUND TRUTH (verified audit of commit `05d6df2`, 2026-07-08 — do not re-derive, verify against this)

### Structural rot to fix
| Problem | Evidence |
|---|---|
| Three competing simulation pages | `src/app/simulation/viewer/page.tsx` (2,209 lines), `src/app/simulation/engine/page.tsx` (1,641), `src/app/simulation/workspace/page.tsx` (700) |
| Two overlapping simulation stores | `src/stores/simulation-store.ts` (785 lines), `src/stores/simulation-engine-store.ts` (852 lines) |
| Monolith pages | `projects/[id]/page.tsx` (2,180), `projects/[id]/floorplan/page.tsx` (1,921), `materials/page.tsx` (1,098), `reports/page.tsx` (1,077) |
| Zero resilience layer | **0** `error.tsx`, `loading.tsx`, or `not-found.tsx` files anywhere in `src/app` |
| No command palette | No command/palette component exists |
| Near-zero test coverage | 6 test files total, for a system with a 600-line cost engine and 44 API routes |
| Inconsistent motion | framer-motion imported in 21 files, no shared motion system/variants file |

### What exists and must be preserved
- Design token foundation: `src/styles/tokens.css`, `typography.css`, `spacing.css`; ink/jade/copper identity in `globals.css` (459 lines) with elevation system (`--elevation-flat/raised/floating`) and `panel-glass`
- 19 UI primitives in `src/components/ui/` (button, card, dialog, toast, skeleton, stat-card, reveal, page-transition, empty-state, count-up, etc.)
- App shell: `src/components/layout/app-shell.tsx`, `sidebar.tsx`, `WorkspaceLayout.tsx` + panel components
- Engine core (verified in prior waves — **numbers must not change**): `cost-engine.ts` (600), `cooling-load.ts` (418), `load-calculation-engine.ts` (401), `equipment-selection-engine.ts` (258), `pricing-engine.ts` (150), `airflow-duct-engine.ts` (369), `equipment-sizing.ts` (315), `psychrometric.ts` (365)
- CFD/simulation stack: `cfd-simulation.ts` (1,378), `building-cfd-simulation.ts` (502), `openfoam-exporter.ts` (791 — per-solver file contracts verified), `geometry-builder.ts` (425), `result-importer.ts` (308), plus `src/lib/simulation/*`
- 44 API routes incl. deep simulation runs/snapshots tree, admin routes (prices/users/stats/audit-logs), auth (JWT + bcrypt + IP-scoped lockout)
- 23 pages total under `src/app`
- 13 Firestore stores under `src/lib/firebase/` + rule engine under `src/lib/engine/rules/`

---

## HARD CONSTRAINTS (violating any of these = failed run)

1. **Money math is untouchable.** `cost-engine.ts`, `pricing-engine.ts`, `cooling-load.ts`, `equipment-selection-engine.ts`, `psychrometric.ts` produce byte-identical outputs for identical inputs. Phase 0 locks this with golden tests BEFORE any refactor.
2. **No new heavy dependencies.** Work with what's installed (framer-motion, R3F/drei, recharts, react-hook-form, zod, zustand, lucide-react, tailwind-merge, clsx). A tiny utility (< 10 kB) needs written justification in the commit message. No component libraries (no shadcn install, no MUI, no Radix packages).
3. **No visual regression to "plain."** Every page must use the token system — zero hardcoded hex colors in `.tsx` files outside of chart palettes and 3D materials.
4. **Verification gate after every phase:** `npx tsc --noEmit` clean → `npx eslint src` clean → `npx vitest run` green → `npm run build` succeeds. A phase is not done until all four pass. Commit per phase with message `overhaul-v3: phase N — <summary>`.
5. **Preserve auth and security behavior exactly** (JWT flow, bcrypt, lockout, Firestore rules, per-user project ownership).
6. **Accessibility floor:** every interactive element keyboard-reachable; `prefers-reduced-motion` respected globally; focus rings visible; form fields labeled.
7. **Do not delete `docs/`** — append, never remove validation history.

---

## PHASE 0 — SAFETY NET (do this before touching anything)

0.1 Create branch `overhaul-v3` off `main-backup2`. All work lands there.

0.2 **Golden tests for the money path.** Create `src/lib/engine/__tests__/golden/`:
- Pick 3 representative project fixtures (small office / mid commercial / multi-floor). Hardcode inputs.
- Run cooling load → equipment selection → pricing → BOQ totals through the CURRENT code and snapshot every intermediate + final number into fixture JSON files.
- Write vitest tests asserting current engines reproduce those snapshots exactly (`toEqual`, not `toBeCloseTo`, unless existing code has documented float noise — then epsilon 1e-9).
- Same for `openfoam-exporter.ts`: snapshot the generated file set for one fixture case (extend the existing smoke test).

0.3 Record baseline metrics into `docs/overhaul-v3-baseline.md`: `npm run build` output (bundle sizes per route), page line counts, test count. You will diff against this at the end.

**Gate: all four checks green, golden tests passing, baseline committed.**

---

## PHASE 1 — ARCHITECTURE: KILL THE DUPLICATION

### 1.1 Simulation consolidation (the big one)
Three pages → **one** simulation workspace at `src/app/simulation/[projectId]/page.tsx` (or `/simulation` with project selector if routing demands).

- Read all three pages fully first. Build a feature matrix: what does viewer have that engine doesn't, and vice versa. NOTHING functional is lost — that includes the CFD tile fixes from `05d6df2`.
- New structure:
  - `src/features/simulation/` — extract ALL logic out of pages:
    - `components/SimulationCanvas.tsx` (R3F viewport)
    - `components/ControlDock.tsx` (run/pause/params)
    - `components/ResultsInspector.tsx` (fields, probes, legends)
    - `components/CaseManager.tsx` (cases, runs, snapshots)
    - `components/ExportPanel.tsx` (OpenFOAM export/import)
    - `hooks/useSimulationRun.ts`, `hooks/useFieldPlayback.ts`
- Merge `simulation-store.ts` + `simulation-engine-store.ts` → single `src/stores/simulation-store.ts` with slices (`caseSlice`, `runSlice`, `viewportSlice`, `playbackSlice`). Migrate every consumer. Delete the old engine store.
- Old routes `/simulation/viewer`, `/simulation/engine`, `/simulation/workspace` become redirects to the new page (`redirect()` in a minimal `page.tsx`) so bookmarks don't 404.
- Target: new simulation page.tsx under 200 lines (composition only).

### 1.2 Monolith decomposition
Same pattern for the other giants. Page files become composition shells (< 300 lines); logic and large JSX move to `src/features/<domain>/components/`:
- `projects/[id]/page.tsx` (2,180) → `src/features/project-detail/` (OverviewHeader, RoomsSection, LoadsSection, EquipmentSection, BoqSection, ActivitySection)
- `projects/[id]/floorplan/page.tsx` (1,921) → `src/features/floorplan/` (FloorplanCanvas [fabric], ToolPalette, LayerPanel, RoomPropertiesDrawer)
- `materials/page.tsx` (1,098) → `src/features/materials/` (CatalogTable [react-table], PriceEditor, SupplierPanel, ImportExport)
- `reports/page.tsx` (1,077) → `src/features/reports/` (ReportBuilder, TemplatePicker, PreviewPane, ExportActions)

Rule: extraction is a MOVE, not a rewrite. Behavior identical; golden tests still green after this phase.

**Gate + commit.**

---

## PHASE 2 — DESIGN SYSTEM 2.0, EDGE TO EDGE (all 23 pages)

### 2.1 Token layer upgrade (`src/styles/tokens.css` + `globals.css`)
- Full dark theme: mirror every light token under `[data-theme="dark"]` (deep ink surfaces, jade stays accent, copper stays currency). Theme toggle in the app shell, persisted (localStorage via zustand `ui-store`, guarded for SSR).
- Add semantic surface scale: `--surface-0` (app bg) → `--surface-1` (recessed) → `--surface-2` (card) → `--surface-3` (overlay), replacing ad-hoc rgba backgrounds.
- Add `--radius-*` scale and `--duration-fast/base/slow` + `--ease-standard/emphasized` motion tokens (used by Phase 3).
- Numeric typography: tabular-nums utility applied to every table, stat, and currency figure. Copper (`--copper`) remains EXCLUSIVELY for currency values — audit and enforce.

### 2.2 Shell & navigation redesign
- `app-shell.tsx` + `sidebar.tsx`: collapsible sidebar (icon rail ↔ full, animated width), active-route indicator that slides between items, project context switcher at top, user menu with theme toggle.
- Breadcrumbs component in the header for all nested routes (`projects/[id]/...`, `simulation/...`).
- Consistent page header pattern: `<PageHeader title actions description />` used by every page — no more per-page ad-hoc headers.

### 2.3 Per-page sweep — every one of the 23 pages
Work through this checklist for EACH page (dashboard, projects list, project detail, new project, floorplan, floorplan preview, load-calculation, equipment-selection, airflow-duct-design, quotation, materials, reports, simulation [new], settings, diagnostics, admin, auth ×4, root):
- [ ] Uses PageHeader, tokens, `panel-glass`/elevation classes — no bare white boxes
- [ ] Empty state (uses `empty-state.tsx`, upgraded with illustration slot + primary action)
- [ ] Loading state (skeletons matching real layout, not spinners)
- [ ] All data tables → consistent styled table (sticky header, hover rows, tabular-nums, density toggle where >20 rows)
- [ ] Forms → react-hook-form + zod with inline errors, not alert()s
- [ ] Auth pages: full redesign — split layout (brand panel with subtle animated gradient mesh / form panel), since these are the first thing users see

### 2.4 Dashboard (`src/app/page.tsx`)
Rebuild as a real command center: greeting + date, stat cards with `count-up`, recent projects with progress indicators, pipeline-stage summary, quick actions ("New project", "Resume last"), recent activity feed from audit logs.

**Gate + commit.** (This phase may be the largest diff; commit per sub-section if needed: 2.1, 2.2, 2.3a-f, 2.4.)

---

## PHASE 3 — MOTION SYSTEM (make it feel alive, never busy)

3.1 Create `src/lib/motion/` as the single source of truth:
- `variants.ts` — shared framer-motion variants: `fadeUp`, `staggerChildren`, `scaleIn`, `slideOver`, `listItem`
- `transitions.ts` — reads the duration/ease tokens from 2.1
- `MotionProvider.tsx` — wraps app, honors `prefers-reduced-motion` (variants collapse to opacity-only)

3.2 Refactor all 21 existing framer-motion usages to consume the shared system. Delete inline duplicate variant objects.

3.3 Apply systematically:
- Route transitions via upgraded `page-transition.tsx` (fade + 8px rise, 200ms — subtle)
- Stagger reveals on dashboard cards, project grid, table row entrance (first load only, not on filter)
- Micro-interactions: button press scale (0.98), card hover lift (elevation token transition), sidebar collapse spring, toast slide+fade, dialog scale-fade with overlay blur
- Number transitions: `count-up` on all stat cards and BOQ totals when values change
- 3D viewports: animated camera focus transitions when selecting rooms/equipment (drei `CameraControls` if already available via drei; otherwise lerp in `useFrame`)
- Loading: skeleton shimmer via CSS (`@keyframes` on a token gradient), not JS

3.4 Performance guardrails: no layout animations on tables > 50 rows; `will-change` only during animation; verify no dropped frames on the floorplan and simulation pages (test with 6x CPU throttle mentally — i.e., no animating filters/blur on large surfaces).

**Gate + commit.**

---

## PHASE 4 — UX FLOWS: THE USER'S LIFE GETS EASIER

4.1 **Guided project wizard.** Rebuild `projects/new` as a stepper: (1) Project basics → (2) Building/floors → (3) Rooms (quick-add grid with templates: office, server room, retail, etc.) → (4) Review & create. Each step validates before advancing; progress persisted so refresh doesn't lose work.

4.2 **The golden path made visible.** On project detail, add a `WorkflowRail` component showing the pipeline: Floorplan → Loads → Equipment → Ducting → BOQ → Quotation → Reports, with per-stage status (not started / in progress / done / stale — stale = upstream changed after this stage ran). Clicking a stage navigates. This is the single biggest usability win: users always know where they are and what's next.

4.3 **Command palette (Ctrl/Cmd+K).** Build `src/components/ui/command-palette.tsx` from scratch (no cmdk dependency): fuzzy match over navigation targets, projects (from project-store), and actions ("New project", "Run calculation", "Export BOQ", "Toggle theme"). Keyboard navigable, recent-items section, registered globally in the shell.

4.4 **Explain the numbers.** Extend `dual-value-explainer.tsx` / add `CalcBreakdown` drawer: every computed figure on load-calculation, equipment-selection, and quotation pages gets an info affordance opening a breakdown (inputs → formula → result, citing ASHRAE step names where the engine already tracks them). Read-only view over existing engine intermediates — engines unchanged.

4.5 **Never lose work.** Autosave status indicator (saving… / saved / offline) in the header of floorplan and workspace pages, wired to existing persistence calls. Unsaved-changes guard on route change.

4.6 **Onboarding.** Upgrade `welcome-overlay.tsx` + `tutorial/`: 4-step first-run tour (dashboard → new project → workflow rail → command palette), dismissible, "don't show again" persisted.

4.7 **Keyboard shortcuts.** `?` opens a shortcuts sheet. Implement: Ctrl+K palette, g then p → projects, g then d → dashboard, Esc closes overlays consistently.

**Gate + commit.**

---## PHASE 5 — RESILIENCE & PERFORMANCE

5.1 **Error/loading/not-found — from zero to full coverage:**
- Root: `src/app/error.tsx` (branded, "try again" + "report" actions), `not-found.tsx` (branded 404 with search + nav suggestions), `global-error.tsx`
- Route-group `loading.tsx` with layout-matched skeletons for: projects, projects/[id], floorplan, simulation, materials, reports, quotation, admin
- Segment `error.tsx` for the heavy routes (simulation, floorplan, project detail) so one crashed panel doesn't kill the shell

5.2 **Code splitting the heavy stuff:** `next/dynamic` with skeleton fallbacks for R3F canvases (simulation, building viewer), fabric floorplan canvas, recharts blocks, pdfmake/exceljs export paths (import on action, not on page load).

5.3 **Bundle audit:** rerun build, diff route sizes vs `docs/overhaul-v3-baseline.md`. Any route that grew must be explained in the phase commit message; the simulation and floorplan routes should SHRINK (dynamic imports + dead code from consolidation).

5.4 API hygiene pass on the 44 routes: consistent error envelope `{ error: { code, message } }`, zod-validated inputs on every mutating route (many have it — close the gaps), correct status codes. No behavioral changes to success paths.

**Gate + commit.**

---

## PHASE 6 — ENGINE HARDENING (tests + transparency, zero math changes)

6.1 Unit tests (vitest) beyond the Phase 0 goldens:
- `cost-engine`: line-item math, override precedence (the historical "money bug" path — admin price overrides reaching BOQ), currency rounding
- `cooling-load` + `psychrometric`: known-answer tests from ASHRAE examples already encoded in code comments/docs
- `equipment-selection-engine`: capacity matching edges (exact match, oversize step-up, no-match)
- `airflow-duct-engine` + `duct-sizing`: velocity/friction limits
- `rule-evaluator`: rule precedence and conflict cases
- Target: ≥ 60 meaningful test files/cases total across the engine layer (from today's 6)

6.2 Property checks where cheap: totals monotonic in area, BOQ total = Σ line items, exported OpenFOAM file set complete per solver contract.

6.3 `docs/engine-invariants.md`: one page listing every invariant the tests now enforce — this becomes the contract for all future waves.

**Gate + commit.**

---

## PHASE 7 — ADMIN & OWNER EXPERIENCE (your life gets easier)

7.1 Admin portal (`/admin`, currently 71 lines) → real console: stats overview (users, projects, calc runs — existing `admin/stats` route), user management table with lockout status + unlock action, price-override manager with diff-vs-catalog view and change history, audit-log viewer with filters (user/action/date) and detail drawer.

7.2 Diagnostics page: promote to a system health board — engine self-test button (runs golden fixtures in-browser via API), Firestore connectivity, last simulation runs status.

7.3 Developer docs refresh: rewrite `README.md` top section (accurate stack, setup, scripts), add `docs/architecture-v3.md` with the new `src/features/` layout, store map, and route map. Add `npm run check` script chaining tsc + eslint + vitest for one-command verification.

**Gate + commit.**

---

## FINAL VERIFICATION & HANDOFF

1. Full gate on the completed branch: tsc, eslint, vitest (all goldens + new suites), `npm run build`.
2. Diff against baseline in `docs/overhaul-v3-baseline.md` → write `docs/overhaul-v3-results.md`: pages over 1,000 lines (target: 0), test file count (target: ≥ 60 cases), error/loading coverage (target: 100% of heavy routes), bundle deltas, features shipped list.
3. Manual smoke script — walk it and record in the results doc: register → login → new project wizard → floorplan → run loads → select equipment → view BOQ with breakdown drawer → quotation → export → simulation run → admin audit view → dark mode across all of it → Ctrl+K everywhere.
4. Squash-merge or fast-forward `overhaul-v3` → `main-backup2` only after the smoke walk passes. Push.

## EXECUTION RULES
- Read files before editing them. Never edit from memory of this plan alone.
- If reality contradicts this plan's ground truth (a file moved, a count differs), trust the repo, note the discrepancy in the commit, and adapt — do not halt.
- Prefer many small verified commits inside a phase over one giant one.
- If a phase step is genuinely impossible in-session (e.g., network-restricted install), document it in `docs/overhaul-v3-results.md` under "Deferred" and continue — do not silently skip.
- Definition of done = all seven phase gates passed + final verification section complete.
