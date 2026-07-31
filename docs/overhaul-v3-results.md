# Overhaul v3 — Results & Status

Rolling status of the MASTER-PLAN-v3 phases as landed on `main` /
`main-backup2` / `overhaul-v3`. Every commit passed the gate
(`npm run check` = tsc + eslint + vitest, plus `next build`).

## Metrics snapshot

| Metric | Baseline | Now |
|---|---|---|
| Pages > 1000 lines | 8 | **0** |
| Test cases | 6 | **136** |
| Vulnerable `brace-expansion` copies | 12 | **0*** |
| `npm run check` one-command gate | — | ✅ added |

\* `npm audit` still prints 9 highs. Those are now a **false positive** — the
vulnerable code is gone from the tree. Details below.

**All 12 were the same advisory**: `brace-expansion` DoS via unbounded expansion
(GHSA-mh99-v99m-4gvg / CVE-2026-14257).

**The two runtime chains** were fixed first — `exceljs` (via `archiver@8`, whose
`readdir-glob@3` → `minimatch@10` → patched `brace-expansion@5`) and
`firebase-admin` (via `rimraf@6` → `glob@11` → `minimatch@10`). Because
`archiver@8` is three majors above what exceljs declares and no test covers it,
XLSX export was verified by generating a real workbook and round-tripping the
bytes.

**The remaining 9** were dev-only lint tooling (`eslint` → `@eslint/eslintrc`,
and eslint-config-next's import/jsx-a11y/react plugins → `minimatch@3` →
`brace-expansion@1.1.16`). Two earlier attempts failed and were reverted:
overriding to `brace-expansion@5` (that line returns a plain object where
`minimatch@3` calls `require('brace-expansion')(…)`, so it is a guaranteed
`TypeError`), and `eslint`→10 (no eslint-plugin supports it; peer is `^9` max,
and it crashes the lint run).

They are fixed now. The **1.x line was back-patched** — `1.1.17`/`1.1.18` carry
the `EXPANSION_MAX_LENGTH` bound and cite CVE-2026-14257 directly, while keeping
the callable CommonJS export `minimatch@3` needs. A scoped override
(`"minimatch@3": { "brace-expansion": "^1.1.18" }`) pulls it in; `eslint src`
still runs clean. Confirmed by reading both tarballs: `1.1.16` has no length
guard, `1.1.18` does.

`npm audit` keeps reporting these because the advisory's affected range is a
flat `<=5.0.7`, which swallows the whole 1.x line and does not carve out the
backport. **Do not "fix" this by reverting the override** — that reinstalls
genuinely vulnerable code to quiet a stale range.

## Phase status

### Phase 0 — Safety net ✅
Golden money-path tests + `openfoam-export` smoke frozen. `engine-invariants.md`
documents the contract.

### Phase 1.1 — Simulation consolidation ✅
- ✅ Pure logic extracted to `src/features/simulation/viewer/` (types, constants,
  helpers) during the CFD scene fix.
- ✅ Auto-detect consolidated to one placer (`autoDetectEquipment`); the viewer's
  divergent `inferRacksFromRoom`/`inferHVACFromRoom` deleted.
- ✅ **Stores merged.** `simulation-engine-store` → `simulation-engine-slice`
  (a `StateCreator` slice), composed into `useSimulationStore`
  (`SimulationStoreState = base CFD slice + engine slice`). The one field
  collision (`result`) was renamed `caseResult`/`resetEngine` (unread by any
  consumer); the engine page migrated to `useSimulationStore`; the standalone
  engine store is deleted. One source of truth for viewer/engine.
- ✅ **Navigation unified.** A shared `simulation/layout.tsx` tab bar
  (Overview / 3D Viewer / Engine) makes the views read as one workspace.
- ✅ **Workspace absorbed, both pages decomposed.** Structural research found the
  three routes were not three views of one thing: `workspace` (700 lines) was a
  *strict subset* of `viewer` — its store reads and its config/3D/results panels
  all had equivalents there — while `engine` is a genuinely different tool
  (OpenFOAM batch case management, not live interactive simulation). A literal
  one-page merge would have stacked 10+ tabs across two unrelated workflows, so
  instead:
  - `/simulation/workspace` now `redirect()`s to `/simulation/viewer` (bookmarks
    keep working); its Workspace tab, sidebar entry, launcher CTA and route-meta
    are gone, and `WorkspaceLayout`/`InputPanel`/`ViewerPanel`/`ResultsPanel`
    (single-consumer, confirmed by grep) are deleted.
  - Its two capabilities viewer lacked were **ported, not dropped**: the
    PDF/CSV/JSON engineering report export (now in the viewer's header toolbar)
    and the `runtimeMode` / `config.dimensionMode` solver controls (now in the
    Configuration tab). `dimensionMode` is a real switch consumed by
    `cfd.worker.ts`'s `force2DFast`, independent of the fast/balanced selector.
  - Both remaining pages are now composition shells over
    `features/simulation/{viewer,engine}/`: **viewer 1675 → 268**, **engine
    1641 → 226**.
- 🟡 **Partly verified.** The autosave's pure half is now covered by
  `features/simulation/viewer/__tests__/layout-payload.test.ts` (8 cases): the
  hydrate → re-serialise round trip is idempotent (which is *why* loading a
  project fires no PUT), the hash still changes when a unit moves or is
  added/removed (so a real drag does save), malformed placements are dropped
  rather than piled at the origin, and a scaleless floor falls back to canvas
  scale 50. Verified non-vacuous by mutation: making the mapper lossy fails the
  round-trip case.

- ✅ **Autosave effect wiring now covered too.**
  `__tests__/layout-autosave.test.ts` (6 cases, jsdom via a per-file docblock so
  the suite stays node by default) drives the real hook with `renderHook`, a
  per-URL `authFetch` stub and the real zustand store, so a "drag" is just a
  store write. It pins: opening a project writes nothing back, one move sends
  exactly one PUT and only after 650ms, a burst of moves collapses to one, an
  identical re-set sends nothing, and writes landing *while hydration is still
  in flight* are suppressed.

  Both guards were mutation-checked. Removing the hash short-circuit fails the
  identical-value case; removing the hydration guard fails the in-flight case —
  which the first five tests did **not** catch, since by then hydration has
  finished and the hash check alone suppresses the write. The in-flight test was
  added specifically to close that hole.

### Phase 1.2 — Monolith decomposition ✅
materials 1098→174, reports 1077→125, projects/[id] 2202→357, floorplan
1921→617, simulation/viewer 1675→268, simulation/engine 1641→226. All logic
moved into `src/features/<domain>/` (hooks + presentational components).
No page over 1000 lines remains.

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
  launcher/viewer) — it's a deliberate, already-consistent design,
  not a gap; the audit's own comparison would have looked worse stacking a
  second header on top of it.
- ⬜ **Deferred**: the full subjective per-page visual redesign sweep (spacing,
  hierarchy, information density judgment calls) — still out of scope without
  browser-based visual review.

### Phase 3 — Motion system ✅
Shared system already exists (`src/lib/ui/motion.ts`, `src/animations/`). New
overlays (command palette, shortcuts sheet, CalcBreakdown) consume it and are
reduced-motion aware.

The remaining item was logged as "retire a few inline variant objects", but the
audit found the real defect underneath it: ~26 inline `initial={{…}}` props
across 14 files bypassed `usePrefersReducedMotion`, and there was **no global
`MotionConfig`** — so those animations ignored the OS "reduce motion" setting
outright (WCAG 2.3.3), which is an accessibility bug rather than a style
inconsistency. Fixed at the root instead of at 26 call sites: `AppShell` now
wraps the tree in `<MotionConfig reducedMotion="user">`, which applies the
preference to every motion component beneath it. Retiring the inline objects is
now cosmetic only.

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
  Remaining polish (migrating ~25 inline `{ error }` returns in 14 files onto
  the helper) was investigated and **deliberately not done**: grep shows nothing
  reads the `code` field — zero frontend consumers, zero literal comparisons —
  while both `error` and `description` *are* rendered to users. The migration
  would therefore add an unread field while touching auth routes (login,
  register, refresh, profile), risking user-visible message changes for no
  payoff. Worth revisiting only when a consumer for `code` actually exists.

### CFD follow-ups (parked by the scene audit) ✅
The CFD/3D scene fix deliberately left three items out of scope. All now closed:
- ✅ **Solver ignored `rack.position.z`.** `placeRacks` hard-coded every rack to
  grid layer 1, so an elevated rack rendered in the air while its heat load
  stayed on the floor — renderer/solver desync. Now offsets by
  `posToGrid(position.z)`. Backward-compatible by construction:
  `normalizeRoomLayout` floor-snaps racks to z=0 and `posToGrid(0) === 0`, so
  every existing placement is byte-identical (locked in by a regression test
  asserting a floor rack still occupies layers [1,2]). 5 tests cover elevation,
  heat co-location, heat conservation, and out-of-domain clamping.
- ✅ **Orphaned `BuildingSimulationViewer3D`** (216 lines, zero references)
  deleted.
- ✅ **Dead `DenseVelocityArrows`** export (63 lines, exported but never
  imported) deleted from `CFDOverlay3D`.

TileFlow was also listed as out of scope; it was reviewed and needs no change —
`placePerforatedTiles` already places tiles by integer grid index on the floor
plane (z=0), consistent with the placement pipeline.

### Lint / React-correctness ✅
`eslint-plugin-react-hooks` had been pinned to 7.0.1 during the security work
to keep that commit scoped. Unpinning to 7.1.1 surfaced 51 findings, now
resolved:

- **19 `static-components`, all real.** `Pill` and `NumField` were declared
  inside `DiagnosticsPage`, so React rebuilt and remounted them every render.
  For `NumField` (which wraps an `<Input>`) that meant **losing focus after one
  keystroke** — a user-facing bug the pin was hiding. Both hoisted to module
  scope, and now pinned by
  `app/diagnostics/__tests__/measurement-input-focus.test.tsx`. Reverting the
  hoist fails those tests with focus on `<body>` and a fresh input node, i.e.
  it reproduces the original symptom exactly.

  Writing that test also surfaced an **unrelated a11y bug**: `NumField` renders
  its own `<label>`, and `Input` only wires `htmlFor`/`id` when given its own
  `label` prop — so every measurement label was associated with nothing.
  Screen readers announced no name and clicking a label did not focus its
  field. Now wired explicitly.
- **1 `immutability`** on `OrbitControls.min/maxDistance` — a false positive;
  three.js exposes those only as mutable properties. Disabled inline with the
  reason.
- **31 `set-state-in-effect`**, all the same shape: a mount effect starting an
  async fetch where `load` flips `loading` before its first `await`. The rule
  can't see past the await. Fixing them for real means restructuring data
  fetching across ~20 files to save one render on mount, so the rule is a
  **warning** with that rationale in `eslint.config.mjs` — visible rather than
  hidden behind a version pin.

### Engineering-tier gating ✅
Pressing **Run Engineering** raised a full-screen Next.js error overlay reading
"The OpenFOAM cloud path is not configured."

The backend was right: the Engineering tier is unprovisioned by default —
`.env.example` says so explicitly ("Leave blank to keep the Engineering tier
unprovisioned") — and `POST .../runs` returns a clean 503
(`ENGINEERING_TIER_NOT_PROVISIONED`). The bug was entirely in how the client
treated it. `startRun` turned that 503 into a thrown `Error` and `console.error`d
it, and Next.js renders anything reaching `console.error` as a crash overlay. So
a correctly-configured Preview-tier deployment looked broken.

Two halves, both fixed:
- **Ask before offering.** New `GET /api/simulation/capabilities` reports which
  tiers this deployment can run. The engine hook probes it on mount and the
  Run Engineering button now disables itself with a pointer to Run Preview.
  Availability is tri-state (`null` = not yet known) so a slow or failed probe
  never disables a tier that *is* provisioned.
- **Report, don't crash.** The 503 is now an `info` toast. The carve-out is
  narrow — matched on the `code` only, so a genuine dispatch failure still
  logs and still surfaces as an error.

Covered by `stores/__tests__/engineering-tier-gating.test.ts` (8). The
console.error assertions are the point: they are what separates "handled" from
"crash overlay". Verified by mutation — removing the carve-out fails 3 of them.

Missing config var *names* are returned to admins only. They are already in
`.env.example` and carry no secret material, but they are only actionable for
whoever configures the deployment.

### Dev loading times ✅
`.local-firestore.json` had grown to **35 MB**, and every mutation flushed it
with `writeFileSync` — a synchronous whole-file write that blocks the Node event
loop, so each flush stalled *every* in-flight request behind it.

- **59% of that file was indentation.** It was written with
  `JSON.stringify(…, null, 2)`, which inflated something far too large to read
  by hand anyway. Serializing compactly: 35 MB → 15 MB on disk (verified
  lossless), and ~2x faster to serialize.
- **The flush no longer blocks the request path.** It is async now; only the
  process-exit hook stays synchronous, because `exit` handlers cannot await.
- **Writes are atomic.** Staged through `.tmp` + `rename`, so an interrupted
  flush can no longer truncate the database — a pre-existing risk that going
  async would otherwise have widened.

Covered by `firebase/__tests__/local-firestore-persistence.test.ts` (10), with
`fs` mocked so no test touches a real database. Includes the failure mode that
would lose data silently: a mutation landing *while* a write is in flight is
held in a snapshot taken before it, so it needs a follow-up flush to reach disk.
Old indented files still load unchanged.

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
1. **Browser-verify the simulation consolidation** — the code is landed and the
   gate is green, but nothing in tsc/eslint/vitest/build can catch a JSX or
   wiring regression on these client-rendered, auth-gated pages. Highest-risk
   spots: viewer's layout autosave (hydration must fire no PUT; one drag must
   fire exactly one debounced PUT) and engine's per-case snapshot timeline
   restore from localStorage.
2. Phase 2 full subjective redesign sweep (spacing/hierarchy/density) — the
   objective consistency gaps (headers, empty states, color tokens) are closed;
   what's left is genuine design judgment.
